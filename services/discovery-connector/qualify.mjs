// Search evidence is kept separate from immutable raw-source envelopes.
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const hostOf = value => new URL(value).hostname.toLowerCase().replace(/^www\./, '');
const platforms = ['scribd.com', 'goafricaonline.com', 'b2b.tn', 'linkedin.com', 'facebook.com', 'instagram.com', 'wikipedia.org', 'youtube.com', 'kompass.com', 'pagesjaunes.com.tn', 'pagesjaunes.fr', 'emploi.nat.tn', 'keejob.com', 'tanitjobs.com', 'indeed.com', 'glassdoor.com'];
export function preclassify(record) {
  const url = record.payload?.url || record.source_url;
  let parsed;
  try { parsed = new URL(url); } catch { return 'INVALID_URL'; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return 'INVALID_URL';
  const host = hostOf(url);
  if (platforms.some(p => host === p || host.endsWith(`.${p}`))) return 'DIRECTORY_OR_PLATFORM';
  if (/\.(pdf|docx?|xlsx?|pptx?)(?:$|[?#])/i.test(url)) return 'DOCUMENT';
  if (/\/(blog|news|actualites|article|articles|jobs|emploi|annuaire)(\/|$)/i.test(parsed.pathname)) return 'EDITORIAL_OR_LISTING_PAGE';
  if (/\b(liste des|annuaire|top \d+|meilleures societes|societes d.informatique de|list of|best \d+)\b/i.test(norm(record.payload?.title))) return 'COMPANY_LIST';
  return null;
}
const generic = new Set(['www','com','net','org','tn','co','it','informatique','tunisie','tunis','societe','services','solutions','accueil','home','contact','ssii','entreprise','company','business','maintenance','infogerance','expert','experte']);
const tokens = value => norm(value).match(/[a-z0-9]+/g)?.filter(t => t.length >= 2 && !generic.has(t)) ?? [];
export function assessPage(record, page) {
  const rejected = preclassify(record);
  if (rejected) return { status: 'REJECTED', reason: rejected };
  if (!page || !page.source_url || !page.checksum || page.http_status !== 200) return { status: 'REVIEW_REQUIRED', reason: 'WEBSITE_UNAVAILABLE' };
  const inputHost = hostOf(record.payload?.url || record.source_url);
  if (hostOf(page.source_url) !== inputHost) return { status: 'REVIEW_REQUIRED', reason: 'DOMAIN_MISMATCH' };
  const body = norm(page.text);
  if (/verify you are human|checking your browser|domain (is )?for sale|buy this domain|access denied|just a moment/.test(body.slice(0,1500))) return { status: 'REVIEW_REQUIRED', reason: 'BLOCKED_OR_PARKED_WEBSITE' };
  const domainTokens = tokens(inputHost.split('.').slice(0,-1).join(' '));
  const names = [...(page.organization_names ?? []), ...String(page.title || '').split(/\s+[|–—-]\s+|\s*:\s*/)].map(x => String(x).trim()).filter(x => x.length >= 2 && x.length <= 100);
  // Require an actual brand token shared with the site's host, not generic SEO words.
  const name = names.find(n => tokens(n).some(t => domainTokens.some(d => d === t)));
  const contacts = (page.evidence_links ?? []).filter(x => ['email','phone'].includes(x.type));
  const business = /\b(nos services|nos solutions|nos clients|notre entreprise|notre societe|nous accompagnons|specialis[eé]|our services|our solutions|our clients|our company|fournisseur|integrateur|prestations|expertise)\b/.test(body);
  if (!name || !business || !contacts.length) return { status: 'REVIEW_REQUIRED', reason: !name ? 'BUSINESS_IDENTITY_UNCLEAR' : !business ? 'BUSINESS_ACTIVITY_UNCLEAR' : 'CONTACT_EVIDENCE_MISSING' };
  return {
    status: 'QUALIFIED', reason: 'BUSINESS_WEBSITE_WITH_IDENTITY_AND_CONTACT', company_name: name,
    website: new URL('/', page.source_url).toString(),
    website_status: 'SUPPORTED_BY_SITE_EVIDENCE', // Not independent legal/ownership verification.
    evidence: { source_url: page.source_url, retrieved_at: page.retrieved_at, checksum: page.checksum, title: page.title, organization_names: page.organization_names ?? [], contact_links: contacts, method: 'domain_brand_and_business_contact_v1' },
  };
}
export function corroborateWebsite(decision, records) {
  if (decision.status !== 'QUALIFIED') return decision;
  const host = hostOf(decision.website);
  const brand = tokens(decision.company_name);
  const matches = records.filter(record => {
    if (!['google_maps', 'b2b_tn'].includes(record.source_name)) return false;
    const p = record.payload ?? {};
    const url = p.websiteUri || p.website || p.site_web || p.url_site;
    const name = p.displayName?.text || p.company_name || p.name || p.title || '';
    try { return hostOf(url).replace(/^www\./, '') === host && tokens(name).some(t => brand.includes(t)); }
    catch { return false; }
  });
  return { ...decision,
    website_status: matches.length ? 'CORROBORATED_BY_DISCOVERY_SOURCE' : decision.website_status,
    ownership_verified: false,
    corroboration: matches.map(r => ({ source_name: r.source_name, source_record_id: r.source_record_id,
      source_url: r.source_url, retrieved_at: r.retrieved_at, checksum: r.checksum,
      reported_name: r.payload.displayName?.text || r.payload.company_name || r.payload.name || r.payload.title,
      reported_website: r.payload.websiteUri || r.payload.website || r.payload.site_web || r.payload.url_site })),
  };
}
export async function qualifyDiscovery(input, { collect, corroborate, maxChecks = 12 } = {}) {
  if (!input || typeof input.campaign_id !== 'string' || !Array.isArray(input.raw_candidates)) throw new Error('Qualification requires campaign_id and raw_candidates');
  const results = [];
  const queue = input.raw_candidates.filter(r => r.source_name === 'web_search');
  let checked = 0;
  async function qualify(record) {
    const rejected = preclassify(record);
    let decision;
    if (rejected) decision = { status: 'REJECTED', reason: rejected };
    else if (checked++ >= maxChecks) decision = { status: 'REVIEW_REQUIRED', reason: 'QUALIFICATION_LIMIT' };
    else {
      try {
        const result = await collect(record, input.campaign_id);
        decision = assessPage(record, result.pages?.[0]);
        if (decision.status === 'QUALIFIED') {
          decision = corroborateWebsite(decision, input.raw_candidates);
          if (!decision.corroboration.length && corroborate) {
            try { decision = corroborateWebsite(decision, await corroborate(record, decision, input.campaign_id)); }
            catch { decision.corroboration_warning = 'Independent source lookup unavailable'; }
          }
        }
        if (decision.status === 'REVIEW_REQUIRED') decision.collection_warnings = result.warnings ?? [];
      } catch { decision = { status: 'REVIEW_REQUIRED', reason: 'WEBSITE_COLLECTION_FAILED' }; }
    }
    results.push({ source_record_id: record.source_record_id, ...decision });
  }
  let index = 0;
  await Promise.all(Array.from({length: Math.min(3, queue.length)}, async () => {
    while (index < queue.length) await qualify(queue[index++]);
  }));
  return { ...input, web_qualifications: results };
}
