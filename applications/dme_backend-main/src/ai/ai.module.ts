import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
