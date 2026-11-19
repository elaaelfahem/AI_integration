// Only organic web results enter the pipeline; Maps/Places are never requested.
export async function searchSerper({query, language, limit = 10, page = 1, apiKey}, fetcher = fetch) {
  if (!Number.isInteger(page) || page < 1 || page > 20) throw new Error('Search page must be between 1 and 20');
  const response = await fetcher('https://google.serper.dev/search', {
    method: 'POST', redirect: 'error',
    headers: {'Content-Type':'application/json', 'X-API-KEY':apiKey},
    body: JSON.stringify({q:query, num:Math.max(1,Math.min(limit,100)), page, ...(language && language !== 'auto' ? {hl:language} : {})}),
    signal: AbortSignal.timeout(45000),
  });
  // Never reflect upstream bodies: they can echo authentication material.
  if (!response.ok) throw new Error(`Serper returned HTTP ${response.status}`);
  let body;
  try { body = await response.json(); } catch { throw new Error('Serper returned invalid JSON'); }
  if (!body || !Array.isArray(body.organic)) throw new Error('Serper returned an invalid organic results payload');
  const results = body.organic.filter(r => {
    try { const u = new URL(r.link); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }).slice(0,limit).map(r => ({title:r.title ?? '',url:r.link,content:r.snippet ?? '',engine:'serper',engines:['serper'],score:null,publishedDate:r.date ?? null}));
  if (body.organic.length && !results.length) throw new Error('Serper returned no usable HTTP(S) result URLs');
  return results;
}
