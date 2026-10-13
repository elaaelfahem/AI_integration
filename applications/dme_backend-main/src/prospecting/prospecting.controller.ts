import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { APP_ROLES, AccessTokenPayload } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AssignProspectDto,
  StartProspectingDto,
  UpdateProspectingCriteriaDto,
} from './dto/prospecting.dto';
import { ProspectingService } from './prospecting.service';

@ApiTags('Prospecting')
@ApiBearerAuth()
@Controller('prospecting')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
export class ProspectingController {
  constructor(private readonly prospecting: ProspectingService) {}

  @Get()
  @ApiOperation({
    summary: 'List role-scoped AI prospecting opportunities',
    description:
      'Returns active companies in the caller scope with their AI score, recommendation, and shortlist state.',
  })
  list(@Req() request: { user: AccessTokenPayload }) {
    return this.prospecting.list(request.user.sub, request.user.role);
  }

  @Get('criteria')
  @ApiOperation({ summary: 'Get the caller’s saved prospecting criteria' })
  getCriteria(@Req() request: { user: AccessTokenPayload }) {
    return this.prospecting.getCriteria(request.user.sub);
  }

  @Patch('criteria')
  @ApiOperation({ summary: 'Save the caller’s prospecting criteria' })
  updateCriteria(
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: UpdateProspectingCriteriaDto,
  ) {
    return this.prospecting.updateCriteria(request.user.sub, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'List the caller’s prospecting runs' })
  history(@Req() request: { user: AccessTokenPayload }) {
    return this.prospecting.history(request.user.sub);
  }

  @Post('runs')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({
    summary: 'Run a role-scoped prospecting search',
    description:
      'Runs AI discovery, enrichment, scoring and offer recommendations, then stores the results in the caller’s company scope.',
  })
  start(
    @Req() request: { user: AccessTokenPayload },
    @Body() dto: StartProspectingDto,
  ) {
    return this.prospecting.start(request.user.sub, request.user.role, dto);
  }

  @Post(':companyId/shortlist')
  @ApiOperation({ summary: 'Add a company to the caller’s shortlist' })
  shortlist(
    @Req() request: { user: AccessTokenPayload },
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.prospecting.addToShortlist(
      request.user.sub,
      request.user.role,
      companyId,
    );
  }

  @Delete(':companyId/shortlist')
  @ApiOperation({ summary: 'Remove a company from the caller’s shortlist' })
  removeFromShortlist(
    @Req() request: { user: AccessTokenPayload },
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.prospecting.removeFromShortlist(
      request.user.sub,
      request.user.role,
      companyId,
    );
  }

  @Post(':companyId/assign')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  @ApiOperation({
    summary: 'Assign a shortlisted opportunity to an agent',
    description:
      'Creates an assignment using the existing assignment authorization rules and marks the shortlist entry as assigned.',
  })
  assign(
    @Req() request: { user: AccessTokenPayload },
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AssignProspectDto,
  ) {
    return this.prospecting.assign(
      request.user.sub,
      request.user.role,
      companyId,
      dto,
    );
  }
}
