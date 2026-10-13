import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const port = Number(process.env.PORT ?? 8081);
const baseUrl = String(process.env.RNE_API_BASE_URL ?? '').trim();
const lookupPath = String(process.env.RNE_LOOKUP_PATH_TEMPLATE ?? '/companies/{identifier}').trim();
const authMode = String(process.env.RNE_AUTH_MODE ?? 'bearer').trim().toLowerCase();
const apiKeyHeader = String(process.env.RNE_API_KEY_HEADER ?? 'x-api-key').trim();
const apiKeyFile = String(process.env.RNE_API_KEY_FILE ?? '/run/secrets/rne_api_key').trim();

function readSecret(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

const apiKey = String(process.env.RNE_API_KEY ?? '').trim() || readSecret(apiKeyFile);
const configured = Boolean(baseUrl && (authMode === 'none' || apiKey));

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

const text = (value) => value === null || value === undefined ? '' : String(value).trim();
const normalizedIdentifier = (value) => text(value).toLocaleUpperCase().replace(/[^A-Z0-9]/g, '');
const normalizedName = (value) => text(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase()
  .replace(/\b(sarl|sa|sas|sasu|suarl|company|compagnie|societe)\b/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

function checksum(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function first(object, names) {
  for (const name of names) {
    const value = object?.[name];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return null;
}

function firstRecord(body) {
  if (!body || typeof body !== 'object') return null;
  for (const value of [body.data, body.result, body.company, body.enterprise, body.entreprise, body]) {
    if (Array.isArray(value)) return value[0] ?? null;
    if (value && typeof value === 'object') return value;
  }
  return null;
}

function nameSimilarity(left, right) {
  const a = new Set(normalizedName(left).split(' ').filter(Boolean));
  const b = new Set(normalizedName(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

function resultBase(input, status, warnings = []) {
  return {
    contract_version: '1.0',
    campaign_id: text(input.campaign_id),
    company_id: text(input.company_id),
    provider: 'RNE',
    provider_configured: configured,
    registry_verified: status === 'VERIFIED',
    status,
    validated_at: null,
    identifier_used: text(input.identifier) || null,
    official_fields: null,
    conflicts: [],
    retrieval: null,
    warnings,
  };
}

function buildEndpoint(identifier) {
  const encoded = encodeURIComponent(identifier);
  const path = lookupPath.includes('{identifier}')
    ? lookupPath.replaceAll('{identifier}', encoded)
    : `${lookupPath.replace(/\/$/, '')}/${encoded}`;
  return new URL(path, baseUrl).toString();
}

async function validateCompany(input) {
  for (const field of ['campaign_id', 'company_id']) {
    if (!text(input[field])) throw new Error(`${field} must be a non-empty string`);
  }
  const policy = input.validation_policy ?? {};
  if (policy.enabled === false) return resultBase(input, 'NOT_REQUESTED');
  if (policy.mode === 'MANUAL_ONLY') {
    return { ...resultBase(input, 'NOT_REQUESTED', ['RNE validation requires a manual action']), manual_action_available: true };
  }
  const identifier = normalizedIdentifier(input.identifier);
  if (!identifier) return resultBase(input, 'SKIPPED_NO_IDENTIFIER', [
    'Official registry verification not performed: company identifier is missing',
    ...(!configured ? ['RNE API access is not configured; authorized provider access is required'] : []),
  ]);
  if (!configured) return resultBase(input, 'UNAVAILABLE', ['RNE connector is not configured']);

  const headers = { accept: 'application/json' };
  if (authMode === 'bearer') headers.authorization = `Bearer ${apiKey}`;
  else if (authMode === 'api-key') headers[apiKeyHeader] = apiKey;
  else if (authMode !== 'none') return resultBase(input, 'UNAVAILABLE', [`Unsupported RNE auth mode: ${authMode}`]);

  const retrievedAt = new Date().toISOString();
  let response;
  try {
    response = await fetch(buildEndpoint(identifier), {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return resultBase(input, 'UNAVAILABLE', [`RNE request failed: ${error.name}`]);
  }

  const body = await response.json().catch(() => null);
  const retrieval = {
    retrieved_at: retrievedAt,
    http_status: response.status,
    checksum: checksum(body),
  };
  if (response.status === 404) return { ...resultBase(input, 'NOT_FOUND'), retrieval };
  if (!response.ok) return { ...resultBase(input, 'UNAVAILABLE', [`RNE returned HTTP ${response.status}`]), retrieval };

  const record = firstRecord(body);
  if (!record) return { ...resultBase(input, 'NOT_FOUND'), retrieval };
  const officialIdentifier = text(first(record, [
    'identifier', 'rne_id', 'registry_number', 'registre_commerce',
    'matricule_fiscale', 'tax_id', 'numeroRegistre', 'numero_registre',
  ]));
  const officialName = text(first(record, [
    'legal_name', 'raison_sociale', 'denomination', 'name', 'nom', 'company_name',
  ]));
  if (!officialName) {
    return { ...resultBase(input, 'UNAVAILABLE', ['RNE response mapping found no official company name']), retrieval };
  }

  const officialFields = {
    legal_identifier: officialIdentifier || identifier,
    legal_name: officialName,
    legal_status: first(record, ['legal_status', 'statut_juridique', 'forme_juridique', 'status']),
    registration_date: first(record, ['registration_date', 'date_immatriculation', 'date_creation', 'created_at']),
    legal_address: first(record, ['legal_address', 'siege_social', 'adresse', 'address']),
    activity: first(record, ['activity', 'activite', 'objet_social', 'business_activity']),
    representative: first(record, ['representative', 'representant_legal', 'dirigeant', 'manager']),
  };
  const conflicts = [];
  if (officialIdentifier && normalizedIdentifier(officialIdentifier) !== identifier) {
    conflicts.push({ field: 'legal_identifier', candidate_value: input.identifier, official_value: officialIdentifier });
  }
  const similarity = nameSimilarity(input.canonical_name, officialName);
  if (text(input.canonical_name) && similarity < 0.6) {
    conflicts.push({ field: 'canonical_name', candidate_value: input.canonical_name, official_value: officialName, similarity: Number(similarity.toFixed(2)) });
  }
  const status = conflicts.length ? 'CONFLICT' : 'VERIFIED';
  return {
    ...resultBase(input, status),
    validated_at: new Date().toISOString(),
    identifier_used: identifier,
    official_fields: officialFields,
    conflicts,
    retrieval,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      return jsonResponse(response, 200, {
        status: 'ok',
        configured,
        auth_mode: authMode,
        lookup_template_configured: Boolean(lookupPath),
      });
    }
    if (request.method === 'POST' && request.url === '/v1/validate') {
      return jsonResponse(response, 200, await validateCompany(await readJson(request)));
    }
    return jsonResponse(response, 404, { error: 'Not found' });
  } catch (error) {
    return jsonResponse(response, 400, { error: error.message });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`RNE connector listening on port ${port}; configured=${configured}`);
});
