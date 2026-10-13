import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import {
  CheckInvitationDto,
  InviteManagerDto,
  VerifyInvitationDto,
} from './dto/invite-manager.dto';
import { InvitationsService } from './invitations.service';
import {
  InvitationAcceptedDto,
  InvitationCancelledDto,
  InvitationCheckDto,
  InvitationSentDto,
  ManagerResponseDto,
} from './dto/manager-response.dto';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('managers')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List pending user invitations and status' })
  @ApiOkResponse({ type: ManagerResponseDto, isArray: true })
  listManagers(@Req() request: Request & { user: AccessTokenPayload }) {
    return this.invitationsService.listManagers(request.user.sub);
  }

  @Post('managers')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a manager or agent by email and role' })
  @ApiCreatedResponse({ type: InvitationSentDto })
  async inviteManager(
    @Req() request: Request & { user: AccessTokenPayload },
    @Body() dto: InviteManagerDto,
  ) {
    return this.invitationsService.inviteManager(request.user.sub, dto);
  }

  @Post('managers/:managerId/resend')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resend a pending manager invitation' })
  @ApiOkResponse({ type: InvitationSentDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can resend invitations',
  })
  resendManagerInvitation(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('managerId', ParseUUIDPipe) managerId: string,
  ) {
    return this.invitationsService.resendManagerInvitation(
      request.user.sub,
      managerId,
    );
  }

  @Post('managers/:managerId/cancel')
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel a pending manager invitation without deleting it',
  })
  @ApiOkResponse({ type: InvitationCancelledDto })
  @ApiUnauthorizedResponse({
    description: 'Only an active superadmin can cancel invitations',
  })
  cancelManagerInvitation(
    @Req() request: Request & { user: AccessTokenPayload },
    @Param('managerId', ParseUUIDPipe) managerId: string,
  ) {
    return this.invitationsService.cancelManagerInvitation(
      request.user.sub,
      managerId,
    );
  }

  @Post('check')
  @ApiOperation({
    summary:
      'Check an invitation link before requesting the temporary password',
  })
  @ApiOkResponse({ type: InvitationCheckDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, used, or locked invitation',
  })
  checkInvitation(@Body() dto: CheckInvitationDto) {
    return this.invitationsService.checkInvitation(dto);
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Validate an invitation link and temporary password',
  })
  @ApiOkResponse({ type: InvitationAcceptedDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, used, or locked invitation',
  })
  verifyInvitation(@Body() dto: VerifyInvitationDto) {
    return this.invitationsService.verifyInvitation(dto);
  }
}
