export type CollectedPage = {
  source_url: string;
  retrieved_at: string;
  checksum: string;
  http_status: number;
  text: string;
  evidence_links: Array<{ type: string; value: string }>;
};

export type ContactEvidence = {
  field: 'email' | 'phone';
  value: string;
  source_name: 'official_website' | 'public_search_corroborated';
  source_url: string;
  retrieved_at: string;
  checksum: string;
};

export function officialContacts(website: string, pages: CollectedPage[]): ContactEvidence[] {
  let host: string;
  try { host = new URL(website).hostname.toLowerCase().replace(/^www\./, ''); }
  catch { return []; }
  const valid = pages.filter((page) => {
    try {
      const url = new URL(page.source_url);
      return page.http_status === 200 && ['http:', 'https:'].includes(url.protocol)
        && url.hostname.toLowerCase().replace(/^www\./, '') === host;
    } catch { return false; }
  });
  // A contact page gives clearer evidence than a homepage with many branch numbers.
  valid.sort((a, b) => Number(/contact/i.test(new URL(b.source_url).pathname))
    - Number(/contact/i.test(new URL(a.source_url).pathname)));
  const facts: ContactEvidence[] = [];
  const contactPhonePublished = valid.some((page) => /contact/i.test(new URL(page.source_url).pathname)
    && (page.evidence_links ?? []).some((link) => link.type === 'phone'));
  const seen = new Set<string>();
  const add = (field: 'email' | 'phone', raw: string, page: CollectedPage) => {
    const value = raw.trim().replace(/^mailto:|^tel:/i, '').split('?')[0].trim();
    if (field === 'email' && (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)
      || !value.toLowerCase().endsWith(`@${host}`))) return;
    if (field === 'phone' && (!/^\+?[0-9 ()-]{8,25}$/.test(value)
      || value.replace(/\D/g, '').length < 8)) return;
    const key = `${field}:${field === 'email' ? value.toLowerCase() : value.replace(/\D/g, '')}`;
    if (seen.has(key) || facts.filter((fact) => fact.field === field).length >= 3) return;
    seen.add(key);
    facts.push({ field, value: field === 'email' ? value.toLowerCase() : value,
      source_name: 'official_website', source_url: page.source_url,
      retrieved_at: page.retrieved_at, checksum: page.checksum });
  };
  for (const page of valid) {
    for (const link of page.evidence_links ?? []) {
      if (link.type === 'phone' && contactPhonePublished && !/contact/i.test(new URL(page.source_url).pathname)) continue;
      if (link.type === 'email' || link.type === 'phone') add(link.type, link.value, page);
    }
    for (const match of String(page.text ?? '').matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi))
      add('email', match[0], page);
  }
  return facts;
}

export type SearchEvidence = {
  source_url: string;
  retrieved_at: string;
  checksum: string;
  payload: { title?: string; content?: string; url?: string };
};

export function emailCandidates(name: string, website: string, records: SearchEvidence[]) {
  const host = new URL(website).hostname.toLowerCase().replace(/^www\./, '');
  const brand = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const found: Array<{ email: string; evidence: SearchEvidence }> = [];
  for (const record of records) {
    const text = `${record.payload?.title ?? ''} ${record.payload?.content ?? ''}`;
    if (!text.toLowerCase().replace(/[^a-z0-9]/g, '').includes(brand)) continue;
    for (const match of text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
      const email = match[0].toLowerCase();
      if (email.endsWith(`@${host}`)) found.push({ email, evidence: record });
    }
  }
  return found;
}

export function corroboratedEmailFacts(name: string, website: string, records: SearchEvidence[]): ContactEvidence[] {
  const candidates = emailCandidates(name, website, records);
  const facts: ContactEvidence[] = [];
  for (const email of [...new Set(candidates.map(item => item.email))]) {
    const evidence = candidates.filter(item => item.email === email);
    const distinctDomains = new Set(evidence.flatMap(item => {
      try { return [new URL(item.evidence.source_url).hostname.toLowerCase().replace(/^www\./, '')]; }
      catch { return []; }
    }));
    if (distinctDomains.size < 2) continue;
    const usedDomains = new Set<string>();
    for (const item of evidence) {
      const domain = new URL(item.evidence.source_url).hostname.toLowerCase().replace(/^www\./, '');
      if (usedDomains.has(domain)) continue;
      usedDomains.add(domain);
      facts.push({ field: 'email', value: email, source_name: 'public_search_corroborated',
        source_url: item.evidence.source_url, retrieved_at: item.evidence.retrieved_at,
        checksum: item.evidence.checksum });
      if (usedDomains.size === 2) break;
    }
  }
  return facts.slice(0, 6);
}

export function employeeRangeEvidence(name: string, website: string, records: SearchEvidence[]) {
  const host = new URL(website).hostname.toLowerCase().replace(/^www\./, '');
  const brand = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const record of records) {
    let url: URL;
    try { url = new URL(record.source_url); } catch { continue; }
    if (!['linkedin.com', 'fr.linkedin.com', 'tn.linkedin.com'].includes(url.hostname.toLowerCase().replace(/^www\./, ''))
      || !url.pathname.startsWith('/company/')) continue;
    const title = String(record.payload?.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const content = String(record.payload?.content ?? '');
    if (!title.includes(brand) || !content.toLowerCase().includes(host)) continue;
    const match = content.match(/(?:company size|taille de l’entreprise|taille de l'entreprise)\s*[:：]\s*(\d{1,6})\s*[-–]\s*(\d{1,6})\s*(?:employees|employés)/i);
    if (!match) continue;
    const minimum = Number(match[1]);
    const maximum = Number(match[2]);
    if (minimum <= 0 || maximum < minimum || maximum > 1000000) continue;
    return { range: `${minimum}-${maximum}`, source_name: 'linkedin_public_profile',
      source_url: record.source_url, retrieved_at: record.retrieved_at,
      checksum: record.checksum };
  }
  return null;
}
