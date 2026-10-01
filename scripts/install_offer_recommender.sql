INSERT OR REPLACE INTO chat_flow (
  id,name,flowData,deployed,isPublic,apikeyid,chatbotConfig,createdDate,updatedDate,
  apiConfig,analytic,category,speechToText,type,workspaceId,followUpPrompts,textToSpeech
)
SELECT
  '8e4a912b-7708-46b7-bc27-5b0bd5ea8271','offer_recommender',
  CAST(readfile('/tmp/offer_recommender_agent.json') AS TEXT),0,0,apikeyid,chatbotConfig,
  datetime('now'),datetime('now'),apiConfig,analytic,category,speechToText,type,workspaceId,
  followUpPrompts,textToSpeech
FROM chat_flow
WHERE id='7d3c481a-01ad-49ec-918b-1d7cfcb85a70';
