import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ListNotificationsQueryDto,
  NotificationIdsDto,
  NotificationPageDto,
  RegisterDeviceDto,
  UnregisterDeviceDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

type AuthedRequest = { user: AccessTokenPayload };

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
@ApiUnauthorizedResponse({ description: 'A valid access token is required' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: "List the caller's notifications, newest first",
    description:
      'Filters: q searches title and body, status (all, unread, read), category (security, team, visits, reports, tickets, data).',
  })
  @ApiOkResponse({ type: NotificationPageDto })
  list(
    @Req() request: AuthedRequest,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(request.user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications (bell badge)' })
  async unreadCount(@Req() request: AuthedRequest) {
    return { count: await this.notifications.unreadCount(request.user.sub) };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  markRead(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(request.user.sub, id);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark every notification as read' })
  markAllRead(@Req() request: AuthedRequest) {
    return this.notifications.markAllRead(request.user.sub);
  }

  @Post('read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark the selected notifications as read' })
  markManyRead(@Req() request: AuthedRequest, @Body() dto: NotificationIdsDto) {
    return this.notifications.markManyRead(request.user.sub, dto.ids);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one notification' })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  remove(
    @Req() request: AuthedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.remove(request.user.sub, id);
  }

  @Post('delete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete the selected notifications (up to 100)' })
  removeMany(@Req() request: AuthedRequest, @Body() dto: NotificationIdsDto) {
    return this.notifications.removeMany(request.user.sub, dto.ids);
  }

  @Post('delete-read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete every notification already read' })
  removeRead(@Req() request: AuthedRequest) {
    return this.notifications.removeRead(request.user.sub);
  }

  @Post('devices')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Register this browser or phone for push notifications',
    description:
      'Call after login and on every app start: FCM tokens can change. Re-registering an existing token refreshes it.',
  })
  registerDevice(
    @Req() request: AuthedRequest,
    @Body() dto: RegisterDeviceDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.notifications.registerDevice(
      request.user.sub,
      dto.token,
      dto.platform,
      userAgent,
    );
  }

  @Post('devices/unregister')
  @HttpCode(200)
  @ApiOperation({ summary: 'Stop push notifications on this device (logout)' })
  unregisterDevice(
    @Req() request: AuthedRequest,
    @Body() dto: UnregisterDeviceDto,
  ) {
    return this.notifications.unregisterDevice(request.user.sub, dto.token);
  }
}
