const assert=require('node:assert/strict');require('dotenv').config({path:'.env.local',quiet:true});
const {ConfigService}=require('@nestjs/config');const {PrismaService}=require('../dist/src/prisma/prisma.service');const {AiService}=require('../dist/src/ai/ai.service');const {DataSourcesService}=require('../dist/src/data-sources/data-sources.service');
const url=new URL(process.env.DATABASE_URL);if(url.hostname!=='127.0.0.1'||url.pathname!=='/dme_integration')throw Error('Local integration database required');
const config=new ConfigService(process.env);const db=new PrismaService(config);
(async()=>{
 await db.$connect();const admin=await db.superadmin.findUniqueOrThrow({where:{email:process.env.SUPERADMIN_EMAIL}});const source=await db.dataSource.findUniqueOrThrow({where:{name:'B2B.tn'}});
 const service=new DataSourcesService(db,{collectionJobFailed:async()=>{}},new AiService(config));
 const job=await db.collectionJob.create({data:{requested_by_id:admin.id,filters:{sector:'informatique',governorate:'Tunis'},sources:{create:{data_source_id:source.id}}}});
 await service.runJob(job.id);
 const result=await service.getJob(job.id);assert.equal(result.status,'COMPLETED');assert.ok(result.discovered_count>0);assert.ok(result.evidence.length>0);assert.ok(result.evidence.every(e=>!e.company.name.startsWith('Entreprise découverte')));
 console.log(JSON.stringify({status:result.status,discovered:result.discovered_count,evidence:result.evidence.length}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.onModuleDestroy());
