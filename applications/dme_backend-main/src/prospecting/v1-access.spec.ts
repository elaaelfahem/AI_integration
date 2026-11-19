import { ProspectingService } from './prospecting.service';
import { NotFoundException } from '@nestjs/common';
import { APP_ROLES } from '../auth/auth.types';
describe('V1 scoped dossier and run reads', () => {
  const setup = () => {
    const prisma = {prospectingRun:{findFirst:jest.fn()},company:{findFirst:jest.fn()}};
    return {prisma,service:new ProspectingService(prisma as never,{} as never,{} as never)};
  };
  it('does not reveal another actor’s run',async()=>{
    const {prisma,service}=setup();prisma.prospectingRun.findFirst.mockResolvedValue(null);
    await expect(service.runStatus('actor','run')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.prospectingRun.findFirst.mock.calls[0][0].where).toEqual({id:'run',requested_by_id:'actor'});
  });
  it('restricts manager dossiers to their assigned scope',async()=>{
    const {prisma,service}=setup();prisma.company.findFirst.mockResolvedValue(null);
    await expect(service.dossier('manager',APP_ROLES.MANAGER,'company')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.company.findFirst.mock.calls[0][0].where.manager_id).toBe('manager');
  });
  it('does not generate reports outside the actor’s scope', async () => {
    const {prisma,service}=setup();prisma.company.findFirst.mockResolvedValue(null);
    await expect(service.report('manager',APP_ROLES.MANAGER,'company')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('returns the saved evidence without recomputing claims',async()=>{
    const {prisma,service}=setup();const dossier={web_research:{status:'PARTIAL'},enriched_facts:[]};
    prisma.company.findFirst.mockResolvedValue({id:'company',name:'Alpha',ai_context:dossier});
    expect(await service.dossier('manager',APP_ROLES.MANAGER,'company')).toEqual({companyId:'company',name:'Alpha',dossier});
  });
});
