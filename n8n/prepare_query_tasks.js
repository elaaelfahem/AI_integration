// n8n Code node: Run Once for All Items
const campaign = $input.first().json;
const unique = (values) => {
  const seen = new Set();
  return (values ?? []).filter((value) => {
    if (typeof value !== 'string' || value.trim() === '') return false;
    const key = value.trim().toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const locations = unique([...(campaign.governorates ?? []), ...(campaign.cities ?? [])]);
const sectors = unique(campaign.sectors);
const preferredLanguages = unique(campaign.language_preferences ?? ['fr']);
const maximumQueries = campaign.limits?.maximum_queries ?? 40;
const maximumPerSource = campaign.limits?.maximum_queries_per_source ?? maximumQueries;

if (!Number.isInteger(maximumQueries) || maximumQueries < 1) {
  throw new Error('limits.maximum_queries must be a whole number of at least 1');
}
if (!Number.isInteger(maximumPerSource) || maximumPerSource < 1) {
  throw new Error('limits.maximum_queries_per_source must be a whole number of at least 1');
}

const sources = (campaign.enabled_sources ?? []).filter((source) => {
  if (source.source_type === 'registry') return false;
  return ['keyword', 'sector', 'location'].some((capability) =>
    (source.capabilities ?? []).includes(capability),
  );
});

if (!campaign.campaign_id || sectors.length === 0 || locations.length === 0 || sources.length === 0) {
  throw new Error('Campaign requires campaign_id, sectors, locations, and at least one discovery source');
}
if (preferredLanguages.length === 0) {
  throw new Error('Campaign requires at least one language preference');
}

const sourceCounts = Object.fromEntries(sources.map((source) => [source.source_id, 0]));
const tasks = [];
let sourceCursor = 0;

const combinations = [];
for (const sector of sectors) {
  for (const location of locations) {
    for (const language of preferredLanguages) combinations.push({ sector, location, language, used: new Set() });
  }
}

// The first pass gives every combination one source, rotating through them.
// Later passes spend any remaining query budget on the sources a combination
// has not used yet, so a small campaign still reaches each enabled source.
for (let pass = 0; pass < sources.length && tasks.length < maximumQueries; pass += 1) {
  for (const combination of combinations) {
    if (tasks.length >= maximumQueries) break;
    const { sector, location, language, used } = combination;
    let selected;
    for (let offset = 0; offset < sources.length; offset += 1) {
      const candidate = sources[(sourceCursor + offset) % sources.length];
      const supportsLanguage = (candidate.supported_languages ?? []).includes(language);
      if (supportsLanguage && !used.has(candidate.source_id) && sourceCounts[candidate.source_id] < maximumPerSource) {
        selected = candidate;
        sourceCursor = (sourceCursor + offset + 1) % sources.length;
        break;
      }
    }
    if (!selected) {
      if (pass > 0) continue;
      throw new Error(`No enabled discovery source can create a ${language} query within the configured per-source limit`);
    }
    used.add(selected.source_id);
    sourceCounts[selected.source_id] += 1;
    tasks.push({
      campaign_id: campaign.campaign_id,
      query_id: `q-${String(tasks.length + 1).padStart(3, '0')}`,
      source_id: selected.source_id,
      source_type: selected.source_type,
      language,
      sector,
      location,
      keywords: campaign.keywords ?? [],
      priority: 1,
      query_limit: maximumQueries,
      maximum_candidates: campaign.maximum_candidates,
      search_page: campaign.search_page ?? 1,
    });
  }
}

if (tasks.length === 0) {
  throw new Error('Campaign did not produce any discovery query tasks');
}

return tasks.map((json) => ({ json }));
