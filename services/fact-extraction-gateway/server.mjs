import { contactsFromPage } from './contacts.mjs';
import http from 'node:http';
import { createHash } from 'node:crypto';

const port = Number(process.env.PORT ?? 8083);
const flowiseUrl = String(process.env.FLOWISE_URL ?? 'http://flowise:3000').replace(/\/$/, '');
const flowId = String(process.env.FACT_EXTRACTOR_FLOW_ID ?? '7d3c481a-01ad-49ec-918b-1d7cfcb85a70');
const timeoutMs = Math.max(10_000, Math.min(Number(process.env.FLOWISE_TIMEOUT_MS ?? 90_000), 180_000));
const searxngUrl = String(process.env.SEARXNG_URL ?? 'http://searxng:8080').replace(/\/$/, '');

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 2_000_000) throw new Error('Request body exceeds 2 MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const text = (value) => value === null || value === undefined ? '' : String(value).trim();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const allowedFields = new Set([
  'description', 'activity', 'product_service', 'email', 'phone', 'linkedin',
  'facebook', 'other_social', 'leader', 'legal_identifier', 'legal_name',
  'address', 'market', 'technology', 'growth_signal',
]);

function evidenceFact(field, value, page, evidenceText, confidence = 0.98) {
  return {
    field,
    value_text: text(value),
    source_url: page.source_url,
    evidence_text: text(evidenceText).slice(0, 500),
    extractor_confidence: confidence,
    inferred: false,
    extraction_method: 'DETERMINISTIC',
  };
}

function deterministicFacts(pages) {
  const facts = [];
  for (const page of pages) {
    for (const contact of contactsFromPage(page)) {
      facts.push({ ...evidenceFact(contact.field, contact.value, page, contact.raw), contact_validation: contact.validation });
    }
    for (const link of page.evidence_links ?? []) {
      if (!['email', 'phone'].includes(link.type) && allowedFields.has(link.type) && text(link.value)) facts.push(evidenceFact(link.type, link.value, page, link.value));
    }
    for (const match of page.text.matchAll(/(?:matricule\s+fiscal|identifiant\s+fiscal|registre\s+(?:de\s+)?commerce|RNE)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/.-]{5,30})/gi)) {
      facts.push(evidenceFact('legal_identifier', match[1], page, match[0]));
    }
  }
  return facts.filter((fact, index, all) => all.findIndex((other) => other.field === fact.field && other.value_text.toLocaleLowerCase() === fact.value_text.toLocaleLowerCase()) === index).slice(0, 30);
}

async function reputationSignals(company) {
  const name = text(company.canonical_name);
  if (!name) return { status: 'SKIPPED_NO_COMPANY_NAME', signals: [], warnings: [] };
  const url = new URL(`${searxngUrl}/search`);
  url.searchParams.set('q', `"${name}" Tunisia`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'news');
  url.searchParams.set('language', 'auto');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}`);
    const signals = (Array.isArray(body.results) ? body.results : []).slice(0, 5).map((result) => {
      const evidence = text(`${result.title ?? ''} ${result.content ?? ''}`).slice(0, 700);
      const negative = /fraud|lawsuit|scandal|fine|sanction|closure|bankrupt|arrest|complaint/i.test(evidence);
      const positive = /funding|partnership|award|expansion|launch|growth/i.test(evidence);
      return {
        sentiment: negative ? 'NEGATIVE_SIGNAL' : (positive ? 'POSITIVE_SIGNAL' : 'MENTION'),
        title: text(result.title),
        source_url: text(result.url),
        evidence_text: evidence,
        published_at: result.publishedDate ?? null,
        engines: result.engines ?? [],
      };
    }).filter((signal) => signal.source_url && signal.evidence_text);
    return { status: 'COMPLETED', signals, warnings: [] };
  } catch (error) {
    return { status: 'UNAVAILABLE', signals: [], warnings: [`Reputation search unavailable: ${error.name}`] };
  }
}

function extractionInput(input, bundleChecksum) {
  let remaining = 12_000;
  const pages = [];
  for (const page of input.collection.pages ?? []) {
    if (remaining <= 0) break;
    const pageText = text(page.text).slice(0, Math.min(3_500, remaining));
    remaining -= pageText.length;
    pages.push({ source_url: page.source_url, title: page.title, text: pageText });
  }
  return {
    campaign_id: input.campaign_id,
    company_id: input.company.company_id,
    canonical_name: input.company.canonical_name,
    website: input.company.website,
    document_checksum: bundleChecksum,
    pages,
  };
}

function parseModelBody(body) {
  let value = body;
  if (value && typeof value === 'object' && typeof value.text === 'string') value = value.text;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    value = JSON.parse(cleaned);
  }
  return value;
}

function validateModelFacts(value, expected, pages) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Model output is not an object');
  for (const field of ['campaign_id', 'company_id', 'document_checksum']) {
    if (value[field] !== expected[field]) throw new Error(`Model changed ${field}`);
  }
  if (!Array.isArray(value.facts) || !Array.isArray(value.warnings)) throw new Error('Model output requires facts and warnings arrays');
  const pageByUrl = new Map(pages.map((page) => [page.source_url, page]));
  const facts = [];
  for (const fact of value.facts.slice(0, 10)) {
    const page = pageByUrl.get(fact.source_url);
    const confidence = Number(fact.extractor_confidence);
    if (!allowedFields.has(fact.field) || !text(fact.value_text) || !page) continue;
    if (!text(fact.evidence_text) || !page.text.includes(fact.evidence_text)) continue;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || fact.inferred !== false) continue;
    // Contact facts must come from the same deterministic, format-validated evidence path.
    // A model cannot introduce a different number merely because a quote is present.
    if (['phone', 'email'].includes(fact.field)) continue;
    facts.push({ ...fact, extractor_confidence: confidence, extraction_method: 'FLOWISE' });
  }
  return { summary: text(value.summary), facts, warnings: value.warnings.map(text).filter(Boolean) };
}

async function extract(input) {
  if (!input.collection || !input.company || !text(input.campaign_id)) throw new Error('Extraction request is missing campaign, company, or collection');
  const pages = Array.isArray(input.collection.pages) ? input.collection.pages : [];
  const bundleChecksum = hash(pages.map((page) => `${page.source_url}|${page.checksum}`).join('\n'));
  const deterministic = deterministicFacts(pages);
  const reputation = await reputationSignals(input.company);
  const base = {
    contract_version: '1.0', campaign_id: input.campaign_id, company_id: input.company.company_id,
    collection_status: input.collection.status, document_checksum: bundleChecksum,
    summary: '', facts: deterministic, model_used: false,
    flowise_flow_id: flowId, reputation_status: reputation.status, reputation_signals: reputation.signals, warnings: [...(input.collection.warnings ?? []), ...reputation.warnings],
  };
  if (input.collection.status !== 'COLLECTED') return { ...base, status: input.collection.status };
  if (input.enable_semantic_extraction !== true) {
    return { ...base, status: 'COMPLETED_DETERMINISTIC', warnings: [...base.warnings, 'Flowise semantic extraction disabled for this run'] };
  }

  const modelInput = extractionInput(input, bundleChecksum);
  try {
    const response = await fetch(`${flowiseUrl}/api/v1/prediction/${flowId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: JSON.stringify(modelInput) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Flowise returned HTTP ${response.status}`);
    const parsed = validateModelFacts(parseModelBody(await response.json()), modelInput, modelInput.pages);
    const combined = [...deterministic, ...parsed.facts].filter((fact, index, all) => all.findIndex((other) => other.field === fact.field && other.value_text.toLocaleLowerCase() === fact.value_text.toLocaleLowerCase()) === index);
    return { ...base, status: 'COMPLETED', summary: parsed.summary, facts: combined, model_used: true, warnings: [...base.warnings, ...parsed.warnings] };
  } catch (error) {
    return { ...base, status: 'COMPLETED_FALLBACK', warnings: [...base.warnings, `Flowise extraction fallback: ${error.name}`] };
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') return jsonResponse(response, 200, { status: 'ok', flowise_flow_id: flowId, timeout_ms: timeoutMs, searxng_url: searxngUrl });
    if (request.method === 'POST' && request.url === '/v1/extract') return jsonResponse(response, 200, await extract(await readJson(request)));
    return jsonResponse(response, 404, { error: 'Not found' });
  } catch (error) {
    return jsonResponse(response, 400, { error: error.message });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Fact extraction gateway listening on port ${port}`));
