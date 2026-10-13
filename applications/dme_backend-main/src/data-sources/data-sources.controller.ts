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
import { APP_ROLES } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateDataSourceDto,
  StartCollectionJobDto,
  UpdateDataSourceDto,
} from './dto/data-source.dto';
import { DataSourcesService } from './data-sources.service';

@ApiTags('Data sources')
@ApiBearerAuth()
@Controller('data-sources')
@UseGuards(AccessTokenGuard, RolesGuard)
@Roles(APP_ROLES.SUPERADMIN)
export class DataSourcesController {
  constructor(private readonly dataSources: DataSourcesService) {}

  @Get()
  @ApiOperation({
    summary: 'List active and disabled data sources',
    description:
      'Returns the managed source catalogue available to SuperAdmins. Retired sources are deliberately excluded; their historical jobs and company evidence remain available through job and company detail endpoints.',
  })
  list() {
    return this.dataSources.listSources();
  }

  @Post()
  @ApiOperation({
    summary: 'Create a managed data source',
    description:
      'Registers an approved collection source. configurationReference is an operational label only: credentials, private URLs, and other secrets must remain server-side and are never accepted or returned by this API.',
  })
  create(
    @Req() request: { user: { sub: string } },
    @Body() dto: CreateDataSourceDto,
  ) {
    return this.dataSources.createSource(request.user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a managed data source',
    description:
      'Updates the catalogue metadata without changing existing jobs or company evidence. Source names must remain unique.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDataSourceDto,
  ) {
    return this.dataSources.updateSource(id, dto);
  }

  @Post(':id/enable')
  @ApiOperation({
    summary: 'Enable a data source for future collection jobs',
    description:
      'Makes a non-retired source selectable for new jobs. It does not alter any completed collection or provenance record.',
  })
  enable(@Param('id', ParseUUIDPipe) id: string) {
    return this.dataSources.setSourceEnabled(id, true);
  }

  @Post(':id/disable')
  @ApiOperation({
    summary: 'Disable a data source without removing its evidence',
    description:
      'Prevents the source from being selected by future jobs while preserving the source, completed jobs, and company provenance.',
  })
  disable(@Param('id', ParseUUIDPipe) id: string) {
    return this.dataSources.setSourceEnabled(id, false);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Retire a data source while preserving job history and evidence',
    description:
      'Removes a source from the active catalogue and disables it. Retiring is non-destructive: previous jobs and source evidence are retained for traceability.',
  })
  retire(@Param('id', ParseUUIDPipe) id: string) {
    return this.dataSources.retireSource(id);
  }

  @Get('jobs/history')
  @ApiOperation({
    summary:
      'List collection-job history with source configuration and results',
    description:
      'Returns every requested collection with its selected sources, requester, filters, lifecycle status, and created or enriched company counts.',
  })
  listJobs() {
    return this.dataSources.listJobs();
  }

  @Get('jobs/:id')
  @ApiOperation({
    summary: 'Get collection-job details and collected company evidence',
    description:
      'Returns the complete traceability record for one job, including per-company evidence, field values, source references, and collection time.',
  })
  getJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.dataSources.getJob(id);
  }

  @Post('jobs')
  @ApiOperation({
    summary: 'Start a server-side company collection job from enabled sources',
    description:
      'Creates a queued server-side job from one or more enabled sources and optional targeting filters. Disabled or retired sources are rejected. Created and enriched companies retain job and source provenance.',
  })
  startJob(
    @Req() request: { user: { sub: string } },
    @Body() dto: StartCollectionJobDto,
  ) {
    return this.dataSources.startJob(request.user.sub, dto);
  }
}
