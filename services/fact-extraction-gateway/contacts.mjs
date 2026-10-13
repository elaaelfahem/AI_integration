import { parsePhoneNumberFromString, findPhoneNumbersInText } from 'libphonenumber-js/max';

export function phone(value) {
  const raw = String(value ?? '').trim().replace(/^tel:/i, '').replace(/^00/, '+');
  const parsed = parsePhoneNumberFromString(raw, { defaultCountry: 'TN', extract: false });
  return parsed?.isValid() ? parsed.number : null;
}
export function email(value) {
  const raw = String(value ?? '').trim().replace(/^mailto:/i, '').split('?')[0].toLowerCase();
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(raw) && !raw.includes('..') ? raw : null;
}
export function contactsFromPage(page) {
  const found = [];
  const add = (field, raw, method) => {
    const value = field === 'phone' ? phone(raw) : email(raw);
    if (value) found.push({ field, value, raw, validation: { status: 'FORMAT_VALID', method, reachability_verified: false } });
  };
  for (const link of page.evidence_links ?? []) if (['phone', 'email'].includes(link.type)) add(link.type, link.value, 'PUBLISHED_CONTACT_LINK');
  const content = String(page.text ?? '');
  for (const match of content.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) add('email', match[0], 'PUBLISHED_TEXT');
  for (const match of findPhoneNumbersInText(content, 'TN')) {
    const raw = content.slice(match.startsAt, match.endsAt);
    const before = content.slice(Math.max(0, match.startsAt - 35), match.startsAt);
    // Do not reinterpret an unlabelled identifier or part of a foreign number as TN.
    if (!/^(?:\+|00)/.test(raw) && !/(?:t[eé]l(?:[eé]phone)?|phone|fax|mobile|contact)\s*[:.\-]?\s*$/i.test(before)) continue;
    const prefix = content.slice(Math.max(0, match.startsAt - 2), match.startsAt);
    const suffix = content.slice(match.endsAt, match.endsAt + 2);
    if (/\d[ .-]?$/.test(prefix) || /^[ .-]?\d/.test(suffix)) continue;
    add('phone', raw, 'PUBLISHED_TEXT');
  }
  return found.filter((c,i,a) => a.findIndex(x => x.field === c.field && x.value === c.value) === i);
}
