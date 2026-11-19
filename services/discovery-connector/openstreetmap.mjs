const endpoint = 'https://overpass-api.de/api/interpreter';
const cache = new Map();
const ttlMs = 30 * 60 * 1000;
let queue = Promise.resolve();
let nextRequestAt = 0;

function searchSector(query) {
  const text = String(query.sector || query.query || '').toLowerCase();

  if (/informatique|software|logiciel|technolog|digital|numérique|\bit\b/.test(text)) {
    return 'it';
  }

  throw new Error('Unsupported OSM sector. Currently supported: IT');
}

function searchArea(location) {
  const text = String(location || '').toLowerCase();

  if (/tunis|ariana|manouba|ben arous/.test(text)) {
    return '36.75,10.05,36.95,10.37';
  }

  throw new Error('Unsupported OSM area. Currently supported: Greater Tunis');
}

function buildQuery(sector, area) {
  if (sector !== 'it') throw new Error('Unsupported sector');

  return `[out:json][timeout:25];
(
  nwr["office"="it"](${area});
  nwr["company"~"^(it|software|software_development)$"](${area});
);
out center 100;`;
}

function businessRecord(place) {
  const tags = place.tags || {};
  const name = String(tags.name || tags['name:fr'] || tags['name:ar'] || '').trim();

  if (!name || !place.type || !place.id) return null;

  const validCompany =
    tags.office === 'it' ||
    /^(it|software|software_development)$/.test(tags.company || '');

  if (!validCompany) return null;

  if (['school', 'college', 'university'].includes(tags.amenity)) {
    return null;
  }

  if (tags.shop) return null;

  const latitude = Number(place.lat ?? place.center?.lat);
  const longitude = Number(place.lon ?? place.center?.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const city = tags['addr:city'] || '';
  const address = [
    tags['addr:housenumber'],
    tags['addr:street'],
    city
  ].filter(Boolean).join(', ');

  return {
    sourceUrl: `https://www.openstreetmap.org/${place.type}/${place.id}`,
    payload: {
      name,
      category: tags.office
        ? `office: ${tags.office}`
        : `company: ${tags.company}`,
      description: tags.description || '',
      address,
      city,
      governorate: tags['addr:state'] || '',
      website: tags.website || tags['contact:website'] || '',
      phone: tags.phone || tags['contact:phone'] || '',
      email: tags.email || tags['contact:email'] || '',
      opening_hours: tags.opening_hours || '',
      social_profiles: Object.fromEntries(
        Object.entries(tags).filter(([key]) =>
          /^(contact:)?(facebook|instagram|linkedin|twitter)$/.test(key)
        )
      ),
      latitude,
      longitude,
      osm_id: place.id,
      osm_type: place.type,
      osm_tags: tags
    }
  };
}

async function fetchOverpass(data, fetchImpl) {
  const run = async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    nextRequestAt = Date.now() + 1100;

    const agent = process.env.OSM_USER_AGENT?.trim();

    if (fetchImpl === fetch && !agent) {
      throw new Error('Set OSM_USER_AGENT with a real project contact before using Overpass');
    }

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'User-Agent': agent || 'ProfessionalB2B-Test/0.1',
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ data }).toString(),
      signal: AbortSignal.timeout(40000)
    });

    if (!response.ok) {
      throw new Error(`Overpass returned HTTP ${response.status}`);
    }

    const body = await response.json();

    if (!body || !Array.isArray(body.elements)) {
      throw new Error('Invalid Overpass response');
    }

    if (body.remark) {
      throw new Error(`Overpass warning: ${body.remark}`);
    }

    return body.elements;
  };

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

export async function searchOpenStreetMap(query, limit, fetchImpl = fetch) {
  const sector = searchSector(query);
  const area = searchArea(query.location);
  const data = buildQuery(sector, area);
  const maxResults = Number.isFinite(Number(limit))
    ? Math.max(1, Math.min(50, Math.floor(Number(limit))))
    : 20;

  const key = data;
  const cached = cache.get(key);

  let elements;

  if (cached && cached.expiresAt > Date.now()) {
    elements = cached.elements;
  } else {
    elements = await fetchOverpass(data, fetchImpl);
    cache.set(key, { elements, expiresAt: Date.now() + ttlMs });
    if (cache.size > 200) cache.delete(cache.keys().next().value);
  }

  const seen = new Set();
  const candidates = [];

  for (const element of elements) {
    const record = businessRecord(element);
    if (!record) continue;

    const name = record.payload.name.toLowerCase().trim();
    const website = record.payload.website.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '');

    const identity = website || name;

    if (seen.has(identity)) continue;
    seen.add(identity);

    candidates.push(record);
    if (candidates.length >= maxResults) break;
  }

  return candidates;
}
