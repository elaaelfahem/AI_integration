import type { Company } from '@prisma/client';
import {
  buildCsv,
  buildExportFilename,
  buildXlsx,
  type TabularColumn,
  type TabularExportFormat,
} from '../common/utils/tabular-export.util';

export type CompaniesExportFormat = TabularExportFormat;

const EXPORT_COLUMNS: TabularColumn<Company>[] = [
  { header: 'Name', value: (company) => company.name },
  { header: 'Sector', value: (company) => company.sector ?? '' },
  { header: 'Contact name', value: (company) => company.contact_name ?? '' },
  { header: 'Phone', value: (company) => company.phone ?? '' },
  { header: 'Email', value: (company) => company.email ?? '' },
  { header: 'Address', value: (company) => company.address ?? '' },
  { header: 'Governorate', value: (company) => company.governorate ?? '' },
  { header: 'Delegation', value: (company) => company.delegation ?? '' },
  {
    header: 'Client category',
    value: (company) => company.client_category ?? '',
  },
  {
    header: 'Mobile lines',
    value: (company) => company.mobile_lines ?? '',
  },
  { header: 'AI score', value: (company) => company.ai_score ?? '' },
  { header: 'Status', value: (company) => company.status },
  { header: 'Notes', value: (company) => company.notes ?? '' },
];

export function buildCompaniesExportFilename(format: CompaniesExportFormat) {
  return buildExportFilename('dme-companies', format);
}

export function buildCompaniesCsv(companies: Company[]): Buffer {
  return buildCsv(EXPORT_COLUMNS, companies);
}

export function buildCompaniesXlsx(companies: Company[]): Promise<Buffer> {
  return buildXlsx('Companies', EXPORT_COLUMNS, companies);
}

// The importer doesn't recognize a "Status" column (it's server-assigned),
// so the template omits it to avoid implying it can be set on import.
const IMPORT_TEMPLATE_COLUMNS: TabularColumn<Company>[] = EXPORT_COLUMNS.filter(
  (column) => column.header !== 'Status',
);

export function buildCompaniesImportTemplateCsv(): Buffer {
  return buildCsv(IMPORT_TEMPLATE_COLUMNS, []);
}

export function buildCompaniesImportTemplateXlsx(): Promise<Buffer> {
  return buildXlsx('Companies', IMPORT_TEMPLATE_COLUMNS, []);
}

export function buildCompaniesImportTemplateFilename(
  format: CompaniesExportFormat,
) {
  return buildExportFilename('dme-companies-import-template', format);
}
