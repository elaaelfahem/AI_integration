import { gateEvidence, pageSupportsIdentity, sameSite } from './evidence-policy.mjs';
// Public search is evidence, never an automatic company identity.
const platforms = ['b2b.tn','linkedin.com','facebook.com','instagram.com','kompass.com','goafricaonline.com','pagesjaunes.fr','pagesjaunes.com.tn','wikipedia.org','youtube.com','scribd.com','keejob.com','tanitjobs.com','indeed.com','glassdoor.com'];
export function companyWebsite(value) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (platforms.some(p => host === p || host.endsWith(`.${p}`))) return null;
    if (/\.(pdf|docx?|xlsx?)$/i.test(u.pathname)) return null;
    return u.origin + '/';
  } catch { return null; }
}
export function researchQueries(company) {
  const name = String(company.canonical_name ?? '').replace(/["\r\n]/g, ' ').trim().slice(0, 200);
  if (!name || company.identity_status === 'UNRESOLVED_PLACE_ID') return [];
  const prefix = `"${name}" ${String(company.governorate || company.city || 'Tunisie').slice(0, 80)}`;
  return ['site officiel official website', 'activités services produits contact', 'actualités news partenariat', 'recrutement jobs emploi'].map((topic, i) => ({ query: `${i === 0 ? `"${name}"` : prefix} ${topic}`, topic: ['identity','activities_contacts','news','jobs'][i] }));
}
export async function researchCompany(input, { search, collect, lookupLocation }) {
  if (!input?.campaign_id || !input?.company?.company_id) throw new Error('campaign_id and company.company_id required');
  const company = { ...input.company };
  const warnings = [], rawEvidence = [], queries = researchQueries(company);
  let completedQueries = 0;
  for (const [index, task] of queries.entries()) {
    try {
      const result = await search({campaign_id: input.campaign_id, query_id: `${company.company_id}:research:${index}`, source_id:'web_search',source_type:'web_search', language:'fr',query:task.query}, 4);
      warnings.push(...(result.warnings ?? []));
      if (result.status && result.status !== 'COMPLETED') warnings.push(`Research query ${task.topic} incomplete`);
      if ((!result.status || result.status === 'COMPLETED') && !(result.warnings ?? []).length) completedQueries++;
      for (const record of result.candidates ?? []) {
        const p = record.payload ?? {};
        rawEvidence.push({query_topic:task.topic,topic:task.topic,source_url:record.source_url,retrieved_at:record.retrieved_at,published_at:p.publishedDate ?? null,title:String(p.title || '').slice(0,300),evidence_text:String(p.content || '').slice(0,700),uncertainty:'SEARCH_SNIPPET_UNVERIFIED',source_name:'web_search',search_provider:p.engine || null,source_record_id:record.source_record_id ?? null,checksum:record.checksum ?? null,query_id:record.query_id ?? `${company.company_id}:research:${index}`});
      }
    } catch { warnings.push(`Research query ${task.topic} unavailable`); }
  }
  const gated = gateEvidence(company, rawEvidence);
  const evidence = gated.evidence;
  let website = queries.length ? companyWebsite(company.website) : null;
  let resolution = {status: website ? 'SUPPLIED_UNVERIFIED' : 'REVIEW_REQUIRED', website, evidence:[]};
  const collections = new Map();
  // A company's careers/contact page can identify its site even when the
  // identity query is dominated by directories or press mentions.
  const nameHost = String(company.canonical_name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const plausible = [...new Set(evidence.filter(e => e.identity_match).map(e => companyWebsite(e.source_url)).filter(Boolean))]
    .sort((a,b) => Number(new URL(b).hostname.replace(/^www\./,'').split('.')[0] === nameHost) - Number(new URL(a).hostname.replace(/^www\./,'').split('.')[0] === nameHost)).slice(0,2);
  if (!website) {
    const supported = [];
    for (const url of plausible) {
      try {
        const bundle = await collect({...input, company, website:url, maximum_pages:1});
        collections.set(url,bundle);
        const page = bundle.pages?.[0];
        if (bundle.status === 'COLLECTED' && pageSupportsIdentity(company, page, url)) supported.push(url);
      } catch { warnings.push('Website identity check unavailable'); }
    }
    if (supported.length === 1) {
      website = supported[0];
      resolution = {status:'SUPPORTED_BY_SITE_EVIDENCE',website,evidence:[{source_url:collections.get(website).pages[0].source_url,retrieved_at:collections.get(website).pages[0].retrieved_at,checksum:collections.get(website).pages[0].checksum,title:collections.get(website).pages[0].title,source_name:'website_collector',method:'SAME_SITE_EXACT_ORGANIZATION_OR_TITLE',uncertainty:'Site claim; not independent ownership verification'}],ownership_verified:false};
    } else if (supported.length > 1) warnings.push('Multiple plausible company websites; manual review required');
  }
  let collection = {contract_version:'1.0',campaign_id:input.campaign_id,company_id:company.company_id,status:'SKIPPED_NO_WEBSITE',website:null,pages:[],warnings:[]};
  if (website) {
    try { collection = await collect({...input,company,website,maximum_pages:5}); }
    catch { collection = {...collection,status:'UNAVAILABLE'}; warnings.push('Website collection unavailable'); }
  }
  // A missing homepage is not a missing company. Try bounded, already sourced
  // same-site pages after a 404, through the same collector/robots checks.
  if (website && collection.status !== 'COLLECTED' && (collection.warnings ?? []).some(w => /HTTP 404/.test(w)) && !(collection.warnings ?? []).some(w => /robots|unsafe|private|blocked/i.test(w))) {
    const alternatives = [...new Set(evidence.map(e => e.source_url).filter(url => sameSite(url, website) && new URL(url).pathname !== '/'))].slice(0,2);
    for (const url of alternatives) {
      try {
        const fallback = await collect({...input,company,website:url,maximum_pages:5});
        if (fallback.status === 'COLLECTED' && fallback.pages?.some(p => pageSupportsIdentity(company,p,website))) {
          warnings.push('Homepage unavailable; collected an independently sourced same-site page');
          collection = fallback;
          break;
        }
      } catch { warnings.push('Same-site fallback collection unavailable'); }
    }
  }
  // Preserve the already collected identity page when a later enrichment request fails.
  if (website && collection.status !== 'COLLECTED' && collections.get(website)?.status === 'COLLECTED') {
    warnings.push('Full website collection unavailable; retaining the previously collected identity page');
    collection = collections.get(website);
  }
  if (website && collection.status === 'COLLECTED') {
    const supportingPage = collection.pages?.find(page => pageSupportsIdentity(company, page, website));
    if (supportingPage) resolution = {status:'SUPPORTED_BY_SITE_EVIDENCE',website,evidence:[{source_url:supportingPage.source_url,retrieved_at:supportingPage.retrieved_at,checksum:supportingPage.checksum,title:supportingPage.title,source_name:'website_collector',method:'SAME_SITE_EXACT_ORGANIZATION_OR_TITLE',uncertainty:'Site claim; not independent ownership verification'}],ownership_verified:false};
  }
  company.website = website;
  company.websites = website ? [website] : [];
  company.domains = website ? [new URL(website).hostname.replace(/^www\./,'')] : [];
  company.website_resolution = resolution;
  // Community records guide a location review; they are never extracted facts
  // and cannot independently satisfy the scoring gate.
  let locationResearch = {status:'NOT_REQUESTED',leads:[],warnings:[]};
  if (lookupLocation && (company.governorate || company.city) && company.identity_status !== 'UNRESOLVED_PLACE_ID') {
    try { locationResearch = await lookupLocation(company); }
    catch { locationResearch = {status:'UNAVAILABLE',leads:[],warnings:['Community location lookup unavailable']}; }
  }
  if (['UNAVAILABLE', 'RATE_LIMITED', 'NOT_CONFIGURED'].includes(locationResearch.status))
    warnings.push(...(locationResearch.warnings?.length ? locationResearch.warnings : [`Community location lookup ${locationResearch.status.toLowerCase()}`]));
  const missingTopics = ['activities_contacts','news','jobs'].filter(topic => !evidence.some(e => e.detected_topics.includes(topic)));
  if (queries.length && resolution.status !== 'SUPPORTED_BY_SITE_EVIDENCE') missingTopics.unshift('identity');
  if (queries.length && missingTopics.length) warnings.push(`No supported evidence for research topics: ${missingTopics.join(', ')}; absence of results is not proof of absence`);
  company.web_research = {research_version:'external-evidence-2.1',evidence_quality:gated.evidence_quality,diagnostics:{...gated.diagnostics,by_query_topic:Object.fromEntries(queries.map(q => [q.topic,{received_count:rawEvidence.filter(e=>e.query_topic===q.topic).length,retained_count:evidence.filter(e=>e.query_topic===q.topic).length,topic_supported_count:evidence.filter(e=>e.query_topic===q.topic && e.detected_topics.includes(q.topic)).length}]))},status_semantics:'Query execution only; not identity or fact verification',status:queries.length ? (warnings.length ? 'PARTIAL' : 'COMPLETED') : 'NEEDS_INDEPENDENT_IDENTITY',query_count:queries.length,evidence,location_research:locationResearch,uncertainty:'Public mentions and community locations are unverified; neither is an accepted fact',researched_at:new Date().toISOString()};
  company.web_research.coverage = {completed_queries:completedQueries,total_queries:queries.length,missing_topics:missingTopics,site_identity_supported:resolution.status === 'SUPPORTED_BY_SITE_EVIDENCE',collection_status:collection.status};
  company.web_research.warnings = [...new Set([...(collection.warnings ?? []),...warnings])];
  if (queries.length && collection.status !== 'COLLECTED') company.web_research.status = 'PARTIAL';
  company.web_research.status_semantics = 'Search execution and evidence coverage; completion never establishes independent verification';
  return {...collection, company, research:company.web_research,warnings:company.web_research.warnings};
}
