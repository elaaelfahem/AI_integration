import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountType, TokenType, UserRole } from '@prisma/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  ACCOUNT_STATUS,
  INVITATION_MAX_ATTEMPTS,
  INVITATION_PASSWORD_LENGTH,
  INVITATION_TOKEN_TTL_SECONDS,
} from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import {
  CheckInvitationDto,
  InviteManagerDto,
  VerifyInvitationDto,
} from './dto/invite-manager.dto';
import { isEmailDomainAllowed } from '../common/utils/email-whitelist';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async listManagers(actorId: string) {
    const actor = await this.prisma.account.findFirst({
      where: { id: actorId },
      include: { superadmin: true, user: true },
    });
    const isSuperadmin =
      actor?.account_type === AccountType.SUPERADMIN &&
      actor.superadmin?.status === ACCOUNT_STATUS.ACTIVE;
    const isManager =
      actor?.account_type === AccountType.USER &&
      actor.user?.role === UserRole.MANAGER &&
      actor.user.status === ACCOUNT_STATUS.ACTIVE;
    if (!isSuperadmin && !isManager) {
      throw new UnauthorizedException(
        'Only an active manager or superadmin can list invitations',
      );
    }
    const managers = await this.prisma.user.findMany({
      where: {
        status: ACCOUNT_STATUS.PENDING,
        role: isManager
          ? UserRole.AGENT
          : { in: [UserRole.MANAGER, UserRole.AGENT] },
        ...(isManager ? { manager_id: actorId } : {}),
      },
      include: {
        account: {
          include: {
            invites_received: {
              include: { token: true },
              orderBy: { token: { created_at: 'desc' } },
              take: 1,
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    const mapped = managers.map((manager) => {
      const invitation = manager.account.invites_received[0];
      let invitationStatus: string = 'CANCELLED';

      if (invitation && !invitation.token.used_at) {
        const hasSurpassedDelay =
          Date.now() - invitation.token.created_at.getTime() >=
            INVITATION_TOKEN_TTL_SECONDS * 1000 ||
          invitation.token.expires_at.getTime() <= Date.now();

        invitationStatus = hasSurpassedDelay ? 'EXPIRED' : 'INVITED';
      }

      return {
        id: manager.id,
        email: manager.email,
        status: manager.status,
        invitationStatus,
        firstName: manager.first_name,
        lastName: manager.last_name,
        role: manager.role,
        createdAt: (
          invitation?.token?.created_at ?? manager.created_at
        ).toISOString(),
      };
    });

    return mapped.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async inviteManager(inviterId: string, dto: InviteManagerDto) {
    const email = dto.email.trim().toLowerCase();
    const inviter = await this.requireActiveInviter(inviterId, dto.role);
    const assignedManagerId = await this.resolveAgentManagerId(
      inviter,
      dto.role,
      dto.managerId,
    );

    const whitelistConfig = this.configService.get<string>(
      'EMAIL_DOMAIN_WHITELIST',
      '*',
    );
    if (!isEmailDomainAllowed(email, whitelistConfig)) {
      throw new BadRequestException(
        `L'adresse e-mail doit appartenir à un domaine autorisé (${whitelistConfig}).`,
      );
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    const existingSuperadmin = await this.prisma.superadmin.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    const existingInvite = await this.prisma.inviteToken.findFirst({
      where: {
        invited_email: email,
        token: { used_at: null, expires_at: { gt: new Date() } },
      },
      include: { token: true },
    });

    if (existingUser || existingSuperadmin || existingInvite) {
      throw new BadRequestException(
        'An account or active invitation already exists for this email',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword();
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 12);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITATION_TOKEN_TTL_SECONDS * 1000,
    );
    const invitationUrl = this.buildInvitationUrl(rawToken);

    await this.obsoleteOpenInviteTokensForEmail(email);

    await this.mailService.sendInvitation({
      to: email,
      role: dto.role,
      invitationUrl,
      temporaryPassword,
      expiresInMinutes: INVITATION_TOKEN_TTL_SECONDS / 60,
    });

    try {
      await this.prisma.$transaction(async (transaction) => {
        const createdAccount = await transaction.account.create({
          data: {
            account_type: AccountType.USER,
            user: {
              create: {
                email,
                password_hash: temporaryPasswordHash,
                role: dto.role,
                status: ACCOUNT_STATUS.PENDING,
                first_name: dto.firstName?.trim() || 'Utilisateur',
                last_name: dto.lastName?.trim() || '',
                phone: dto.phone?.trim() || null,
                mfa_enabled: dto.mfaEnabled ?? false,
                manager_id: assignedManagerId,
              },
            },
          },
        });

        const tokenId = randomUUID();
        await transaction.token.create({
          data: {
            id: tokenId,
            token_type: TokenType.INVITE,
            token_hash: tokenHash,
            expires_at: expiresAt,
          },
        });
        await transaction.inviteToken.create({
          data: {
            id: tokenId,
            invited_email: email,
            account_id: createdAccount.id,
            invited_by_id: inviterId,
            role_to_assign: dto.role,
          },
        });
      });

      return {
        sent: true as const,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new BadRequestException(
          'An account or active invitation already exists for this email',
        );
      }
      throw error;
    }
  }

  async resendManagerInvitation(inviterId: string, managerId: string) {
    const manager = await this.findPendingManager(managerId);
    await this.requireInvitationManagerAccess(inviterId, manager.id);
    const temporaryPassword = this.generateTemporaryPassword();
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 12);
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITATION_TOKEN_TTL_SECONDS * 1000,
    );
    const invitationUrl = this.buildInvitationUrl(rawToken);

    await this.obsoleteOpenInviteTokensForEmail(manager.email);

    await this.mailService.sendInvitation({
      to: manager.email,
      role: manager.role,
      invitationUrl,
      temporaryPassword,
      expiresInMinutes: INVITATION_TOKEN_TTL_SECONDS / 60,
    });

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: manager.id },
        data: { password_hash: temporaryPasswordHash },
      });

      const tokenId = randomUUID();
      await transaction.token.create({
        data: {
          id: tokenId,
          token_type: TokenType.INVITE,
          token_hash: tokenHash,
          expires_at: expiresAt,
        },
      });
      await transaction.inviteToken.create({
        data: {
          id: tokenId,
          invited_email: manager.email,
          account_id: manager.id,
          invited_by_id: inviterId,
          role_to_assign: manager.role,
        },
      });
    });

    return {
      sent: true as const,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async cancelManagerInvitation(inviterId: string, managerId: string) {
    const manager = await this.findPendingManager(managerId);
    await this.requireInvitationManagerAccess(inviterId, manager.id);

    const result = await this.prisma.token.updateMany({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        expires_at: { gt: new Date() },
        created_at: {
          gt: new Date(Date.now() - INVITATION_TOKEN_TTL_SECONDS * 1000),
        },
        invite_token: { is: { account_id: managerId } },
      },
      data: { used_at: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('There is no active invitation to cancel');
    }

    return { cancelled: true as const };
  }

  async checkInvitation(dto: CheckInvitationDto) {
    const invitation = await this.requireValidInvitation(dto.token);

    return {
      valid: true as const,
      email: invitation.account.user.email,
      firstName: invitation.account.user.first_name,
      role: invitation.account.user.role,
      expiresAt: invitation.token.expires_at.toISOString(),
    };
  }

  async verifyInvitation(dto: VerifyInvitationDto) {
    const invitation = await this.requireValidInvitation(dto.token);

    const matches = await bcrypt.compare(
      dto.password.trim(),
      invitation.account.user.password_hash,
    );

    if (!matches) {
      await this.prisma.inviteToken.updateMany({
        where: {
          id: invitation.id,
          attempts: { lt: INVITATION_MAX_ATTEMPTS },
          token: { used_at: null },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('The invitation is invalid or expired');
    }

    return {
      setupToken: await this.authService.issuePasswordSetupToken(
        invitation.account.id,
        invitation.id,
      ),
      email: invitation.account.user.email,
      firstName: invitation.account.user.first_name,
    };
  }

  private async requireValidInvitation(token: string) {
    const invitation = await this.prisma.inviteToken.findFirst({
      where: { token: { token_hash: this.hashToken(token.trim()) } },
      include: { token: true, account: { include: { user: true } } },
    });

    if (
      !invitation ||
      invitation.token.used_at ||
      invitation.token.expires_at.getTime() <= Date.now() ||
      invitation.attempts >= INVITATION_MAX_ATTEMPTS ||
      !invitation.account?.user ||
      ![UserRole.MANAGER, UserRole.AGENT].includes(
        invitation.account.user.role,
      ) ||
      invitation.account.user.status !== ACCOUNT_STATUS.PENDING
    ) {
      throw new UnauthorizedException('The invitation is invalid or expired');
    }

    return invitation as typeof invitation & {
      account: NonNullable<typeof invitation.account> & {
        user: NonNullable<NonNullable<typeof invitation.account>['user']>;
      };
    };
  }

  private async requireActiveSuperadmin(accountId: string) {
    const inviter = await this.prisma.account.findFirst({
      where: { id: accountId, account_type: AccountType.SUPERADMIN },
      include: { superadmin: true },
    });

    if (
      !inviter?.superadmin ||
      inviter.superadmin.status !== ACCOUNT_STATUS.ACTIVE
    ) {
      throw new UnauthorizedException(
        'Only an active superadmin can manage invitations',
      );
    }

    return inviter;
  }

  private async requireInvitationManagerAccess(
    inviterId: string,
    agentId: string,
  ) {
    try {
      await this.requireActiveSuperadmin(inviterId);
      return;
    } catch (error) {
      const manager = await this.prisma.user.findFirst({
        where: {
          id: inviterId,
          role: UserRole.MANAGER,
          status: ACCOUNT_STATUS.ACTIVE,
        },
        select: { id: true },
      });
      const agent = await this.prisma.user.findFirst({
        where: { id: agentId, role: UserRole.AGENT, manager_id: inviterId },
        select: { id: true },
      });
      if (!manager || !agent) throw error;
    }
  }

  private async requireActiveInviter(accountId: string, role: UserRole) {
    const inviter = await this.prisma.account.findFirst({
      where: { id: accountId },
      include: { superadmin: true, user: true },
    });
    const isActiveSuperadmin =
      inviter?.account_type === AccountType.SUPERADMIN &&
      inviter.superadmin?.status === ACCOUNT_STATUS.ACTIVE;
    const isActiveManager =
      inviter?.account_type === AccountType.USER &&
      inviter.user?.role === UserRole.MANAGER &&
      inviter.user.status === ACCOUNT_STATUS.ACTIVE;

    if (!isActiveSuperadmin && !(isActiveManager && role === UserRole.AGENT)) {
      throw new UnauthorizedException(
        role === UserRole.AGENT
          ? 'Only an active manager or superadmin can invite agents'
          : 'Only an active superadmin can invite managers',
      );
    }

    return inviter;
  }

  private async resolveAgentManagerId(
    inviter: {
      account_type: AccountType;
      id: string;
      user: { role: UserRole } | null;
    },
    role: UserRole,
    managerId: string | undefined,
  ): Promise<string | undefined> {
    if (role !== UserRole.AGENT) return undefined;

    const isManager =
      inviter.account_type === AccountType.USER &&
      inviter.user?.role === UserRole.MANAGER;
    if (isManager) return inviter.id;

    // A superadmin inviting an agent directly must pick which manager the
    // agent reports to; there is no implicit default.
    if (!managerId) {
      throw new BadRequestException(
        'A manager must be selected for this agent',
      );
    }

    const manager = await this.prisma.user.findFirst({
      where: {
        id: managerId,
        role: UserRole.MANAGER,
        status: ACCOUNT_STATUS.ACTIVE,
      },
      select: { id: true },
    });
    if (!manager) {
      throw new BadRequestException('Selected manager was not found');
    }

    return manager.id;
  }

  private async findPendingManager(managerId: string) {
    const manager = await this.prisma.user.findFirst({
      where: {
        id: managerId,
        role: { in: [UserRole.MANAGER, UserRole.AGENT] },
        status: ACCOUNT_STATUS.PENDING,
      },
    });

    if (!manager) {
      throw new NotFoundException('Pending manager invitation was not found');
    }

    return manager;
  }

  private async obsoleteOpenInviteTokensForEmail(email: string) {
    await this.prisma.token.updateMany({
      where: {
        token_type: TokenType.INVITE,
        used_at: null,
        invite_token: {
          is: {
            invited_email: {
              equals: email.trim().toLowerCase(),
              mode: 'insensitive',
            },
          },
        },
      },
      data: { used_at: new Date() },
    });
  }

  private buildInvitationUrl(rawToken: string) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );

    return `${frontendUrl.replace(/\/$/, '')}/invite?token=${encodeURIComponent(rawToken)}`;
  }

  private generateTemporaryPassword() {
    const sets = [
      'ABCDEFGHJKLMNPQRSTUVWXYZ',
      'abcdefghijkmnopqrstuvwxyz',
      '23456789',
      '!@#$%^&*_-',
    ];
    const required = sets.map((set) => set[randomInt(set.length)]);
    const all = sets.join('');
    while (required.length < INVITATION_PASSWORD_LENGTH) {
      required.push(all[randomInt(all.length)]);
    }

    for (let index = required.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [required[index], required[swapIndex]] = [
        required[swapIndex],
        required[index],
      ];
    }

    return required.join('');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}

function isUniqueConstraintError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
