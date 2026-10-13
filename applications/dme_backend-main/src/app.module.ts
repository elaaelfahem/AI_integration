import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import {
  AUTH_TIMING_CONFIG,
  PASSWORD_RESET_EMAIL_LIMIT_CONFIG,
} from './auth/auth.constants';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { InvitationsModule } from './invitations/invitations.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { MeetingsModule } from './meetings/meetings.module';
import { TicketsModule } from './tickets/tickets.module';
import { VisitReportsModule } from './visit-reports/visit-reports.module';
import { DataSourcesModule } from './data-sources/data-sources.module';
import { ProspectingModule } from './prospecting/prospecting.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';

function validateEnvironment(config: Record<string, unknown>) {
  const requiredValues = [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];
  const missingValues = requiredValues.filter((key) => !config[key]);

  if (missingValues.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingValues.join(', ')}`,
    );
  }

  const idleTimeout = readPositiveDuration(
    config[AUTH_TIMING_CONFIG.sessionIdleTimeout.environmentKey],
    AUTH_TIMING_CONFIG.sessionIdleTimeout.defaultMs,
    AUTH_TIMING_CONFIG.sessionIdleTimeout.environmentKey,
  );
  const touchInterval = readPositiveDuration(
    config[AUTH_TIMING_CONFIG.touchInterval.environmentKey],
    AUTH_TIMING_CONFIG.touchInterval.defaultMs,
    AUTH_TIMING_CONFIG.touchInterval.environmentKey,
  );

  if (touchInterval >= idleTimeout) {
    throw new Error(
      'TOUCH_INTERVAL_MS must be shorter than SESSION_IDLE_TIMEOUT_MS',
    );
  }

  readPositiveInteger(
    config[PASSWORD_RESET_EMAIL_LIMIT_CONFIG.limit.environmentKey],
    PASSWORD_RESET_EMAIL_LIMIT_CONFIG.limit.defaultValue,
    PASSWORD_RESET_EMAIL_LIMIT_CONFIG.limit.environmentKey,
  );
  readPositiveDuration(
    config[PASSWORD_RESET_EMAIL_LIMIT_CONFIG.window.environmentKey],
    PASSWORD_RESET_EMAIL_LIMIT_CONFIG.window.defaultMs,
    PASSWORD_RESET_EMAIL_LIMIT_CONFIG.window.environmentKey,
  );

  return config;
}

function readPositiveDuration(value: unknown, fallback: number, name: string) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const duration = Number(value);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds`);
  }

  return duration;
}

function readPositiveInteger(value: unknown, fallback: number, name: string) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const amount = Number(value);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return amount;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    MailModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    InvitationsModule,
    UsersModule,
    CompaniesModule,
    AssignmentsModule,
    MeetingsModule,
    TicketsModule,
    VisitReportsModule,
    DataSourcesModule,
    ProspectingModule,
    DashboardModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
