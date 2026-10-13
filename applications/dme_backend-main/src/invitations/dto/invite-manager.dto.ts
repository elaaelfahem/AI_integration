import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class InviteManagerDto {
  @ApiProperty({ example: 'manager@example.com' })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'Amina', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ example: 'Manager', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ enum: UserRole, example: UserRole.MANAGER })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  mfaEnabled?: boolean;

  @ApiProperty({ example: '+216 22 456 789', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({
    format: 'uuid',
    required: false,
    description:
      'The managing manager for an agent invited by a superadmin. Required when a superadmin invites an agent.',
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class CheckInvitationDto {
  @ApiProperty({ description: 'Raw invitation token from the link' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}

export class VerifyInvitationDto extends CheckInvitationDto {
  @ApiProperty({ description: 'Temporary password from the invitation email' })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
