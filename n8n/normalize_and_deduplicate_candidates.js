// n8n Code node: Run Once for All Items.
// Deterministically normalizes source payloads and merges only high-confidence matches.
const discovery = $input.first().json;

if (!discovery || typeof discovery !== 'object' || Array.isArray(discovery)) {
  throw new Error('Discovery result must be one JSON object');
}
if (typeof discovery.campaign_id !== 'string' || !discovery.campaign_id) {
  throw new Error('Discovery result requires campaign_id');
}
if (!Array.isArray(discovery.raw_candidates)) {
  throw new Error('Discovery result requires raw_candidates');
}

const qualificationById = new Map((discovery.web_qualifications ?? []).map(item => [item.source_record_id, item]));
const text = (value) => value === null || value === undefined ? '' : String(value).trim();
const firstText = (...values) => values.map(text).find(Boolean) ?? '';
const unique = (values) => [...new Set(values.filter(Boolean))];

function normalized(value) {
  return text(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\b(sarl|sa|sas|sasu|suarl|llc|ltd|limited|inc|company|compagnie|societe)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableId(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `cmp_${hash.toString(16).padStart(8, '0')}`;
}

function website(value) {
  const raw = text(value);
  if (!raw) return '';
  const prepared = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const match = prepared.match(/^(https?):\/\/([^\/?#]+)([^?#]*)/i);
  if (!match) return '';
  const protocol = match[1].toLocaleLowerCase();
  const host = match[2].toLocaleLowerCase().replace(/^www\./, '').replace(/:\d+$/, '');
  if (!host || !host.includes('.')) return '';
  const path = match[3] === '/' ? '' : match[3].replace(/\/$/, '');
  return `${protocol}://${host}${path}`;
}

function domain(value) {
  const normalizedWebsite = website(value);
  const match = normalizedWebsite.match(/^https?:\/\/([^/]+)/i);
  return match ? match[1] : '';
}

function phone(value) {
  let raw = text(value);
  if (!raw) return '';
  raw = raw.replace(/(?:ext\.?|poste)\s*\d+$/i, '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(2);
  else if (digits.length === 8) digits = `216${digits}`;
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

function email(value) {
  const candidate = text(value).toLocaleLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : '';
}

function valuesFrom(payload, names) {
  return names.flatMap((name) => {
    const value = payload[name];
    if (Array.isArray(value)) return value;
    return value === undefined || value === null ? [] : [value];
  });
}

function inferGovernorate(payload, address) {
  const direct = firstText(payload.governorate, payload.gouvernorat, payload.state, payload.city, payload.ville);
  if (direct) return direct;
  const haystack = normalized(address);
  const known = ['Tunis', 'Ariana', 'Ben Arous', 'Manouba', 'Nabeul', 'Sousse', 'Sfax', 'Bizerte', 'Monastir'];
  return known.find((item) => haystack.includes(normalized(item))) ?? '';
}

function candidateFromEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || !envelope.payload) {
    throw new Error('Every raw candidate requires a source envelope and payload');
  }
  const payload = envelope.payload;
  const displayName = typeof payload.displayName === 'object' ? payload.displayName?.text : payload.displayName;
  const qualification = envelope.source_name === 'web_search' ? qualificationById.get(envelope.source_record_id) : null;
  const name = firstText(qualification?.company_name, payload.company_name, payload.name, payload.title, displayName, payload.raison_sociale, payload.legal_name);
  if (!name) throw new Error(`Candidate ${envelope.source_record_id ?? 'unknown'} has no company name`);

  const websiteValues = (qualification ? [qualification.website] : valuesFrom(payload, ['website', 'websiteUri', 'site_web', 'url_site'])).map(website).filter(Boolean);
  const phoneValues = valuesFrom(payload, ['phone', 'phones', 'telephone', 'mobile', 'nationalPhoneNumber', 'internationalPhoneNumber']).map(phone).filter(Boolean);
  const emailValues = valuesFrom(payload, ['email', 'emails', 'mail']).map(email).filter(Boolean);
  const address = firstText(payload.formattedAddress, payload.address, payload.adresse, payload.location_name);
  const latitude = Number(payload.latitude ?? payload.lat ?? payload.location?.latitude);
  const longitude = Number(payload.longitude ?? payload.lng ?? payload.lon ?? payload.location?.longitude);
  const legalIdentifier = normalized(firstText(
    payload.rne_id, payload.registry_number, payload.registre_commerce,
    payload.matricule_fiscale, payload.tax_id, payload.legal_identifier,
  )).replace(/\s/g, '');
  const placeId = firstText(payload.place_id, payload.placeId, envelope.source_name === 'google_maps' ? payload.id : '');
  const sourceIdentity = `${envelope.source_name}|${firstText(payload.company_url, payload.profile_url, envelope.source_url)}`;

  return {
    source_record_id: text(envelope.source_record_id),
    qualification,
    name,
    normalized_name: normalized(name),
    websites: unique(websiteValues),
    domains: unique(websiteValues.map(domain)),
    phones: unique(phoneValues),
    emails: unique(emailValues),
    address,
    normalized_address: normalized(address),
    city: firstText(payload.city, payload.ville),
    governorate: inferGovernorate(payload, address),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    legal_identifier: legalIdentifier,
    place_id: placeId,
    source_identity: normalized(sourceIdentity),
    evidence: {
      source_record_id: text(envelope.source_record_id),
      query_id: text(envelope.query_id),
      source_name: text(envelope.source_name),
      source_type: text(envelope.source_type),
      source_url: text(envelope.source_url),
      retrieved_at: text(envelope.retrieved_at),
      checksum: text(envelope.checksum),
      payload,
    },
  };
}

function shares(left, right) {
  return left.some((item) => right.includes(item));
}

function jaccard(left, right) {
  const a = new Set(normalized(left).split(' ').filter(Boolean));
  const b = new Set(normalized(right).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

function distanceMeters(left, right) {
  if ([left.latitude, left.longitude, right.latitude, right.longitude].some((value) => value === null)) return Infinity;
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function match(left, right) {
  if (left.legal_identifier && left.legal_identifier === right.legal_identifier) return { score: 1, reason: 'legal_identifier' };
  if (left.place_id && left.place_id === right.place_id) return { score: 0.99, reason: 'place_id' };
  if (left.source_identity && left.source_identity === right.source_identity) return { score: 0.98, reason: 'source_identity' };
  if (shares(left.domains, right.domains)) return { score: 0.96, reason: 'website_domain' };
  if (shares(left.phones, right.phones)) return { score: 0.94, reason: 'phone' };

  const sameName = left.normalized_name && left.normalized_name === right.normalized_name;
  const sameAddress = left.normalized_address && left.normalized_address === right.normalized_address;
  const sameGovernorate = normalized(left.governorate) && normalized(left.governorate) === normalized(right.governorate);
  if (sameName && sameAddress) return { score: 0.93, reason: 'name_and_address' };
  if (sameName && distanceMeters(left, right) <= 250) return { score: 0.92, reason: 'name_and_coordinates' };
  if (sameName && sameGovernorate) return { score: 0.82, reason: 'name_and_governorate' };

  const nameSimilarity = jaccard(left.normalized_name, right.normalized_name);
  const addressSimilarity = jaccard(left.normalized_address, right.normalized_address);
  if (nameSimilarity >= 0.8 && addressSimilarity >= 0.75) return { score: 0.87, reason: 'similar_name_and_address' };
  if (sameName) return { score: 0.74, reason: 'same_name_only' };
  if (nameSimilarity >= 0.75 && sameGovernorate) return { score: 0.68, reason: 'similar_name_and_governorate' };
  return { score: 0, reason: '' };
}

const excludedCandidates = [];
const eligibleEnvelopes = discovery.raw_candidates.filter(envelope => {
  if (envelope.source_name !== 'web_search') return true;
  const qualification = qualificationById.get(envelope.source_record_id);
  if (qualification?.status === 'QUALIFIED' && qualification.website && qualification.evidence) return true;
  excludedCandidates.push({ source_record_id: envelope.source_record_id,
    status: qualification?.status === 'REJECTED' ? 'REJECTED' : 'REVIEW_REQUIRED',
    reason: qualification?.reason || 'QUALIFICATION_NOT_RUN',
    source_url: envelope.source_url, payload: envelope.payload,
    qualification: qualification ?? null });
  return false;
});
const candidates = eligibleEnvelopes.map(candidateFromEnvelope);
const parent = candidates.map((_, index) => index);
const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
const join = (left, right) => {
  const a = find(left);
  const b = find(right);
  if (a !== b) parent[b] = a;
};
const reviewedPairs = [];
const acceptedMatches = [];

for (let left = 0; left < candidates.length; left += 1) {
  for (let right = left + 1; right < candidates.length; right += 1) {
    const result = match(candidates[left], candidates[right]);
    if (result.score >= 0.85) {
      join(left, right);
      acceptedMatches.push({ left, right, ...result });
    } else if (result.score >= 0.65) {
      reviewedPairs.push({ left, right, ...result });
    }
  }
}

const groups = new Map();
candidates.forEach((candidate, index) => {
  const root = find(index);
  if (!groups.has(root)) groups.set(root, []);
  groups.get(root).push({ candidate, index });
});

const groupEntries = [...groups.values()].map((members) => {
  const sorted = [...members].sort((a, b) => {
    const completeness = (item) => item.candidate.websites.length + item.candidate.phones.length + item.candidate.emails.length + Boolean(item.candidate.address);
    return completeness(b) - completeness(a) || a.candidate.name.localeCompare(b.candidate.name);
  });
  const primary = sorted[0].candidate;
  const legalIdentifiers = unique(members.map(({ candidate }) => candidate.legal_identifier)).sort();
  const domains = unique(members.flatMap(({ candidate }) => candidate.domains)).sort();
  const phones = unique(members.flatMap(({ candidate }) => candidate.phones)).sort();
  const placeIds = unique(members.map(({ candidate }) => candidate.place_id)).sort();
  const sourceIdentities = unique(members.map(({ candidate }) => candidate.source_identity)).sort();
  const fallbackIdentity = primary.normalized_address
    ? `${primary.normalized_name}|${primary.normalized_address}|${normalized(primary.governorate)}`
    : `${primary.normalized_name}|${normalized(primary.governorate)}|${sourceIdentities[0]}`;
  const identity = firstText(legalIdentifiers[0], domains[0], phones[0], placeIds[0], fallbackIdentity);
  const memberIndexes = members.map(({ index }) => index);
  const scores = acceptedMatches
    .filter((item) => memberIndexes.includes(item.left) && memberIndexes.includes(item.right))
    .map((item) => item.score);
  return {
    memberIndexes,
    company: {
      company_id: stableId(identity),
      canonical_name: primary.name,
      web_qualifications: members.map(({ candidate }) => candidate.qualification).filter(Boolean),
      normalized_name: primary.normalized_name,
      legal_identifier: primary.legal_identifier || null,
      website: primary.websites[0] ?? null,
      websites: unique(members.flatMap(({ candidate }) => candidate.websites)),
      domains: unique(members.flatMap(({ candidate }) => candidate.domains)),
      phones: unique(members.flatMap(({ candidate }) => candidate.phones)),
      emails: unique(members.flatMap(({ candidate }) => candidate.emails)),
      address: primary.address || null,
      city: primary.city || null,
      governorate: primary.governorate || null,
      coordinates: primary.latitude === null ? null : { latitude: primary.latitude, longitude: primary.longitude },
      source_ids: unique(members.map(({ candidate }) => candidate.evidence.source_name)),
      source_records: members.map(({ candidate }) => candidate.evidence),
      source_record_count: members.length,
      deduplication_confidence: scores.length ? Number(Math.min(...scores).toFixed(2)) : 1,
      review_required: false,
      possible_duplicates: [],
    },
  };
});

for (const pair of reviewedPairs) {
  const leftGroup = groupEntries.find((group) => group.memberIndexes.includes(pair.left));
  const rightGroup = groupEntries.find((group) => group.memberIndexes.includes(pair.right));
  if (!leftGroup || !rightGroup || leftGroup === rightGroup) continue;
  leftGroup.company.review_required = true;
  rightGroup.company.review_required = true;
  leftGroup.company.possible_duplicates.push({ company_id: rightGroup.company.company_id, confidence: pair.score, reason: pair.reason });
  rightGroup.company.possible_duplicates.push({ company_id: leftGroup.company.company_id, confidence: pair.score, reason: pair.reason });
}

const companies = groupEntries.map(({ company }) => ({
  ...company,
  possible_duplicates: company.possible_duplicates
    .filter((item, index, all) => all.findIndex((other) => other.company_id === item.company_id) === index)
    .sort((left, right) => right.confidence - left.confidence),
})).sort((left, right) => left.canonical_name.localeCompare(right.canonical_name));

const reviewRequiredCount = companies.filter((company) => company.review_required).length;
return [{
  json: {
    contract_version: '1.0',
    campaign_id: discovery.campaign_id,
    status: reviewRequiredCount || excludedCandidates.some(item => item.status === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'COMPLETED',
    raw_candidate_count: discovery.raw_candidates.length,
    qualified_candidate_count: candidates.length,
    excluded_candidate_count: excludedCandidates.length,
    excluded_candidates: excludedCandidates,
    unique_company_count: companies.length,
    duplicates_merged: candidates.length - companies.length,
    review_required_count: reviewRequiredCount,
    companies,
    warnings: [...(Array.isArray(discovery.warnings) ? discovery.warnings : [])],
  },
}];
