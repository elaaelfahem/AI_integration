// n8n Code node: Run Once for All Items.
const request = $input.first().json;
const scoring = request.scoring ?? request;
if (!Array.isArray(scoring.companies)) throw new Error('Offer request must contain scored companies');
const catalog = request.offer_catalog;
if (!catalog || !Array.isArray(catalog.offers)) throw new Error('Offer catalog is required');
const lower = (value) => String(value ?? '').toLowerCase();
const unique = (values) => [...new Set(values.filter(Boolean))];

function companyEvidence(company) {
  const records = company.source_records ?? [];
  return lower([
    company.canonical_name, company.description, company.sector, company.industry, company.activity,
    ...records.flatMap((record) => { const p = record.payload ?? {}; return [p.title, p.category, ...(p.categories ?? []), p.activity, p.description]; }),
    ...(company.enriched_facts ?? []).map((fact) => `${fact.field} ${fact.value_text}`),
  ].join(' '));
}

function recommend(company) {
  const eligible = company.scoring?.ready_for_offer_recommendation === true;
  if (!eligible) return {...company, offer_recommendation:{status:'NOT_ELIGIBLE',catalog_version:catalog.catalog_version,recommendations:[],warnings:['Company is not ready for offer recommendation']}};
  const text = companyEvidence(company);
  const employeeCount = Number(company.employee_count ?? company.employees ?? company.company_size);
  const recommendations = catalog.offers.map((offer) => {
    const matched = offer.signal_terms.filter((term) => text.includes(lower(term)));
    let relevance = matched.length * 15;
    const reasons = matched.slice(0, 4).map((term) => `Evidence contains signal: ${term}`);
    if (offer.offer_id === 'broad_band' && company.website) { relevance += 15; reasons.push('A digital presence indicates connectivity relevance'); }
    if (offer.offer_id === 'mobile' && Number.isFinite(employeeCount) && employeeCount >= 20) { relevance += 20; reasons.push('Company size may indicate multiple mobile users'); }
    if (offer.offer_id === 'office_365' && (company.emails?.length ?? 0)) { relevance += 10; reasons.push('Business email contact is available'); }
    if (offer.offer_id === 'voip' && (company.phones?.length ?? 0) > 1) { relevance += 10; reasons.push('Multiple phone contacts suggest voice-service relevance'); }
    relevance = Math.min(100, relevance);
    return {offer_id:offer.offer_id,offer_name:offer.name,relevance_score:relevance,reasons:unique(reasons),commercial_details:null,needs_commercial_confirmation:true};
  }).filter((item) => item.relevance_score >= 15)
    .sort((a,b) => b.relevance_score-a.relevance_score || a.offer_id.localeCompare(b.offer_id)).slice(0,3);
  return {...company,offer_recommendation:{
    status: recommendations.length ? 'RECOMMENDED' : 'REVIEW_REQUIRED',
    catalog_version:catalog.catalog_version,
    recommendations,
    explanation: recommendations.length ? `Selected ${recommendations.length} offer families from verified company signals.` : 'No offer family has sufficient supporting evidence.',
    explanation_source:'DETERMINISTIC',
    warnings: recommendations.length ? ['Commercial features, eligibility and pricing require the official Orange catalog'] : ['Collect more company needs before proposing an offer'],
  }};
}
const companies = scoring.companies.map(recommend);
const recommended = companies.filter((c)=>c.offer_recommendation.status==='RECOMMENDED').length;
const review = companies.filter((c)=>c.offer_recommendation.status==='REVIEW_REQUIRED').length;
return [{json:{contract_version:'1.0',campaign_id:scoring.campaign_id,status:review?'REVIEW_REQUIRED':'COMPLETED',catalog_version:catalog.catalog_version,company_count:companies.length,recommended_company_count:recommended,not_eligible_count:companies.filter((c)=>c.offer_recommendation.status==='NOT_ELIGIBLE').length,review_required_count:review,companies,warnings:unique(companies.flatMap((c)=>c.offer_recommendation.warnings))}}];
