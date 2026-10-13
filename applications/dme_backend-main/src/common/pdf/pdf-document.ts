import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

/** Orange B2B logo (src/common/pdf/assets, copied to dist by nest-cli). */
const LOGO_PATH = [
  join(__dirname, 'assets', 'logo-orange-b2b.png'),
  join(process.cwd(), 'src', 'common', 'pdf', 'assets', 'logo-orange-b2b.png'),
].find((path) => existsSync(path));

/** Orange brand colours. */
const ORANGE = '#FF7900';
const BLACK = '#000000';
const GREY = '#595959';
const LIGHT = '#F2F2F2';

const MARGIN = 50;

export interface PdfTableColumn<Row> {
  header: string;
  /** Share of the available width, e.g. 0.3. */
  width: number;
  value: (row: Row) => string | number | null | undefined;
}

/**
 * Small layer over pdfkit for DME documents: Orange header, sections,
 * key/value lists and tables that wrap and continue on new pages.
 * Standard Helvetica supports French accents.
 */
export class DmePdf {
  private readonly doc: PDFKit.PDFDocument;
  private readonly chunks: Buffer[] = [];
  private readonly done: Promise<Buffer>;

  constructor(title: string, subtitle?: string) {
    this.doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: { Title: title, Author: 'Orange DME' },
    });
    this.doc.on('data', (chunk: Buffer) => this.chunks.push(chunk));
    this.done = new Promise((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.doc.on('error', reject);
    });

    this.doc.rect(0, 0, this.doc.page.width, 8).fill(ORANGE);
    if (LOGO_PATH) {
      // 3276 x 800 source: 150 pt wide is about 37 pt high.
      this.doc.image(LOGO_PATH, MARGIN, 26, { width: 150 });
    } else {
      this.doc
        .fillColor(ORANGE)
        .font('Helvetica-Bold')
        .fontSize(12)
        .text('ORANGE B2B', MARGIN, 34);
    }
    this.doc
      .fillColor(BLACK)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(title, MARGIN, 82, { width: this.width });
    if (subtitle) {
      this.doc.font('Helvetica').fontSize(10).fillColor(GREY).text(subtitle);
    }
    this.doc.moveDown(1.2);
  }

  private get width() {
    return this.doc.page.width - MARGIN * 2;
  }

  private get bottom() {
    return this.doc.page.height - MARGIN - 20;
  }

  private ensureSpace(height: number) {
    if (this.doc.y + height > this.bottom) this.doc.addPage();
  }

  section(title: string) {
    this.ensureSpace(60);
    this.doc.moveDown(0.6);
    const y = this.doc.y;
    this.doc.rect(MARGIN, y, 4, 16).fill(ORANGE);
    this.doc
      .fillColor(BLACK)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(title, MARGIN + 12, y + 1, { width: this.width - 12 });
    this.doc.moveDown(0.5);
    this.doc.x = MARGIN;
    return this;
  }

  paragraph(text: string) {
    this.doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(BLACK)
      .text(text, MARGIN, this.doc.y, { width: this.width });
    this.doc.moveDown(0.4);
    return this;
  }

  /** Label / value rows. Empty values are skipped. */
  keyValues(rows: [string, string | number | null | undefined][]) {
    const labelWidth = this.width * 0.4;
    for (const [label, value] of rows) {
      if (value === null || value === undefined || value === '') continue;
      const text = String(value);
      const height = Math.max(
        this.doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .heightOfString(text, {
            width: this.width - labelWidth,
          }),
        12,
      );
      this.ensureSpace(height + 6);
      const y = this.doc.y;
      this.doc
        .font('Helvetica')
        .fillColor(GREY)
        .text(label, MARGIN, y, { width: labelWidth - 8 });
      this.doc
        .font('Helvetica-Bold')
        .fillColor(BLACK)
        .text(text, MARGIN + labelWidth, y, { width: this.width - labelWidth });
      this.doc.y = y + height + 6;
    }
    this.doc.x = MARGIN;
    return this;
  }

  /** A table; the header is repeated on each new page. */
  table<Row>(
    columns: PdfTableColumn<Row>[],
    rows: Row[],
    empty = 'Aucune donnée.',
  ) {
    if (rows.length === 0) return this.paragraph(empty);
    const widths = columns.map((column) => column.width * this.width);
    const padding = 4;
    const drawHeader = () => {
      const y = this.doc.y;
      this.doc.rect(MARGIN, y, this.width, 18).fill(BLACK);
      let x = MARGIN;
      columns.forEach((column, index) => {
        this.doc
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(8.5)
          .text(column.header, x + padding, y + 5, {
            width: widths[index] - padding * 2,
            lineBreak: false,
            ellipsis: true,
          });
        x += widths[index];
      });
      this.doc.y = y + 18;
    };

    this.ensureSpace(40);
    drawHeader();
    rows.forEach((row, rowIndex) => {
      const cells = columns.map((column) => {
        const value = column.value(row);
        return value === null || value === undefined || value === ''
          ? '—'
          : String(value);
      });
      this.doc.font('Helvetica').fontSize(8.5);
      const height =
        Math.max(
          ...cells.map((cell, index) =>
            this.doc.heightOfString(cell, {
              width: widths[index] - padding * 2,
            }),
          ),
        ) +
        padding * 2;
      if (this.doc.y + height > this.bottom) {
        this.doc.addPage();
        drawHeader();
      }
      const y = this.doc.y;
      if (rowIndex % 2 === 1) {
        this.doc.rect(MARGIN, y, this.width, height).fill(LIGHT);
      }
      let x = MARGIN;
      cells.forEach((cell, index) => {
        this.doc
          .fillColor(BLACK)
          .font('Helvetica')
          .fontSize(8.5)
          .text(cell, x + padding, y + padding, {
            width: widths[index] - padding * 2,
          });
        x += widths[index];
      });
      this.doc.y = y + height;
    });
    this.doc.x = MARGIN;
    this.doc.moveDown(0.5);
    return this;
  }

  /** Adds page numbers and returns the PDF bytes. */
  async toBuffer() {
    const range = this.doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      this.doc.switchToPage(range.start + index);
      // Writing inside the bottom margin would otherwise open a new page.
      this.doc.page.margins.bottom = 0;
      this.doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(GREY)
        .text(
          `Orange DME · page ${index + 1}/${range.count}`,
          MARGIN,
          this.doc.page.height - MARGIN + 10,
          { width: this.width, align: 'right', lineBreak: false },
        );
    }
    this.doc.end();
    return this.done;
  }
}
