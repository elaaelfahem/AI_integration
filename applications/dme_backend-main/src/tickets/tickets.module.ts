import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
