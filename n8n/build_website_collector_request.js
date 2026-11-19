// n8n Code node: Run Once for Each Item.
return {
  json: {
    campaign_id: $json.campaign_id,
    company: $json.company,
    company_id: $json.company.company_id,
    canonical_name: $json.company.canonical_name,
    website: $json.website,
  },
};
