import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const PROSPECTING_EMPLOYEE_RANGES = ['10-50', '50-250', '250+'] as const;

export class UpdateProspectingCriteriaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sector?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  governorate?: string | null;

  @IsOptional()
  @IsIn(PROSPECTING_EMPLOYEE_RANGES)
  employeeRange?: (typeof PROSPECTING_EMPLOYEE_RANGES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  query?: string | null;
}

export class StartProspectingDto extends UpdateProspectingCriteriaDto {}

export class AssignProspectDto {
  @IsUUID()
  agentId!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsDateString()
  scheduledAt!: string;
}
