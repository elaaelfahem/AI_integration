import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ClientCategory, CompanyStatus } from '@prisma/client';

export class CreateCompanyDto {
  @IsString() @MaxLength(255) name!: string;
  @IsOptional() @IsString() @MaxLength(120) sector?: string | null;
  @IsOptional() @IsString() @MaxLength(160) contactName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string | null;
  @IsOptional() @IsString() @MaxLength(500) address?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) aiScore?: number | null;
  @IsOptional() @IsString() @MaxLength(60) governorate?: string | null;
  @IsOptional() @IsString() @MaxLength(80) delegation?: string | null;
  @IsOptional()
  @IsEnum(ClientCategory)
  clientCategory?: ClientCategory | null;
  @IsOptional() @IsInt() @Min(0) @Max(20000) mobileLines?: number | null;
  @IsOptional() @IsUUID() managerId?: string | null;
}

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;
}
