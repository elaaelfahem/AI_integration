import { TicketPriority, TicketStatus, TicketType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty({ enum: TicketType })
  @IsEnum(TicketType)
  type!: TicketType;

  @ApiProperty({ example: 'Erreur lors de l’export PDF' })
  @IsString()
  @MaxLength(160)
  subject!: string;

  @ApiProperty({ example: 'Le rapport ne se télécharge pas.' })
  @IsString()
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Company the ticket is about',
  })
  @IsOptional()
  @IsUUID()
  relatedCompanyId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Visit (meeting) the ticket is about. Sets the company too.',
  })
  @IsOptional()
  @IsUUID()
  relatedMeetingId?: string;
}

export class UpdateTicketDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}

export class ListTicketsQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ enum: TicketType })
  @IsOptional()
  @IsEnum(TicketType)
  type?: TicketType;

  @ApiPropertyOptional({ enum: TicketPriority })
  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @ApiPropertyOptional({
    description:
      'Searches the subject, the description and the reference number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Created on or after',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Created before' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  relatedCompanyId?: string;
}

export class CreateTicketReplyDto {
  @ApiProperty({ example: 'Nous investiguons le problème.' })
  @IsString()
  @MaxLength(2000)
  message!: string;
}

export class AssignTicketDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Superadmin account to assign the ticket to, or null to unassign',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  assigneeId?: string | null;
}

export class TicketDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  number: number;

  @ApiProperty({ enum: TicketType })
  type: TicketType;

  @ApiProperty()
  subject: string;

  @ApiProperty({ enum: TicketStatus })
  status: TicketStatus;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Company the ticket is about: { id, name }',
  })
  related_company: { id: string; name: string } | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Visit the ticket is about: { id, title, scheduled_at }',
  })
  related_meeting: { id: string; title: string; scheduled_at: string } | null;
}
