import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  AssignmentStatus,
  MeetingStatus,
  CompanyHistoryAction,
  CompanyStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/company.dto';
import {
  buildCompaniesCsv,
  buildCompaniesExportFilename,
  buildCompaniesImportTemplateCsv,
  buildCompaniesImportTemplateFilename,
  buildCompaniesImportTemplateXlsx,
  buildCompaniesXlsx,
  type CompaniesExportFormat,
} from './companies-export.util';
import {
  parseCompaniesCsv,
  parseCompaniesXlsx,
  type ImportedCompanyRow,
} from './companies-import.util';
import { exportContentType } from '../common/utils/tabular-export.util';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actorId: string, role: string, visited?: 'true' | 'false') {
    const scope = this.scopeFor(actorId, role);
    // Agents care about their own visits; managers and admins about anyone's.
    const wasVisited = this.visitedWhere(
      role === 'AGENT' ? actorId : undefined,
    );
    const companies = await this.prisma.company.findMany({
      where: {
        AND: [
          { status: CompanyStatus.ACTIVE, ...scope },
          ...(visited === 'true' ? [wasVisited] : []),
          ...(visited === 'false' ? [{ NOT: wasVisited }] : []),
        ],
      },
      include: {
        manager: { select: { id: true, first_name: true, last_name: true } },
        _count: { select: { assignments: true } },
      },
      orderBy: { name: 'asc' },
    });
    const visitedIds =
      visited === undefined
        ? new Set(
            (
              await this.prisma.company.findMany({
                where: {
                  AND: [
                    { id: { in: companies.map((company) => company.id) } },
                    wasVisited,
                  ],
                },
                select: { id: true },
              })
            ).map((company) => company.id),
          )
        : null;
    return companies.map((company) => ({
      ...company,
      visited: visitedIds ? visitedIds.has(company.id) : visited === 'true',
    }));
  }

  /** At least one completed visit (by that agent when agentId is given). */
  private visitedWhere(agentId?: string): Prisma.CompanyWhereInput {
    const byAgent = agentId ? { agent_id: agentId } : {};
    return {
      OR: [
        { meetings: { some: { ...byAgent, status: MeetingStatus.COMPLETED } } },
        {
          assignments: {
            some: { ...byAgent, status: AssignmentStatus.COMPLETED },
          },
        },
        { prospections: { some: { ...byAgent, visited_at: { not: null } } } },
      ],
    };
  }

  async create(accountId: string, dto: CreateCompanyDto) {
    const name = requiredCompanyName(dto.name);
    const managerId = await this.resolveManagerId(dto.managerId);
    return this.prisma.company.create({
      data: {
        ...this.toData(dto),
        name,
        ...(managerId !== undefined && { manager_id: managerId }),
        created_by_id: accountId,
      } as Prisma.CompanyUncheckedCreateInput,
    });
  }

  async getOne(id: string, actorId: string, role: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, first_name: true, last_name: true } },
        _count: { select: { assignments: true, source_evidence: true } },
        source_evidence: {
          include: {
            data_source: { select: { id: true, name: true, type: true } },
            collection_job: {
              select: { id: true, status: true, created_at: true },
            },
          },
          orderBy: { collected_at: 'desc' },
        },
        history: {
          include: {
            actor: {
              include: {
                user: { select: { first_name: true, last_name: true } },
                superadmin: { select: { first_name: true, last_name: true } },
              },
            },
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });
    if (!company || company.status !== CompanyStatus.ACTIVE) {
      throw new NotFoundException('Company not found');
    }
    if (!(await this.hasAccess(company.id, actorId, role))) {
      throw new NotFoundException('Company not found');
    }
    return company;
  }

  async update(
    id: string,
    actorId: string,
    role: string,
    dto: UpdateCompanyDto,
  ) {
    const existing = await this.ensure(id);
    if (!(await this.hasAccess(id, actorId, role))) {
      throw new NotFoundException('Company not found');
    }
    if (role !== 'SUPERADMIN' && dto.status !== undefined) {
      throw new ForbiddenException(
        'Only a superadmin can change a company status',
      );
    }
    if (role !== 'SUPERADMIN' && dto.managerId !== undefined) {
      throw new ForbiddenException(
        'Only a superadmin can assign a company to a manager',
      );
    }
    const managerId =
      dto.managerId === undefined
        ? undefined
        : await this.resolveManagerId(dto.managerId);
    const data = this.toData(dto);
    const updated = await this.prisma.company.update({
      where: { id },
      data: {
        ...data,
        ...(dto.managerId !== undefined && {
          manager:
            managerId === null
              ? { disconnect: true }
              : { connect: { id: managerId } },
        }),
      },
    });
    const changedFields = Object.keys(data).filter(
      (field) =>
        JSON.stringify(existing[field as keyof typeof existing]) !==
        JSON.stringify(data[field as keyof typeof data]),
    );
    if (changedFields.length) {
      await this.prisma.companyHistory.create({
        data: {
          company_id: id,
          actor_id: actorId,
          action: CompanyHistoryAction.UPDATED,
          summary: 'Company profile updated by an authenticated user',
          details: { fields: changedFields },
        },
      });
    }
    return updated;
  }

  private async hasAccess(id: string, actorId: string, role: string) {
    if (role === 'SUPERADMIN') return true;
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        status: CompanyStatus.ACTIVE,
        ...this.scopeFor(actorId, role),
      },
      select: { id: true },
    });
    return Boolean(company);
  }

  private scopeFor(actorId: string, role: string) {
    if (role === 'MANAGER') return { manager_id: actorId };
    if (role === 'AGENT') {
      return {
        assignments: {
          some: {
            agent_id: actorId,
            status: { not: AssignmentStatus.CANCELLED },
          },
        },
      };
    }
    return {};
  }

  async archive(id: string) {
    await this.ensure(id);
    return this.prisma.company.update({
      where: { id },
      data: { status: CompanyStatus.INACTIVE },
    });
  }

  async ensure(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  private async resolveManagerId(managerId: string | null | undefined) {
    if (managerId === undefined || managerId === null) return managerId;
    const manager = await this.prisma.account.findFirst({
      where: {
        id: managerId,
        account_type: AccountType.USER,
        user: { role: UserRole.MANAGER, status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!manager) throw new BadRequestException('Invalid manager');
    return manager.id;
  }

  async exportCompanies(format: CompaniesExportFormat) {
    const companies = await this.prisma.company.findMany({
      where: { status: CompanyStatus.ACTIVE },
      orderBy: { name: 'asc' },
    });
    const buffer =
      format === 'xlsx'
        ? await buildCompaniesXlsx(companies)
        : buildCompaniesCsv(companies);

    return {
      buffer,
      filename: buildCompaniesExportFilename(format),
      contentType: exportContentType(format),
    };
  }

  async importTemplate(format: CompaniesExportFormat) {
    const buffer =
      format === 'xlsx'
        ? await buildCompaniesImportTemplateXlsx()
        : buildCompaniesImportTemplateCsv();

    return {
      buffer,
      filename: buildCompaniesImportTemplateFilename(format),
      contentType: exportContentType(format),
    };
  }

  async importCompanies(
    accountId: string,
    buffer: Buffer,
    format: CompaniesExportFormat,
  ) {
    const { rows, skipped } =
      format === 'xlsx'
        ? await parseCompaniesXlsx(buffer)
        : parseCompaniesCsv(buffer);

    let created = 0;
    let duplicates = 0;
    for (const row of rows) {
      const existing = await this.prisma.company.findFirst({
        where: { name: { equals: row.name, mode: 'insensitive' } },
      });
      if (existing) {
        duplicates++;
        continue;
      }

      await this.prisma.company.create({
        data: {
          ...this.rowToData(row),
          created_by_id: accountId,
        },
      });
      created++;
    }

    return { created, duplicates, skipped };
  }

  private rowToData(
    row: ImportedCompanyRow,
  ): Omit<Prisma.CompanyUncheckedCreateInput, 'created_by_id'> {
    return {
      name: row.name.trim(),
      sector: row.sector,
      contact_name: row.contactName,
      phone: row.phone,
      email: row.email?.toLowerCase(),
      address: row.address,
      notes: row.notes,
      ai_score: row.aiScore,
      governorate: row.governorate,
      delegation: row.delegation,
      client_category: row.clientCategory,
      mobile_lines: row.mobileLines,
    };
  }

  private toData(
    dto: CreateCompanyDto | UpdateCompanyDto,
  ): Prisma.CompanyUpdateInput {
    const data: Prisma.CompanyUpdateInput = {};
    if (dto.name !== undefined) data.name = requiredCompanyName(dto.name);
    if (dto.sector !== undefined) data.sector = dto.sector;
    if (dto.contactName !== undefined) data.contact_name = dto.contactName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.email !== undefined)
      data.email = dto.email ? dto.email.toLowerCase() : null;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.aiScore !== undefined) data.ai_score = dto.aiScore;
    if (dto.governorate !== undefined) data.governorate = dto.governorate;
    if (dto.delegation !== undefined) data.delegation = dto.delegation;
    if (dto.clientCategory !== undefined)
      data.client_category = dto.clientCategory;
    if (dto.mobileLines !== undefined) data.mobile_lines = dto.mobileLines;
    if ('status' in dto && dto.status !== undefined) data.status = dto.status;
    return data;
  }
}

function requiredCompanyName(value: string) {
  const name = value.trim();
  if (!name) throw new BadRequestException('Company name is required');
  return name;
}
