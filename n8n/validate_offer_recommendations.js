// n8n Code node: Run Once for Each Item.
const result = $json;
const allowed = new Set(['mobile','broad_band','data','wifi','voip','mssp','bulk_sms','office_365']);
if (!result.campaign_id || !Array.isArray(result.companies) || result.company_count !== result.companies.length) throw new Error('Invalid offer recommendation envelope');
for (const company of result.companies) {
  const output = company.offer_recommendation;
  if (!output || !['RECOMMENDED','NOT_ELIGIBLE','REVIEW_REQUIRED'].includes(output.status)) throw new Error(`Invalid offer status for ${company.company_id}`);
  if (company.scoring?.ready_for_offer_recommendation !== true && output.recommendations.length) throw new Error(`Ineligible company ${company.company_id} received offers`);
  for (const offer of output.recommendations) {
    if (!allowed.has(offer.offer_id)) throw new Error(`Unknown offer ${offer.offer_id}`);
    if (!Number.isInteger(offer.relevance_score) || offer.relevance_score < 0 || offer.relevance_score > 100) throw new Error(`Invalid relevance for ${offer.offer_id}`);
    if (offer.commercial_details !== null || offer.needs_commercial_confirmation !== true) throw new Error(`Unverified commercial claim for ${offer.offer_id}`);
  }
}
return {json:result};
