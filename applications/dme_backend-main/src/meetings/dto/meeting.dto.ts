import { MeetingStatus, VisitType } from '@prisma/client';
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMeetingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  companyId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Active agent assigned by the manager',
  })
  @IsUUID()
  agentId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when a superadmin creates the meeting',
  })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiProperty({ example: 'Initial prospecting meeting' })
  @IsString()
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({
    example: 'Present the DME offer and qualify the opportunity.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  agenda?: string;

  @ApiPropertyOptional({ example: '12 Rue de la Bourse, Tunis' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({
    format: 'uri',
    example: 'https://meet.example.com/prospecting-call',
  })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  meetingUrl?: string;

  @ApiProperty({ format: 'date-time', example: '2026-09-10T09:00:00.000Z' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ minimum: 15, maximum: 480, example: 60 })
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;

  @ApiPropertyOptional({ enum: VisitType, default: VisitType.FIRST_VISIT })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @ApiPropertyOptional({
    default: true,
    description: '"Recevez un rappel 1 jour avant la visite."',
  })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;
}

export class UpdateMeetingDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Superadmins only' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Managers and superadmins only',
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  agenda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  meetingUrl?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @ApiPropertyOptional({ enum: VisitType })
  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional({
    description: 'Reminder the day before (agents can change it)',
  })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Required when cancelling a meeting' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationReason?: string;

  @ApiPropertyOptional({
    description: 'Agents may add this only when completing their own meeting',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  outcome?: string;

  @ApiPropertyOptional({
    description: 'Agents may add this only when completing their own meeting',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  completionNotes?: string;
}

export class ListMeetingsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Superadmins only' })
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Superadmins and managers only',
  })
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ProspectingMeetingDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  scheduled_at: string;

  @ApiProperty({ enum: MeetingStatus })
  status: MeetingStatus;
}
