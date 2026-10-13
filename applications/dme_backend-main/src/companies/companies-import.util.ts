import ExcelJS from 'exceljs';
import { ClientCategory } from '@prisma/client';

export type ImportedCompanyRow = {
  name: string;
  sector?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  governorate?: string;
  delegation?: string;
  clientCategory?: ClientCategory;
  mobileLines?: number;
  aiScore?: number;
  notes?: string;
};

export type CompanyImportResult = {
  rows: ImportedCompanyRow[];
  skipped: { row: number; reason: string }[];
};

// Accepts both our own CSV/XLSX export headers and the French CRM-style
// headers from the prospecting sheet, so a file exported from this app or
// the raw prospecting export can both be re-imported without renaming.
const HEADER_ALIASES: Record<string, keyof ImportedCompanyRow> = {
  name: 'name',
  'raison sociale (compte payeur)': 'name',
  sector: 'sector',
  'segment de recouvrement': 'sector',
  'contact name': 'contactName',
  'gestionnaire de flotte (contact payeur)': 'contactName',
  phone: 'phone',
  email: 'email',
  address: 'address',
  governorate: 'governorate',
  gouvernorat: 'governorate',
  delegation: 'delegation',
  'client category': 'clientCategory',
  'categorie client': 'clientCategory',
  'catégorie client': 'clientCategory',
  'mobile lines': 'mobileLines',
  'mobile sales (compte payeur)': 'mobileLines',
  'ai score': 'aiScore',
  notes: 'notes',
};

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function toClientCategory(value: string): ClientCategory | undefined {
  const upper = value.trim().toUpperCase();
  return (Object.values(ClientCategory) as string[]).includes(upper)
    ? (upper as ClientCategory)
    : undefined;
}

function buildRow(
  fields: Record<string, string>,
  rowNumber: number,
  skipped: CompanyImportResult['skipped'],
): ImportedCompanyRow | null {
  const name = fields.name?.trim();
  if (!name) {
    skipped.push({ row: rowNumber, reason: 'Missing company name' });
    return null;
  }

  const mobileLinesRaw = fields.mobileLines?.trim();
  const aiScoreRaw = fields.aiScore?.trim();

  return {
    name,
    sector: fields.sector?.trim() || undefined,
    contactName: fields.contactName?.trim() || undefined,
    phone: fields.phone?.trim() || undefined,
    email: fields.email?.trim() || undefined,
    address: fields.address?.trim() || undefined,
    governorate: fields.governorate?.trim() || undefined,
    delegation: fields.delegation?.trim() || undefined,
    clientCategory: fields.clientCategory
      ? toClientCategory(fields.clientCategory)
      : undefined,
    mobileLines:
      mobileLinesRaw && !Number.isNaN(Number(mobileLinesRaw))
        ? Math.round(Number(mobileLinesRaw))
        : undefined,
    aiScore:
      aiScoreRaw && !Number.isNaN(Number(aiScoreRaw))
        ? Math.round(Number(aiScoreRaw))
        : undefined,
    notes: fields.notes?.trim() || undefined,
  };
}

function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((value) => value.trim().length));
}

function rowsToImportResult(table: string[][]): CompanyImportResult {
  const skipped: CompanyImportResult['skipped'] = [];
  if (table.length === 0) return { rows: [], skipped };

  const headerRow = table[0].map(normalizeHeader);
  const columnMap = headerRow.map((header) => HEADER_ALIASES[header]);

  const rows: ImportedCompanyRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const fields: Record<string, string> = {};
    columnMap.forEach((key, col) => {
      if (key) fields[key] = raw[col] ?? '';
    });
    const row = buildRow(fields, i + 1, skipped);
    if (row) rows.push(row);
  }

  return { rows, skipped };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in (value as { text?: unknown })) {
    const text = (value as { text?: unknown }).text;
    return typeof text === 'string' || typeof text === 'number'
      ? String(text)
      : '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return '';
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseCompaniesCsv(buffer: Buffer): CompanyImportResult {
  const text = stripBom(buffer.toString('utf8'));
  return rowsToImportResult(parseCsvText(text));
}

export async function parseCompaniesXlsx(
  buffer: Buffer,
): Promise<CompanyImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], skipped: [] };

  const table: string[][] = [];
  sheet.eachRow((row) => {
    const values = (row.values as unknown[]).slice(1);
    table.push(values.map(cellToString));
  });

  return rowsToImportResult(table);
}
