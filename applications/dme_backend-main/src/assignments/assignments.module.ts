import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsSummaryService } from './assignments-summary.service';
@Module({
  imports: [JwtModule.register({})],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsSummaryService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
