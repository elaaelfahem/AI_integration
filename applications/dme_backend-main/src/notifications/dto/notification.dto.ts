import { DevicePlatform } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_ENTITY_TYPES,
  type NotificationCategory,
} from '../notification.types';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'Firebase Cloud Messaging registration token' })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token!: string;

  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}

export class UnregisterDeviceDto {
  @ApiProperty({ description: 'Token previously registered on this device' })
  @IsString()
  @MaxLength(4096)
  token!: string;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Id of the last notification of the previous page',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Searches title and body' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ['all', 'unread', 'read'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'unread', 'read'])
  status?: 'all' | 'unread' | 'read';

  @ApiPropertyOptional({ enum: Object.keys(NOTIFICATION_CATEGORIES) })
  @IsOptional()
  @IsIn(Object.keys(NOTIFICATION_CATEGORIES))
  category?: NotificationCategory;
}

export class NotificationIdsDto {
  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class NotificationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'ASSIGNMENT_CREATED' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional({ nullable: true, example: '/assignments' })
  link!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    enum: NOTIFICATION_ENTITY_TYPES,
    description: 'What the notification is about (open that item in the app)',
  })
  entityType!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'Id of that item. For visit_report it is the meeting id.',
  })
  entityId!: string | null;
  @ApiPropertyOptional({ nullable: true }) readAt!: string | null;
  @ApiProperty() createdAt!: string;
}

export class NotificationPageDto {
  @ApiProperty({ type: NotificationDto, isArray: true })
  items!: NotificationDto[];
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
  @ApiProperty({ description: 'Notifications matching the filters' })
  total!: number;
  @ApiProperty({ description: 'All unread notifications (badge)' })
  unreadCount!: number;
}
