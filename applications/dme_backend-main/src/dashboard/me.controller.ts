import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { MeDashboardService } from './me-dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('me')
@UseGuards(AccessTokenGuard, RolesGuard)
export class MeController {
  constructor(private readonly meDashboard: MeDashboardService) {}

  @Get('dashboard')
  @Roles(APP_ROLES.AGENT)
  @ApiOperation({
    summary: "The agent's own home screen (mobile Accueil)",
    description:
      'KPIs (planned visits, total visits, assigned companies, reports to complete), the next visit, the open assignments and the unread notification count.',
  })
  get(@Req() request: { user: AccessTokenPayload }) {
    return this.meDashboard.get(request.user.sub);
  }
}
