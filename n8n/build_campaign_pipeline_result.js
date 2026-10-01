// n8n Code node: Run Once for Each Item.
function unwrap(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

const offerRecommendations = unwrap($json);
const scoring = unwrap($('Call Lead Scoring').item.json);
const rneValidation = unwrap($('Retry RNE After Enrichment').item.json);
const websiteEnrichment = unwrap($('Call Website Enrichment').item.json);
const initialRneValidation = unwrap($('Call RNE Validation').item.json);
const normalization = unwrap($('Call Candidate Normalizer').item.json);
const discovery = unwrap($('Call Discovery Executor').item.json);
const plan = $('Validate Research Plan').item.json;

if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) {
  throw new Error('Discovery Executor returned an invalid response envelope');
}
if (!normalization || typeof normalization !== 'object' || Array.isArray(normalization)) {
  throw new Error('Candidate Normalizer returned an invalid response envelope');
}
if (!rneValidation || typeof rneValidation !== 'object' || Array.isArray(rneValidation)) {
  throw new Error('RNE Validation returned an invalid response envelope');
}
if (!websiteEnrichment || typeof websiteEnrichment !== 'object' || Array.isArray(websiteEnrichment)) {
  throw new Error('Website Enrichment returned an invalid response envelope');
}
if (!scoring || typeof scoring !== 'object' || Array.isArray(scoring)) {
  throw new Error('Lead Scoring returned an invalid response envelope');
}
if (!offerRecommendations || typeof offerRecommendations !== 'object' || Array.isArray(offerRecommendations)) {
  throw new Error('Offer Recommender returned an invalid response envelope');
}
if (discovery.campaign_id !== plan.campaign_id
  || normalization.campaign_id !== plan.campaign_id
  || initialRneValidation.campaign_id !== plan.campaign_id
  || websiteEnrichment.campaign_id !== plan.campaign_id
  || rneValidation.campaign_id !== plan.campaign_id
  || scoring.campaign_id !== plan.campaign_id
  || offerRecommendations.campaign_id !== plan.campaign_id) {
  throw new Error('Campaign ID changed between pipeline stages');
}

let pipelineStatus = rneValidation.status;
if (discovery.status === 'SKIPPED') pipelineStatus = 'SKIPPED';
else if (discovery.status === 'PARTIAL') pipelineStatus = 'PARTIAL';
else if (normalization.status === 'REVIEW_REQUIRED') pipelineStatus = 'REVIEW_REQUIRED';
else if (websiteEnrichment.status === 'PARTIAL') pipelineStatus = 'PARTIAL';
if (scoring.status === 'REVIEW_REQUIRED') pipelineStatus = 'REVIEW_REQUIRED';
if (offerRecommendations.status === 'REVIEW_REQUIRED') pipelineStatus = 'REVIEW_REQUIRED';

return {
  json: {
    contract_version: '1.0',
    campaign_id: plan.campaign_id,
    pipeline_status: pipelineStatus,
    stages: {
      research_planning: 'COMPLETED',
      discovery: discovery.status,
      normalization: normalization.status,
      official_validation_initial: initialRneValidation.status,
      website_enrichment: websiteEnrichment.status,
      official_validation: rneValidation.status,
      lead_scoring: scoring.status,
      offer_recommendation: offerRecommendations.status,
    },
    research_plan: plan,
    discovery,
    normalization,
    initial_official_validation: initialRneValidation,
    website_enrichment: websiteEnrichment,
    official_validation: rneValidation,
    scoring,
    offer_recommendations: offerRecommendations,
  },
};
