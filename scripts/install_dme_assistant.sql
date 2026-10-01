INSERT OR REPLACE INTO chat_flow (id,name,flowData,deployed,isPublic,apikeyid,chatbotConfig,createdDate,updatedDate,apiConfig,analytic,category,speechToText,type,workspaceId,followUpPrompts,textToSpeech)
SELECT 'a9b2f1d4-5e36-47c8-9a10-2f3d4c5b6a70','dme_assistant',CAST(readfile('/tmp/dme_assistant_agent.json') AS TEXT),0,0,apikeyid,chatbotConfig,datetime('now'),datetime('now'),apiConfig,analytic,category,speechToText,type,workspaceId,followUpPrompts,textToSpeech
FROM chat_flow WHERE id='7d3c481a-01ad-49ec-918b-1d7cfcb85a70';
