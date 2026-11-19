import {fold, publicUrl, sameSite} from './evidence-policy.mjs';

const endpoint = 'https://overpass-api.de/api/interpreter';
const bounds = {
  sousse: '35.72,10.50,35.94,10.75',
  tunis: '36.72,10.05,36.90,10.35',
  ariana: '36.82,10.10,36.98,10.28',
  'ben arous': '36.66,10.12,36.81,10.35',
};
const cache = new Map();
let nextRequestAt = 0;
let unavailableUntil = 0;
let requestDay = '';
let requestsToday = 0;
let queue = Promise.resolve();
const generic = new Set(['orange','apple','delta','services','solutions','company','global','informatique']);
const clean = value => String(value ?? '').trim();

export async function lookupOsmLocation(company, {fetchImpl=fetch, userAgent=process.env.OSM_USER_AGENT, now=()=>new Date().toISOString()}={}) {
  const name = clean(company?.canonical_name);
  const target = fold(company?.governorate || company?.city);
  if (!userAgent || !/https?:\/\/|@/.test(userAgent)) return {status:'NOT_CONFIGURED',leads:[],warnings:['OSM lookup needs an identifying project contact']};
  if (name.length < 5 || generic.has(fold(name)) || !bounds[target] || company.identity_status === 'UNRESOLVED_PLACE_ID')
    return {status:'NOT_APPLICABLE',leads:[],warnings:[]};
  const key = `${fold(name)}|${target}`;
  const saved = cache.get(key);
  if (saved && Date.now()-saved.cachedAt < 30*60*1000) return {...saved.value,from_cache:true};
  if (Date.now()<unavailableUntil) return {status:'UNAVAILABLE',leads:[],warnings:['OSM provider is cooling down after an unavailable response']};
  const day=new Date().toISOString().slice(0,10);
  if (requestDay!==day) {requestDay=day;requestsToday=0;}
  if (requestsToday>=80) return {status:'RATE_LIMITED',leads:[],warnings:['OSM daily request budget reached']};
  const pattern = `^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`;
  const data = `[out:json][timeout:20];nwr["name"~${JSON.stringify(pattern)},i](${bounds[target]});out center meta 10;`;
  const work = async () => {
    const wait = Math.max(0,nextRequestAt-Date.now());
    if (wait) await new Promise(resolve=>setTimeout(resolve,wait));
    nextRequestAt=Date.now()+1200;
    requestsToday++;
    try {
      const response=await fetchImpl(endpoint,{method:'POST',headers:{'User-Agent':userAgent,Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data}).toString(),signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      if (!Array.isArray(payload?.elements) || payload.remark) throw new Error('Invalid or limited Overpass response');
      const retrievedAt=now();
      const leads=payload.elements.filter(element=>fold(element.tags?.name)===fold(name)).slice(0,3).map(element=>{
        const tags=element.tags??{};
        const sourceUrl=`https://www.openstreetmap.org/${element.type}/${element.id}`;
        const reportedAddress=[tags['addr:housenumber'],tags['addr:street'],tags['addr:city']].filter(Boolean).join(', ') || null;
        return {source_name:'openstreetmap',source_url:sourceUrl,source_record_id:`osm:${element.type}:${element.id}`,
          reported_name:tags.name,reported_city:tags['addr:city']||null,reported_address:reportedAddress,
          reported_website:publicUrl(tags.website||tags['contact:website'])?.toString()||null,
          website_matches_company: Boolean(company.website && sameSite(tags.website||tags['contact:website'],company.website)),
          reported_category:tags.office||tags.company||null,published_at:element.timestamp||null,retrieved_at:retrievedAt,
          claim_status:'UNVERIFIED_COMMUNITY_REPORT',accepted_for_facts:false,
          attribution:'© OpenStreetMap contributors',license:'ODbL 1.0'};
      }).filter(lead=>lead.reported_address||lead.reported_city);
      const value={status:leads.length?'UNVERIFIED_LEADS':'NO_MATCH',leads,warnings:[]};
      cache.set(key,{cachedAt:Date.now(),value});if(cache.size>100)cache.delete(cache.keys().next().value);
      return value;
    } catch (error) {
      unavailableUntil=Date.now()+10*60*1000;
      return {status:'UNAVAILABLE',leads:[],warnings:[`OSM lookup unavailable: ${String(error.message||error.name).slice(0,100)}`]};
    }
  };
  const result=queue.then(work,work);queue=result.then(()=>undefined,()=>undefined);return result;
}
