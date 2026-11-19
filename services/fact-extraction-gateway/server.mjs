import { pathToFileURL } from 'node:url';
import { gateEvidence, pageSupportsIdentity, sameSite, fold } from './evidence-policy.mjs';
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
  'address', 'market', 'technology', 'growth_signal', 'news', 'job',
]);

function evidenceFact(field, value, page, evidenceText, confidence = 0.98) {
  return {
    field,
    value_text: text(value),
    source_url: page.source_url,
    evidence_text: text(evidenceText).slice(0, 500),
    extractor_confidence: confidence,
    retrieved_at: page.retrieved_at,
    uncertainty: 'Observed on source; not independent verification',
    inferred: false,
    extraction_method: 'DETERMINISTIC',
  };
}

export function deterministicFacts(pages, company) {
  const facts = [];
  for (const page of pages) {
    const pageText = String(page.text || '');
    const activityTerms = /\b(?:informati\w*|logiciel\w*|software|technolog\w*|ing[eé]nierie|cybers[eé]curit[eé]|infog[eé]rance|d[eé]veloppement web|support IT|CRM|ERP|[eé]lectricit[eé] industrielle)\b/i;
    const businessTerms = /\b(?:boutique|fournisseur|prestataire|sp[eé]cialis\w*|soci[eé]t[eé]|startup|expert|services?|solutions?|support|agence|mat[eé]riel)\b/i;
    const title = text(page.title);
    if (title.length >= 30 && title.length <= 250 && pageText.includes(title)
      && activityTerms.test(fold(title)) && businessTerms.test(fold(title))) {
      facts.push(evidenceFact('activity', title, page, title, 0.85));
    }
    const lines = pageText.split(/\n+/).map(line => line.trim()).filter(Boolean);
    let descriptiveCount = 0;
    let addressCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (descriptiveCount < 2 && line.length >= 45 && line.length <= 500
        && !/copyright|designed by|made with|tous droits/i.test(line)
        && activityTerms.test(fold(line)) && businessTerms.test(fold(line))
        && (fold(company.canonical_name).split(' ')[0]?.length >= 4
          && fold(line).includes(fold(company.canonical_name).split(' ')[0])
          || /^(?:votre prestataire|startup|soci[eé]t[eé]|sp[eé]cialis\w*|prestataire|fournisseur|nous sommes (?:une|un)\b)\b/i.test(line))) {
        facts.push(evidenceFact('activity', line, page, line, 0.8));
        descriptiveCount++;
      }
      const next = lines[i + 1] ?? '';
      const addNext = next.length > 5 && next.length < 100
        && (/^(?:adresse|address|si[eè]ge|agence|bureau)\s*\d*\s*:/i.test(line) && line.length < 35
          || /(?:,|\bde)$/i.test(line) && /\b(?:rue|avenue|av\.?|route)\b/i.test(line));
      const addressQuote = addNext ? `${line}\n${next}` : line;
      const addressLine = addressQuote.replace(/\s+/g, ' ').trim();
      const labeled = /^(?:adresse|address|si[eè]ge|agence|bureau)\s*\d*\s*:/i.test(addressLine);
      const street = /\b(?:rue|avenue|av\.?|route|immeuble|imm\.?|r[eé]sidence|technopark|technop[oô]le|novation city|parc el ghazala)\b/i.test(addressLine);
      const place = /\b(?:tunis|ariana|ben arous|sfax|sousse|bizerte|nabeul|monastir|gab[eè]s|radd[eè]s|rad[eè]s)\b/i.test(addressLine);
      if (addressCount < 8 && addressLine.length >= 20 && addressLine.length <= 180
        && place && (labeled || street)
        && !/@|aller au contenu|itin[eé]raire plan satellite/i.test(addressLine)
        && pageText.includes(addressQuote)) {
        facts.push(evidenceFact('address', addressLine, page, addressQuote, 0.85));
        addressCount++;
      }
    }
    for (const sentence of pageText.split(/(?<=[.!?])\s+|\n+/).filter(s => s.length >= 35 && s.length <= 500).slice(0, 100)) {
      const namesCompany = ` ${fold(sentence)} `.includes(` ${fold(company.canonical_name)} `);
      const field = /^(?:we are hiring|we're hiring|nous recrutons|nous recherchons|job vacancies|open positions)\b/i.test(sentence) ? 'job'
        : namesCompany && /\b(?:announces?|a annonc[ée]|annonce|has launched|a lanc[ée])\b/i.test(sentence) ? 'news'
        : /^(?:nos services|our services|nous proposons|we provide|we offer)\b/i.test(sentence) ? 'product_service'
        : /^(?:notre entreprise|notre soci[ée]t[ée]|our company)\s+(?:est|is|provides|propose|offers)\b/i.test(sentence)
          || namesCompany && /\b(?:provider|provides|fournisseur|spécialis\w*|specializ\w*)\b/i.test(sentence)
          || /^nous sommes (?:une|un)\b/i.test(sentence) && activityTerms.test(fold(sentence))
            && businessTerms.test(fold(sentence)) ? 'activity' : null;
      if (field) facts.push(evidenceFact(field, sentence, page, sentence, 0.8));
    }
    for (const contact of contactsFromPage(page)) {
      facts.push({ ...evidenceFact(contact.field, contact.value, page, contact.raw), contact_validation: contact.validation });
    }
    for (const link of page.evidence_links ?? []) {
      if (['linkedin', 'facebook', 'other_social'].includes(link.type)) {
        try {
          const url = new URL(link.value);
          const brand = fold(company.canonical_name).replace(/ /g, '');
          const account = fold(decodeURIComponent(url.pathname)).replace(/ /g, '');
          // A staff member's profile or an opaque channel ID is not evidence of
          // the company's own account. Keep the raw link in collection only.
          if (!brand || !account.includes(brand) || (link.type === 'linkedin' && !url.pathname.startsWith('/company/'))) continue;
        } catch { continue; }
      }
      if (!['email', 'phone'].includes(link.type) && allowedFields.has(link.type) && text(link.value)) facts.push(evidenceFact(link.type, link.value, page, link.value));
    }
    for (const match of page.text.matchAll(/\b(?:matricule\s+fiscal|identifiant\s+fiscal|registre\s+(?:de\s+)?commerce|RNE)\b\s*(?:[:#-]\s*|\s+)([A-Z0-9][A-Z0-9/.-]{5,30})\b/gi)) {
      if (!/\d/.test(match[1])) continue;
      facts.push(evidenceFact('legal_identifier', match[1], page, match[0]));
    }
  }
  const factKey = fact => {
    if (!['linkedin', 'facebook', 'other_social'].includes(fact.field)) return `${fact.field}|${fact.value_text.toLocaleLowerCase()}`;
    try {
      const url = new URL(fact.value_text);
      const path = url.pathname.replace(/\/+$/, '').toLocaleLowerCase();
      const account = fact.field === 'linkedin' ? path.match(/^\/company\/[^/]+/)?.[0] ?? path : path;
      return `${fact.field}|${url.hostname.replace(/^www\./, '').toLocaleLowerCase()}${account}`;
    } catch { return `${fact.field}|${fact.value_text.toLocaleLowerCase()}`; }
  };
  return facts.filter((fact, index, all) => all.findIndex(other => factKey(other) === factKey(fact)) === index).slice(0, 30);
}

async function reputationSignals(company) {
  const name = text(company.canonical_name);
  if (!name || company.identity_status === 'UNRESOLVED_PLACE_ID') return { status: 'SKIPPED_NO_COMPANY_NAME', signals: [], warnings: [] };
  const url = new URL(`${searxngUrl}/search`);
  url.searchParams.set('q', `"${name}" Tunisia`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('categories', 'news');
  url.searchParams.set('language', 'auto');
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SearXNG returned HTTP ${response.status}`);
    if (!Array.isArray(body.results)) throw new Error('SearXNG returned invalid results');
    const engineWarnings = (Array.isArray(body.unresponsive_engines) ? body.unresponsive_engines : []).map(entry => `SearXNG engine unavailable: ${Array.isArray(entry) ? entry.join(': ') : String(entry)}`);
    const signals = body.results.slice(0, 5).map((result) => {
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
    const gated = gateEvidence(company, signals.map(s => ({...s, topic:'news', retrieved_at:new Date().toISOString()})));
    return { status: engineWarnings.length ? (body.results.length ? 'PARTIAL' : 'UNAVAILABLE') : 'COMPLETED', signals:gated.evidence.filter(e => e.detected_topics.includes('news')), diagnostics:gated.diagnostics, warnings: engineWarnings };
  } catch (error) {
    return { status: 'UNAVAILABLE', signals: [], warnings: [`Reputation search unavailable: ${error.name}`] };
  }
}

function extractionInput(input, bundleChecksum) {
  // Leave room for the prompt and structured response in the local 4096-token model.
  let remaining = 4_500;
  const pages = [];
  for (const page of input.collection.pages ?? []) {
    if (remaining <= 0) break;
    const pageText = text(page.text).slice(0, Math.min(1_500, remaining));
    remaining -= pageText.length;
    pages.push({ source_url: page.source_url, title: page.title, retrieved_at: page.retrieved_at, text: pageText });
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
    if (!text(fact.evidence_text) || !page.text.includes(fact.evidence_text) || !fact.evidence_text.includes(text(fact.value_text))) continue;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1 || fact.inferred !== false) continue;
    // Contact facts must come from the same deterministic, format-validated evidence path.
    // A model cannot introduce a different number merely because a quote is present.
    if (!['description', 'activity', 'product_service', 'market', 'technology'].includes(fact.field)) continue;
    facts.push({ ...fact, retrieved_at: page.retrieved_at, uncertainty: 'Quoted source claim; not independent verification', extractor_confidence: confidence, extraction_method: 'FLOWISE' });
  }
  if (!facts.length) throw new Error('Model returned no valid source-grounded facts');
  return { summary: facts.filter(f => ['description','activity','product_service'].includes(f.field)).map(f => f.value_text).join(' ').slice(0, 1000), facts, warnings: value.warnings.map(text).filter(Boolean) };
}

export async function extract(input) {
  if (!input.collection || !input.company || !text(input.campaign_id)) throw new Error('Extraction request is missing campaign, company, or collection');
  const incomingPages = Array.isArray(input.collection.pages) ? input.collection.pages : [];
  const identitySupported = input.company.identity_status !== 'UNRESOLVED_PLACE_ID' && incomingPages.some(p => pageSupportsIdentity(input.company, p, input.company.website));
  const pages = input.collection.status === 'COLLECTED' && identitySupported ? incomingPages.filter(p => sameSite(p.source_url, input.company.website) && p.http_status === 200 && p.checksum && p.retrieved_at && typeof p.text === 'string') : [];
  const pageWarnings = pages.length !== incomingPages.length ? ['Pages excluded: company identity, collection status, or same-site provenance unsupported'] : [];
  const gated = gateEvidence(input.company, input.company.web_research?.evidence);
  input = {...input, collection:{...input.collection,pages}, company:{...input.company, ...(input.company.web_research ? {web_research:{...input.company.web_research,evidence:gated.evidence,evidence_quality:gated.evidence_quality,extraction_diagnostics:gated.diagnostics}} : {})}};
  const bundleChecksum = hash(pages.map((page) => `${page.source_url}|${page.checksum}`).join('\n'));
  const deterministic = deterministicFacts(pages, input.company);
  const reputation = input.company.web_research ? {status:input.company.web_research.status,signals:gated.evidence.filter(e => ['COMPANY_PROFILE','JOB_POSTING','PRESS_ARTICLE'].includes(e.source_category) || e.detected_topics.some(t => ['news','jobs'].includes(t))),warnings:[]} : await reputationSignals(input.company);
  const base = {
    contract_version: '1.0', campaign_id: input.campaign_id, company_id: input.company.company_id,
    company: input.company,
    collection_status: input.collection.status, document_checksum: bundleChecksum,
    extractor_version: 'cited-profile-2.1',
    summary: deterministic.filter(f => ['description', 'activity', 'product_service'].includes(f.field)).map(f => f.value_text).join(' ').slice(0, 1000), facts: deterministic, model_used: false,
    flowise_flow_id: flowId, reputation_status: reputation.status, reputation_signals: reputation.signals, research_evidence_quality:reputation.signals.length ? 'UNVERIFIED_MENTIONS_ONLY' : gated.evidence_quality, research_diagnostics:reputation.diagnostics ?? gated.diagnostics, warnings: [...(input.collection.warnings ?? []), ...pageWarnings, ...reputation.warnings],
  };
  if (input.collection.status !== 'COLLECTED') return { ...base, status: input.collection.status };
  if (!pages.length) return {...base,status:'UNAVAILABLE'};
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
    return { ...base, status: 'COMPLETED', summary: parsed.summary || base.summary, facts: combined, model_used: true, warnings: [...base.warnings, ...parsed.warnings] };
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) server.listen(port, '0.0.0.0', () => console.log(`Fact extraction gateway listening on port ${port}`));
