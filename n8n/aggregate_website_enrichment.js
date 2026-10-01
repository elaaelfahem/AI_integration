// n8n Code node: Run Once for All Items.
const results = $input.all().map((item) => item.json);
const tasks = $('Prepare Website Enrichment Tasks').all().map((item) => item.json);
if (results.length !== tasks.length) throw new Error('Extraction result count does not match website task count');
const resultByCompany = new Map(results.map((result) => [result.company_id, result]));
const unique = (values) => [...new Set(values.filter(Boolean))];
const acceptedFacts = results.flatMap((result) => result.facts ?? []);
const baselineCompleteness = (company) => {
  const fields = [company.website, company.phones?.length, company.emails?.length, company.description, company.address, company.legal_identifier, company.social_profiles?.length];
  return Number((fields.filter(Boolean).length / fields.length).toFixed(2));
};

function factsFor(result, field) {
  return result.facts.filter((fact) => fact.field === field && Number(fact.extractor_confidence) >= 0.8).map((fact) => fact.value_text);
}

const enrichedCompanies = tasks.map((task) => {
  const result = resultByCompany.get(task.company.company_id);
  if (!result) throw new Error(`Missing extraction result for ${task.company.company_id}`);
  const legalIdentifier = task.company.legal_identifier
    ?? result.facts.find((fact) => fact.field === 'legal_identifier' && Number(fact.extractor_confidence) >= 0.95)?.value_text
    ?? null;
  const emails = unique([...(task.company.emails ?? []), ...factsFor(result, 'email')]);
  const phones = unique([...(task.company.phones ?? []), ...factsFor(result, 'phone')]);
  const socialProfiles = unique([
    ...(task.company.social_profiles ?? []),
    ...factsFor(result, 'linkedin'), ...factsFor(result, 'facebook'), ...factsFor(result, 'other_social'),
  ]);
  const description = result.summary || task.company.description || null;
  const completenessFields = [task.company.website, phones.length, emails.length, description, task.company.address, legalIdentifier, socialProfiles.length];
  return {
    ...task.company,
    legal_identifier: legalIdentifier,
    emails,
    phones,
    social_profiles: socialProfiles,
    description,
    enriched_facts: result.facts,
    website_enrichment: {
      status: result.status,
      collection_status: result.collection_status,
      document_checksum: result.document_checksum,
      model_used: result.model_used,
      flowise_flow_id: result.flowise_flow_id,
      warnings: result.warnings,
    },
    profile_completeness: Number((completenessFields.filter(Boolean).length / completenessFields.length).toFixed(2)),
    needs_rne_retry: !task.company.legal_identifier && Boolean(legalIdentifier),
  };
});
const unprocessedCompanies = tasks.flatMap((task) => task.unprocessed_companies ?? []).map((company) => ({
  ...company,
  website_enrichment: {
    status: 'NOT_ATTEMPTED_LIMIT',
    collection_status: 'NOT_ATTEMPTED',
    document_checksum: null,
    model_used: false,
    flowise_flow_id: null,
    warnings: ['Website enrichment batch limit reached'],
  },
  profile_completeness: company.profile_completeness ?? baselineCompleteness(company),
  needs_rne_retry: false,
}));
const companies = [...enrichedCompanies, ...unprocessedCompanies];

const unavailable = results.filter((result) => ['UNAVAILABLE', 'BLOCKED_UNSAFE_URL'].includes(result.status)).length;
const fallback = results.filter((result) => result.status === 'COMPLETED_FALLBACK').length;
return [{
  json: {
    contract_version: '1.0',
    campaign_id: tasks[0].campaign_id,
    status: unavailable || fallback || unprocessedCompanies.length ? 'PARTIAL' : 'COMPLETED',
    company_count: companies.length,
    source_company_count: tasks[0].source_company_count,
    companies_enriched: results.filter((result) => result.status.startsWith('COMPLETED')).length,
    websites_collected: results.filter((result) => result.collection_status === 'COLLECTED').length,
    skipped_no_website: results.filter((result) => result.status === 'SKIPPED_NO_WEBSITE').length,
    unavailable_or_blocked: unavailable,
    not_attempted_limit: unprocessedCompanies.length,
    flowise_extractions: results.filter((result) => result.model_used).length,
    deterministic_extractions: results.filter((result) => !result.model_used && result.status.startsWith('COMPLETED')).length,
    fallback_count: fallback,
    facts_accepted: acceptedFacts.length,
    legal_identifiers_discovered: companies.filter((company) => company.needs_rne_retry).length,
    companies,
    warnings: [...new Set([...(tasks[0].source_warnings ?? []), ...results.flatMap((result) => result.warnings ?? [])])],
  },
}];
