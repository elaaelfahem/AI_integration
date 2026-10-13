import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AddVisitReportNoteDto,
  ListVisitReportsQueryDto,
  ReviewVisitReportDto,
  SaveVisitReportDto,
} from './dto/visit-report.dto';
import { VisitReportsService } from './visit-reports.service';

@ApiTags('Visit reports')
@ApiBearerAuth()
@Controller('visit-reports')
@UseGuards(AccessTokenGuard, RolesGuard)
export class VisitReportsController {
  constructor(private readonly reports: VisitReportsService) {}

  @Get()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'List visit reports',
    description:
      'Managers see reports for their own team; superadmins see every report; agents see only their own.',
  })
  list(
    @Req() request: { user: AccessTokenPayload },
    @Query() query: ListVisitReportsQueryDto,
  ) {
    return this.reports.list(request.user.sub, request.user.role, query);
  }

  @Get('stats')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Get visit report counts by status' })
  stats(@Req() request: { user: AccessTokenPayload }) {
    return this.reports.stats(request.user.sub, request.user.role);
  }

  @Get('by-meeting/:meetingId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Get the report for a visit' })
  @ApiNotFoundResponse({ description: 'No report for this visit' })
  getByMeeting(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    return this.reports.getByMeeting(
      meetingId,
      request.user.sub,
      request.user.role,
    );
  }

  @Put('by-meeting/:meetingId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'Create or update a draft report for a completed visit',
    description: 'The agent who ran the visit only, while it is a draft.',
  })
  @ApiForbiddenResponse({
    description: 'Only the owning agent can edit a draft report',
  })
  save(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: SaveVisitReportDto,
  ) {
    return this.reports.save(
      meetingId,
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Post('by-meeting/:meetingId/submit')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Submit a draft report for review' })
  submit(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    return this.reports.submit(meetingId, request.user.sub, request.user.role);
  }

  @Post('by-meeting/:meetingId/review')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({
    summary: 'Move a submitted report to in-review or validated',
  })
  review(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: ReviewVisitReportDto,
  ) {
    return this.reports.review(
      meetingId,
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Post('by-meeting/:meetingId/attachments')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Attach a file to a draft report' })
  addAttachment(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.reports.addAttachment(
      meetingId,
      request.user.sub,
      request.user.role,
      file,
    );
  }

  @Post('by-meeting/:meetingId/scan')
  @Roles(APP_ROLES.AGENT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Scan a photo of handwritten or printed notes (OCR)',
    description:
      'The agent of the visit sends an image (field "file", JPEG/PNG/WebP/BMP/TIFF, 10 MB max). Returns { text, confidence, engine, empty } to prefill the notes form. Nothing is saved.',
  })
  scanNotes(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.reports.scanNotes(
      meetingId,
      request.user.sub,
      request.user.role,
      file,
    );
  }

  @Get('by-meeting/:meetingId/attachments/:attachmentId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Download a report attachment' })
  async getAttachment(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: { user: AccessTokenPayload },
    @Res() response: Response,
  ) {
    const { data, filename, mime } = await this.reports.getAttachment(
      meetingId,
      attachmentId,
      request.user.sub,
      request.user.role,
    );
    response.setHeader('Content-Type', mime);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(data);
  }

  @Delete('by-meeting/:meetingId/attachments/:attachmentId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Remove an attachment from a draft report' })
  async removeAttachment(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    await this.reports.removeAttachment(
      meetingId,
      attachmentId,
      request.user.sub,
      request.user.role,
    );
    return { success: true };
  }

  @Post('by-meeting/:meetingId/notes')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: 'Add a free-text note to a visit',
    description:
      'The agent who ran the visit only. Independent of the report status/summary — an append-only log, not gated to drafts, so notes can be jotted during or any time after the visit.',
  })
  addNote(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: AddVisitReportNoteDto,
  ) {
    return this.reports.addNote(
      meetingId,
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Delete('by-meeting/:meetingId/notes/:noteId')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({ summary: 'Remove one of your own notes' })
  async removeNote(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    await this.reports.removeNote(
      meetingId,
      noteId,
      request.user.sub,
      request.user.role,
    );
    return { success: true };
  }
}
