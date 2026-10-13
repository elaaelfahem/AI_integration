import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { MailService } from './mail.service';
import { MailScheduler } from './mail.scheduler';
import { MAIL_TRANSPORT } from './mail.tokens';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        nodemailer.createTransport(
          {
            host: configService.get<string>('MAIL_HOST', 'localhost'),
            port: configService.get<number>('MAIL_PORT', 1025),
            secure: false,
            ignoreTLS: true,
          },
          {
            from: configService.get<string>(
              'MAIL_FROM',
              '"Orange DME" <dme@orange.com>',
            ),
          },
        ),
    },
    MailService,
    MailScheduler,
  ],
  exports: [MailService],
})
export class MailModule {}
