const expected = $('Prepare Query Tasks').item.json;
const response = $json;
let value = response.json ?? response;
if (typeof value === 'string') value = JSON.parse(value.replace(/^```json\s*|```$/g, '').trim());
const requiredStrings = ['campaign_id', 'query_id', 'source_id', 'source_type', 'language', 'query', 'sector', 'location', 'intent'];
for (const field of requiredStrings) if (typeof value[field] !== 'string' || value[field].trim() === '') throw new Error(`Invalid composed query: ${field} must be a non-empty string`);
for (const field of ['campaign_id', 'query_id', 'source_id', 'source_type', 'language', 'sector', 'location']) if (value[field] !== expected[field]) throw new Error(`Invalid composed query: ${field} changed by the model`);
if (!Number.isInteger(value.priority) || value.priority < 1 || value.priority > 5) throw new Error('Invalid composed query: priority must be an integer from 1 to 5');

const frenchSector = { software: 'logiciels', 'IT services': 'services informatiques' };
const arabicSector = { software: 'البرمجيات', 'IT services': 'خدمات تكنولوجيا المعلومات' };
const sectorLabel = value.language === 'fr'
  ? (frenchSector[expected.sector] ?? expected.sector)
  : value.language === 'ar'
    ? (arabicSector[expected.sector] ?? expected.sector)
    : expected.sector;
const generatedText = `${value.query} ${value.intent}`;
const hasWebOperator = /(^|\s)(site:|inurl:|intitle:)/i.test(value.query);
const obviousEnglishInFrench = value.language === 'fr' && /\b(company|companies|company discovery|find companies|software company|software|IT services)\b/i.test(generatedText);
const hasArabicCharacters = /[\u0600-\u06FF]/.test(generatedText);
const wrongLanguage = (value.language === 'fr' && obviousEnglishInFrench) || (value.language === 'ar' && !hasArabicCharacters);
const unsuitableForSource = value.source_type !== 'web_search' && hasWebOperator;

if (wrongLanguage || unsuitableForSource) {
  if (value.language === 'fr') {
    value.query = value.source_type === 'web_search' ? `entreprises de ${sectorLabel} à ${value.location} Tunisie` : `sociétés de ${sectorLabel} à ${value.location}`;
    value.intent = `Découvrir des sociétés de ${sectorLabel} à ${value.location}`;
  } else if (value.language === 'ar') {
    value.query = `شركات ${sectorLabel} في ${value.location} تونس`;
    value.intent = `اكتشاف شركات ${sectorLabel} في ${value.location}`;
  } else {
    value.query = value.source_type === 'web_search' ? `${sectorLabel} companies in ${value.location}, Tunisia` : `${sectorLabel} companies in ${value.location}`;
    value.intent = `Discover ${sectorLabel} companies in ${value.location}`;
  }
  value._composer_fallback = true;
  value._composer_warning = `Deterministic fallback used for ${value.query_id}`;
}
return { json: value };
