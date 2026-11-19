// Keep the extractor's copy identical: service Docker build contexts are isolated.
export const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function publicUrl(value) {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u : null; } catch { return null; }
}
export const sameSite = (a, b) => {
  const x = publicUrl(a), y = publicUrl(b);
  return Boolean(x && y && x.hostname.replace(/^www\./, '') === y.hostname.replace(/^www\./, ''));
};
const phrase = (text, name) => Boolean(name && ` ${fold(text)} `.includes(` ${fold(name)} `));
const generic = new Set(['it', 'ai', 'abc', 'orange', 'apple', 'delta', 'company', 'services', 'solutions', 'tech', 'technology', 'software', 'global', 'international']);
const jobHosts = ['keejob.com','tanitjobs.com','indeed.com','glassdoor.com','emploi.nat.tn'];
const profileHosts = ['linkedin.com','kompass.com','goafricaonline.com','b2b.tn'];
const publisherHosts = ['ilboursa.com','leaders.com.tn','tunisienumerique.com','kapitalis.com','tekiano.com'];
const hostMatches = (host, list) => list.some(value => host === value || host.endsWith(`.${value}`));
function sourceCategory(item, official, detected) {
  if (official) return 'OFFICIAL_SITE_MENTION';
  const url = publicUrl(item.source_url);
  const host = url?.hostname.toLowerCase().replace(/^www\./,'') ?? '';
  if (hostMatches(host, jobHosts) || /\/(jobs?|emploi|recrutement|offres-d-emploi)(\/|$)/i.test(url?.pathname ?? '')) return 'JOB_POSTING';
  if (hostMatches(host, profileHosts) || /\/(company|entreprise|societe|fiche)(\/|$)/i.test(url?.pathname ?? '')) return 'COMPANY_PROFILE';
  if (hostMatches(host, publisherHosts) && detected.includes('news')) return 'PRESS_ARTICLE';
  return 'OTHER_MENTION';
}
export function assessMention(company, item) {
  if (company.identity_status === 'UNRESOLVED_PLACE_ID') return {reason:'NO_INDEPENDENT_IDENTITY'};
  if (!publicUrl(item.source_url)) return {reason:'INVALID_SOURCE_URL'};
  const name = fold(company.canonical_name);
  const content = `${item.title ?? ''} ${item.evidence_text ?? ''}`;
  if (!name || !phrase(content, name)) return {reason:'COMPANY_NAME_MISMATCH'};
  const official = sameSite(item.source_url, company.website);
  const location = [company.city, company.governorate, company.country].filter(Boolean).some(x => phrase(content, x));
  const websiteHost = publicUrl(company.website)?.hostname.replace(/^www\./, '');
  const domainReference = websiteHost && String(content).toLowerCase().includes(websiteHost);
  const ambiguous = name.length < 4 || name.split(' ').every(t => generic.has(t));
  if (!official && !location && !domainReference && ambiguous) return {reason:'AMBIGUOUS_COMPANY_NAME'};
  // Distinctive names are retained only as candidate mentions, never verified identity.
  const normalized = fold(content);
  const detected = [];
  if (/\b(news|actualites?|partenariat|partnership|launch|lancement|award|funding|acquisition|expansion|announces?|annonce|iso|certification)\b/.test(normalized)) detected.push('news');
  if (/\b(jobs?|hiring|recrutement|recrute|recrutons|vacanc\w*|careers?|emploi|offres? d emploi)\b/.test(normalized)) detected.push('jobs');
  if (/\b(services?|products?|produits?|solutions?|contact|activities|activites)\b/.test(normalized)) detected.push('activities_contacts');
  return {accepted:true, identity_match:true, identity_verified:false, relevance_status:'RELEVANT_UNVERIFIED', relevance_policy:'company-mention-v1', identity_basis:official?'SAME_SITE_AND_NAME':location?'NAME_AND_LOCATION':domainReference?'NAME_AND_DOMAIN_REFERENCE':'DISTINCTIVE_NAME_ONLY', topic:detected.includes(item.query_topic ?? item.topic)?(item.query_topic ?? item.topic):(detected[0] ?? 'mention'), detected_topics:detected, source_category:sourceCategory(item,official,detected),claim_status:'MENTIONED_UNVERIFIED'};
}
export function gateEvidence(company, items) {
  const evidence = [], excluded_by_reason = {};
  for (const item of Array.isArray(items) ? items : []) {
    const decision = item && typeof item === 'object' ? assessMention(company, item) : {reason:'INVALID_RECORD'};
    if (!decision.accepted || item.identity_match === false) {
      const reason = item?.identity_match === false ? 'COMPANY_NAME_MISMATCH' : decision.reason;
      excluded_by_reason[reason] = (excluded_by_reason[reason] ?? 0) + 1;
      continue;
    }
    const {accepted, ...assessment} = decision;
    const published = item.published_at && Number.isFinite(Date.parse(item.published_at)) ? new Date(item.published_at).toISOString() : null;
    evidence.push({...item, ...assessment, published_at:published, query_topic:item.query_topic ?? item.topic ?? null, uncertainty:'SEARCH_SNIPPET_UNVERIFIED', accepted_for_facts:false});
  }
  return {evidence, diagnostics:{received_count:Array.isArray(items)?items.length:0,retained_count:evidence.length,excluded_count:Object.values(excluded_by_reason).reduce((a,b)=>a+b,0),excluded_by_reason}, evidence_quality:evidence.length?'UNVERIFIED_MENTIONS_ONLY':'NO_RELEVANT_EVIDENCE'};
}
export function pageSupportsIdentity(company, page, website) {
  if (!page || !sameSite(page.source_url, website) || page.http_status !== 200 || !page.checksum || !page.retrieved_at || !String(page.text ?? '').trim()) return false;
  if (/verify you are human|checking your browser|domain (is )?for sale|access denied|just a moment/i.test(String(page.text).slice(0,1500))) return false;
  const name = fold(company.canonical_name);
  if (name && [...(page.organization_names ?? []), ...String(page.title ?? '').split(/\s+[|–—-]\s+/)].some(n => fold(n) === name)) return true;
  // A distinctive one-word brand can precede a long SEO title on its own site.
  const hostTokens = fold(publicUrl(website)?.hostname).split(' ');
  return Boolean(name.length >= 5 && !name.includes(' ') && !generic.has(name)
    && hostTokens.includes(name) && fold(page.title).startsWith(`${name} `));
}
