import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { APP_ROLES } from '../auth/auth.types';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import { ExportCompaniesQueryDto } from './dto/company-export-query.dto';
import { ListCompaniesQueryDto } from './dto/company-list-query.dto';

const IMPORT_FORMAT_BY_MIMETYPE: Record<string, 'csv' | 'xlsx'> = {
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

@Controller('companies')
@UseGuards(AccessTokenGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  list(
    @Req() req: { user: { sub: string; role: string } },
    @Query() query: ListCompaniesQueryDto,
  ) {
    return this.companies.list(req.user.sub, req.user.role, query.visited);
  }

  @Get('export')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER)
  async exportCompanies(
    @Query() query: ExportCompaniesQueryDto,
    @Res() response: Response,
  ) {
    const format = query.format ?? 'csv';
    const { buffer, filename, contentType } =
      await this.companies.exportCompanies(format);

    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get('import-template')
  @Roles(APP_ROLES.SUPERADMIN)
  async importTemplate(
    @Query() query: ExportCompaniesQueryDto,
    @Res() response: Response,
  ) {
    const format = query.format ?? 'csv';
    const { buffer, filename, contentType } =
      await this.companies.importTemplate(format);

    response.setHeader('Content-Type', contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.send(buffer);
  }

  @Get(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.companies.getOne(id, req.user.sub, req.user.role);
  }

  @Post('import')
  @Roles(APP_ROLES.SUPERADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  importCompanies(
    @Req() req: { user: { sub: string } },
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('A CSV or Excel file is required');
    }
    const format = IMPORT_FORMAT_BY_MIMETYPE[file.mimetype];
    if (!format) {
      throw new BadRequestException(
        'Unsupported file type. Upload a .csv or .xlsx file.',
      );
    }
    return this.companies.importCompanies(req.user.sub, file.buffer, format);
  }

  @Post()
  @Roles(APP_ROLES.SUPERADMIN)
  create(@Req() req: { user: { sub: string } }, @Body() dto: CreateCompanyDto) {
    return this.companies.create(req.user.sub, dto);
  }

  @Patch(':id')
  @Roles(APP_ROLES.SUPERADMIN, APP_ROLES.MANAGER, APP_ROLES.AGENT)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { sub: string; role: string } },
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companies.update(id, req.user.sub, req.user.role, dto);
  }

  @Delete(':id')
  @Roles(APP_ROLES.SUPERADMIN)
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.companies.archive(id);
  }
}
