import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** One switch per email type the user can turn off (see EMAIL_PREFERENCES). */
export class EmailPreferencesDto {
  @ApiPropertyOptional({ description: 'Ticket replies and status changes' })
  @IsOptional()
  @IsBoolean()
  ticketReply?: boolean;

  @ApiPropertyOptional({ description: 'Ticket assigned to me (admins)' })
  @IsOptional()
  @IsBoolean()
  ticketAssigned?: boolean;

  @ApiPropertyOptional({ description: 'Reminder of tomorrow’s visits' })
  @IsOptional()
  @IsBoolean()
  meetingReminder?: boolean;

  @ApiPropertyOptional({ description: 'Visit report to validate (managers)' })
  @IsOptional()
  @IsBoolean()
  reportSubmitted?: boolean;

  @ApiPropertyOptional({ description: 'My visit report was validated' })
  @IsOptional()
  @IsBoolean()
  reportReviewed?: boolean;

  @ApiPropertyOptional({ description: 'New note on a visit report' })
  @IsOptional()
  @IsBoolean()
  noteAdded?: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Emails with report analysis results' })
  @IsOptional()
  @IsBoolean()
  notifyAnalysisResults?: boolean;

  @ApiPropertyOptional({
    description: 'All activity emails (assignments, visits, reports, tickets)',
  })
  @IsOptional()
  @IsBoolean()
  notifyWorkUpdates?: boolean;

  @ApiPropertyOptional({
    type: EmailPreferencesDto,
    description: 'Per-type email switches. Only the keys sent are changed.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailPreferencesDto)
  emailPreferences?: EmailPreferencesDto;
}
