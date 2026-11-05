import type { Provider } from '../types'
import { startOfDayInTz, LOCAL_TZ } from '../lib/quota'
import { createLocalProvider } from './local'

/**
 * Seed data is drawn from each provider's public terms (checked Nov 2026).
 * Usage starts at zero: log your own consumption on the dashboard.
 * Rules are editable in the provider detail view because these terms move fast.
 */
export function createSeedProviders(now = Date.now()): Provider[] {
  const today = new Date(now).toISOString()
  const localMidnight = startOfDayInTz(new Date(now), LOCAL_TZ).toISOString()
  const utcMidnight = startOfDayInTz(new Date(now), 'UTC').toISOString()
  const minuteStart = new Date(Math.floor(now / 60_000) * 60_000).toISOString()

  return [
    {
      id: 'freebuff',
      name: 'Freebuff',
      accent: '#ff8a4c',
      status: 'active',
      plan: 'Free · ad-supported',
      website: 'https://freebuff.com',
      verdict: 'works',
      summary: 'Ad-supported coding agent. You spend daily session hours, not tokens.',
      note: '',
      sourceUrl: 'https://freebuff.com/plans',
      order: 0,
      createdAt: today,
      updatedAt: today,
      rules: [
        'Free plan is ad-supported: no card and no API key. Text ads pay for model access.',
        'Usage is metered in session hours, not tokens. Each model has an hour multiplier in the /model picker.',
        'Free plan shows 30 hours refilled daily. Limited-mode regions get 5 h/day; a VPN or proxy drops that to 4 h/day.',
        'The daily allowance resets at midnight in your local timezone. Hours earned in the wallet are spent after the daily allowance.',
        'Full access depends on your country. Outside the supported countries, or on a VPN, Freebuff runs in limited mode with a smaller model set.',
        'Some models (e.g. Gemini 4 Argon, GPT-6.1 Sol) are one session per day or paid-plan only.',
      ],
      quotas: [
        {
          id: 'q_freebuff_hours',
          label: 'Session hours / day',
          unit: 'hours',
          limit: 30,
          used: 0,
          window: 'day',
          anchor: localMidnight,
        },
      ],
      models: [
        {
          id: 'm_freebuff_deepseek',
          name: 'DeepSeek V4.1 Flash 10/17',
          note: 'Fast coding and tool use. Around 10 h/day if it is the only free model you pick.',
        },
        {
          id: 'm_freebuff_mimo',
          name: 'MiMo v2.6 Flash Fast',
          note: 'Default all-rounder with image support. Around 15 h/day on the free plan.',
        },
        {
          id: 'm_freebuff_glm',
          name: 'GLM 5.3 Flash',
          note: 'The deepest reasoning in the free set. Check the hour multiplier before a long session.',
        },
        {
          id: 'm_freebuff_solar',
          name: 'Solar Pro 4',
          note: 'Available in limited mode too; shares the daily session allowance.',
        },
      ],
    },
    {
      id: 'nous',
      name: 'Nous Research',
      accent: '#a78bfa',
      status: 'active',
      plan: 'Free',
      website: 'https://portal.nousresearch.com',
      verdict: 'works',
      summary: 'One OpenAI-compatible key for 200+ models, with a rotating free pool.',
      note: '',
      sourceUrl: 'https://portal.nousresearch.com/api-docs',
      order: 1,
      createdAt: today,
      updatedAt: today,
      rules: [
        'Free plan covers free-tagged models only, with $0 monthly credits and standard rate limits.',
        'Free-tier API limits: 50 requests/min and 500K tokens/min. Paid tiers scale up to 1,600 RPM / 16M TPM on Ultra.',
        'Paid plans sell credits at a 10% bonus: Plus is $20 for $22 of credits, with rollover capped at $10.',
        '200+ models are listed on the Portal. The API is OpenAI-compatible at inference-api.nousresearch.com/v1.',
        'The free pool rotates — filter by FREE on the models page before relying on a model.',
      ],
      quotas: [
        {
          id: 'q_nous_rpm',
          label: 'Free-tier rate limit',
          unit: 'requests',
          limit: 50,
          used: 0,
          window: 'minute',
          anchor: minuteStart,
        },
      ],
      models: [
        {
          id: 'm_nous_hermes43',
          name: 'Hermes 4.3 36B',
          note: 'Nous’ own open model with 128k context. Confirm it is tagged FREE before a long run.',
        },
        {
          id: 'm_nous_hermes4_70b',
          name: 'Hermes 4 70B',
          note: 'The bigger Hermes build for harder prompts. Availability depends on the free pool.',
        },
        {
          id: 'm_nous_longcat',
          name: 'LongCat 2.0',
          note: 'Listed FREE on the Portal and popular on daily usage. Cheap for experiments.',
        },
        {
          id: 'm_nous_solar',
          name: 'Solar Pro 4',
          note: 'FREE on the Portal model list at the time of writing.',
        },
      ],
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      accent: '#7dd3fc',
      status: 'active',
      plan: 'Free tier',
      website: 'https://openrouter.ai',
      verdict: 'mixed',
      summary: 'One key, 600+ models. Free :free variants share a daily request cap.',
      note: '',
      sourceUrl: 'https://openrouter.ai/docs/api-reference/limits',
      order: 2,
      createdAt: today,
      updatedAt: today,
      rules: [
        'Free models are the :free variants — $0 per request, and the cap is shared across all of them.',
        'Free-tier limits: 20 requests/min. Daily cap is 50 requests until you have bought $10 of credits once; then it becomes 1,000/day.',
        'Failed requests still count toward the free daily cap.',
        'Paid models have no platform request limit; upstream providers can still throttle. Top-ups carry a 5.5% fee.',
        'Free model IDs and availability rotate. Check the model list on the day you use it.',
        'A negative credit balance blocks free models too, until you add credits.',
      ],
      quotas: [
        {
          id: 'q_openrouter_daily',
          label: 'Free-model requests / day',
          unit: 'requests',
          limit: 50,
          used: 0,
          window: 'day',
          anchor: utcMidnight,
        },
      ],
      models: [
        {
          id: 'm_openrouter_deepseek',
          name: 'DeepSeek V4.1 Flash (:free)',
          note: 'Solid free coding option. Watch the shared daily request cap.',
        },
        {
          id: 'm_openrouter_gptoss',
          name: 'GPT-OSS 120B (:free)',
          note: 'Free variant when routed. Availability and provider fallback rotate.',
        },
        {
          id: 'm_openrouter_qwen',
          name: 'Qwen 3.8 27B (:free)',
          note: 'Good general-purpose backup; failed calls still burn the daily cap.',
        },
      ],
    },
    {
      id: 'cerebras',
      name: 'Cerebras',
      accent: '#fb923c',
      status: 'watchlist',
      plan: 'Free trial',
      website: 'https://cloud.cerebras.ai',
      verdict: 'untried',
      summary: 'Fastest tokens/sec around — but now a $5 trial credit, not a standing free tier.',
      note: '',
      sourceUrl: 'https://inference-docs.cerebras.ai/support/rate-limits',
      order: 0,
      createdAt: today,
      updatedAt: today,
      rules: [
        'There is no permanently free tier since July 2026. New accounts get a one-time $5 trial credit after adding a verified payment method.',
        'The $5 credit expires 30 days after it is granted.',
        'Trial caps per model: 5 requests/min, 30K uncached tokens/min, 1M tokens/hour and 1M tokens/day.',
        'Buying credits moves you to the Developer tier; hourly and daily token caps disappear.',
        'The trial is limited to a couple of models (gpt-oss-120b and Qwen 3.8 27B at the time of writing).',
      ],
      quotas: [
        {
          id: 'q_cerebras_trial',
          label: 'Trial credit',
          unit: 'usd',
          limit: 5,
          used: 0,
          window: 'none',
          anchor: today,
        },
      ],
      models: [
        {
          id: 'm_cerebras_gptoss',
          name: 'GPT-OSS 120B',
          note: 'Fast trial model. 1M tokens/day while the $5 trial lasts.',
        },
        {
          id: 'm_cerebras_qwen',
          name: 'Qwen 3.8 27B',
          note: 'Second trial model; same per-model limits.',
        },
      ],
    },
    {
      id: 'google-ai-studio',
      name: 'Google AI Studio',
      accent: '#4d9df6',
      status: 'watchlist',
      plan: 'Free tier',
      website: 'https://aistudio.google.com',
      verdict: 'untried',
      summary: 'Gemini Flash and Flash-Lite are free within unpublished per-model limits.',
      note: '',
      sourceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
      order: 1,
      createdAt: today,
      updatedAt: today,
      rules: [
        'The free tier covers most Flash / Flash-Lite models. Pro and Gemini 4 Argon need billing.',
        'No fixed public free-tier numbers: limits vary per model and live in AI Studio.',
        'Requests-per-day quotas reset at midnight Pacific time.',
        'Free-tier prompts may be used to improve Google products; paid tier is excluded.',
        'Rate limits apply per project, not per API key.',
      ],
      quotas: [],
      models: [
        {
          id: 'm_google_flash38',
          name: 'Gemini 3.8 Flash',
          note: 'Free-tier flagship Flash. Add your own per-model limits from AI Studio.',
        },
        {
          id: 'm_google_flashlite',
          name: 'Gemini 3.5 Flash-Lite',
          note: 'Cheapest/free tier option for bulk or low-stakes prompts.',
        },
        {
          id: 'm_google_flash25',
          name: 'Gemini 2.5 Flash',
          note: 'Older Flash with a free tier; also has 500 free grounded searches/day.',
        },
      ],
    },
    {
      id: 'groq',
      name: 'Groq',
      accent: '#f55036',
      status: 'watchlist',
      plan: 'Free plan',
      website: 'https://console.groq.com',
      verdict: 'untried',
      summary: 'Very fast open-model inference with a documented free-plan rate table.',
      note: '',
      sourceUrl: 'https://console.groq.com/docs/rate-limits',
      order: 2,
      createdAt: today,
      updatedAt: today,
      rules: [
        'Free plan, no card. Limits are per organization and shared by every key.',
        'Coding models (gpt-oss-120b / 20b, Qwen 3.8 27B): 30 RPM, 1,000 RPD, 8K TPM, 200K TPD each.',
        'Requests-per-day resets at midnight UTC; RPM is a rolling window.',
        'Cached tokens do not count toward limits. Over-limit calls return 429 with Retry-After.',
        'The console limits page is authoritative; the public table is a summary.',
      ],
      quotas: [
        {
          id: 'q_groq_daily',
          label: 'Free requests / day',
          unit: 'requests',
          limit: 1000,
          used: 0,
          window: 'day',
          anchor: utcMidnight,
        },
      ],
      models: [
        {
          id: 'm_groq_gptoss120',
          name: 'GPT-OSS 120B',
          note: '30 RPM / 1,000 RPD / 200K tokens per day on the free plan.',
        },
        {
          id: 'm_groq_gptoss20',
          name: 'GPT-OSS 20B',
          note: 'Smaller and faster; same published free-plan caps.',
        },
        {
          id: 'm_groq_qwen',
          name: 'Qwen 3.8 27B',
          note: 'Open model with the same per-model free allowance.',
        },
      ],
    },
    {
      id: 'cloudflare-workers-ai',
      name: 'Cloudflare Workers AI',
      accent: '#f6821f',
      status: 'watchlist',
      plan: 'Workers Free',
      website: 'https://developers.cloudflare.com/workers-ai',
      verdict: 'untried',
      summary: '10,000 free neurons a day across the Workers AI catalog.',
      note: '',
      sourceUrl: 'https://developers.cloudflare.com/workers-ai/platform/pricing',
      order: 3,
      createdAt: today,
      updatedAt: today,
      rules: [
        '10,000 Neurons/day free on both Workers Free and Paid; resets at 00:00 UTC.',
        'On Workers Free, requests fail once the day’s Neurons are used. There is no overage.',
        'A Neuron is compute, not a token — each model converts token usage at its own rate.',
        'Some frontier models need Workers Paid or prepaid AI Gateway credits even when Neurons remain.',
        'Default text-generation throughput is 300 requests/min per account.',
      ],
      quotas: [
        {
          id: 'q_cloudflare_neurons',
          label: 'Free neurons / day',
          unit: 'neurons',
          limit: 10000,
          used: 0,
          window: 'day',
          anchor: utcMidnight,
        },
      ],
      models: [
        {
          id: 'm_cloudflare_qwen',
          name: 'Qwen 3.8 27B',
          note: 'Open model in the Workers AI catalog; shares the daily neuron pool.',
        },
        {
          id: 'm_cloudflare_gemma',
          name: 'Gemma 4 26B A4B',
          note: 'Mid-size open model, 256K context, same 10K neurons/day pool.',
        },
      ],
    },
    createLocalProvider(now),
  ]
}
