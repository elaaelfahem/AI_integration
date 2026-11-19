// n8n Code node: Run Once for All Items.
const incoming = $input.first().json;
const request = Array.isArray(incoming) && incoming.length === 1 ? incoming[0] : incoming;
const validation = request.official_validation ?? request;
const companies = validation.companies ?? request.companies;
if (!Array.isArray(companies)) throw new Error('Scoring request must contain a companies array');

const campaign = request.campaign ?? {};
const plan = request.research_plan ?? {};
const lower = (value) => String(value ?? '').trim().toLowerCase();
// Accent-insensitive form, so 'santé' matches 'SANTE' in directory categories.
const fold = (value) => lower(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const unique = (values) => [...new Set(values.filter(Boolean))];
const hasAny = (text, terms) => terms.some((term) => text.includes(term));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const targetSectors = unique([
  ...(campaign.sectors ?? []),
  ...(campaign.target_sectors ?? []),
  ...(plan.queries ?? []).map((query) => query.sector),
].map(lower));
const targetLocations = unique([
  ...(campaign.locations ?? []),
  ...(campaign.target_locations ?? []),
  ...(plan.queries ?? []).map((query) => query.location),
].map(lower));
const sectorAliases = {
  software: ['software', 'logiciel', 'programmation informatique', 'développement informatique'],
  'it services': ['it services', 'services informatiques', 'service informatique', 'informatique'],
  cybersecurity: ['cybersecurity', 'cybersécurité', 'sécurité informatique'],
  cloud: ['cloud', 'infonuagique', 'hébergement'],
  finance: ['finance', 'financier', 'banque', 'fintech'],
  // Same terms the discovery connector uses to find these sectors, so a company
  // discovered for a sector is also recognised as matching it.
  informatique: ['informatique', 'logiciel', 'telecommunication', 'software', 'developpement web', 'developpement informatique', 'services it', 'solutions it', 'digital services', 'information system'],
  industrie: ['industr', 'fabrication', 'manufactur', 'usinage', 'mecanique'],
  sante: ['sante', 'medical', 'medic', 'pharma', 'clinique', 'hopital'],
};
sectorAliases.tech = sectorAliases.informatique;
sectorAliases.industry = sectorAliases.industrie;
sectorAliases.health = sectorAliases.sante;
const targetSectorTerms = unique(targetSectors.flatMap((sector) => sectorAliases[sector] ?? sectorAliases[fold(sector)] ?? [sector]).map(fold));

function scoreCompany(company) {
  const reasons = [];
  const missing = [];
  const evidenceRefs = [];
  const sourceRecords = company.source_records ?? [];
  const sourceIds = unique(company.source_ids ?? sourceRecords.map((record) => record.source_id));
  const facts = company.enriched_facts ?? [];
  const sourceEvidenceText = sourceRecords.map((record) => {
    const payload = record.payload ?? {};
    return [payload.title, payload.category, ...(payload.categories ?? []), payload.activity, payload.description].join(' ');
  }).join(' ');
  const text = lower([
    company.canonical_name, company.description, company.sector, company.industry,
    company.activity, company.address, company.location,
    sourceEvidenceText,
    ...facts.map((fact) => `${fact.field} ${fact.value_text}`),
  ].join(' '));
  const sourcedAddresses = facts.filter((fact) => fact.field === 'address' && fact.inferred === false
    && fact.source_url && fact.retrieved_at && fact.evidence_text);
  const sourcedActivities = facts.filter((fact) => ['activity','product_service','technology'].includes(fact.field)
    && fact.inferred === false && fact.source_url && fact.retrieved_at && fact.evidence_text);
  const trustedSectorText = fold([
    ...sourceRecords.filter((record) => record.source_name === 'b2b_tn')
      .flatMap((record) => [record.payload?.category, ...(record.payload?.categories ?? [])]),
    ...sourcedActivities.map((fact) => fact.value_text)].join(' '));
  const locationText = fold([
    ...sourcedAddresses.map((fact) => fact.value_text)].join(' '));

  let fit = 8;
  const foldedText = fold(text);
  const wrongSector = targetSectors.some(s => ['tech','informatique','it services','software'].includes(s))
    && /(?:electri(?:que|cite).{0,35}industri|installation.{0,25}electrique|travaux.{0,25}electrique)/.test(trustedSectorText)
    && !/(?:developpement (?:de logiciels|informatique|web)|services informatiques|edition de logiciels)/.test(trustedSectorText);
  const sectorMatch = !wrongSector && targetSectorTerms.some((sector) => sector && trustedSectorText.includes(sector));
  // A street named after a city is not evidence of a business in that city.
  const locationMatch = targetLocations.some(location => sourcedAddresses.some(fact => {
    const value = fold(fact.value_text).replace(/(?:rue|route|avenue|av\.|boulevard|bd\.)\s+(?:de\s+|du\s+)?[a-z-]+/g, '');
    const token = fold(location).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z])' + token + '($|[^a-z])').test(value);
  }));
  if (wrongSector) reasons.push('Cited core activity is outside the requested IT sector');
  if (sectorMatch) { fit += 12; reasons.push('Matches a campaign target sector'); }
  else missing.push('confirmed_target_sector');
  if (locationMatch) {
    fit += 6; reasons.push('Matches a campaign target location');
    evidenceRefs.push(...sourcedAddresses.map((fact) => fact.source_url));
  }
  else if (targetLocations.length) missing.push('confirmed_target_location');
  const campaignFitConfirmed = (!targetSectors.length || sectorMatch) && (!targetLocations.length || locationMatch);
  if (!campaignFitConfirmed) reasons.push('Campaign sector or location requires source confirmation before offers');
  const employeeCount = Number(company.employee_count ?? company.employees ?? company.company_size);
  if (Number.isFinite(employeeCount) && employeeCount >= 50) { fit += 4; reasons.push('Company size indicates enterprise potential'); }
  else if (!Number.isFinite(employeeCount)) missing.push('employee_count');
  fit = clamp(fit, 0, 30);

  let opportunity = 5;
  if (hasAny(text, ['software', 'logiciel', 'informatique', 'technology', 'technologie', 'cloud', 'digital', 'finance', 'banque'])) {
    opportunity += 8; reasons.push('Activity suggests demand for business connectivity or digital services');
  }
  const growthEvidence = facts.filter(fact => ['job', 'growth_signal'].includes(fact.field)
    && fact.inferred === false && fact.source_url && fact.retrieved_at && fact.evidence_text
    && /\b(?:we are hiring|we're hiring|nous recrutons|nous recherchons|job vacancies|open positions|we are expanding|nous ouvrons)\b/i.test(fact.evidence_text));
  if (growthEvidence.length) {
    opportunity += 5; reasons.push('Sourced hiring or expansion claim observed; not independently verified');
    evidenceRefs.push(...growthEvidence.map(fact => fact.source_url));
  }
  if (employeeCount >= 50) opportunity += 5;
  else if (employeeCount >= 10) opportunity += 3;
  if (company.website) opportunity += 2;
  else { opportunity += 1; missing.push('website'); }
  opportunity = clamp(opportunity, 0, 25);

  const phones = unique(company.phones ?? (company.phone ? [company.phone] : []));
  const emails = unique(company.emails ?? (company.email ? [company.email] : []));
  const socials = unique(company.social_profiles ?? []);
  let reachability = 0;
  if (phones.length) { reachability += 8; reasons.push('Phone contact is available'); } else missing.push('phone');
  if (emails.length) { reachability += 7; reasons.push('Email contact is available'); } else missing.push('email');
  if (company.website) reachability += 3;
  if (socials.length) reachability += 2;
  reachability = clamp(reachability, 0, 20);

  const official = company.official_validation ?? {};
  let trust = 2;
  if (official.status === 'VERIFIED') { trust = 15; reasons.push('Official registry validation succeeded'); }
  else if (official.status === 'CONFLICT') { trust = 0; reasons.push('Official registry data conflicts with collected data'); }
  else if (company.legal_identifier) { trust = 8; reasons.push('A legal identifier is available but not verified'); }
  else if (official.status === 'SKIPPED_NO_IDENTIFIER') missing.push('legal_identifier');
  if (company.review_required) trust = Math.min(trust, 5);

  let evidenceQuality = 0;
  if (sourceRecords.length) { evidenceQuality += 3; evidenceRefs.push(...sourceRecords.map((record) => record.source_record_id).filter(Boolean)); }
  if (sourceIds.length >= 2) { evidenceQuality += 3; reasons.push('Confirmed by multiple discovery sources'); }
  else if (sourceIds.length === 1) evidenceQuality += 1;
  if (facts.length) {
    evidenceQuality += 2;
    evidenceRefs.push(...facts.map((fact) => fact.evidence_ref ?? fact.source_url).filter(Boolean));
  }
  const completeness = Number(company.profile_completeness);
  if (Number.isFinite(completeness)) evidenceQuality += completeness >= 0.7 ? 2 : completeness >= 0.4 ? 1 : 0;
  evidenceQuality = clamp(evidenceQuality, 0, 10);

  const total = fit + opportunity + reachability + trust + evidenceQuality;
  const blocked = wrongSector || company.website_resolution?.status !== 'SUPPORTED_BY_SITE_EVIDENCE' || company.identity_status === 'UNRESOLVED_PLACE_ID' || company.ready_for_scoring === false || official.status === 'CONFLICT';
  if (company.identity_status === 'UNRESOLVED_PLACE_ID') {
    missing.push('independent_company_identity');
    reasons.push('Place ID retained; independent company identity requires review');
  }
  const category = blocked ? 'REVIEW' : total >= 75 ? 'A' : total >= 50 ? 'B' : 'C';
  const confidence = clamp(Number(((evidenceQuality / 10) * 0.6 + (Number.isFinite(completeness) ? completeness : 0.25) * 0.4).toFixed(2)), 0, 1);
  if (!reasons.length) reasons.push('Insufficient positive evidence; manual enrichment recommended');

  return {
    ...company,
    scoring: {
      qualification_status: wrongSector ? 'WRONG_SECTOR' : !sectorMatch && targetSectors.length ? 'UNVERIFIED_SECTOR' : !locationMatch && targetLocations.length ? 'UNVERIFIED_LOCATION' : blocked ? 'NEEDS_REVIEW' : total >= 50 ? 'VERIFIED_FIT' : 'NEEDS_REVIEW',
      identity_status: company.website_resolution?.status === 'SUPPORTED_BY_SITE_EVIDENCE' ? 'SITE_SUPPORTED' : 'UNVERIFIED',
      legal_identity_status: official.status === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED',
      score_version: 'lead-score-2.1',
      total_score: total,
      category,
      confidence,
      components: { campaign_fit: fit, telecom_opportunity: opportunity, reachability, official_trust: trust, evidence_quality: evidenceQuality },
      reasons: unique(reasons).slice(0, 8),
      missing_data: unique(missing),
      evidence_refs: unique(evidenceRefs),
      ready_for_offer_recommendation: !blocked && campaignFitConfirmed && total >= 50,
      explanation_source: 'DETERMINISTIC',
    },
  };
}

const scored = companies.map(scoreCompany).sort((a, b) => b.scoring.total_score - a.scoring.total_score || String(a.company_id).localeCompare(String(b.company_id)));
const categories = Object.fromEntries(['A', 'B', 'C', 'REVIEW'].map((category) => [category.toLowerCase(), scored.filter((company) => company.scoring.category === category).length]));
return [{ json: {
  contract_version: '1.0',
  campaign_id: validation.campaign_id ?? request.campaign_id ?? campaign.campaign_id,
  status: categories.review ? 'REVIEW_REQUIRED' : 'COMPLETED',
  score_version: 'lead-score-2.1',
  company_count: scored.length,
  categories,
  ready_for_offer_recommendation_count: scored.filter((company) => company.scoring.ready_for_offer_recommendation).length,
  companies: scored,
  warnings: validation.warnings ?? [],
} }];
