// n8n Code node: Run Once for Each Item.
return {
  json: {
    contract_version: '1.0',
    campaign_id: $json.campaign_id,
    company_id: $json.company_id,
    canonical_name: $json.canonical_name,
    identifier: $json.identifier,
    validation_policy: $json.validation_policy,
  },
};
