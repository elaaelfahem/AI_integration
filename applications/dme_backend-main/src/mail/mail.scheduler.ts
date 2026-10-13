import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MAIL_TIME_ZONE } from './mail.labels';
import { MailService } from './mail.service';

/**
 * Time-based notifications (Africa/Tunis time). Each job is safe to run
 * twice: MailService records what it sent in scheduled_notification_log.
 */
@Injectable()
export class MailScheduler {
  private readonly logger = new Logger(MailScheduler.name);

  constructor(private readonly mail: MailService) {}

  /** Every 5 minutes: "Visite imminente" and "Compte rendu à compléter". */
  @Cron('*/5 * * * *', { name: 'frequent-reminders', timeZone: MAIL_TIME_ZONE })
  async frequentReminders() {
    await this.mail.sendImminentVisitReminders();
    await this.mail.sendReportDueReminders('after-visit');
  }

  /** 08:00: overdue assignments, yesterday's missing reports, today's agenda. */
  @Cron('0 8 * * *', { name: 'morning', timeZone: MAIL_TIME_ZONE })
  async morning() {
    const overdue = await this.mail.sendOverdueAssignments();
    const reports = await this.mail.sendReportDueReminders('next-morning');
    const agendas = await this.mail.sendDailyAgenda();
    this.logger.log(
      `Morning: ${overdue} overdue assignment(s), ${reports} report reminder(s), ${agendas} agenda(s)`,
    );
  }

  /** 18:00: tomorrow's visits (email per agent, bell/push per visit). */
  @Cron('0 18 * * *', { name: 'visit-reminders', timeZone: MAIL_TIME_ZONE })
  async visitReminders() {
    const agents = await this.mail.sendVisitReminders();
    this.logger.log(`Visit reminders sent to ${agents} agent(s)`);
  }

  /** Monday 08:00: weekly summary for managers. */
  @Cron('0 8 * * 1', { name: 'manager-digest', timeZone: MAIL_TIME_ZONE })
  async managerDigest() {
    const managers = await this.mail.sendManagerWeeklyDigest();
    this.logger.log(`Weekly digest sent to ${managers} manager(s)`);
  }
}
