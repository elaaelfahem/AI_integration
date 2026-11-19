// n8n Code node: Run Once for Each Item.
const task = $('Prepare Website Enrichment Tasks').item.json;
return {
  json: {
    campaign_id: task.campaign_id,
    company: $json.company ?? task.company,
    collection: $json,
    enable_semantic_extraction: task.enable_semantic_extraction,
  },
};
