// n8n Code node: Run Once for Each Item.
const result = Array.isArray($json) && $json.length === 1 ? $json[0] : $json;
if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid scoring response envelope');
if (!result.campaign_id) throw new Error('Scoring response is missing campaign_id');
if (!Array.isArray(result.companies)) throw new Error('Scoring response is missing companies');
if (result.company_count !== result.companies.length) throw new Error('Scoring company_count mismatch');
for (const company of result.companies) {
  const score = company.scoring;
  if (!score || score.score_version !== 'lead-score-1.0') throw new Error(`Missing scoring contract for ${company.company_id}`);
  if (!Number.isInteger(score.total_score) || score.total_score < 0 || score.total_score > 100) throw new Error(`Invalid score for ${company.company_id}`);
  const sum = Object.values(score.components ?? {}).reduce((total, value) => total + value, 0);
  if (sum !== score.total_score) throw new Error(`Score component mismatch for ${company.company_id}`);
  if (!['A', 'B', 'C', 'REVIEW'].includes(score.category)) throw new Error(`Invalid category for ${company.company_id}`);
  if ((company.ready_for_scoring === false || company.official_validation?.status === 'CONFLICT') && score.category !== 'REVIEW') {
    throw new Error(`Blocked company ${company.company_id} escaped REVIEW`);
  }
}
return { json: result };
