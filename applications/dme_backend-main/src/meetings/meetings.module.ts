import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
