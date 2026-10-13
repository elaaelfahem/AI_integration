import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_ROLES, type AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VisitReportsService } from './visit-reports.service';

@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies')
@UseGuards(AccessTokenGuard, RolesGuard)
export class CompanyVisitReportsController {
  constructor(private readonly reports: VisitReportsService) {}

  @Get(':companyId/reports')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  @ApiOperation({
    summary: "A company's visit report history",
    description:
      'Managers see reports from their own team for this company; superadmins see all; agents see only their own.',
  })
  listByCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Req() request: { user: AccessTokenPayload },
  ) {
    return this.reports.listByCompany(
      companyId,
      request.user.sub,
      request.user.role,
    );
  }
}
