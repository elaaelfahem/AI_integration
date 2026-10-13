import { ClientCategory, PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = path.join(__dirname, 'data', 'orange_tunisia_clients.csv');

function parseCsv(text: string): string[][] {
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

function toClientCategory(value: string): ClientCategory | undefined {
  const upper = value.trim().toUpperCase();
  return (Object.values(ClientCategory) as string[]).includes(upper)
    ? (upper as ClientCategory)
    : undefined;
}

export async function seedCompanies(prisma: PrismaClient) {
  if (!fs.existsSync(CSV_PATH)) {
    console.log('Companies seed skipped: no seed CSV found at', CSV_PATH);
    return;
  }

  const owner = await prisma.superadmin.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { created_at: 'asc' },
  });

  if (!owner) {
    console.log(
      'Companies seed skipped: no active superadmin to own the seeded companies.',
    );
    return;
  }

  const managers = await prisma.user.findMany({
    where: { role: 'MANAGER', status: 'ACTIVE' },
    select: { id: true },
    orderBy: { created_at: 'asc' },
  });

  const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
  const table = parseCsv(raw);
  const header = table[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = table.slice(1);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row[idx['Raison sociale (Compte payeur)']]?.trim();
    if (!name) continue;

    const existing = await prisma.company.findFirst({ where: { name } });
    if (existing) {
      skipped++;
      continue;
    }

    const segment = row[idx['Segment De Recouvrement']]?.trim();
    const governorate = row[idx['Gouvernorat']]?.trim() || undefined;
    const delegation = row[idx['Delegation']]?.trim() || undefined;
    const clientCategory = toClientCategory(row[idx['Categorie Client']] ?? '');
    const mobileLinesRaw = row[idx['Mobile Sales (Compte payeur)']]?.trim();
    const mobileLines = mobileLinesRaw
      ? parseInt(mobileLinesRaw, 10)
      : undefined;
    const contactName =
      row[idx['Gestionnaire de Flotte (Contact payeur)']]?.trim() || undefined;

    const aiScore = clientCategory
      ? {
          BRONZE: 25,
          SILVER: 55,
          GOLD: 78,
          DIAMOND: 95,
        }[clientCategory]
      : undefined;

    const notesParts = [
      row[idx['Numero CRM']] && `Numéro CRM: ${row[idx['Numero CRM']]}`,
      row[idx['Proprietaire (Compte payeur)']] &&
        `Propriétaire: ${row[idx['Proprietaire (Compte payeur)']]}`,
      row[idx['Account Manager (Compte payeur)']] &&
        `Account Manager: ${row[idx['Account Manager (Compte payeur)']]}`,
      row[idx['Compte parent (Compte payeur)']] &&
        `Compte parent: ${row[idx['Compte parent (Compte payeur)']]}`,
      '(Données de démonstration générées pour le prospecting)',
    ].filter(Boolean);

    await prisma.company.create({
      data: {
        name,
        sector: segment || undefined,
        contact_name: contactName,
        address:
          governorate || delegation
            ? [delegation, governorate, 'Tunisie'].filter(Boolean).join(', ')
            : undefined,
        governorate,
        delegation,
        client_category: clientCategory,
        mobile_lines:
          mobileLines !== undefined && !Number.isNaN(mobileLines)
            ? mobileLines
            : undefined,
        ai_score: aiScore,
        notes: notesParts.join(' | '),
        created_by_id: owner.id,
        manager_id: managers.length
          ? managers[created % managers.length].id
          : undefined,
      },
    });
    created++;
  }

  if (managers.length) {
    const unassigned = await prisma.company.findMany({
      where: { manager_id: null, status: 'ACTIVE' },
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });
    for (const [index, company] of unassigned.entries()) {
      await prisma.company.update({
        where: { id: company.id },
        data: { manager_id: managers[index % managers.length].id },
      });
    }
  }

  console.log(
    `Companies seed completed: ${created} created, ${skipped} already existed.`,
  );
}
