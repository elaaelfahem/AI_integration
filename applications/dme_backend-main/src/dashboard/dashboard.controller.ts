import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_ROLES, AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Return role-scoped dashboard metrics and actions',
  })
  get(@Req() request: { user: AccessTokenPayload }) {
    return this.dashboard.get(request.user.sub, request.user.role);
  }
}
