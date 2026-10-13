import { qualifyDiscovery } from './qualify.mjs';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';

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

// Companies a caller already holds, registered per campaign just before the
// campaign runs, so repeated searches surface records that are new to them.
const exclusions = new Map();
const exclusionTtlMs = 15 * 60 * 1000;

function registerExclusions(input) {
  if (typeof input?.campaign_id !== 'string' || !input.campaign_id.trim()) {
    throw new Error('campaign_id must be a non-empty string');
  }
  const list = (value) => (Array.isArray(value) ? value : []).filter((item) => typeof item === 'string').slice(0, 5000);
  for (const [id, entry] of exclusions) if (entry.expiresAt < Date.now()) exclusions.delete(id);
  const entry = {
    expiresAt: Date.now() + exclusionTtlMs,
    urls: new Set(list(input.source_urls).map(urlKey).filter(Boolean)),
    names: new Set(list(input.names).map(normalized).filter(Boolean)),
    domains: new Set(list(input.domains).map(domainKey).filter(Boolean)),
  };
  exclusions.set(input.campaign_id, entry);
  return { campaign_id: input.campaign_id, excluded: entry.urls.size + entry.names.size + entry.domains.size };
}

function urlKey(value) {
  try {
    const url = new URL(value);
    return `${domainKey(url.hostname)}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch { return ''; }
}

function domainKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

// Directories host many companies on one domain, so a domain only excludes
// results from sources where each company has its own site.
function isExcluded(campaignId, { url, name, matchDomain = false }) {
  const entry = exclusions.get(campaignId);
  if (!entry || entry.expiresAt < Date.now()) return false;
  if (url && entry.urls.has(urlKey(url))) return true;
  if (name && entry.names.has(normalized(name))) return true;
  if (matchDomain && url) {
    try { return entry.domains.has(domainKey(new URL(url).hostname)); } catch { return false; }
  }
  return false;
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

const namedEntities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
function decodeEntities(value) {
  if (typeof value !== 'string' || !value.includes('&')) return value;
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return namedEntities[entity.toLowerCase()] ?? match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

// The directory publishes HTML-escaped text ("A&#038;B"); store what a reader sees.
function cleanB2bRecord(record) {
  return {
    ...record,
    title: decodeEntities(record.title),
    address: decodeEntities(record.address),
    categories: Array.isArray(record.categories) ? record.categories.map(decodeEntities) : record.categories,
  };
}

// B2B.tn is often unreachable for minutes at a time. The last good copy is kept
// in memory and, when B2B_CACHE_FILE is set, on disk so a restart or an outage
// does not stop directory searches.
const b2bCacheFile = process.env.B2B_CACHE_FILE ?? '';
const b2bRetryMs = 5 * 60 * 1000;

async function fetchB2bRecords() {
  let lastError;
  for (let attempt = 0; attempt < (b2bCacheFile ? 2 : 1); attempt += 1) {
    try {
      const response = await fetch(b2bAllUrl, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`B2B.tn returned HTTP ${response.status}`);
      const body = await response.json();
      if (!body?.get || !Array.isArray(body.data)) throw new Error('Unexpected B2B.tn response');
      return body.data.map(cleanB2bRecord);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function loadB2bRecords() {
  if (Date.now() < b2bCache.expiresAt && b2bCache.records.length) return b2bCache.records;
  if (!b2bCache.records.length && b2bCacheFile) {
    try {
      const saved = JSON.parse(await readFile(b2bCacheFile, 'utf8'));
      if (Array.isArray(saved.records) && saved.records.length) {
        b2bCache = { expiresAt: Number(saved.expiresAt) || 0, records: saved.records };
        if (Date.now() < b2bCache.expiresAt) return b2bCache.records;
      }
    } catch { /* no saved copy yet */ }
  }
  try {
    const records = await fetchB2bRecords();
    b2bCache = { expiresAt: Date.now() + 60 * 60 * 1000, records };
    if (b2bCacheFile && records.length) {
      await writeFile(b2bCacheFile, JSON.stringify(b2bCache)).catch(() => undefined);
    }
  } catch (error) {
    if (!b2bCache.records.length) throw error;
    b2bCache.expiresAt = Date.now() + b2bRetryMs;
    console.warn(`B2B.tn refresh failed (${error.message}); serving the last good copy`);
  }
  return b2bCache.records;
}

function sectorTerms(sector) {
  const raw = normalized(sector);
  const key = ({informatique: 'tech', industrie: 'industry', sante: 'health'})[raw] ?? raw;
  const known = {
    tech: ['informatique', 'logiciel', 'telecommunication', 'technolog', 'reseaux'],
    industry: ['industr', 'fabrication', 'manufactur', 'usinage', 'mecanique'],
    health: ['sante', 'medical', 'medic', 'pharma', 'clinique', 'hopital'],
    software: ['logiciel', 'programmation informatique', 'ingenierie informatique', 'software'],
    'it services': ['services informatiques', 'informatique', 'ingenierie informatique', 'reseaux'],
  };
  return (known[key] ?? [key]).map(normalized).filter(Boolean);
}

function b2bUrl(record) {
  return new URL(record.url, 'https://b2b.tn').toString();
}

async function discoverB2b(query, limit) {
  const records = await loadB2bRecords();
  const location = normalized(query.location);
  const terms = sectorTerms(query.sector);
  const matches = records.filter((record) => {
    const address = normalized(record.address);
    const businessText = normalized([record.title, ...(record.categories ?? [])].join(' '));
    return containsLocation(address, location)
      && terms.some((term) => businessText.includes(term))
      && !isExcluded(query.campaign_id, { url: b2bUrl(record), name: record.title });
  }).slice(0, limit);

  return matches.map((record) => envelope(
    query,
    b2bUrl(record),
    record,
  ));
}

async function discoverGoogleMaps(query, limit, timeoutMs = 45_000) {
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
    signal: AbortSignal.timeout(timeoutMs),
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

const webCache = new Map();
const webCacheMs = Math.max(0, Number(process.env.WEB_CACHE_TTL_MS ?? 900000));
let webRetryAt = 0;
async function discoverWebSearch(query, limit) {
  const key = JSON.stringify([query.query, query.language || 'auto', limit]);
  const cached = webCache.get(key);
  const usable = cached && Date.now() - cached.at < webCacheMs;
  const cachedResult = () => ({candidates: cached.candidates.filter(c => !isExcluded(query.campaign_id, {url:c.source_url, matchDomain:true})).map(c => ({...c, campaign_id:query.campaign_id,query_id:query.query_id})), warnings:['Live web search unavailable; using previously retrieved results with their original timestamps.']});
  if (Date.now() < webRetryAt) {
    if (usable) return cachedResult();
    throw new Error('Search providers are cooling down after a failure; retry in one minute');
  }
  try {
    const result = await fetchWebSearch(query, limit);
    if (webCacheMs && result.candidates.length) {
      webCache.set(key, {at:Date.now(), candidates:result.candidates});
      if (webCache.size > 100) webCache.delete(webCache.keys().next().value);
    }
    return result;
  } catch (error) {
    if (webCacheMs) webRetryAt = Date.now() + 60000;
    if (usable) return cachedResult();
    throw error;
  }
}
async function fetchWebSearch(query, limit) {
  const requestUrl = new URL(`${searxngUrl}/search`);
  requestUrl.searchParams.set('q', query.query);
  requestUrl.searchParams.set('format', 'json');
  requestUrl.searchParams.set('language', query.language || 'auto');
  requestUrl.searchParams.set('categories', 'general');

  const response = await fetch(requestUrl, { signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.results)) {
    throw new Error('SearXNG returned an invalid results payload');
  }
  const unavailable = Array.isArray(body.unresponsive_engines) ? body.unresponsive_engines : [];
  const warnings = unavailable.map((entry) =>
    `SearXNG engine unavailable: ${Array.isArray(entry) ? entry.join(': ') : String(entry)}`);
  if (!body.results.length && unavailable.length) {
    throw new Error(`SearXNG returned no results with engine failures: ${warnings.join('; ')}`);
  }
  const results = body.results.filter((result) => {
    try { return ['http:', 'https:'].includes(new URL(result.url).protocol); } catch { return false; }
  }).filter((result) => !isExcluded(query.campaign_id, { url: result.url, matchDomain: true })).slice(0, limit);
  if (body.results.length && !results.length && !exclusions.has(query.campaign_id)) {
    throw new Error('SearXNG returned no usable HTTP(S) result URLs');
  }
  const candidates = results.map((result) => envelope(
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
  return { candidates, warnings };
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
    try {
      candidates = await discoverB2b(query, limit);
    } catch (error) {
      status = 'SKIPPED';
      warnings.push(`B2B.tn source skipped: ${error.message}`);
    }
  } else if (query.source_id === 'google_maps') {
    try {
      const result = await discoverGoogleMaps(query, limit);
      candidates = result.candidates;
      if (result.warning) {
        warnings.push(result.warning);
        status = 'SKIPPED';
      }
    } catch (error) {
      status = 'SKIPPED';
      warnings.push(`Google Maps source skipped: ${error.message}`);
    }
  } else if (query.source_id === 'web_search') {
    try {
      const result = await discoverWebSearch(query, limit);
      candidates = result.candidates;
      warnings.push(...result.warnings);
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
    if (request.method === 'POST' && request.url === '/v1/qualify-discovery') {
      const input = await readJson(request);
      return jsonResponse(response, 200, await qualifyDiscovery(input, {
        corroborate: async (record, decision, campaignId) => {
          if (!googleApiKey) return [];
          const result = await discoverGoogleMaps({ campaign_id: campaignId,
            query_id: `${record.query_id || record.source_record_id}:website-check`,
            source_id: 'google_maps', source_type: 'maps', language: 'fr',
            query: `${decision.company_name} Tunisie` }, 3, 3_000);
          return result.candidates;
        },
        collect: async (record, campaignId) => {
          const base = process.env.WEBSITE_COLLECTOR_URL || 'http://website-collector:8082';
          const result = await fetch(`${base}/v1/collect`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ campaign_id: campaignId, company_id: record.source_record_id,
              canonical_name: record.payload?.title || 'Search candidate',
              website: record.payload?.url || record.source_url, maximum_pages: 1 }),
            signal: AbortSignal.timeout(35_000),
          });
          if (!result.ok) throw new Error(`Collector returned ${result.status}`);
          return result.json();
        },
      }));
    }
    if (request.method === 'POST' && request.url === '/v1/exclusions') {
      return jsonResponse(response, 200, registerExclusions(await readJson(request)));
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
  if (b2bCacheFile) loadB2bRecords().catch((error) => console.warn(`B2B.tn warm-up failed: ${error.message}`));
});
