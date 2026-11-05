import type { Provider, ProviderModel } from '../types'

/**
 * Probed 5 Nov 2026:
 * - Hookipa (Raspberry Pi 5 Model B, 16 GB, Debian 13) — Ollama 0.33.2, 6 models.
 * - Omarchy (omarchyxps, Omarchy 4.0.6) — 2 Ollama models on disk + llama.cpp
 *   serving qwen3-0.6b on 127.0.0.1:8080. The Ollama daemon was stopped.
 */
export const LOCAL_MODELS: ProviderModel[] = [
  {
    id: 'm_local_omarchy_gemma4',
    name: 'gemma4:26b',
    host: 'omarchy',
    note: '26B · 18.6 GB on disk. The heavyweight on the laptop; pick it when quality matters more than latency.',
  },
  {
    id: 'm_local_omarchy_phi4mini',
    name: 'phi4-mini:latest',
    host: 'omarchy',
    note: '3.8B · 2.49 GB. Small and quick for everyday local chat.',
  },
  {
    id: 'm_local_omarchy_qwen06',
    name: 'qwen3-0.6b-q8_0',
    host: 'omarchy',
    note: '0.6B Q8 · 0.64 GB. Served by llama.cpp on 127.0.0.1:8080. OpenCode’s config names Qwen3-8B, so check /v1/models before relying on the alias.',
  },
  {
    id: 'm_local_pi_gemma2_9b',
    name: 'gemma2:latest',
    host: 'pi5',
    note: '9.2B Q4_0 · 5.44 GB. No tool support. Good for summaries and long chat on the Pi.',
  },
  {
    id: 'm_local_pi_gemma2_2b',
    name: 'gemma2:2b',
    host: 'pi5',
    note: '2.6B Q4_0 · 1.63 GB. Chat only — Ollama rejects tool calls for this model.',
  },
  {
    id: 'm_local_pi_phi3',
    name: 'phi3:3.8b',
    host: 'pi5',
    note: '3.8B Q4_0 · 2.18 GB. Compact general chat; test tool support before wiring it into an agent.',
  },
  {
    id: 'm_local_pi_paddleocr',
    name: 'paddleocr-vl-1.6',
    host: 'pi5',
    note: 'PaddleOCR-VL 1.6 · 1.82 GB. Document/OCR vision model, not a general chat replacement.',
  },
  {
    id: 'm_local_pi_llama32',
    name: 'llama3.2:3b',
    host: 'pi5',
    note: '3.2B Q4_K_M · 2.02 GB. Bench: tool calls and the dependent sequence PASS at ~4 t/s on the Pi.',
  },
  {
    id: 'm_local_pi_qwen35',
    name: 'qwen3.5:2b',
    host: 'pi5',
    note: '2.3B Q8_0 · 2.74 GB. The only small tool-capable model in the Pi bench. Keep thinking off for speed.',
  },
]

export function createLocalProvider(now = Date.now()): Provider {
  const today = new Date(now).toISOString()

  return {
    id: 'local-models',
    name: 'Local models',
    accent: '#b7f077',
    kind: 'local',
    status: 'active',
    plan: 'Free · your hardware',
    website: 'http://192.168.43.51:11434',
    verdict: 'works',
    summary:
      'Ollama and llama.cpp across Omarchy and the Pi 5. No token bill — the limits are RAM, disk and speed.',
    note: '',
    order: 3,
    createdAt: today,
    updatedAt: today,
    rules: [
      'Hookipa is a Raspberry Pi 5 Model B Rev 1.1 with 16 GB RAM running Debian 13. Ollama 0.33.2 serves six models at 192.168.43.51:11434.',
      'Omarchy (omarchyxps, Omarchy 4.0.6) has two Ollama models on disk. Its Ollama daemon was stopped at probe time; llama.cpp serves qwen3-0.6b on 127.0.0.1:8080.',
      'The Pi address is a phone-hotspot IP. It changes with the network and only works while the hotspot is up.',
      'Local inference is free, but the Pi shares 16 GB between every loaded model. Unload one before pulling a big one.',
      'Bench 22 Oct 2026: Omarchy generated about 12–16 t/s, the Pi 3.5–4.7 t/s on the same models. Treat the Pi as capacity, not a speed-up.',
      'Tool calls: llama3.2:3b and qwen3.5:2b pass on the Pi; gemma2 does not support tools at all. Test the model before an agent depends on it.',
      'Counts below come from the live Ollama inventories and local manifests on 5 Nov 2026. Change a model’s host when the split changes.',
    ],
    quotas: [],
    models: LOCAL_MODELS,
  }
}

/**
 * The cloud build's starting panel: one local provider for the server it runs
 * on, with no models. The first read of the server fills the model list from
 * what Ollama actually serves. Rotation and the try list start empty, because
 * this build knows nothing about the other machines.
 */
export function createServerProvider(now = Date.now()): Provider {
  const today = new Date(now).toISOString()

  return {
    id: 'local-models',
    name: 'Local models',
    accent: '#b7f077',
    kind: 'local',
    status: 'active',
    plan: 'Free · this server',
    website: 'http://127.0.0.1:11434',
    verdict: 'works',
    summary:
      'Ollama on this server. The model list is what is pulled here, not a wish list.',
    note: '',
    order: 0,
    createdAt: today,
    updatedAt: today,
    rules: [
      'This is the cloud panel: it reads the server it runs on, over 127.0.0.1, and nothing else on a network.',
      'Ollama serves 127.0.0.1:11434 with the models that are actually pulled. Add or pull one and read the server again.',
      'There is no background polling: the panel reads once when it opens and when you press Read this server.',
      'Requests are self-tracked and start at zero. Add a quota here if you want to count your own calls.',
    ],
    quotas: [],
    models: [],
  }
}

/** Add the local entry once when an older saved panel is upgraded. */
export function ensureLocalProvider(providers: Provider[], now = Date.now()): Provider[] {
  if (providers.some((provider) => provider.kind === 'local' || provider.id === 'local-models')) {
    return providers
  }
  return [...providers, createLocalProvider(now)]
}
