import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class ManagedUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: ['ADMIN', 'MANAGER', 'AGENT'] })
  role: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ nullable: true })
  phone: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  latestLogin: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  lastActive: string | null;

  @ApiProperty()
  isOnline: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty()
  passwordResetRequired: boolean;

  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'BLOCKED'] })
  status: string;

  @ApiProperty({ nullable: true })
  managerName: string | null;
}

export class ManagedUserActionDto {
  @ApiProperty({ example: true })
  updated: true;
}

export class UserManagementSummaryDto {
  @ApiProperty()
  superadmins: number;
}

export class ExportUsersQueryDto {
  @ApiPropertyOptional({ enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx' = 'csv';
}

export class ConnectionEventDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ nullable: true })
  ipAddress: string | null;

  @ApiProperty()
  device: string;

  @ApiProperty()
  browser: string;

  @ApiProperty({ enum: ['SUCCESS', 'MFA_REQUIRED', 'FAILED'] })
  status: string;
}
