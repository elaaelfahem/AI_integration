import {
  VisitReportInterestLevel,
  VisitReportNeed,
  VisitReportOutcome,
  VisitReportSolution,
  VisitReportStatus,
} from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SaveVisitReportDto {
  @ApiPropertyOptional({ example: 'Réunion très constructive avec…' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @ApiPropertyOptional({ enum: VisitReportNeed, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(VisitReportNeed, { each: true })
  needs?: VisitReportNeed[];

  @ApiPropertyOptional({ enum: VisitReportSolution, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(VisitReportSolution, { each: true })
  solutions?: VisitReportSolution[];

  @ApiPropertyOptional({ enum: VisitReportInterestLevel })
  @IsOptional()
  @IsEnum(VisitReportInterestLevel)
  interestLevel?: VisitReportInterestLevel;

  @ApiPropertyOptional({ enum: VisitReportOutcome })
  @IsOptional()
  @IsEnum(VisitReportOutcome)
  outcomeResult?: VisitReportOutcome;
}

export class AddVisitReportNoteDto {
  @ApiProperty({ example: "Client demande un devis pour l'offre SD-WAN." })
  @IsString()
  @MaxLength(2000)
  body!: string;
}

export class ReviewVisitReportDto {
  @ApiProperty({ enum: ['IN_REVIEW', 'VALIDATED'] })
  @IsEnum(VisitReportStatus)
  status!: VisitReportStatus;
}

export class ListVisitReportsQueryDto {
  @ApiPropertyOptional({ enum: VisitReportStatus })
  @IsOptional()
  @IsEnum(VisitReportStatus)
  status?: VisitReportStatus;

  @ApiPropertyOptional({ enum: VisitReportOutcome })
  @IsOptional()
  @IsEnum(VisitReportOutcome)
  outcomeResult?: VisitReportOutcome;

  @ApiPropertyOptional({ enum: VisitReportInterestLevel })
  @IsOptional()
  @IsEnum(VisitReportInterestLevel)
  interestLevel?: VisitReportInterestLevel;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  companyId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  to?: string;
}
