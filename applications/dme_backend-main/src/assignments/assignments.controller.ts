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
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { APP_ROLES } from '../auth/auth.types';
import { AssignmentsService } from './assignments.service';
import { AssignmentsSummaryService } from './assignments-summary.service';
import { CreateAssignmentDto, UpdateAssignmentDto } from './dto/assignment.dto';

@Controller('assignments')
@UseGuards(AccessTokenGuard, RolesGuard)
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly summary: AssignmentsSummaryService,
  ) {}
  /** Stats for the Assignation and Planifier une visite pages (role-scoped). */
  @Get('summary')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  getSummary(@Req() req: { user: { sub: string; role: string } }) {
    return this.summary.get(req.user.sub, req.user.role);
  }
  @Get()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  list(@Req() req: { user: { sub: string; role: string } }) {
    return this.assignments.list(req.user.sub, req.user.role);
  }
  @Post()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  create(
    @Req() req: { user: { sub: string; role: string } },
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.assignments.create(req.user.sub, req.user.role, dto);
  }
  @Patch(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { sub: string; role: string } },
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignments.update(id, req.user.sub, req.user.role, dto);
  }
  @Delete(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.assignments.remove(id, req.user.sub, req.user.role);
  }
}
