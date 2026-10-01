import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import { createHash } from 'node:crypto';

const port = Number(process.env.PORT ?? 8082);
const maxPages = Math.max(1, Math.min(Number(process.env.MAX_PAGES ?? 5), 10));
const maxBytes = Math.max(100_000, Math.min(Number(process.env.MAX_PAGE_BYTES ?? 1_000_000), 5_000_000));
const timeoutMs = Math.max(2_000, Math.min(Number(process.env.REQUEST_TIMEOUT_MS ?? 15_000), 60_000));
const userAgent = 'Orange-DME-Research/1.0 (+local authorized enrichment)';

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
const checksum = (value) => createHash('sha256').update(value).digest('hex');

function isPrivateAddress(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
      || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
      || (parts[0] === 192 && parts[1] === 168)
      || parts[0] >= 224;
  }
  if (net.isIP(address) === 6) {
    const value = address.toLocaleLowerCase();
    return value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:');
  }
  return true;
}

async function safeUrl(raw, expectedHost = null) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Website URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) websites are allowed');
  if (parsed.username || parsed.password) throw new Error('Website URL must not contain credentials');
  const comparableHost = (value) => value.toLocaleLowerCase().replace(/^www\./, '');
  if (expectedHost && comparableHost(parsed.hostname) !== comparableHost(expectedHost)) throw new Error('Cross-domain redirect is blocked');
  const addresses = await dns.lookup(parsed.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Website resolves to a private or unsafe address');
  }
  parsed.hash = '';
  return parsed;
}

async function fetchPage(startUrl, expectedHost, accept = 'text/html, text/plain;q=0.9') {
  let current = await safeUrl(startUrl, expectedHost);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: { 'user-agent': userAgent, accept },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect response has no Location header');
      current = await safeUrl(new URL(location, current).toString(), expectedHost);
      continue;
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('text/html') && !type.includes('text/plain')) throw new Error(`Unsupported website content type: ${type || 'unknown'}`);
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > maxBytes) throw new Error('Website page exceeds size limit');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error('Website page exceeds size limit');
      }
      chunks.push(value);
    }
    return { url: current.toString(), type, body: Buffer.concat(chunks).toString('utf8'), httpStatus: response.status };
  }
  throw new Error('Website exceeded redirect limit');
}

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLocaleLowerCase() === 'x';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : ' ';
    }
    return named[entity.toLocaleLowerCase()] ?? ' ';
  });
}

function htmlText(html) {
  return decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40_000);
}

function titleFromHtml(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlText(match[1]).slice(0, 300) : '';
}

function candidateLinks(html, pageUrl, host) {
  const preferred = /(?:about|a-propos|qui-sommes|contact|service|solution|produit|product|team|equipe|legal|mentions|company|entreprise)/i;
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      const parsed = new URL(match[1], pageUrl);
      parsed.hash = '';
      if (!['http:', 'https:'].includes(parsed.protocol)
        || parsed.hostname.replace(/^www\./, '') !== host.replace(/^www\./, '')
        || !preferred.test(parsed.pathname)) continue;
      links.push(parsed.toString());
    } catch {
      // Ignore malformed page links.
    }
  }
  return [...new Set(links)];
}

function evidenceLinks(html, pageUrl) {
  const output = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    const raw = match[1].trim();
    try {
      if (/^mailto:/i.test(raw)) output.push({ type: 'email', value: raw.replace(/^mailto:/i, '').split('?')[0] });
      else if (/^tel:/i.test(raw)) output.push({ type: 'phone', value: raw.replace(/^tel:/i, '') });
      else {
        const link = new URL(raw, pageUrl).toString();
        if (/linkedin\.com/i.test(link)) output.push({ type: 'linkedin', value: link });
        else if (/facebook\.com/i.test(link)) output.push({ type: 'facebook', value: link });
        else if (/(?:instagram\.com|x\.com|twitter\.com|youtube\.com)/i.test(link)) output.push({ type: 'other_social', value: link });
      }
    } catch {
      // Ignore malformed evidence links.
    }
  }
  return output.filter((item, index, all) => all.findIndex((other) => other.type === item.type && other.value === item.value) === index).slice(0, 30);
}

function robotsAllows(robots, path) {
  if (!robots) return true;
  let applies = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') applies = value === '*';
    if (applies && key === 'disallow' && value && path.startsWith(value)) return false;
  }
  return true;
}

async function collect(input) {
  for (const field of ['campaign_id', 'company_id', 'canonical_name']) {
    if (!text(input[field])) throw new Error(`${field} must be a non-empty string`);
  }
  if (!text(input.website)) {
    return { contract_version: '1.0', campaign_id: input.campaign_id, company_id: input.company_id, status: 'SKIPPED_NO_WEBSITE', website: null, pages: [], warnings: [] };
  }

  let homepage;
  try {
    const raw = /^https?:\/\//i.test(text(input.website)) ? text(input.website) : `https://${text(input.website)}`;
    homepage = await safeUrl(raw);
  } catch (error) {
    return { contract_version: '1.0', campaign_id: input.campaign_id, company_id: input.company_id, status: 'BLOCKED_UNSAFE_URL', website: text(input.website), pages: [], warnings: [error.message] };
  }

  const warnings = [];
  let robots = '';
  try {
    robots = (await fetchPage(new URL('/robots.txt', homepage).toString(), homepage.hostname, 'text/plain')).body;
  } catch {
    warnings.push('robots.txt unavailable; collection limited to public same-domain pages');
  }

  const queue = [homepage.toString()];
  const seen = new Set();
  const pages = [];
  while (queue.length && pages.length < maxPages) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const parsed = new URL(url);
    if (!robotsAllows(robots, parsed.pathname)) {
      warnings.push(`robots.txt disallowed ${parsed.pathname}`);
      continue;
    }
    try {
      const page = await fetchPage(url, homepage.hostname);
      const content = htmlText(page.body);
      if (content.length < 40) {
        warnings.push(`Page contained insufficient readable text: ${page.url}`);
        continue;
      }
      pages.push({
        source_url: page.url,
        title: titleFromHtml(page.body),
        text: content,
        retrieved_at: new Date().toISOString(),
        http_status: page.httpStatus,
        checksum: checksum(content),
        evidence_links: evidenceLinks(page.body, page.url),
      });
      for (const link of candidateLinks(page.body, page.url, homepage.hostname)) {
        if (!seen.has(link) && queue.length < maxPages * 4) queue.push(link);
      }
    } catch (error) {
      warnings.push(`${url}: ${error.message}`);
    }
  }

  return {
    contract_version: '1.0',
    campaign_id: input.campaign_id,
    company_id: input.company_id,
    status: pages.length ? 'COLLECTED' : 'UNAVAILABLE',
    website: homepage.toString(),
    page_count: pages.length,
    pages,
    warnings,
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      return jsonResponse(response, 200, { status: 'ok', max_pages: maxPages, max_page_bytes: maxBytes, timeout_ms: timeoutMs });
    }
    if (request.method === 'POST' && request.url === '/v1/collect') {
      return jsonResponse(response, 200, await collect(await readJson(request)));
    }
    return jsonResponse(response, 404, { error: 'Not found' });
  } catch (error) {
    return jsonResponse(response, 400, { error: error.message });
  }
});

server.listen(port, '0.0.0.0', () => console.log(`Website collector listening on port ${port}`));
