import { corroboratedEmailFacts, employeeRangeEvidence, officialContacts, type SearchEvidence } from './contact-enrichment';

const result = (url: string, title: string, content: string): SearchEvidence => ({
  source_url: url, retrieved_at: '2026-10-30T12:00:00Z', checksum: 'hash',
  payload: { title, content },
});

describe('contact enrichment evidence', () => {
  it('prefers the company contact page and ignores another domain', () => {
    const pages = [
      { source_url: 'https://www.mytek.tn/', retrieved_at: 'now', checksum: 'home', http_status: 200,
        text: '', evidence_links: [{ type: 'phone', value: '+216 36 010 387' }] },
      { source_url: 'https://www.mytek.tn/contact', retrieved_at: 'now', checksum: 'contact', http_status: 200,
        text: 'Service client', evidence_links: [{ type: 'phone', value: '+216 36 360 000' }] },
      { source_url: 'https://other.tn/contact', retrieved_at: 'now', checksum: 'other', http_status: 200,
        text: 'fake@mytek.tn', evidence_links: [{ type: 'email', value: 'fake@mytek.tn' }] },
    ];
    expect(officialContacts('https://mytek.tn/', pages).map(fact => fact.value)).toEqual(['+216 36 360 000']);
  });

  it('accepts an email only after two independent public sources agree', () => {
    const first = result('https://play.google.com/store/apps/details?id=tn.mytek.shop', 'MyTek', 'Email info@mytek.tn');
    const second = result('https://facebook.com/Mytekcharguia', 'MyTek', 'info@mytek.tn');
    expect(corroboratedEmailFacts('MYTEK', 'https://mytek.tn/', [first])).toEqual([]);
    expect(corroboratedEmailFacts('MYTEK', 'https://mytek.tn/', [first, second])).toHaveLength(2);
  });

  it('ties an employee range to the matching company domain', () => {
    const wrong = result('https://www.linkedin.com/company/mytek-group', 'MYTEK GROUP',
      'Website: https://mytek.net. Company size: 11-50 employees');
    const right = result('https://www.linkedin.com/company/mytek-tn', 'MyTek.tn',
      'Website: https://www.mytek.tn/. Company size: 201-500 employees');
    expect(employeeRangeEvidence('MYTEK', 'https://mytek.tn/', [wrong, right])?.range).toBe('201-500');
  });
});
