import { createHash } from 'node:crypto';
const text = value => typeof value === 'string' ? value.trim() : '';
export function suppliedCompanies(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new Error('supplied_companies must contain 1-5 companies');
  return value.map(company => {
    const name = text(company?.name);
    if (!name || name.length > 200) throw new Error('Each supplied company needs a name of 1-200 characters');
    const location = text(company.location).slice(0,80);
    let website = null;
    if (company.website) {
      let url; try { url = new URL(company.website); } catch { throw new Error('Invalid supplied website'); }
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Supplied website must be an HTTP(S) URL without credentials');
      website = url.toString();
    }
    return {name,website,location};
  });
}
export function planSuppliedCampaign(input) {
  if (!text(input?.campaign_id)) throw new Error('campaign_id required');
  const companies = suppliedCompanies(input.supplied_companies);
  return {
    contract_version:'1.0',campaign_id:input.campaign_id,query_count:1,
    planning_method:'USER_SUPPLIED_IDENTITIES',
    queries:[{campaign_id:input.campaign_id,query_id:`${input.campaign_id}:supplied`,source_id:'user_supplied',source_type:'user_supplied',query:'Research independently supplied companies',sector:input.sectors?.[0] || 'entreprises',location:input.governorates?.[0] || 'Tunisie',language:'fr',priority:1,intent:'Research supplied companies',supplied_companies:companies}],
    stop_conditions:{maximum_candidates:companies.length},warnings:['User-supplied identities are claims, not independently verified company identities'],
  };
}
export function suppliedRecords(query) {
  return suppliedCompanies(query.supplied_companies).map(company => {
    const id=createHash('sha256').update(JSON.stringify(company)).digest('hex').slice(0,24);
    return {sourceUrl:company.website || `urn:user-supplied:${id}`,payload:{name:company.name,website:company.website,city:company.location,identity_status:'USER_SUPPLIED_UNVERIFIED',provenance:'USER_SUPPLIED'}};
  });
}
