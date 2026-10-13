import { CollectionMethod, DataSourceType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDataSourceDto {
  @ApiProperty({ example: 'Registre National des Entreprises' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: DataSourceType })
  @IsEnum(DataSourceType)
  type!: DataSourceType;

  @ApiProperty({ enum: CollectionMethod })
  @IsEnum(CollectionMethod)
  collectionMethod!: CollectionMethod;

  @ApiPropertyOptional({
    example: 'https://www.registre-entreprises.tn',
    description: 'URL publique ou libellé de référence opérationnel.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  configurationReference?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/logo.png',
    description: 'URL publique de l’image du logo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({
    example: 'Description détaillée de la source.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateDataSourceDto {
  @ApiPropertyOptional({ example: 'Registre National des Entreprises' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: DataSourceType })
  @IsOptional()
  @IsEnum(DataSourceType)
  type?: DataSourceType;

  @ApiPropertyOptional({ enum: CollectionMethod })
  @IsOptional()
  @IsEnum(CollectionMethod)
  collectionMethod?: CollectionMethod;

  @ApiPropertyOptional({
    description: 'URL publique ou libellé de référence opérationnel.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  configurationReference?: string | null;

  @ApiPropertyOptional({
    description: 'URL publique de l’image du logo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class StartCollectionJobDto {
  @ApiProperty({
    type: [String],
    description: 'Enabled data-source identifiers to use for this job.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  sourceIds!: string[];

  @ApiPropertyOptional({ example: 'Fintech' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sector?: string;

  @ApiPropertyOptional({ example: 'Tunis' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  governorate?: string;

  @ApiPropertyOptional({ example: 'cloud connectivity' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  query?: string;
}
