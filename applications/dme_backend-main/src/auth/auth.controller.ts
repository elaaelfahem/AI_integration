import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { SetupPasswordDto } from './dto/setup-password.dto';
import {
  AuthResponseDto,
  ForcedPasswordResetResponseDto,
  MfaChallengeResponseDto,
  MfaCodeSentResponseDto,
  PasswordResetConfirmedResponseDto,
  PasswordResetRequestedResponseDto,
  PasswordResetVerifiedResponseDto,
  PasswordSetupResponseDto,
  RefreshResponseDto,
  TotpSetupResponseDto,
  TouchResponseDto,
} from './dto/auth-response.dto';
import { MfaRequestCodeDto, MfaVerifyDto } from './dto/mfa.dto';
import {
  CompletePasswordResetDto,
  ConfirmPasswordResetDto,
  RequestPasswordResetDto,
} from './dto/reset-password.dto';
import { TotpConfirmDto, TotpSetupDto } from './dto/totp.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { ConfirmEnableMfaDto } from './dto/enable-mfa.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AccessTokenGuard } from './guards/access-token.guard';
import { AccessTokenPayload } from './auth.types';

abstract class AuthCookieController {
  constructor(
    protected readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  protected setRefreshCookie(response: Response, token: string) {
    response.cookie(REFRESH_COOKIE_NAME, token, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
  }

  protected cookieOptions() {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('COOKIE_SECURE') === 'true',
      sameSite: 'strict' as const,
      path: '/',
    };
  }
}

@ApiTags('Auth')
@ApiExtraModels(
  AuthResponseDto,
  MfaChallengeResponseDto,
  PasswordSetupResponseDto,
  ForcedPasswordResetResponseDto,
)
@Controller()
export class AuthController extends AuthCookieController {
  constructor(authService: AuthService, configService: ConfigService) {
    super(authService, configService);
  }

  @Get('auth/whitelist')
  @ApiOperation({
    summary: 'Get authorized email domain whitelist configuration',
  })
  getEmailWhitelist() {
    return {
      whitelist: this.authService.getEmailWhitelist(),
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in and create the account active session',
    description:
      'Pending accounts receive a password setup token. Accounts that require MFA receive a challenge token instead of a session. Active accounts that do not require MFA receive a five-minute access token and an HTTP-only refresh cookie.',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AuthResponseDto) },
        { $ref: getSchemaPath(MfaChallengeResponseDto) },
        { $ref: getSchemaPath(PasswordSetupResponseDto) },
        { $ref: getSchemaPath(ForcedPasswordResetResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or inactive account',
  })
  async login(
    @Body() credentials: LoginDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(
      credentials,
      ipAddress,
      userAgent,
    );

    if ('passwordSetupRequired' in result) {
      return result;
    }

    if ('passwordResetRequired' in result) {
      return result;
    }

    if (result.mfaRequired) {
      return {
        mfaRequired: result.mfaRequired,
        mfaToken: result.mfaToken,
        mfaType: result.mfaType,
        email: result.email,
        phone: result.phone,
      };
    }

    this.setRefreshCookie(response, result.refreshToken);
    return {
      mfaRequired: result.mfaRequired,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      lastActive: result.lastActive,
      idleExpiresInMs: result.idleExpiresInMs,
      touchIntervalMs: result.touchIntervalMs,
      account: result.account,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Rotate the refresh token and issue a new access token',
    description:
      'Fails when the signed refresh cookie does not match the active session or the session has been inactive for more than 15 minutes.',
  })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, or inactive session',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.refresh(
      request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined,
    );
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      lastActive: result.lastActive,
      idleExpiresInMs: result.idleExpiresInMs,
      touchIntervalMs: result.touchIntervalMs,
    };
  }

  @Post('touch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Record activity for the active session',
    description:
      'Validates both tokens and updates last_active at most once per minute.',
  })
  @ApiOkResponse({ type: TouchResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, or inactive session',
  })
  touch(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.authService.touch(
      request.user.sub,
      request.user.sessionId,
      request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({
    summary: 'Log out and remove the active session',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ description: 'Missing or expired access token' })
  async logout(
    @Req() request: Request & { user: AccessTokenPayload },
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      request.user.sub,
      request.user.sessionId,
      request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined,
    );
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }
}

@ApiTags('Password')
@ApiExtraModels(AuthResponseDto, MfaChallengeResponseDto)
@Controller()
export class PasswordSetupController extends AuthCookieController {
  constructor(authService: AuthService, configService: ConfigService) {
    super(authService, configService);
  }

  @Post('password/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set the first password for a pending account',
    description:
      'Validates the setup token from /login, stores the new password, activates the account, then continues through the normal login result for that account type.',
  })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(AuthResponseDto) },
        { $ref: getSchemaPath(MfaChallengeResponseDto) },
      ],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired password setup token',
  })
  async setupPassword(
    @Body() dto: SetupPasswordDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.setupPassword(
      dto,
      ipAddress,
      userAgent,
    );

    if (result.mfaRequired) {
      return {
        mfaRequired: result.mfaRequired,
        mfaToken: result.mfaToken,
        mfaType: result.mfaType,
        email: result.email,
        phone: result.phone,
      };
    }

    this.setRefreshCookie(response, result.refreshToken);
    return {
      mfaRequired: result.mfaRequired,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      lastActive: result.lastActive,
      idleExpiresInMs: result.idleExpiresInMs,
      touchIntervalMs: result.touchIntervalMs,
      account: result.account,
    };
  }

  @Post('password/reset/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password reset code',
    description:
      'Returns a generic success response for unknown emails. Active accounts receive a short-lived reset code by email. Known non-active accounts are rejected.',
  })
  @ApiOkResponse({ type: PasswordResetRequestedResponseDto })
  @ApiForbiddenResponse({
    description: 'Password reset is only available for active accounts',
  })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('password/reset/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify the emailed reset code',
    description:
      'Checks the latest valid reset code and returns a short-lived reset token for the password change step.',
  })
  @ApiOkResponse({ type: PasswordResetVerifiedResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or over-attempted reset code',
  })
  verifyPasswordResetCode(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.verifyPasswordResetCode(dto);
  }

  @Post('password/reset/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set the new password after reset code verification',
    description:
      'Consumes the verified reset token, stores the new password, and removes active sessions for the account.',
  })
  @ApiOkResponse({ type: PasswordResetConfirmedResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired reset token',
  })
  confirmPasswordReset(@Body() dto: CompletePasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Change the password for the currently authenticated account',
    description: 'Requires the current password.',
  })
  @ApiUnauthorizedResponse({ description: 'Incorrect current password' })
  changePassword(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      request.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}

@ApiTags('MFA')
@Controller()
export class MfaController extends AuthCookieController {
  constructor(authService: AuthService, configService: ConfigService) {
    super(authService, configService);
  }

  @Post('mfa/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send (or resend) a verification code for a pending MFA login',
    description:
      'The method is required the first time it is called for an account; subsequent calls reuse the chosen method unless a different one is passed.',
  })
  @ApiOkResponse({ type: MfaCodeSentResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired challenge token',
  })
  requestMfaCode(@Body() dto: MfaRequestCodeDto) {
    return this.authService.requestMfaCode(dto);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify the MFA code and create the account active session',
    description:
      'Returns a five-minute access token and writes the refresh token to an HTTP-only cookie, identical to a direct /login success.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired challenge token, or incorrect code',
  })
  async verifyMfaCode(
    @Body() dto: MfaVerifyDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyMfaCode(
      dto,
      ipAddress,
      userAgent,
    );
    this.setRefreshCookie(response, result.refreshToken);
    return {
      mfaRequired: result.mfaRequired,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      lastActive: result.lastActive,
      idleExpiresInMs: result.idleExpiresInMs,
      touchIntervalMs: result.touchIntervalMs,
      account: result.account,
    };
  }

  @Post('mfa/totp/setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Begin authenticator app enrollment',
    description:
      'Generates a new TOTP secret and returns a QR code (Google Authenticator / Microsoft Authenticator compatible). The secret is stored but does not become the active MFA method until confirmed via /mfa/totp/confirm.',
  })
  @ApiOkResponse({ type: TotpSetupResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired challenge token',
  })
  setupTotp(@Body() dto: TotpSetupDto) {
    return this.authService.setupTotp(dto.mfaToken);
  }

  @Post('mfa/totp/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm authenticator app enrollment and create the account active session',
    description:
      'Validates the code against the pending TOTP secret, activates AUTH as the MFA method, and returns a session identical to a direct /login success.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired challenge token, or incorrect code',
  })
  async confirmTotp(
    @Body() dto: TotpConfirmDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.confirmTotp(
      dto,
      ipAddress,
      userAgent,
    );
    this.setRefreshCookie(response, result.refreshToken);
    return {
      mfaRequired: result.mfaRequired,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      lastActive: result.lastActive,
      idleExpiresInMs: result.idleExpiresInMs,
      touchIntervalMs: result.touchIntervalMs,
      account: result.account,
    };
  }

  @Post('mfa/totp/self-setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Begin authenticator app enrollment for the current account',
    description:
      'Self-service equivalent of /mfa/totp/setup for an already-authenticated caller. Generates a new TOTP secret and returns a QR code; the secret is stored but does not become the active MFA method until confirmed via /mfa/totp/self-confirm.',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or expired access token' })
  setupTotpForSelf(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.authService.setupTotpForSelf(request.user.sub);
  }

  @Post('mfa/totp/self-confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm authenticator app enrollment for the current account',
    description:
      'Validates the code against the pending TOTP secret and activates AUTH as the account MFA method.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing/expired access token, or incorrect code',
  })
  confirmTotpForSelf(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: ConfirmEnableMfaDto,
  ) {
    return this.authService.confirmTotpForSelf(request.user.sub, dto.code);
  }

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Disable authenticator-app verification for the caller',
    description:
      'Requires the current password. Falls back to email verification codes rather than turning MFA off entirely, since the app always requires a second factor.',
  })
  @ApiUnauthorizedResponse({
    description: 'Incorrect password, or the authenticator app is not active',
  })
  disableTotp(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: DisableMfaDto,
  ) {
    return this.authService.disableTotp(request.user.sub, dto.password);
  }
}
