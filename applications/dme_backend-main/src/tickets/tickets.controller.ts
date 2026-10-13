import {
  BadRequestException,
  Body,
  Controller,
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
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiConsumes,
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
  AssignTicketDto,
  CreateTicketDto,
  CreateTicketReplyDto,
  ListTicketsQueryDto,
  TicketDto,
  UpdateTicketDto,
} from './dto/ticket.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(AccessTokenGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'List tickets visible to the caller',
    description:
      'Superadmins see every ticket. Managers and agents only see tickets they reported themselves.',
  })
  @ApiOkResponse({ type: TicketDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'A valid access token is required' })
  list(
    @Req() request: { user: AccessTokenPayload },
    @Query() query: ListTicketsQueryDto,
  ) {
    return this.tickets.list(request.user.sub, request.user.role, query);
  }

  @Get('stats')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Get ticket counts by status for the caller' })
  stats(@Req() request: { user: AccessTokenPayload }) {
    return this.tickets.stats(request.user.sub, request.user.role);
  }

  @Get('assignees')
  @Roles(APP_ROLES.SUPERADMIN)
  @ApiOperation({ summary: 'List administrators tickets can be assigned to' })
  listAssignees(@Req() request: { user: AccessTokenPayload }) {
    return this.tickets.listAssignees(request.user.role);
  }

  @Get(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Get a ticket' })
  @ApiOkResponse({ type: TicketDto })
  @ApiForbiddenResponse({
    description: 'The ticket is outside the caller scope',
  })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    return this.tickets.get(id, request.user.sub, request.user.role);
  }

  @Get(':id/attachment')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Download a ticket attachment' })
  async getAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Res() response: Response,
  ) {
    const { data, filename, mime } = await this.tickets.getAttachment(
      id,
      request.user.sub,
      request.user.role,
    );
    response.setHeader('Content-Type', mime);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeAttachmentFilename(filename)}"`,
    );
    response.send(data);
  }

  @Post()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_request, file, callback) => {
        const allowed = ['image/jpeg', 'image/png', 'application/pdf'].includes(
          file.mimetype,
        );
        callback(
          allowed
            ? null
            : new BadRequestException(
                'Only PDF, JPEG, and PNG attachments are supported',
              ),
          allowed,
        );
      },
    }),
  )
  @ApiOperation({
    summary: 'Report a new ticket',
    description:
      'Any authenticated user can report a ticket. Only superadmins can update its status afterwards.',
  })
  @ApiOkResponse({ type: TicketDto })
  create(
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: CreateTicketDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.tickets.create(request.user.sub, dto, file, request.user.role);
  }

  @Patch(':id')
  @Roles(APP_ROLES.SUPERADMIN)
  @ApiOperation({
    summary: 'Update ticket status or priority',
    description: 'Superadmins only.',
  })
  @ApiOkResponse({ type: TicketDto })
  @ApiForbiddenResponse({
    description: 'Only an administrator can manage tickets',
  })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: UpdateTicketDto,
  ) {
    return this.tickets.update(id, request.user.sub, request.user.role, dto);
  }

  @Post(':id/replies')
  @Roles(APP_ROLES.SUPERADMIN)
  @ApiOperation({
    summary: 'Reply to a ticket',
    description: 'Superadmins only.',
  })
  @ApiOkResponse({ type: TicketDto })
  @ApiForbiddenResponse({
    description: 'Only an administrator can manage tickets',
  })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  addReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: CreateTicketReplyDto,
  ) {
    return this.tickets.addReply(id, request.user.sub, request.user.role, dto);
  }

  @Patch(':id/assign')
  @Roles(APP_ROLES.SUPERADMIN)
  @ApiOperation({
    summary: 'Assign a ticket to an administrator, or unassign it',
    description: 'Superadmins only.',
  })
  @ApiOkResponse({ type: TicketDto })
  @ApiForbiddenResponse({
    description: 'Only an administrator can manage tickets',
  })
  @ApiNotFoundResponse({ description: 'Ticket or assignee not found' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: AssignTicketDto,
  ) {
    return this.tickets.assign(id, request.user.sub, request.user.role, dto);
  }
}

function safeAttachmentFilename(filename: string) {
  return (
    filename.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'attachment'
  );
}
