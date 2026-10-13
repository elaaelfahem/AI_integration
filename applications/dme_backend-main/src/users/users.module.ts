import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersCompaniesService } from './users-companies.service';

@Module({
  imports: [PrismaModule, AuthModule, JwtModule.register({})],
  controllers: [UsersController],
  providers: [UsersService, UsersCompaniesService],
})
export class UsersModule {}
