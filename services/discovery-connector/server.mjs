import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

function readEnvFile(path) {
  try {
    return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
      const value = line.trim();
      if (!value || value.startsWith('#') || !value.includes('=')) return [];
      const separator = value.indexOf('=');
      return [[value.slice(0, separator).trim(), value.slice(separator + 1).trim()]];
    }));
  } catch {
    return {};
  }
}

const secretEnv = readEnvFile('/run/secrets/discovery.env');

const port = Number(process.env.PORT ?? 8080);
const b2bAllUrl = process.env.B2B_ALL_URL
  ?? 'https://b2b.tn/api/95144485658589965854226547145896325655854852365856665545855/entreprises/getEntreprisesAll.php?nb=-1';
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY ?? secretEnv.GOOGLE_MAPS_API_KEY ?? '';
const googleUrl = 'https://places.googleapis.com/v1/places:searchText';
const searxngUrl = (process.env.SEARXNG_URL ?? 'http://searxng:8080').replace(/\/$/, '');
const mapsScraperUrl = (process.env.GOOGLE_MAPS_SCRAPER_URL ?? 'http://google-maps-scraper:8080').replace(/\/$/, '');
const googleFieldMask = [
  'places.id', 'places.displayName', 'places.formattedAddress',
  'places.nationalPhoneNumber', 'places.websiteUri', 'places.rating',
  'places.userRatingCount', 'places.primaryType', 'places.location',
].join(',');

let b2bCache = { expiresAt: 0, records: [] };

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_000_000) throw new Error('Request body exceeds 1 MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalized(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

function containsLocation(address, location) {
  if (!location) return true;
  return address === location
    || address.startsWith(`${location} `)
    || address.endsWith(` ${location}`)
    || address.includes(` ${location} `);
}

function checksum(payload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function envelope(query, sourceUrl, payload, httpStatus = 200) {
  return {
    source_record_id: randomUUID(),
    campaign_id: query.campaign_id,
    query_id: query.query_id,
    source_name: query.source_id,
    source_type: query.source_type,
    source_url: sourceUrl,
    retrieved_at: new Date().toISOString(),
    http_status: httpStatus,
    content_type: 'application/json',
    checksum: checksum(payload),
    payload,
  };
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  const [headers = [], ...dataRows] = rows;
  return dataRows
    .filter((dataRow) => dataRow.length === headers.length)
    .map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index]])));
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function scraperPayload(row) {
  return {
    name: row.title ?? '',
    category: row.category ?? '',
    address: row.address ?? '',
    complete_address: row.complete_address ?? '',
    website: row.website ?? '',
    phone: row.phone ?? '',
    rating: numeric(row.review_rating),
    review_count: numeric(row.review_count),
    latitude: numeric(row.latitude),
    longitude: numeric(row.longitude),
    google_maps_url: row.link ?? '',
    place_id: row.place_id ?? '',
    open_hours: row.open_hours ?? '',
    emails: row.emails ?? '',
  };
}

async function waitForScraperJob(jobId) {
  const deadline = Date.now() + 260_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${mapsScraperUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(45_000),
    });
    const job = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google Maps Scraper returned HTTP ${response.status}`);
    if (job.Status === 'ok') return job;
    if (job.Status && !['pending', 'working'].includes(job.Status)) {
      throw new Error(`Google Maps Scraper job ended with status: ${job.Status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
  throw new Error('Google Maps Scraper did not finish within 260 seconds');
}

async function discoverGoogleMapsScraper(query, limit) {
  const response = await fetch(`${mapsScraperUrl}/api/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Discovery ${query.query_id}`,
      keywords: [query.query],
      lang: query.language || 'en',
      zoom: 15,
      depth: 1,
      max_time: 180,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const created = await response.json().catch(() => ({}));
  if (!response.ok || typeof created.id !== 'string' || !created.id) {
    throw new Error(`Google Maps Scraper could not create a job${response.ok ? '' : ` (HTTP ${response.status})`}`);
  }
  await waitForScraperJob(created.id);
  const download = await fetch(`${mapsScraperUrl}/api/v1/jobs/${encodeURIComponent(created.id)}/download`, {
    signal: AbortSignal.timeout(20_000),
  });
  const csv = await download.text();
  if (!download.ok) throw new Error(`Google Maps Scraper download returned HTTP ${download.status}`);
  const location = normalized(query.location);
  const records = parseCsv(csv)
    .filter((row) => containsLocation(normalized(`${row.address ?? ''} ${row.complete_address ?? ''}`), location))
    .slice(0, limit);
  return records.map((row) => envelope(
    query,
    row.link || `${mapsScraperUrl}/api/v1/jobs/${encodeURIComponent(created.id)}/download`,
    scraperPayload(row),
    download.status,
  ));
}

async function loadB2bRecords() {
  if (Date.now() < b2bCache.expiresAt && b2bCache.records.length) return b2bCache.records;
  const response = await fetch(b2bAllUrl, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`B2B.tn returned HTTP ${response.status}`);
  const body = await response.json();
  if (!body?.get || !Array.isArray(body.data)) throw new Error('Unexpected B2B.tn response');
  b2bCache = { expiresAt: Date.now() + 60 * 60 * 1000, records: body.data };
  return b2bCache.records;
}

function sectorTerms(sector) {
  const key = normalized(sector);
  const known = {
    software: ['logiciel', 'programmation informatique', 'ingenierie informatique', 'software'],
    'it services': ['services informatiques', 'informatique', 'ingenierie informatique', 'reseaux'],
  };
  return (known[key] ?? [key]).map(normalized).filter(Boolean);
}

async function discoverB2b(query, limit) {
  const records = await loadB2bRecords();
  const location = normalized(query.location);
  const terms = sectorTerms(query.sector);
  const matches = records.filter((record) => {
    const address = normalized(record.address);
    const businessText = normalized([record.title, ...(record.categories ?? [])].join(' '));
    return containsLocation(address, location)
      && terms.some((term) => businessText.includes(term));
  }).slice(0, limit);

  return matches.map((record) => envelope(
    query,
    new URL(record.url, 'https://b2b.tn').toString(),
    record,
  ));
}

async function discoverGoogleMaps(query, limit) {
  if (!googleApiKey) {
    return { candidates: [], warning: 'Google Maps source skipped: API key is not configured' };
  }
  const response = await fetch(googleUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': googleApiKey,
      'X-Goog-FieldMask': googleFieldMask,
    },
    body: JSON.stringify({
      textQuery: query.query,
      languageCode: query.language,
      pageSize: Math.min(limit, 20),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Places returned HTTP ${response.status}`);
  const candidates = (body.places ?? []).map((place) => envelope(
    query,
    `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id ?? '')}`,
    place,
    response.status,
  ));
  return { candidates };
}

async function discoverWebSearch(query, limit) {
  const requestUrl = new URL(`${searxngUrl}/search`);
  requestUrl.searchParams.set('q', query.query);
  requestUrl.searchParams.set('format', 'json');
  requestUrl.searchParams.set('language', query.language || 'auto');
  requestUrl.searchParams.set('categories', 'general');

  const response = await fetch(requestUrl, { signal: AbortSignal.timeout(45_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}`);
  const results = Array.isArray(body.results) ? body.results.slice(0, limit) : [];
  return results.map((result) => envelope(
    query,
    typeof result.url === 'string' && result.url ? result.url : requestUrl.toString(),
    {
      title: result.title ?? '',
      url: result.url ?? '',
      content: result.content ?? '',
      engine: result.engine ?? '',
      engines: result.engines ?? [],
      score: result.score ?? null,
      publishedDate: result.publishedDate ?? null,
    },
    response.status,
  ));
}

async function discover(query) {
  for (const field of ['campaign_id', 'query_id', 'source_id', 'source_type', 'query']) {
    if (typeof query[field] !== 'string' || !query[field].trim()) {
      throw new Error(`${field} must be a non-empty string`);
    }
  }
  const limit = Math.max(1, Math.min(Number(query.limit_per_query ?? 20), 50));
  let candidates = [];
  const warnings = [];
  let status = 'COMPLETED';

  if (query.source_id === 'b2b_tn') {
    candidates = await discoverB2b(query, limit);
  } else if (query.source_id === 'google_maps') {
    const result = await discoverGoogleMaps(query, limit);
    candidates = result.candidates;
    if (result.warning) {
      warnings.push(result.warning);
      status = 'SKIPPED';
    }
  } else if (query.source_id === 'web_search') {
    try {
      candidates = await discoverWebSearch(query, limit);
    } catch (error) {
      status = 'SKIPPED';
      warnings.push(`Web search source skipped: ${error.message}`);
    }
  } else if (query.source_id === 'google_maps_scraper') {
    try {
      candidates = await discoverGoogleMapsScraper(query, limit);
    } catch (error) {
      status = 'SKIPPED';
      warnings.push(`Google Maps Scraper source skipped: ${error.message}`);
    }
  } else {
    throw new Error(`Unsupported discovery source: ${query.source_id}`);
  }

  return {
    contract_version: '1.0',
    campaign_id: query.campaign_id,
    query_id: query.query_id,
    source_id: query.source_id,
    status,
    candidate_count: candidates.length,
    candidates,
    warnings,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      return jsonResponse(response, 200, {
        status: 'ok',
        google_maps_configured: Boolean(googleApiKey),
        searxng_url: searxngUrl,
        google_maps_scraper_url: mapsScraperUrl,
        b2b_cache_records: b2bCache.records.length,
      });
    }
    if (request.method === 'POST' && request.url === '/v1/discover') {
      return jsonResponse(response, 200, await discover(await readJson(request)));
    }
    return jsonResponse(response, 404, { error: 'Not found' });
  } catch (error) {
    return jsonResponse(response, 400, { error: error.message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Discovery connector listening on port ${port}`);
});
