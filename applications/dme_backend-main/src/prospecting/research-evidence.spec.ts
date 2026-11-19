import { publicMentions, publicLocationLeads, researchView } from './research-evidence';
import { ProspectingService } from './prospecting.service';
import { APP_ROLES } from '../auth/auth.types';
const valid = {source_url:'https://news.example/vermeg',identity_match:true,relevance_policy:'company-mention-v1',relevance_status:'RELEVANT_UNVERIFIED',identity_verified:false,accepted_for_facts:false};
describe('research read boundaries', () => {
  it('hides unrelated, legacy unchecked, and invalid-url snippets', () => {
    expect(publicMentions([valid,{...valid,identity_match:false},{source_url:valid.source_url},{...valid,source_url:'javascript:alert(1)'},null])).toEqual([valid]);
  });
  it('exposes only labelled community location leads, never arbitrary locations', () => {
    const lead={source_name:'openstreetmap',source_url:'https://www.openstreetmap.org/node/42',retrieved_at:'2026-11-17T12:00:00Z',claim_status:'UNVERIFIED_COMMUNITY_REPORT',accepted_for_facts:false,reported_city:'Sousse'};
    expect(publicLocationLeads({location_research:{leads:[lead,{...lead,claim_status:'CONFIRMED'},{...lead,source_url:'https://other.example/node/42'}]}})).toEqual([lead]);
  });
  it('filters saved dossiers without mutating storage', () => {
    const source={web_research:{status:'COMPLETED',evidence:[{identity_match:false}]},public_signals:[{identity_match:false}]};
    const view=researchView(source) as any;
    expect(view.web_research.evidence).toEqual([]);
    expect(view.web_research.evidence_quality).toBe('NO_RELEVANT_EVIDENCE');
    expect(source.web_research.evidence).toHaveLength(1);
  });
  it('reports only gated public mentions', async () => {
    const prisma={company:{findFirst:jest.fn().mockResolvedValue({id:'company',name:'VERMEG',ai_context:{public_signals:[valid,{...valid,identity_match:false}]}})}};
    const service=new ProspectingService(prisma as never,{} as never,{} as never);
    const report=await service.report('actor',APP_ROLES.MANAGER,'company');
    expect(report.publicMentions).toEqual([valid]);
  });
});
