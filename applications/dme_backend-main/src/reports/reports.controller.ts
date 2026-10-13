import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  MonthlyReportQueryDto,
  SubmitReportDto,
  UpdateProspectionDto,
} from './dto/report.dto';
import { MonthlyReportService } from './monthly-report.service';
import { ReportsService } from './reports.service';

const REPORT_ROLES = [
  APP_ROLES.SUPERADMIN,
  APP_ROLES.MANAGER,
  APP_ROLES.AGENT,
] as const;

@ApiTags('Prospection reports')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard, RolesGuard)
@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly monthly: MonthlyReportService,
  ) {}

  @Post('prospections/:id/update')
  @Roles(...REPORT_ROLES)
  @ApiOperation({
    summary: 'Update the lifecycle status of an assignment prospection',
  })
  @ApiForbiddenResponse({
    description: 'The assignment is outside the caller scope',
  })
  updateProspection(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: UpdateProspectionDto,
  ) {
    return this.reports.updateProspection(
      id,
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Get('reports/monthly')
  @Roles(...REPORT_ROLES)
  @ApiOperation({
    summary: 'Monthly rollup of visits and reports (role-scoped)',
    description:
      'Agents get their own month, managers their team, superadmins everything. month=YYYY-MM, default the current month.',
  })
  monthlySummary(
    @Req() request: { user: AccessTokenPayload },
    @Query() query: MonthlyReportQueryDto,
  ) {
    return this.monthly.summary(
      request.user.sub,
      request.user.role,
      query.month,
    );
  }

  @Get('reports/monthly/export')
  @Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Monthly rollup as a PDF (role-scoped)' })
  async exportMonthly(
    @Req() request: { user: AccessTokenPayload },
    @Query() query: MonthlyReportQueryDto,
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.monthly.exportPdf(
      request.user.sub,
      request.user.role,
      query.month,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Post('reports/:id')
  @Roles(...REPORT_ROLES)
  @ApiOperation({
    summary: 'Submit or replace the field report for an assignment',
  })
  submitReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: SubmitReportDto,
  ) {
    return this.reports.submitReport(
      id,
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Get('reports/:id')
  @Roles(...REPORT_ROLES)
  @ApiOperation({
    summary: 'Read the original field report and its structured result',
  })
  @ApiNotFoundResponse({ description: 'No report exists for the assignment' })
  getReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    return this.reports.getReportByAssignment(
      id,
      request.user.sub,
      request.user.role,
    );
  }

  @Get('reports/:id/export')
  @Roles(...REPORT_ROLES)
  @ApiOperation({ summary: 'Export a field report as a PDF' })
  async exportReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: { user: AccessTokenPayload },
    @Res() response: Response,
  ) {
    const { buffer, filename } = await this.reports.exportReport(
      id,
      request.user.sub,
      request.user.role,
    );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }
}
