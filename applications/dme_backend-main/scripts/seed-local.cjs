const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: '.env.local', quiet: true });
const url = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/dme_integration') throw Error('This script only supports the isolated dme_integration database');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
(async () => {
 const email = process.env.SUPERADMIN_EMAIL;
 const existing = await prisma.superadmin.findUnique({where:{email}});
 if (!existing) await prisma.account.create({data:{account_type:'SUPERADMIN',superadmin:{create:{email,password_hash:await bcrypt.hash(process.env.SUPERADMIN_PASSWORD,10),first_name:'Local',last_name:'Admin',status:'ACTIVE'}}}});
 const managerEmail = 'manager@dme.local';
 if (!await prisma.user.findUnique({where:{email:managerEmail}})) await prisma.account.create({data:{account_type:'USER',user:{create:{email:managerEmail,password_hash:await bcrypt.hash(process.env.SUPERADMIN_PASSWORD,10),first_name:'Local',last_name:'Manager',role:'MANAGER',status:'ACTIVE',password_reset_required:false,mfa_enabled:false}}}});
 const admin = await prisma.superadmin.findUnique({where:{email}});
 for (const [name, ref, type] of [['B2B.tn','b2b_tn','BUSINESS_DIRECTORY'],['Recherche web DME','web_search','OTHER'],['Google Maps & Places API','google_maps','MAPS']]) {
  await prisma.dataSource.upsert({where:{name},create:{name,type,collection_method:'API',configuration_reference:ref,enabled:true,created_by_id:admin.id},update:{}});
 }
 console.log('Local administrator and three supported AI sources are ready. Credentials are in .env.local.');
})().finally(()=>prisma.$disconnect());
