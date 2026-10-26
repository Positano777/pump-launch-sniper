import { validateSignal } from './policy.mjs';

const PROVIDERS = Object.freeze({
  grok: { endpoint: 'https://api.x.ai/v1/chat/completions', model: 'grok-4.7', env: 'XAI_API_KEY' },
  muse: { endpoint: 'https://api.meta.ai/v1/chat/completions', model: 'muse-spark-1.3', env: 'MODEL_API_KEY' },
});

export async function analyzeWithModel(provider, rawSignal, { env = process.env, fetcher = fetch } = {}) {
  const config = PROVIDERS[provider];
  if (!config) throw new TypeError('provider must be grok or muse');
  const key = env[config.env];
  if (!key) throw new Error(`${config.env} is required`);
  const signal = validateSignal(rawSignal);
  const publicEvidence = { ...signal };
  const response = await fetcher(config.endpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12_000),
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages: [
      { role: 'system', content: 'Analyze this public Pump launch evidence for research. Explain uncertainties and possible missing information. Never instruct a trade, invent facts, or claim a token is safe. Return concise plain text.' },
      { role: 'user', content: JSON.stringify(publicEvidence) },
    ] }),
  });
  if (!response.ok) throw new Error(`${provider} request failed with HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 50_000) throw new Error(`${provider} response too large`);
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error(`${provider} response was not JSON`); }
  const content = parsed?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error(`${provider} response has no text`);
  return { provider, model: config.model, explanation: content.slice(0, 4000),
    warning: 'Research only. Model output never changes a trading decision.' };
}
