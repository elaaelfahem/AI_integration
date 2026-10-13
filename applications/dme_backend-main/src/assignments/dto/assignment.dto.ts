import {
  AssignmentPriority,
  AssignmentStatus,
  VisitType,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID() companyId!: string;
  @IsUUID() agentId!: string;
  @IsOptional() @IsUUID() managerId?: string;
  @IsDateString() scheduledAt!: string;
  @IsInt() @Min(15) @Max(480) durationMinutes!: number;
  @IsEnum(VisitType) visitType!: VisitType;
  @IsEnum(AssignmentPriority) priority!: AssignmentPriority;
  @IsOptional() @IsString() objectives?: string;
  /** "Recevez un rappel 1 jour avant la visite." Defaults to true. */
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() agentId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsInt() @Min(15) @Max(480) durationMinutes?: number;
  @IsOptional() @IsEnum(VisitType) visitType?: VisitType;
  @IsOptional() @IsEnum(AssignmentPriority) priority?: AssignmentPriority;
  @IsOptional() @IsString() objectives?: string;
  @IsOptional() @IsEnum(AssignmentStatus) status?: AssignmentStatus;
  @IsOptional() @IsString() cancellationReason?: string;
  /** Agents may change it on their own assignments. */
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
}
