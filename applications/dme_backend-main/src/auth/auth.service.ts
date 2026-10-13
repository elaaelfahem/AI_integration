import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountType, ConnectionStatus, UserRole } from '@prisma/client';
import { createHash, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import {
  generateSecret as generateTotpSecret,
  generateURI as generateTotpUri,
  verify as verifyTotp,
} from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { isEmailDomainAllowed } from '../common/utils/email-whitelist';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ACCOUNT_STATUS,
  AUTH_TIMING_CONFIG,
  MFA_CHALLENGE_TTL_SECONDS,
  MFA_CODE_LENGTH,
  MFA_CODE_TTL_SECONDS,
  PASSWORD_RESET_CODE_LENGTH,
  PASSWORD_RESET_CODE_TTL_SECONDS,
  PASSWORD_RESET_EMAIL_LIMIT_CONFIG,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_VERIFICATION_TTL_SECONDS,
  PASSWORD_SETUP_TTL_SECONDS,
  REFRESH_TOKEN_GRACE_MS,
  REFRESH_TOKEN_TTL_SECONDS,
  TOTP_ISSUER,
} from './auth.constants';
import {
  AccessTokenPayload,
  APP_ROLES,
  AppRole,
  MfaChallengePayload,
  MfaMethod,
  PasswordResetPayload,
  PasswordSetupPayload,
  RefreshTokenPayload,
} from './auth.types';
import { LoginDto } from './dto/login.dto';
import { MfaRequestCodeDto, MfaVerifyDto } from './dto/mfa.dto';
import {
  CompletePasswordResetDto,
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/reset-password.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import { TotpConfirmDto } from './dto/totp.dto';

interface AccountIdentity {
  id: string;
  accountType: AccountType;
  email: string;
  passwordHash: string;
  role: AppRole;
  status: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  mfaType: MfaMethod | null;
  mfaSecret: string | null;
  mfaEnabled: boolean;
  passwordResetRequired: boolean;
  /** Language of the interface, emails and notifications. */
  language: 'fr' | 'en';
}

function maskPhone(phone: string | null): string | null {
  if (!phone) {
    return null;
  }

  const match = /^(\+\d{1,3})[\s-]?(.*)$/.exec(phone);
  if (!match) {
    return phone;
  }

  const [, countryCode, rest] = match;
  const digits = rest.replace(/\D/g, '');

  if (digits.length <= 2) {
    return phone;
  }

  return `${countryCode} XX XXX ${digits.slice(-2)}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  getEmailWhitelist(): string {
    return this.configService.get<string>('EMAIL_DOMAIN_WHITELIST', '*');
  }

  async login(credentials: LoginDto, ipAddress?: string, userAgent?: string) {
    const whitelistConfig = this.getEmailWhitelist();
    if (!isEmailDomainAllowed(credentials.email, whitelistConfig)) {
      throw new UnauthorizedException(
        "L'adresse e-mail doit appartenir à un domaine autorisé",
      );
    }

    const account = await this.findAccountByEmail(credentials.email);

    if (
      !account ||
      !(await bcrypt.compare(credentials.password, account.passwordHash))
    ) {
      if (account) {
        await this.recordConnectionEvent(
          account.id,
          ConnectionStatus.FAILED,
          ipAddress,
          userAgent,
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    if (account.status === ACCOUNT_STATUS.PENDING) {
      if (
        account.accountType === AccountType.USER &&
        [UserRole.MANAGER, UserRole.AGENT].includes(account.role as UserRole)
      ) {
        throw new UnauthorizedException(
          'Use the invitation link to activate this account',
        );
      }

      return {
        passwordSetupRequired: true as const,
        setupToken: await this.signPasswordSetupToken(account.id),
        email: account.email,
        firstName: account.firstName,
      };
    }

    if (account.status !== ACCOUNT_STATUS.ACTIVE) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (
      account.accountType === AccountType.USER &&
      account.passwordResetRequired
    ) {
      return {
        passwordResetRequired: true as const,
        email: account.email,
        firstName: account.firstName,
      };
    }

    if (this.requiresMfa(account)) {
      await this.recordConnectionEvent(
        account.id,
        ConnectionStatus.MFA_REQUIRED,
        ipAddress,
        userAgent,
      );
      return {
        mfaRequired: true as const,
        mfaToken: await this.signMfaChallengeToken(account.id),
        mfaType: account.mfaType,
        email: account.email,
        phone: maskPhone(account.phone),
      };
    }

    return this.establishSession(account, ipAddress, userAgent);
  }

  async setupPassword(
    dto: SetupPasswordDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const payload = await this.verifyPasswordSetupToken(dto.setupToken);
    const account = await this.findAccountById(payload.sub);

    if (!account || account.status !== ACCOUNT_STATUS.PENDING) {
      throw new UnauthorizedException('The password setup session is invalid');
    }

    if (payload.inviteId) {
      const invitation = await this.prisma.inviteToken.findFirst({
        where: {
          id: payload.inviteId,
          account_id: account.id,
          token: { used_at: null, expires_at: { gt: new Date() } },
        },
      });

      if (!invitation || invitation.attempts >= 3) {
        throw new UnauthorizedException('The invitation is invalid or expired');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.prisma.$transaction(async (transaction) => {
      if (account.accountType === AccountType.SUPERADMIN) {
        await transaction.superadmin.update({
          where: { id: account.id },
          data: { password_hash: passwordHash, status: ACCOUNT_STATUS.ACTIVE },
        });
      } else {
        await transaction.user.update({
          where: { id: account.id },
          data: { password_hash: passwordHash, status: ACCOUNT_STATUS.ACTIVE },
        });
      }

      if (payload.inviteId) {
        const consumed = await transaction.token.updateMany({
          where: {
            id: payload.inviteId,
            used_at: null,
            expires_at: { gt: new Date() },
          },
          data: { used_at: new Date() },
        });

        if (consumed.count !== 1) {
          throw new UnauthorizedException(
            'The invitation is invalid or expired',
          );
        }
      }
    });

    account.passwordHash = passwordHash;
    account.status = ACCOUNT_STATUS.ACTIVE;

    if (payload.inviteId) {
      void this.mailService.invitationAccepted(payload.inviteId);
    }

    if (this.requiresMfa(account)) {
      await this.recordConnectionEvent(
        account.id,
        ConnectionStatus.MFA_REQUIRED,
        ipAddress,
        userAgent,
      );
      return {
        mfaRequired: true as const,
        mfaToken: await this.signMfaChallengeToken(account.id),
        mfaType: account.mfaType,
        email: account.email,
        phone: maskPhone(account.phone),
      };
    }

    return this.establishSession(account, ipAddress, userAgent);
  }

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    const account = await this.findAccountByEmail(dto.email);

    if (!account) {
      return { sent: true as const };
    }

    if (account.status !== ACCOUNT_STATUS.ACTIVE) {
      await this.obsoleteOpenPasswordResetCodes(account.id);

      throw new ForbiddenException(
        'Password reset is only available for active accounts',
      );
    }

    await this.enforcePasswordResetEmailLimit(account.id);

    const code = this.generateFixedLengthCode(PASSWORD_RESET_CODE_LENGTH);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_CODE_TTL_SECONDS * 1000,
    );
    const now = new Date();

    try {
      await this.mailService.sendPasswordResetCode(account.email, code);
    } catch {
      throw new ServiceUnavailableException(
        'Password reset email could not be sent',
      );
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetCode.updateMany({
        where: {
          account_id: account.id,
          used_at: null,
        },
        data: { used_at: now },
      });
      await transaction.passwordResetCode.create({
        data: {
          account_id: account.id,
          code_hash: codeHash,
          expires_at: expiresAt,
        },
      });
    });

    return { sent: true as const };
  }

  async verifyPasswordResetCode(dto: ConfirmPasswordResetDto) {
    const account = await this.findResetEligibleAccountByEmail(dto.email);

    if (!account) {
      throw new UnauthorizedException('The password reset code is invalid');
    }

    const resetCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        account_id: account.id,
        used_at: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (
      !resetCode ||
      resetCode.expires_at.getTime() < Date.now() ||
      resetCode.attempts >= PASSWORD_RESET_MAX_ATTEMPTS
    ) {
      throw new UnauthorizedException('The password reset code is invalid');
    }

    const matches = await bcrypt.compare(dto.code, resetCode.code_hash);

    if (!matches) {
      await this.prisma.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('The password reset code is invalid');
    }

    return {
      resetToken: await this.signPasswordResetToken(account.id, resetCode.id),
    };
  }

  async confirmPasswordReset(dto: CompletePasswordResetDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const payload = await this.verifyPasswordResetToken(dto.resetToken);
    const account = await this.findResetEligibleAccountById(payload.sub);

    if (!account) {
      throw new UnauthorizedException('The password reset code is invalid');
    }

    const resetCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        id: payload.resetCodeId,
        account_id: account.id,
        used_at: null,
      },
    });

    if (
      !resetCode ||
      resetCode.expires_at.getTime() < Date.now() ||
      resetCode.attempts >= PASSWORD_RESET_MAX_ATTEMPTS
    ) {
      throw new UnauthorizedException('The password reset code is invalid');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.passwordResetCode.update({
        where: { id: resetCode.id },
        data: { used_at: now },
      });

      if (account.accountType === AccountType.SUPERADMIN) {
        await transaction.superadmin.update({
          where: { id: account.id },
          data: { password_hash: passwordHash },
        });
      } else {
        await transaction.user.update({
          where: { id: account.id },
          data: {
            password_hash: passwordHash,
            password_reset_required: false,
            password_reset_required_at: null,
            password_reset_required_by_id: null,
          },
        });
      }

      await transaction.account.update({
        where: { id: account.id },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { account_id: account.id },
      });
      await transaction.passwordResetCode.deleteMany({
        where: {
          account_id: account.id,
          used_at: null,
        },
      });
    });

    await this.recordConnectionEvent(
      account.id,
      ConnectionStatus.PASSWORD_CHANGED,
    );
    void this.mailService.passwordChanged(account.id);

    return { reset: true as const };
  }

  async requestMfaCode(dto: MfaRequestCodeDto) {
    const account = await this.requireMfaAccount(dto.mfaToken);

    if (dto.method === 'AUTH' || (!dto.method && account.mfaType === 'AUTH')) {
      throw new BadRequestException(
        'Authenticator app verification is not available yet',
      );
    }

    const method = dto.method ?? account.mfaType;

    if (!method) {
      throw new BadRequestException('A verification method is required');
    }

    const code = this.generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + MFA_CODE_TTL_SECONDS * 1000);

    await this.prisma.$transaction([
      this.prisma.mfaCode.deleteMany({ where: { account_id: account.id } }),
      this.prisma.mfaCode.create({
        data: {
          account_id: account.id,
          code_hash: codeHash,
          method,
          expires_at: expiresAt,
        },
      }),
    ]);

    await this.mailService.sendMfaCode(account.email, code);

    return {
      sent: true,
      mfaType: method,
      expiresInSeconds: MFA_CODE_TTL_SECONDS,
    };
  }

  async verifyMfaCode(
    dto: MfaVerifyDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const account = await this.requireMfaAccount(dto.mfaToken);

    const method = dto.method ?? account.mfaType;

    if (method === 'AUTH') {
      if (!(await this.checkTotpCode(account, dto.code))) {
        await this.recordConnectionEvent(
          account.id,
          ConnectionStatus.FAILED,
          ipAddress,
          userAgent,
        );
        throw new UnauthorizedException('Invalid verification code');
      }

      return this.establishSession(account, ipAddress, userAgent);
    }

    const mfaCode = await this.prisma.mfaCode.findFirst({
      where: { account_id: account.id },
      orderBy: { created_at: 'desc' },
    });

    if (!mfaCode || mfaCode.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException(
        'The code has expired. Request a new one.',
      );
    }

    const matches = await bcrypt.compare(dto.code, mfaCode.code_hash);

    if (!matches) {
      await this.recordConnectionEvent(
        account.id,
        ConnectionStatus.FAILED,
        ipAddress,
        userAgent,
      );
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.mfaCode.delete({ where: { id: mfaCode.id } });

    if (mfaCode.method !== account.mfaType) {
      await this.setAccountMfaType(account, mfaCode.method);
    }

    return this.establishSession(account, ipAddress, userAgent);
  }

  async setupTotp(mfaToken: string) {
    const account = await this.requireMfaAccount(mfaToken);

    const secret = generateTotpSecret();
    await this.setAccountMfaSecret(account, secret);

    const otpauthUrl = generateTotpUri({
      issuer: TOTP_ISSUER,
      label: account.email,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmTotp(
    dto: TotpConfirmDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const account = await this.requireMfaAccount(dto.mfaToken);

    if (!account.mfaSecret) {
      throw new BadRequestException(
        'Start authenticator app setup before confirming a code',
      );
    }

    if (!(await this.checkTotpCode(account, dto.code))) {
      await this.recordConnectionEvent(
        account.id,
        ConnectionStatus.FAILED,
        ipAddress,
        userAgent,
      );
      throw new UnauthorizedException('Invalid verification code');
    }

    if (account.mfaType !== 'AUTH') {
      await this.setAccountMfaType(account, 'AUTH');
      void this.mailService.twoFactorChanged(account.id, true);
    }

    return this.establishSession(account, ipAddress, userAgent);
  }

  async setupTotpForSelf(accountId: string) {
    const account = await this.findAccountById(accountId);
    if (!account) throw new UnauthorizedException('Account was not found');

    const secret = generateTotpSecret();
    await this.setAccountMfaSecret(account, secret);

    const otpauthUrl = generateTotpUri({
      issuer: TOTP_ISSUER,
      label: account.email,
      secret,
    });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, otpauthUrl, qrCodeDataUrl };
  }

  async confirmTotpForSelf(accountId: string, code: string) {
    const account = await this.findAccountById(accountId);
    if (!account) throw new UnauthorizedException('Account was not found');

    if (!account.mfaSecret) {
      throw new BadRequestException(
        'Start authenticator app setup before confirming a code',
      );
    }

    if (!(await this.checkTotpCode(account, code))) {
      throw new UnauthorizedException('Invalid verification code');
    }

    if (account.mfaType !== 'AUTH') {
      await this.setAccountMfaType(account, 'AUTH');
      void this.mailService.twoFactorChanged(account.id, true);
    }

    return { mfaType: 'AUTH' as const };
  }

  private async checkTotpCode(account: AccountIdentity, code: string) {
    if (!account.mfaSecret) {
      return false;
    }

    const result = await verifyTotp({
      secret: account.mfaSecret,
      token: code,
      epochTolerance: 30,
    });

    return result.valid;
  }

  async refresh(refreshToken?: string) {
    const session = await this.requireActiveSession(refreshToken);
    const account = await this.findAccountById(session.account_id);

    if (!account || account.status !== ACCOUNT_STATUS.ACTIVE) {
      await this.removeSession(session.account_id, session.id);
      throw new UnauthorizedException('The session is no longer valid');
    }

    const rotatedRefreshToken = await this.rotateRefreshToken(
      session.id,
      session.refresh_token_hash,
      account.id,
    );

    return {
      accessToken: await this.signAccessToken(
        account.id,
        session.id,
        account.role,
      ),
      refreshToken: rotatedRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      lastActive: session.last_active.toISOString(),
      idleExpiresInMs: this.getIdleExpiresInMs(session.last_active),
      touchIntervalMs: this.touchIntervalMs,
    };
  }

  /**
   * Rotates a session's refresh token, retrying on top of a concurrent
   * winner instead of failing outright. Two nearly-simultaneous /refresh
   * calls for the same session (e.g. a page reload firing while the
   * previous load's refresh is still in flight) both start from the same
   * "current" hash; only one optimistic update can win. Rather than
   * rejecting the loser, re-read the session and rotate again on top of
   * whatever the winner just wrote, so both callers end up with a usable
   * token.
   */
  private async rotateRefreshToken(
    sessionId: string,
    currentHash: string,
    accountId: string,
    attemptsLeft = 2,
  ): Promise<string> {
    const rotatedRefreshToken = await this.signRefreshToken(
      accountId,
      sessionId,
    );

    const rotation = await this.prisma.session.updateMany({
      where: { id: sessionId, refresh_token_hash: currentHash },
      data: {
        previous_refresh_token_hash: currentHash,
        previous_token_expires_at: new Date(
          Date.now() + REFRESH_TOKEN_GRACE_MS,
        ),
        refresh_token_hash: this.hashToken(rotatedRefreshToken),
      },
    });

    if (rotation.count === 1) {
      return rotatedRefreshToken;
    }

    if (attemptsLeft <= 0) {
      throw new UnauthorizedException('The session is no longer valid');
    }

    const latest = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!latest) {
      throw new UnauthorizedException('The session is no longer valid');
    }

    return this.rotateRefreshToken(
      sessionId,
      latest.refresh_token_hash,
      accountId,
      attemptsLeft - 1,
    );
  }

  async touch(accountId: string, sessionId: string, refreshToken?: string) {
    const session = await this.requireActiveSession(refreshToken);

    if (session.account_id !== accountId || session.id !== sessionId) {
      throw new UnauthorizedException('The session is no longer valid');
    }

    const now = new Date();
    const writeBefore = new Date(now.getTime() - this.touchIntervalMs);
    const result = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        account_id: accountId,
        last_active: { lte: writeBefore },
      },
      data: { last_active: now },
    });

    const lastActive = result.count === 1 ? now : session.last_active;

    return {
      updated: result.count === 1,
      lastActive: lastActive.toISOString(),
      idleExpiresInMs: this.getIdleExpiresInMs(lastActive),
      touchIntervalMs: this.touchIntervalMs,
    };
  }

  async logout(accountId: string, sessionId: string, refreshToken?: string) {
    if (refreshToken) {
      try {
        const payload = await this.verifyRefreshToken(refreshToken);
        if (payload.sub !== accountId || payload.sessionId !== sessionId) {
          return;
        }
      } catch {
        return;
      }
    }

    await this.removeSession(accountId, sessionId);
  }

  async issuePasswordSetupToken(accountId: string, inviteId?: string) {
    return this.signPasswordSetupToken(accountId, inviteId);
  }

  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const account = await this.findAccountById(accountId);
    if (!account) throw new UnauthorizedException('Account was not found');
    if (!(await bcrypt.compare(currentPassword, account.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction(async (transaction) => {
      if (account.accountType === AccountType.SUPERADMIN) {
        await transaction.superadmin.update({
          where: { id: account.id },
          data: { password_hash: passwordHash },
        });
      } else {
        await transaction.user.update({
          where: { id: account.id },
          data: {
            password_hash: passwordHash,
            password_reset_required: false,
            password_reset_required_at: null,
            password_reset_required_by_id: null,
          },
        });
      }

      await transaction.account.update({
        where: { id: account.id },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { account_id: account.id },
      });
    });

    await this.recordConnectionEvent(
      account.id,
      ConnectionStatus.PASSWORD_CHANGED,
    );
    void this.mailService.passwordChanged(account.id);

    return { updated: true };
  }

  async disableTotp(accountId: string, password: string) {
    const account = await this.findAccountById(accountId);
    if (!account) throw new UnauthorizedException('Account was not found');
    if (!(await bcrypt.compare(password, account.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }
    if (account.mfaType !== 'AUTH') {
      throw new BadRequestException(
        'The authenticator app is not the active verification method',
      );
    }

    if (account.accountType === AccountType.SUPERADMIN) {
      await this.prisma.superadmin.update({
        where: { id: account.id },
        data: { mfa_type: 'EMAIL', mfa_secret: null },
      });
    } else {
      await this.prisma.user.update({
        where: { id: account.id },
        data: { mfa_type: 'EMAIL', mfa_secret: null },
      });
    }
    void this.mailService.twoFactorChanged(account.id, false);

    return { mfaType: 'EMAIL' as const };
  }

  private requiresMfa(account: AccountIdentity) {
    return account.accountType === AccountType.SUPERADMIN || account.mfaEnabled;
  }

  private async recordConnectionEvent(
    accountId: string,
    status: ConnectionStatus,
    ipAddress?: string,
    userAgent?: string,
  ) {
    await this.prisma.connectionEvent.create({
      data: {
        account_id: accountId,
        status,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });
  }

  private async requireMfaAccount(mfaToken: string) {
    const payload = await this.verifyMfaChallengeToken(mfaToken);
    const account = await this.findAccountById(payload.sub);

    if (
      !account ||
      account.status !== ACCOUNT_STATUS.ACTIVE ||
      !this.requiresMfa(account)
    ) {
      throw new UnauthorizedException('The verification session is invalid');
    }

    return account;
  }

  private async setAccountMfaType(account: AccountIdentity, method: MfaMethod) {
    if (account.accountType === AccountType.SUPERADMIN) {
      await this.prisma.superadmin.update({
        where: { id: account.id },
        data: { mfa_type: method },
      });
    } else {
      await this.prisma.user.update({
        where: { id: account.id },
        data: { mfa_type: method },
      });
    }
    account.mfaType = method;
  }

  private async setAccountMfaSecret(account: AccountIdentity, secret: string) {
    if (account.accountType === AccountType.SUPERADMIN) {
      await this.prisma.superadmin.update({
        where: { id: account.id },
        data: { mfa_secret: secret },
      });
    } else {
      await this.prisma.user.update({
        where: { id: account.id },
        data: { mfa_secret: secret },
      });
    }
    account.mfaSecret = secret;
  }

  private async establishSession(
    account: AccountIdentity,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const loginAt = new Date();
    await this.recordConnectionEvent(
      account.id,
      ConnectionStatus.SUCCESS,
      ipAddress,
      userAgent,
    );
    void this.mailService.newDeviceLogin(
      account.id,
      userAgent,
      ipAddress,
      loginAt,
    );

    const sessionId = randomUUID();
    const refreshToken = await this.signRefreshToken(account.id, sessionId);
    const refreshTokenHash = this.hashToken(refreshToken);
    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.account.update({
        where: { id: account.id },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { account_id: account.id },
      });
      await transaction.session.create({
        data: {
          id: sessionId,
          account_id: account.id,
          refresh_token_hash: refreshTokenHash,
          ip_address: ipAddress,
          last_active: now,
        },
      });
      await transaction.account.update({
        where: { id: account.id },
        data: {
          active_session_id: sessionId,
          ...(account.accountType === AccountType.SUPERADMIN
            ? { superadmin: { update: { latest_login: now } } }
            : { user: { update: { latest_login: now } } }),
        },
      });
    });

    return {
      mfaRequired: false as const,
      accessToken: await this.signAccessToken(
        account.id,
        sessionId,
        account.role,
      ),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      lastActive: now.toISOString(),
      idleExpiresInMs: this.sessionIdleTimeoutMs,
      touchIntervalMs: this.touchIntervalMs,
      account: {
        id: account.id,
        email: account.email,
        role: account.role,
        firstName: account.firstName,
        lastName: account.lastName,
        language: account.language,
      },
    };
  }

  private async requireActiveSession(refreshToken?: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('A valid refresh token is required');
    }

    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        account_id: payload.sub,
        account: { active_session_id: payload.sessionId },
        OR: [
          { refresh_token_hash: tokenHash },
          {
            previous_refresh_token_hash: tokenHash,
            previous_token_expires_at: { gt: new Date() },
          },
        ],
      },
    });

    if (!session) {
      throw new UnauthorizedException('The session is no longer valid');
    }

    if (
      Date.now() - session.last_active.getTime() >
      this.sessionIdleTimeoutMs
    ) {
      await this.removeSession(session.account_id, session.id);
      throw new UnauthorizedException('The session expired due to inactivity');
    }

    return session;
  }

  private async removeSession(accountId: string, sessionId: string) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.account.updateMany({
        where: { id: accountId, active_session_id: sessionId },
        data: { active_session_id: null },
      });
      await transaction.session.deleteMany({
        where: { id: sessionId, account_id: accountId },
      });
    });
  }

  private async enforcePasswordResetEmailLimit(accountId: string) {
    const limit = this.getPositiveIntegerConfig(
      PASSWORD_RESET_EMAIL_LIMIT_CONFIG.limit.environmentKey,
      PASSWORD_RESET_EMAIL_LIMIT_CONFIG.limit.defaultValue,
    );
    const windowMs = this.getPositiveNumberConfig(
      PASSWORD_RESET_EMAIL_LIMIT_CONFIG.window.environmentKey,
      PASSWORD_RESET_EMAIL_LIMIT_CONFIG.window.defaultMs,
    );
    const windowStart = new Date(Date.now() - windowMs);
    const sentEmailCount = await this.prisma.passwordResetCode.count({
      where: {
        account_id: accountId,
        created_at: { gte: windowStart },
      },
    });

    if (sentEmailCount >= limit) {
      throw new HttpException(
        'Too many password reset emails requested. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async obsoleteOpenPasswordResetCodes(accountId: string) {
    await this.prisma.passwordResetCode.updateMany({
      where: {
        account_id: accountId,
        used_at: null,
      },
      data: { used_at: new Date() },
    });
  }

  private async findAccountByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const account = await this.prisma.account.findFirst({
      where: {
        OR: [
          { user: { email: { equals: normalizedEmail, mode: 'insensitive' } } },
          {
            superadmin: {
              email: { equals: normalizedEmail, mode: 'insensitive' },
            },
          },
        ],
      },
      include: { user: true, superadmin: true },
    });

    return account ? this.toAccountIdentity(account) : null;
  }

  private async findResetEligibleAccountByEmail(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        status: ACCOUNT_STATUS.ACTIVE,
      },
    });

    if (user) {
      return this.findAccountById(user.id);
    }

    const superadmin = await this.prisma.superadmin.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        status: ACCOUNT_STATUS.ACTIVE,
      },
    });

    if (!superadmin) {
      return null;
    }

    return this.findAccountById(superadmin.id);
  }

  private async findResetEligibleAccountById(id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id },
      include: { user: true, superadmin: true },
    });

    if (!account) {
      return null;
    }

    if (
      account.account_type === AccountType.USER &&
      account.user?.status === ACCOUNT_STATUS.ACTIVE
    ) {
      return this.toAccountIdentity(account);
    }

    if (
      account.account_type === AccountType.SUPERADMIN &&
      account.superadmin?.status === ACCOUNT_STATUS.ACTIVE
    ) {
      return this.toAccountIdentity(account);
    }

    return null;
  }

  private async findAccountById(id: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { user: true, superadmin: true },
    });

    return account ? this.toAccountIdentity(account) : null;
  }

  private toAccountIdentity(
    account: Awaited<ReturnType<PrismaService['account']['findFirst']>> & {
      user?: {
        email: string;
        password_hash: string;
        role: UserRole;
        status: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        mfa_type: MfaMethod | null;
        mfa_secret: string | null;
        mfa_enabled: boolean;
        password_reset_required: boolean;
        locale?: string;
      } | null;
      superadmin?: {
        email: string;
        password_hash: string;
        status: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        mfa_type: MfaMethod | null;
        mfa_secret: string | null;
        locale?: string;
      } | null;
    },
  ): AccountIdentity {
    if (account.account_type === AccountType.SUPERADMIN && account.superadmin) {
      return {
        id: account.id,
        accountType: account.account_type,
        email: account.superadmin.email,
        passwordHash: account.superadmin.password_hash,
        role: APP_ROLES.SUPERADMIN,
        status: account.superadmin.status,
        firstName: account.superadmin.first_name,
        lastName: account.superadmin.last_name,
        phone: account.superadmin.phone,
        mfaType: account.superadmin.mfa_type,
        mfaSecret: account.superadmin.mfa_secret,
        mfaEnabled: true,
        passwordResetRequired: false,
        language: account.superadmin.locale === 'en' ? 'en' : 'fr',
      };
    }

    if (account.account_type === AccountType.USER && account.user) {
      return {
        id: account.id,
        accountType: account.account_type,
        email: account.user.email,
        passwordHash: account.user.password_hash,
        role: account.user.role,
        status: account.user.status,
        firstName: account.user.first_name,
        lastName: account.user.last_name,
        phone: account.user.phone,
        mfaType: account.user.mfa_type,
        mfaSecret: account.user.mfa_secret,
        mfaEnabled: account.user.mfa_enabled,
        passwordResetRequired: account.user.password_reset_required,
        language: account.user.locale === 'en' ? 'en' : 'fr',
      };
    }

    throw new UnauthorizedException('The account is invalid');
  }

  private signAccessToken(accountId: string, sessionId: string, role: AppRole) {
    const payload: AccessTokenPayload = {
      sub: accountId,
      sessionId,
      role,
      type: 'access',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  private signRefreshToken(accountId: string, sessionId: string) {
    const payload: RefreshTokenPayload = {
      sub: accountId,
      sessionId,
      jti: randomUUID(),
      type: 'refresh',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });
  }

  private async verifyRefreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );

      if (payload.type !== 'refresh') {
        throw new Error();
      }

      return payload;
    } catch {
      throw new UnauthorizedException('A valid refresh token is required');
    }
  }

  private signMfaChallengeToken(accountId: string) {
    const payload: MfaChallengePayload = {
      sub: accountId,
      type: 'mfa_challenge',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: MFA_CHALLENGE_TTL_SECONDS,
    });
  }

  private signPasswordSetupToken(accountId: string, inviteId?: string) {
    const payload: PasswordSetupPayload = {
      sub: accountId,
      type: 'password_setup',
      ...(inviteId ? { inviteId } : {}),
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: PASSWORD_SETUP_TTL_SECONDS,
    });
  }

  private signPasswordResetToken(accountId: string, resetCodeId: string) {
    const payload: PasswordResetPayload = {
      sub: accountId,
      resetCodeId,
      type: 'password_reset',
    };

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: PASSWORD_RESET_VERIFICATION_TTL_SECONDS,
    });
  }

  private async verifyPasswordResetToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<PasswordResetPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );

      if (payload.type !== 'password_reset') {
        throw new Error();
      }

      return payload;
    } catch {
      throw new UnauthorizedException('The password reset code is invalid');
    }
  }

  private async verifyPasswordSetupToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<PasswordSetupPayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );

      if (payload.type !== 'password_setup') {
        throw new Error();
      }

      return payload;
    } catch {
      throw new UnauthorizedException('The password setup session is invalid');
    }
  }

  private async verifyMfaChallengeToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<MfaChallengePayload>(
        token,
        {
          secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        },
      );

      if (payload.type !== 'mfa_challenge') {
        throw new Error();
      }

      return payload;
    } catch {
      throw new UnauthorizedException('The verification session is invalid');
    }
  }

  private generateCode() {
    return this.generateFixedLengthCode(MFA_CODE_LENGTH);
  }

  private generateFixedLengthCode(length: number) {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, '0');
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getIdleExpiresInMs(lastActive: Date) {
    return Math.min(
      this.sessionIdleTimeoutMs,
      Math.max(
        0,
        this.sessionIdleTimeoutMs - (Date.now() - lastActive.getTime()),
      ),
    );
  }

  private get sessionIdleTimeoutMs() {
    return this.getDuration(
      AUTH_TIMING_CONFIG.sessionIdleTimeout.environmentKey,
      AUTH_TIMING_CONFIG.sessionIdleTimeout.defaultMs,
    );
  }

  private get touchIntervalMs() {
    return this.getDuration(
      AUTH_TIMING_CONFIG.touchInterval.environmentKey,
      AUTH_TIMING_CONFIG.touchInterval.defaultMs,
    );
  }

  private getDuration(key: string, fallback: number) {
    return this.getPositiveNumberConfig(key, fallback);
  }

  private getPositiveNumberConfig(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private getPositiveIntegerConfig(key: string, fallback: number) {
    const value = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
