import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ProspectionStatus } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProspectionDto {
  @IsEnum(ProspectionStatus)
  status!: ProspectionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;
}

export class SubmitReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  summary!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  needs!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  outcome!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  objections?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  suggestedOffer?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;
}

export class MonthlyReportQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description:
      'Month as YYYY-MM. Defaults to the current month (Tunis time).',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must look like 2026-10',
  })
  month?: string;
}
