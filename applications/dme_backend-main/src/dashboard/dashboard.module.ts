import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { MeController } from './me.controller';
import { MeDashboardService } from './me-dashboard.service';

@Module({
  imports: [PrismaModule, AuthModule, JwtModule.register({})],
  controllers: [DashboardController, MeController],
  providers: [DashboardService, MeDashboardService],
})
export class DashboardModule {}
