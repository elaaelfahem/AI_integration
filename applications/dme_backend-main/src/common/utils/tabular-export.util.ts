import ExcelJS from 'exceljs';

export type TabularExportFormat = 'csv' | 'xlsx';

export type TabularColumn<T> = {
  header: string;
  value: (row: T) => string | number;
};

export function buildExportFilename(
  prefix: string,
  format: TabularExportFormat,
) {
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${date}.${format}`;
}

export function exportContentType(format: TabularExportFormat) {
  return format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv; charset=utf-8';
}

export function buildCsv<T>(columns: TabularColumn<T>[], rows: T[]): Buffer {
  const csvRows = [
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => String(column.value(row)))),
  ];

  const csv = csvRows
    .map((row) => row.map(escapeCsvField).join(','))
    .join('\r\n');
  // Prepend a UTF-8 BOM so Excel detects the encoding correctly.
  return Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(csv, 'utf8')]);
}

function escapeCsvField(field: string) {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export async function buildXlsx<T>(
  sheetName: string,
  columns: TabularColumn<T>[],
  rows: T[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: Math.max(column.header.length + 4, 18),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(
      Object.fromEntries(
        columns.map((column) => [column.header, column.value(row)]),
      ),
    );
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
