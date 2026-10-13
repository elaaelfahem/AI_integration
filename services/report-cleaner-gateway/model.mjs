// Compact, schema-constrained generation using the configured local Ollama.
export async function generate(system, context, schema) {
  const url = process.env.OLLAMA_URL;
  if (!url) throw new Error('Ollama is not configured');
  const response = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({model: process.env.OLLAMA_MODEL || 'llama3.2', stream: false,
      keep_alive: '10m', format: schema,
      options: {temperature: 0, num_ctx: 4096, num_predict: 300},
      messages: [{role: 'system', content: system}, {role: 'user', content: JSON.stringify(context)}]}),
    signal: AbortSignal.timeout(65000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const result = await response.json();
  if (!result.done || result.done_reason === 'length') throw new Error('Incomplete model response');
  return JSON.parse(result.message?.content);
}
