import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountType, UserRole, type ConnectionEvent } from '@prisma/client';
import { ACCOUNT_STATUS } from '../auth/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { parseUserAgent } from '../common/utils/user-agent';
import { mapSuperadminView, mapUserView } from './users.mapper';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import { EMAIL_PREFERENCE_KEYS } from '../notifications/notification.types';
import {
  buildUsersCsv,
  buildUsersExportFilename,
  buildUsersXlsx,
  type UsersExportFormat,
} from './users-export.util';
import { exportContentType } from '../common/utils/tabular-export.util';

const CONNECTION_HISTORY_LIMIT = 100;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async listActiveUsers(superadminId: string) {
    await this.requireActiveSuperadmin(superadminId);

    const users = await this.prisma.user.findMany({
      where: {
        status: { in: [ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.BLOCKED] },
        role: { in: [UserRole.MANAGER, UserRole.AGENT] },
      },
      include: {
        account: {
          include: {
            sessions: {
              orderBy: { last_active: 'desc' },
              take: 1,
            },
          },
        },
        manager: { select: { first_name: true, last_name: true } },
      },
      orderBy: [{ role: 'asc' }, { created_at: 'desc' }],
    });

    const superadmins = await this.prisma.superadmin.findMany({
      where: {
        id: { not: superadminId },
        status: { in: [ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.ACTIVE] },
      },
      include: {
        account: {
          include: {
            sessions: {
              orderBy: { last_active: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return [...superadmins.map(mapSuperadminView), ...users.map(mapUserView)];
  }

  async listManagerAgents(managerId: string) {
    const superadmin = await this.prisma.account.findFirst({
      where: { id: managerId, account_type: AccountType.SUPERADMIN },
      select: { id: true },
    });
    if (superadmin) {
      const agents = await this.prisma.user.findMany({
        where: {
          role: UserRole.AGENT,
          status: {
            in: [
              ACCOUNT_STATUS.ACTIVE,
              ACCOUNT_STATUS.PENDING,
              ACCOUNT_STATUS.BLOCKED,
            ],
          },
        },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          status: true,
          manager_id: true,
          manager: { select: { account: { select: { id: true } } } },
          account: { select: { id: true } },
        },
        orderBy: { first_name: 'asc' },
      });
      return agents.map(({ manager, ...agent }) => ({
        ...agent,
        manager_account_id: manager?.account?.id ?? null,
      }));
    }
    const manager = await this.prisma.user.findFirst({
      where: {
        id: managerId,
        role: UserRole.MANAGER,
        status: {
          in: [
            ACCOUNT_STATUS.ACTIVE,
            ACCOUNT_STATUS.PENDING,
            ACCOUNT_STATUS.BLOCKED,
          ],
        },
      },
      select: { id: true },
    });
    if (!manager)
      throw new UnauthorizedException('Only an active manager can list agents');
    return this.prisma.user.findMany({
      where: {
        manager_id: managerId,
        role: UserRole.AGENT,
        status: ACCOUNT_STATUS.ACTIVE,
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        status: true,
        account: { select: { id: true } },
      },
      orderBy: { first_name: 'asc' },
    });
  }

  async getOwnProfile(accountId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      include: {
        user: {
          include: {
            manager: { select: { first_name: true, last_name: true } },
          },
        },
        superadmin: true,
        sessions: { orderBy: { last_active: 'desc' }, take: 1 },
      },
    });

    if (!account) {
      throw new NotFoundException('Account was not found');
    }

    if (account.account_type === AccountType.SUPERADMIN && account.superadmin) {
      return mapSuperadminView({
        ...account.superadmin,
        account: { id: account.id, sessions: account.sessions },
      });
    }

    if (account.user) {
      return mapUserView({
        ...account.user,
        account: { id: account.id, sessions: account.sessions },
      });
    }

    throw new NotFoundException('Account was not found');
  }

  async updateOwnProfile(accountId: string, role: string, dto: UpdateUserDto) {
    const data = {
      ...(dto.firstName !== undefined && { first_name: dto.firstName.trim() }),
      ...(dto.lastName !== undefined && { last_name: dto.lastName.trim() }),
      ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
    };

    if (role === 'SUPERADMIN') {
      await this.prisma.superadmin.update({ where: { id: accountId }, data });
    } else {
      await this.prisma.user.update({ where: { id: accountId }, data });
    }

    return this.getOwnProfile(accountId);
  }

  async uploadOwnAvatar(
    accountId: string,
    role: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ) {
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Avatar exceeds the 2 MB limit');
    }
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image file');
    }
    const data = {
      avatar_mime: file.mimetype,
      avatar_data: new Uint8Array(file.buffer),
    };
    if (role === 'SUPERADMIN') {
      await this.prisma.superadmin.update({ where: { id: accountId }, data });
    } else {
      await this.prisma.user.update({ where: { id: accountId }, data });
    }
    return this.getOwnProfile(accountId);
  }

  async removeOwnAvatar(accountId: string, role: string) {
    const data = { avatar_mime: null, avatar_data: null };
    if (role === 'SUPERADMIN') {
      await this.prisma.superadmin.update({ where: { id: accountId }, data });
    } else {
      await this.prisma.user.update({ where: { id: accountId }, data });
    }
    return this.getOwnProfile(accountId);
  }

  async getAvatar(actorId: string, actorRole: string, userId: string) {
    if (userId !== actorId) {
      if (actorRole === 'SUPERADMIN') {
        // Superadmins may view any account's avatar.
      } else if (actorRole === 'MANAGER') {
        const agent = await this.prisma.user.findFirst({
          where: {
            id: userId,
            role: UserRole.AGENT,
            manager_id: actorId,
            status: { not: ACCOUNT_STATUS.DELETED },
          },
          select: { id: true },
        });
        if (!agent) {
          throw new UnauthorizedException(
            'You can only view your own agents avatars',
          );
        }
      } else {
        throw new UnauthorizedException('You can only view your own avatar');
      }
    }

    const account = await this.prisma.account.findUnique({
      where: { id: userId },
      include: {
        user: { select: { avatar_mime: true, avatar_data: true } },
        superadmin: { select: { avatar_mime: true, avatar_data: true } },
      },
    });
    const record = account?.user ?? account?.superadmin;
    if (!record?.avatar_data || !record.avatar_mime) {
      throw new NotFoundException('No avatar set');
    }
    return { data: record.avatar_data, mime: record.avatar_mime };
  }

  /** Saves the language used by the interface, emails and notifications. */
  async updateLanguage(accountId: string, role: string, language: 'fr' | 'en') {
    const data = { locale: language };
    if (role === 'SUPERADMIN') {
      await this.prisma.superadmin.update({ where: { id: accountId }, data });
    } else {
      await this.prisma.user.update({ where: { id: accountId }, data });
    }
    return this.getOwnProfile(accountId);
  }

  async updateNotificationPreferences(
    accountId: string,
    role: string,
    preferences: NotificationPreferencesDto,
  ) {
    const isSuperadmin = role === 'SUPERADMIN';
    let emailOptOuts: string[] | undefined;
    if (preferences.emailPreferences) {
      const current = isSuperadmin
        ? await this.prisma.superadmin.findUnique({
            where: { id: accountId },
            select: { email_opt_outs: true },
          })
        : await this.prisma.user.findUnique({
            where: { id: accountId },
            select: { email_opt_outs: true },
          });
      const optOuts = new Set(current?.email_opt_outs ?? []);
      for (const key of EMAIL_PREFERENCE_KEYS) {
        const enabled = preferences.emailPreferences[key];
        if (enabled === true) optOuts.delete(key);
        if (enabled === false) optOuts.add(key);
      }
      emailOptOuts = [...optOuts];
    }
    const data = {
      notify_analysis_results: preferences.notifyAnalysisResults,
      notify_work_updates: preferences.notifyWorkUpdates,
      email_opt_outs: emailOptOuts,
    };
    if (isSuperadmin) {
      await this.prisma.superadmin.update({ where: { id: accountId }, data });
    } else {
      await this.prisma.user.update({ where: { id: accountId }, data });
    }
    return this.getOwnProfile(accountId);
  }

  async getConnectionHistory(superadminId: string, userId: string) {
    await this.requireActiveSuperadmin(superadminId);
    const user = await this.findManagedUser(userId);
    return this.listConnectionEvents(user.id);
  }

  async getOwnConnectionHistory(accountId: string) {
    return this.listConnectionEvents(accountId);
  }

  private async listConnectionEvents(accountId: string) {
    const events = await this.prisma.connectionEvent.findMany({
      where: { account_id: accountId },
      orderBy: { created_at: 'desc' },
      take: CONNECTION_HISTORY_LIMIT,
    });

    return events.map(mapConnectionEvent);
  }

  async exportUsers(superadminId: string, format: UsersExportFormat) {
    const users = await this.listActiveUsers(superadminId);
    const buffer =
      format === 'xlsx' ? await buildUsersXlsx(users) : buildUsersCsv(users);

    return {
      buffer,
      filename: buildUsersExportFilename(format),
      contentType: exportContentType(format),
    };
  }

  async getSummary(superadminId: string) {
    await this.requireActiveSuperadmin(superadminId);

    const superadmins = await this.prisma.superadmin.count({
      where: { status: ACCOUNT_STATUS.ACTIVE },
    });

    return { superadmins };
  }

  async blockUser(superadminId: string, userId: string) {
    const user = await this.findUserForManagerOrSuperadmin(
      superadminId,
      userId,
    );

    if (user.status === ACCOUNT_STATUS.BLOCKED) {
      return { updated: true as const };
    }

    if (user.status !== ACCOUNT_STATUS.ACTIVE) {
      throw new BadRequestException('Only active users can be blocked');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          status: ACCOUNT_STATUS.BLOCKED,
          password_reset_required: false,
          password_reset_required_at: null,
          password_reset_required_by_id: null,
        },
      });
      await transaction.account.update({
        where: { id: user.id },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { account_id: user.id },
      });
      await transaction.deviceToken.deleteMany({
        where: { account_id: user.id },
      });
      await transaction.passwordResetCode.updateMany({
        where: { account_id: user.id, used_at: null },
        data: { used_at: new Date() },
      });
    });
    void this.mailService.accountBlocked(user.id);

    return { updated: true as const };
  }

  async unblockUser(superadminId: string, userId: string) {
    const user = await this.findUserForManagerOrSuperadmin(
      superadminId,
      userId,
    );

    if (user.status === ACCOUNT_STATUS.ACTIVE) {
      return { updated: true as const };
    }

    if (user.status !== ACCOUNT_STATUS.BLOCKED) {
      throw new BadRequestException('Only blocked users can be unblocked');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { status: ACCOUNT_STATUS.ACTIVE },
    });
    void this.mailService.accountUnblocked(user.id);

    return { updated: true as const };
  }

  async deleteUser(superadminId: string, userId: string) {
    const user = await this.findUserForManagerOrSuperadmin(
      superadminId,
      userId,
    );

    if (user.status === ACCOUNT_STATUS.DELETED) {
      return { updated: true as const };
    }

    if (user.role === UserRole.MANAGER) {
      const assignedAgents = await this.prisma.user.count({
        where: {
          manager_id: user.id,
          status: { not: ACCOUNT_STATUS.DELETED },
        },
      });

      if (assignedAgents > 0) {
        throw new BadRequestException(
          'Users with assigned agents cannot be deleted',
        );
      }
    }

    // Soft delete: the account row and its history (assignments, connection
    // events, ...) are kept for the record, just hidden from the app and
    // fully locked out of signing in again.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          status: ACCOUNT_STATUS.DELETED,
          password_reset_required: false,
          password_reset_required_at: null,
          password_reset_required_by_id: null,
        },
      });
      await transaction.account.update({
        where: { id: user.id },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { account_id: user.id },
      });
      await transaction.deviceToken.deleteMany({
        where: { account_id: user.id },
      });
      await transaction.passwordResetCode.updateMany({
        where: { account_id: user.id, used_at: null },
        data: { used_at: new Date() },
      });
    });

    return { updated: true as const };
  }

  async updateUser(actorId: string, userId: string, dto: UpdateUserDto) {
    const target = await this.findUserForManagerOrSuperadmin(actorId, userId);

    await this.prisma.user.update({
      where: { id: target.id },
      data: {
        ...(dto.firstName !== undefined && {
          first_name: dto.firstName.trim(),
        }),
        ...(dto.lastName !== undefined && { last_name: dto.lastName.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
      },
    });

    const account = await this.prisma.account.findUnique({
      where: { id: target.id },
      include: {
        user: {
          include: {
            manager: { select: { first_name: true, last_name: true } },
          },
        },
        sessions: { orderBy: { last_active: 'desc' }, take: 1 },
      },
    });
    if (!account?.user) throw new NotFoundException('User was not found');

    return mapUserView({
      ...account.user,
      account: { id: account.id, sessions: account.sessions },
    });
  }

  async requirePasswordReset(superadminId: string, userId: string) {
    await this.requireActiveSuperadmin(superadminId);
    const user = await this.findManagedUser(userId);

    if (user.status !== ACCOUNT_STATUS.ACTIVE) {
      throw new BadRequestException(
        'Password reset can only be required for active users',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: {
          password_reset_required: true,
          password_reset_required_at: new Date(),
          password_reset_required_by_id: superadminId,
        },
      });
      await transaction.account.update({
        where: { id: user.id },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { account_id: user.id },
      });
      await transaction.passwordResetCode.updateMany({
        where: { account_id: user.id, used_at: null },
        data: { used_at: new Date() },
      });
    });
    void this.mailService.passwordResetRequired(user.id);

    return { updated: true as const };
  }

  private async requireActiveSuperadmin(accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, account_type: AccountType.SUPERADMIN },
      include: { superadmin: true },
    });

    if (
      !account?.superadmin ||
      account.superadmin.status !== ACCOUNT_STATUS.ACTIVE
    ) {
      throw new UnauthorizedException(
        'Only an active superadmin can manage users',
      );
    }
  }

  private async findUserForManagerOrSuperadmin(
    actorId: string,
    userId: string,
  ) {
    try {
      await this.requireActiveSuperadmin(actorId);
      return this.findManagedUser(userId);
    } catch (error) {
      const manager = await this.prisma.user.findFirst({
        where: {
          id: actorId,
          role: UserRole.MANAGER,
          status: ACCOUNT_STATUS.ACTIVE,
        },
        select: { id: true },
      });
      if (!manager) throw error;

      const agent = await this.prisma.user.findFirst({
        where: {
          id: userId,
          role: UserRole.AGENT,
          manager_id: actorId,
          status: { not: ACCOUNT_STATUS.DELETED },
        },
      });
      if (!agent) {
        throw new BadRequestException('You can only manage your own agents');
      }
      return agent;
    }
  }

  private async findManagedUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: { in: [UserRole.MANAGER, UserRole.AGENT] },
        status: { not: ACCOUNT_STATUS.DELETED },
      },
    });

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    return user;
  }
}

function mapConnectionEvent(event: ConnectionEvent) {
  const { device, browser } = parseUserAgent(event.user_agent);

  return {
    id: event.id,
    createdAt: event.created_at.toISOString(),
    ipAddress: event.ip_address,
    device,
    browser,
    status: event.status,
  };
}
