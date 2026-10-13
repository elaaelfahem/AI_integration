import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { OcrModule } from '../ocr/ocr.module';
import { CompanyVisitReportsController } from './company-visit-reports.controller';
import { VisitReportsController } from './visit-reports.controller';
import { VisitReportsService } from './visit-reports.service';

@Module({
  imports: [JwtModule.register({}), OcrModule],
  controllers: [VisitReportsController, CompanyVisitReportsController],
  providers: [VisitReportsService],
})
export class VisitReportsModule {}
