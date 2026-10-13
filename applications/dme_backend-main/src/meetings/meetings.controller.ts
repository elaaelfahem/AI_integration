import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
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
  CreateMeetingDto,
  ListMeetingsQueryDto,
  ProspectingMeetingDto,
  UpdateMeetingDto,
} from './dto/meeting.dto';
import { MeetingsService } from './meetings.service';

@ApiTags('Prospecting meetings')
@ApiBearerAuth()
@Controller('meetings')
@UseGuards(AccessTokenGuard, RolesGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'List prospecting meetings visible to the caller',
    description:
      'Superadmins can view every meeting and filter by manager. Managers receive meetings they scheduled for their active company catalogue and team agents. Agents only receive meetings assigned to them.',
  })
  @ApiOkResponse({ type: ProspectingMeetingDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  list(
    @Req() request: { user: AccessTokenPayload },
    @Query() query: ListMeetingsQueryDto,
  ) {
    return this.meetings.list(request.user.sub, request.user.role, query);
  }

  @Get(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'Get a prospecting meeting',
    description:
      'Superadmins can read every meeting. Managers can read their own meetings, and agents can read only meetings assigned to them.',
  })
  @ApiOkResponse({ type: ProspectingMeetingDto })
  @ApiForbiddenResponse({
    description: 'The meeting is outside the caller scope',
  })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    return this.meetings.get(id, request.user.sub, request.user.role);
  }

  @Post()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'Schedule a prospecting meeting and assign an agent',
    description:
      'Managers can schedule active companies for active agents reporting to them. Superadmins must provide managerId and are subject to the same active company and agent relationship checks. Agents can schedule only for themselves, for active companies; agentId/managerId in the payload are ignored for agents. The agent cannot have an overlapping scheduled or in-progress meeting.',
  })
  @ApiOkResponse({ type: ProspectingMeetingDto })
  @ApiBadRequestResponse({
    description:
      'The meeting is in the past, invalid, or overlaps an existing meeting for the agent',
  })
  @ApiForbiddenResponse({
    description: 'Company, manager, or agent relationship is invalid',
  })
  create(
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: CreateMeetingDto,
  ) {
    return this.meetings.create(request.user.sub, request.user.role, dto);
  }

  @Patch(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'Manage a prospecting meeting',
    description:
      'Managers can reschedule, reassign, cancel, mark no-show, or complete their own meetings. Superadmins can do this for every meeting and may move it to another manager when the company and agent relationships remain valid. Agents can edit the details (title, agenda, location, meeting URL, schedule, duration, visit type) of their own meetings while not completed/cancelled/no-show, and can start or complete meetings assigned to them, but cannot reassign or cancel. Completion requires an outcome and may include completionNotes; agents may also edit the outcome/completionNotes afterwards on their own already-completed meetings.',
  })
  @ApiOkResponse({ type: ProspectingMeetingDto })
  @ApiBadRequestResponse({
    description:
      'Invalid status transition, missing cancellation reason or outcome, past schedule, or a conflicting agent meeting',
  })
  @ApiForbiddenResponse({
    description: 'The caller cannot manage this meeting',
  })
  @ApiNotFoundResponse({ description: 'Meeting not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetings.update(id, request.user.sub, request.user.role, dto);
  }
}
