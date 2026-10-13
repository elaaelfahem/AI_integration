import { AiModule } from '../ai/ai.module';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProspectingController } from './prospecting.controller';
import { ProspectingService } from './prospecting.service';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    AuthModule,
    AssignmentsModule,
    JwtModule.register({}),
  ],
  controllers: [ProspectingController],
  providers: [ProspectingService],
})
export class ProspectingModule {}
