import { ApiProperty } from '@nestjs/swagger';

export class AccountDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'admin123@example.com' })
  email: string;

  @ApiProperty({ enum: ['SUPERADMIN', 'MANAGER', 'AGENT'] })
  role: string;

  @ApiProperty({ example: 'Super' })
  firstName: string;

  @ApiProperty({ example: 'Admin' })
  lastName: string;
}

export class AuthResponseDto {
  @ApiProperty({ example: false })
  mfaRequired: false;

  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;

  @ApiProperty({ format: 'date-time' })
  lastActive: string;

  @ApiProperty({ example: 900000 })
  idleExpiresInMs: number;

  @ApiProperty({ example: 60000 })
  touchIntervalMs: number;

  @ApiProperty({ type: AccountDto })
  account: AccountDto;
}

export class MfaChallengeResponseDto {
  @ApiProperty({ example: true })
  mfaRequired: true;

  @ApiProperty({ description: 'Opaque token to pass to the /mfa endpoints' })
  mfaToken: string;

  @ApiProperty({
    enum: ['EMAIL', 'SMS', 'AUTH'],
    nullable: true,
    description: 'Null when the account has not chosen an MFA method yet',
  })
  mfaType: 'EMAIL' | 'SMS' | 'AUTH' | null;

  @ApiProperty({ example: 'admin123@example.com' })
  email: string;

  @ApiProperty({
    example: '+216 XX XXX 56',
    nullable: true,
    description: 'Masked phone number, present when one is on file',
  })
  phone: string | null;
}

export class PasswordSetupResponseDto {
  @ApiProperty({ example: true })
  passwordSetupRequired: true;

  @ApiProperty({
    description: 'Opaque token to pass to /password/setup',
  })
  setupToken: string;

  @ApiProperty({ example: 'admin123@example.com' })
  email: string;

  @ApiProperty({ example: 'Super' })
  firstName: string;
}

export class ForcedPasswordResetResponseDto {
  @ApiProperty({ example: true })
  passwordResetRequired: true;

  @ApiProperty({ example: 'manager@example.com' })
  email: string;

  @ApiProperty({ example: 'Amina' })
  firstName: string;
}

export class MfaCodeSentResponseDto {
  @ApiProperty({ example: true })
  sent: boolean;

  @ApiProperty({ enum: ['EMAIL', 'SMS', 'AUTH'] })
  mfaType: 'EMAIL' | 'SMS' | 'AUTH';

  @ApiProperty({ example: 300 })
  expiresInSeconds: number;
}

export class TotpSetupResponseDto {
  @ApiProperty({ description: 'Base32 secret, for manual entry as a fallback' })
  secret: string;

  @ApiProperty({ description: 'otpauth:// URI encoded by the QR code' })
  otpauthUrl: string;

  @ApiProperty({
    description: 'QR code as a data: URL, ready for an <img> src',
  })
  qrCodeDataUrl: string;
}

export class RefreshResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 300 })
  expiresIn: number;

  @ApiProperty({ format: 'date-time' })
  lastActive: string;

  @ApiProperty({ example: 900000 })
  idleExpiresInMs: number;

  @ApiProperty({ example: 60000 })
  touchIntervalMs: number;
}

export class TouchResponseDto {
  @ApiProperty({
    description:
      'False when the session was already touched in the last minute',
  })
  updated: boolean;

  @ApiProperty({ format: 'date-time' })
  lastActive: string;

  @ApiProperty({ example: 900000 })
  idleExpiresInMs: number;

  @ApiProperty({ example: 60000 })
  touchIntervalMs: number;
}

export class PasswordResetRequestedResponseDto {
  @ApiProperty({ example: true })
  sent: true;
}

export class PasswordResetConfirmedResponseDto {
  @ApiProperty({ example: true })
  reset: true;
}

export class PasswordResetVerifiedResponseDto {
  @ApiProperty()
  resetToken: string;
}
