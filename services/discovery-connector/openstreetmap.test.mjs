import test from 'node:test';
import assert from 'node:assert/strict';
import { searchOpenStreetMap } from './openstreetmap.mjs';

test('maps a business listing to sourced public fields and caches the lookup', async () => {
  const requests = [];
  const mockFetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
  elements: [
    {
      type: 'node',
      id: 42,
      lat: 36.8,
      lon: 10.2,
      tags: {
        name: 'Example IT Company',
        office: 'it',
        website: 'https://example.tn',
        email: 'info@example.tn'
      }
    }
  ]
}));
  };
  const query = { sector: 'informatique', location: 'Tunis test-cache-42' };
  const first = await searchOpenStreetMap(query, 5, mockFetch);
  const second = await searchOpenStreetMap(query, 5, mockFetch);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /overpass/);
  assert.equal(first[0].sourceUrl, 'https://www.openstreetmap.org/node/42');
  assert.equal(first[0].payload.email, 'info@example.tn');
  assert.equal(first[0].payload.city, '', 'Search area is not source evidence of a city');
  assert.equal(first[0].payload.address, '');
  assert.deepEqual(second, first);
});
