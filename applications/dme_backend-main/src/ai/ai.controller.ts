import {
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  BadGatewayException,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccessTokenPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';
class QuestionDto {
  @IsString() @MinLength(1) @MaxLength(2000) question!: string;
}
class ReportDto {
  @IsString() @MinLength(1) @MaxLength(20000) text!: string;
}
@Controller('ai')
@UseGuards(AccessTokenGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('companies/:id/assistant')
  async assistant(
    @Req() req: { user: AccessTokenPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QuestionDto,
  ) {
    const actor = req.user;
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        status: 'ACTIVE',
        ...(actor.role === 'SUPERADMIN'
          ? {}
          : actor.role === 'MANAGER'
            ? { manager_id: actor.sub }
            : {
                assignments: {
                  some: { agent_id: actor.sub, status: { not: 'CANCELLED' } },
                },
              }),
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    await this.ai.checkInput(dto.question);
    const stored = company.ai_context;
    const context =
      stored && typeof stored === 'object' && !Array.isArray(stored)
        ? stored
        : {
            company_id: id,
            canonical_name: company.name,
            scoring: {
              total_score: company.ai_score,
              category: 'REVIEW',
              ready_for_offer_recommendation: false,
            },
          };
    const result = await this.ai.call<{ answer: string; company_id: string }>(
      'AI_ASSISTANT_URL',
      '/v1/assist',
      {
        company: context,
        user_question: dto.question,
        enable_ai: this.ai.modelEnabled,
      },
    );
    if (
      !result ||
      result.company_id !== context.company_id ||
      typeof result.answer !== 'string'
    )
      throw new BadGatewayException('Invalid assistant response');
    return result;
  }

  @Post('meetings/:id/clean-report')
  async cleanReport(
    @Req() req: { user: AccessTokenPayload },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportDto,
  ) {
    const meeting = await this.prisma.prospectingMeeting.findFirst({
      where: { id, agent_id: req.user.sub },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    const report = await this.prisma.visitReport.findUnique({
      where: { meeting_id: id },
    });
    if (report && report.status !== 'DRAFT')
      throw new NotFoundException('Draft report not found');
    await this.ai.checkInput(dto.text);
    const result = await this.ai.call<{
      executive_summary: string;
      company_id: string;
    }>('AI_REPORT_CLEANER_URL', '/v1/clean', {
      company_id: meeting.company_id,
      raw_report: dto.text,
      enable_ai: this.ai.modelEnabled,
    });
    if (
      !result ||
      result.company_id !== meeting.company_id ||
      typeof result.executive_summary !== 'string'
    )
      throw new BadGatewayException('Invalid report response');
    return result;
  }
}
