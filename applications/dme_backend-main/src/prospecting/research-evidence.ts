// Older stored search signals lack relevance checks. Hide them on reads; never
// rewrite saved dossiers or infer verification from a completed search.
export function publicMentions(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : []).filter((item): item is Record<string, unknown> => {
    if (!item || typeof item !== 'object' || item.identity_match !== true ||
        item.relevance_policy !== 'company-mention-v1' || item.relevance_status !== 'RELEVANT_UNVERIFIED' ||
        item.identity_verified !== false || item.accepted_for_facts !== false) return false;
    try {
      const url = new URL(item.source_url);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  });
}
export function publicLocationLeads(research: unknown): Record<string, unknown>[] {
  if (!research || typeof research !== 'object' || Array.isArray(research)) return [];
  const location = (research as Record<string, unknown>).location_research;
  if (!location || typeof location !== 'object' || Array.isArray(location)) return [];
  const leads = (location as Record<string, unknown>).leads;
  return (Array.isArray(leads) ? leads : []).filter((lead): lead is Record<string, unknown> => {
    if (!lead || typeof lead !== 'object' || lead.source_name !== 'openstreetmap' ||
        lead.claim_status !== 'UNVERIFIED_COMMUNITY_REPORT' || lead.accepted_for_facts !== false ||
        typeof lead.retrieved_at !== 'string' || !Number.isFinite(Date.parse(lead.retrieved_at))) return false;
    try { const url = new URL(lead.source_url); return url.protocol === 'https:' && url.hostname === 'www.openstreetmap.org' && /^\/(node|way|relation)\/\d+$/.test(url.pathname); }
    catch { return false; }
  });
}
export function researchView(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const data = value as Record<string, unknown>;
  const result = {...data};
  if (Array.isArray(data.public_signals)) result.public_signals = publicMentions(data.public_signals);
  if (data.web_research && typeof data.web_research === 'object' && !Array.isArray(data.web_research)) {
    const research = data.web_research as Record<string, unknown>;
    if (Array.isArray(research.evidence)) {
      const retained = publicMentions(research.evidence);
      result.web_research = {...research, evidence:retained, evidence_quality:retained.length ? 'UNVERIFIED_MENTIONS_ONLY' : 'NO_RELEVANT_EVIDENCE',
        read_excluded_count:research.evidence.length-retained.length, status_semantics:'Query execution only; not identity or fact verification'};
    }
  }
  return result;
}
