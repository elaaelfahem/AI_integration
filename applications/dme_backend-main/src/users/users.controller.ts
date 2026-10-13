import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  ConnectionEventDto,
  ExportUsersQueryDto,
  ManagedUserActionDto,
  ManagedUserDto,
  UserManagementSummaryDto,
} from './dto/user-management-response.dto';
import { NotificationPreferencesDto } from './dto/notification-preferences.dto';
import { UpdateLanguageDto } from './dto/language.dto';
import { UsersService } from './users.service';
import { UsersCompaniesService } from './users-companies.service';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(APP_ROLES.SUPERADMIN)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly usersCompanies: UsersCompaniesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List active manager and agent accounts' })
  @ApiOkResponse({ type: ManagedUserDto, isArray: true })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can list users',
  })
  listUsers(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.usersService.listActiveUsers(request.user.sub);
  }

  @Get('agents')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({
    summary: 'List active agents assigned to the current manager',
  })
  listManagerAgents(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.usersService.listManagerAgents(request.user.sub);
  }

  @Get('me')
  @Roles()
  @ApiOperation({ summary: "Get the caller's own profile" })
  @ApiOkResponse({ type: ManagedUserDto })
  @ApiUnauthorizedResponse({
    description: 'Missing or expired access token',
  })
  getOwnProfile(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.usersService.getOwnProfile(request.user.sub);
  }

  @Get('me/connections')
  @Roles()
  @ApiOperation({ summary: "Get the caller's own connection history" })
  @ApiOkResponse({ type: ConnectionEventDto, isArray: true })
  @ApiUnauthorizedResponse({
    description: 'Missing or expired access token',
  })
  getOwnConnectionHistory(
    @Req() request: Request & { user: AccessTokenPayload },
  ) {
    return this.usersService.getOwnConnectionHistory(request.user.sub);
  }

  @Patch('me')
  @Roles()
  @ApiOperation({ summary: "Update the caller's own profile" })
  @ApiOkResponse({ type: ManagedUserDto })
  updateOwnProfile(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateOwnProfile(
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Post('me/avatar')
  @Roles()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: "Upload or replace the caller's profile photo" })
  @ApiOkResponse({ type: ManagedUserDto })
  uploadOwnAvatar(
    @Req() request: Request & { user: AccessTokenPayload },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadOwnAvatar(
      request.user.sub,
      request.user.role,
      file,
    );
  }

  @Delete('me/avatar')
  @Roles()
  @ApiOperation({ summary: "Remove the caller's profile photo" })
  @ApiOkResponse({ type: ManagedUserDto })
  removeOwnAvatar(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.usersService.removeOwnAvatar(
      request.user.sub,
      request.user.role,
    );
  }

  @Get('me/companies')
  @Roles()
  @ApiOperation({
    summary: "The caller's companies (managed, or visited for an agent)",
  })
  listOwnCompanies(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.usersCompanies.list(
      request.user.sub,
      request.user.role,
      request.user.sub,
    );
  }

  @Get(':userId/companies')
  @Roles()
  @ApiOperation({
    summary:
      'Companies of a user: managed ones for a manager, visited ones for an agent',
    description:
      'Superadmins can see anyone, managers themselves and their agents, agents themselves. Each company comes with visit counts and the last / next visit date.',
  })
  listUserCompanies(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.usersCompanies.list(
      request.user.sub,
      request.user.role,
      userId,
    );
  }

  @Get(':userId/avatar')
  @Roles()
  @ApiOperation({ summary: "Download a user's profile photo" })
  @ApiUnauthorizedResponse({
    description:
      'Only your own avatar, or (for managers/superadmins) an avatar within your scope',
  })
  async getAvatar(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Res() response: Response,
  ) {
    const { data, mime } = await this.usersService.getAvatar(
      request.user.sub,
      request.user.role,
      userId,
    );
    response.setHeader('Content-Type', mime);
    response.send(data);
  }

  @Patch('me/language')
  @Roles()
  @ApiOperation({
    summary: "Save the caller's language (interface, emails, notifications)",
    description:
      'fr or en. New and invited accounts start in French; emails and notifications follow this setting.',
  })
  @ApiOkResponse({ type: ManagedUserDto })
  updateLanguage(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.usersService.updateLanguage(
      request.user.sub,
      request.user.role,
      dto.language,
    );
  }

  @Patch('me/notification-preferences')
  @Roles()
  @ApiOperation({
    summary: "Toggle the caller's notification preferences",
  })
  @ApiOkResponse({ type: ManagedUserDto })
  updateNotificationPreferences(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: NotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Get(':userId/connections')
  @ApiOperation({ summary: "Get a managed user's connection history" })
  @ApiOkResponse({ type: ConnectionEventDto, isArray: true })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can view connection history',
  })
  getConnectionHistory(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.usersService.getConnectionHistory(request.user.sub, userId);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export active users as a CSV or Excel file' })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can export users',
  })
  async exportUsers(
    @Req() request: Request & { user: AccessTokenPayload },
    @Query() query: ExportUsersQueryDto,
    @Res() response: Response,
  ) {
    const format = query.format ?? 'csv';
    const { buffer, filename, contentType } =
      await this.usersService.exportUsers(request.user.sub, format);

    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get user management summary counts' })
  @ApiOkResponse({ type: UserManagementSummaryDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can view user management counts',
  })
  getSummary(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.usersService.getSummary(request.user.sub);
  }

  @Patch(':userId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({ summary: "Update a managed user's profile details" })
  @ApiOkResponse({ type: ManagedUserDto })
  @ApiUnauthorizedResponse({
    description:
      "Only an active superadmin or the user's manager can edit this user",
  })
  updateUser(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(request.user.sub, userId, dto);
  }

  @Post(':userId/block')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({ summary: 'Block an active manager or agent account' })
  @ApiOkResponse({ type: ManagedUserActionDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can block users',
  })
  blockUser(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.usersService.blockUser(request.user.sub, userId);
  }

  @Post(':userId/unblock')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({ summary: 'Unblock a blocked manager or agent account' })
  @ApiOkResponse({ type: ManagedUserActionDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can unblock users',
  })
  unblockUser(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.usersService.unblockUser(request.user.sub, userId);
  }

  @Delete(':userId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({ summary: 'Delete a manager or agent account' })
  @ApiOkResponse({ type: ManagedUserActionDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can delete users',
  })
  deleteUser(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.usersService.deleteUser(request.user.sub, userId);
  }

  @Post(':userId/password-reset')
  @ApiOperation({
    summary: 'Require a password reset the next time a user signs in',
  })
  @ApiOkResponse({ type: ManagedUserActionDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can require password resets',
  })
  requirePasswordReset(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.usersService.requirePasswordReset(request.user.sub, userId);
  }
}
