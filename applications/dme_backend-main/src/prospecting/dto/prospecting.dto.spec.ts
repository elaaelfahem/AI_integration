import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StartProspectingDto } from './prospecting.dto';
const errors = (suppliedCompanies: unknown) => validate(plainToInstance(StartProspectingDto, {suppliedCompanies}));
describe('Supplied campaign validation', () => {
  it('preserves a named candidate without a website', async () => {
    expect(await errors([{name:'Example Company'}])).toHaveLength(0);
  });
  it('rejects whitespace identities before starting a campaign', async () => {
    expect((await errors([{name:'   '}])).length).toBeGreaterThan(0);
  });
  it('rejects oversized batches', async () => {
    expect((await errors(Array.from({length:51},(_,i)=>({name:`Company ${i}`})))).length).toBeGreaterThan(0);
  });
  it('rejects credential-bearing and non-HTTP websites', async () => {
    for(const website of ['https://user:secret@example.com','file:///etc/passwd']) {
      expect((await errors([{name:'Company',website}])).length).toBeGreaterThan(0);
    }
  });
});
