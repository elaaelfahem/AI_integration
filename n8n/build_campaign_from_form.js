const form = $input.first().json;
const list = (value) => [...new Set(String(value ?? '').split(/[,;\n]+/).map(v => v.trim()).filter(Boolean))];
const name = String(form.campaign_name ?? '').trim();
const sectors = list(form.Sectors);
const governorates = list(form.Governorates);
const keywords = list(form.Keywords);
const rawLimit = form['Maximum candidates'];
const maximumCandidates = rawLimit === '' || rawLimit == null ? 200 : Number(rawLimit);
if (!name) throw new Error('Please enter a campaign name.');
if (!sectors.length) throw new Error('Please enter at least one sector.');
if (!governorates.length) throw new Error('Please enter at least one governorate.');
if (!Number.isInteger(maximumCandidates) || maximumCandidates < 1 || maximumCandidates > 200) throw new Error('Maximum candidates must be a whole number from 1 to 200.');
const languagePreferences = ['fr', 'en'];
if (sectors.length * governorates.length * languagePreferences.length > 40) throw new Error('Please use no more than 20 sector and governorate combinations because the campaign generates French and English queries.');
return [{json: {
 campaign_id: 'campaign-form-' + $execution.id,
 campaign_name: name, countries: ['TN'], governorates, cities: [], sectors, keywords,
 excluded_keywords: [], employee_range: {minimum: null, maximum: null}, maximum_candidates: maximumCandidates,
 enabled_sources: [
  {source_id:'google_maps',source_type:'maps',capabilities:['keyword','sector','location','pagination'],supported_languages:['fr','en']},
  {source_id:'b2b_tn',source_type:'directory',capabilities:['sector','location','company_lookup','pagination'],supported_languages:['fr','en']},
  {source_id:'web_search',source_type:'web_search',capabilities:['keyword','sector','location','pagination'],supported_languages:['fr','en','ar']},
  {source_id:'rne_kyc',source_type:'registry',capabilities:['company_lookup'],supported_languages:['fr']}
 ],
 official_validation:{enabled:true,source_id:'rne_kyc',mode:'WHEN_IDENTIFIER_AVAILABLE',failure_policy:'REVIEW',enrich:true},
 language_preferences:languagePreferences, limits:{maximum_queries:40,maximum_queries_per_source:16}
}}];
