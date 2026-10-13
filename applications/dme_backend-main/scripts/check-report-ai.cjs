const assert=require('node:assert/strict');const {PrismaClient}=require('@prisma/client');const {PrismaPg}=require('@prisma/adapter-pg');const bcrypt=require('bcrypt');
require('dotenv').config({path:'.env.local',quiet:true});
const url=new URL(process.env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.pathname!=='/dme_integration')throw Error('Local integration database required');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
async function post(path,body,token){const r=await fetch('http://127.0.0.1:3001'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(100000)});return{status:r.status,body:await r.json()};}
(async()=>{
 const manager=await db.user.findUniqueOrThrow({where:{email:'manager@dme.local'}});
 let agent=await db.user.findUnique({where:{email:'agent@dme.local'}});
 if(!agent){const account=await db.account.create({data:{account_type:'USER',user:{create:{email:'agent@dme.local',password_hash:await bcrypt.hash(process.env.SUPERADMIN_PASSWORD,10),first_name:'Local',last_name:'Agent',role:'AGENT',status:'ACTIVE',manager_id:manager.id}}},include:{user:true}});agent=account.user;}
 const company=await db.company.findFirstOrThrow({where:{manager_id:manager.id}});
 let meeting=await db.prospectingMeeting.findFirst({where:{agent_id:agent.id,title:'Local AI integration test'}});
 if(!meeting)meeting=await db.prospectingMeeting.create({data:{company_id:company.id,manager_id:manager.id,agent_id:agent.id,title:'Local AI integration test',scheduled_at:new Date(Date.now()+86400000),duration_minutes:60}});
 const auth=await post('/login',{email:agent.email,password:process.env.SUPERADMIN_PASSWORD});assert.ok(auth.body.accessToken);const token=auth.body.accessToken;
 let result=await post('/prospecting/runs',{sector:'IT'},token);assert.equal(result.status,403);console.log('Agent discovery permission: PASS');
 result=await post(`/ai/companies/${company.id}/assistant`,{question:'Prepare the visit'},token);assert.equal(result.status,404);console.log('Unassigned company access: PASS');
 const raw='Premier contact. Le client cherche une solution Office 365 pour son équipe. Envoyer une proposition mardi.';
 result=await post(`/ai/meetings/${meeting.id}/clean-report`,{text:raw},token);assert.equal(result.status,201,JSON.stringify(result.body));assert.equal(result.body.original_report,raw);assert.ok(result.body.executive_summary);assert.equal(await db.visitReport.count({where:{meeting_id:meeting.id}}),0);console.log('Report preview, original text preserved, no automatic save: PASS; model_used='+result.body.model_used);
 const managerAuth=await post('/login',{email:manager.email,password:process.env.SUPERADMIN_PASSWORD});result=await post(`/ai/meetings/${meeting.id}/clean-report`,{text:raw},managerAuth.body.accessToken);assert.equal(result.status,404);console.log('Report ownership: PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
