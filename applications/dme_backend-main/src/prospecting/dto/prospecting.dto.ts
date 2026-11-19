import { Type } from 'class-transformer';
import {
  IsDateString,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsUrl,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
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

export class SuppliedCompanyDto {
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2000)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  location?: string;
}

export class StartProspectingDto extends UpdateProspectingCriteriaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  targetCompanies?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SuppliedCompanyDto)
  suppliedCompanies?: SuppliedCompanyDto[];
}

export class AssignProspectDto {
  @IsUUID()
  agentId!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;

  @IsDateString()
  scheduledAt!: string;
}
