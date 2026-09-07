// ИИ-генерация и морфинг сэмплов. Архитектура провайдер-агностик:
// интерфейс один, реализации добавляются. Ключи живут в localStorage —
// barlow локальный личный инструмент; для публикации ключи должны уйти
// за прокси (Tauri решит это нативно).

import { abortableDelay } from './jobs';
export interface GenerateParams {
  signal?: AbortSignal;
  apiKey: string;
  prompt: string;
  seconds: number;
}

export interface TransformParams {
  signal?: AbortSignal;
  apiKey: string;
  prompt: string;
  audio: Blob;
  // Сила преобразования 0..1: 0 — лёгкая приправа, 1 — полная переделка.
  strength: number;
  // Длительность исходного куска, с — морфинг держится в её рамках.
  duration?: number;
}

export interface SampleProvider {
  id: string;
  title: string;
  /** Где взять ключ — панель настроек ИИ. */
  keyHint?: string;
  /** Умеет ли audio-to-audio: преобразование существующего сэмпла
   *  по описанию. У ElevenLabs в API только текст→звук. */
  supportsTransform: boolean;
  generate(params: GenerateParams): Promise<Blob>;
  /** ИИ-преобразование сэмпла по промпту. undefined у провайдеров
   *  без a2a — UI честно говорит, что нужен другой. */
  transform?(params: TransformParams): Promise<Blob>;
}

/** fetch с внятной ошибкой сети: «Failed to fetch» ничего не говорит —
 *  чаще всего это гео-блок провайдера (ElevenLabs не отдаёт CORS из
 *  запрещённых регионов) или упавший прокси. */
async function netFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(180000)]) });
  } catch (error) {
    if (init.signal?.aborted || error instanceof DOMException && ['AbortError','TimeoutError'].includes(error.name)) throw error;
    const host = new URL(url).host;
    throw new Error(
      `нет соединения с ${host} — сеть, прокси или гео-блок (ElevenLabs недоступен в этом регионе). ` +
        'Смени провайдера в настройках ИИ (шестерёнка в шапке)',
    );
  }
}

const elevenlabs: SampleProvider = {
  id: 'elevenlabs',
  title: 'ElevenLabs (звуковые эффекты)',
  keyHint: 'Взять: elevenlabs.io → Profile → API Keys',
  supportsTransform: false,
  async generate({ apiKey, prompt, seconds, signal }) {
    const res = await netFetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      signal,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: seconds,
        prompt_influence: 0.3, // держимся ближе к описанию, а не фантазируем
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ElevenLabs ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.blob();
  },
};

// ---- fal.ai: очередь + поллинг статуса. Stable Audio 3 (small, SFX) —
// дистиллированная модель: инференс пара секунд даже на слабом железе.
// Морфинг (audio-to-audio) задаётся промптом и init_noise_level — долей
// «переделки»; генерация — соседний endpoint той же семьи. Свой звук
// передаём data URI: сэмплы короткие, отдельная загрузка в storage
// не нужна. Ответ — публичная ссылка fal.media (CORS открыт).
const FAL_A2A = 'fal-ai/stable-audio-3/small/sfx/audio-to-audio';
const FAL_T2S = 'fal-ai/stable-audio-3/small/sfx/text-to-sfx';

/** Прогнать запрос через очередь fal: submit → поллинг статуса →
 *  результат. Сеть бывает моргает — статус перечитываем, не сдаёмся. */
async function falRun(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
  timeoutMs = 180_000,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
  const auth = { Authorization: `Key ${apiKey}` };
  const sub = await netFetch(`https://queue.fal.run/${model}`, {
    signal,
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!sub.ok) {
    const text = await sub.text().catch(() => '');
    throw new Error(`fal.ai ${sub.status}: ${text.slice(0, 200)}`);
  }
  const queued = (await sub.json()) as { status_url?: string; response_url?: string };
  if (!queued.status_url || !queued.response_url) {
    throw new Error('fal.ai: очередь не вернула адреса результата');
  }
  for (const url of [queued.status_url, queued.response_url]) {
    if (new URL(url).origin !== 'https://queue.fal.run') throw new Error('fal.ai: неожиданный адрес очереди');
  }
  const deadline = Date.now() + timeoutMs;
  for (let i = 0; ; i++) {
    if (Date.now() > deadline) throw new Error('fal.ai: не дождались результата (таймаут)');
    await abortableDelay(i === 0 ? 400 : 800, signal);
    let j: { status?: string } | null = null;
    try {
      const st = await fetch(queued.status_url, { headers: auth, signal });
      if (st.ok) j = (await st.json()) as { status?: string };
    } catch {
      signal.throwIfAborted();
      continue; // моргнула сеть — попробуем ещё
    }
    if (j?.status === 'COMPLETED') {
      const res = await netFetch(queued.response_url, { headers: auth, signal });
      if (!res.ok) throw new Error(`fal.ai ${res.status}: результат не отдаётся`);
      return (await res.json()) as Record<string, unknown>;
    }
    if (j?.status === 'FAILED' || j?.status === 'ERROR') {
      throw new Error('fal.ai: модель не справилась с запросом');
    }
  }
}

/** Blob → data URI (FileReader: и бинарный WAV, и mp3 из библиотеки). */
function toDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('не удалось прочитать сэмпл для отправки'));
    fr.readAsDataURL(blob);
  });
}

/** Достать аудио из ответа fal и скачать блобом. */
async function falAudioOf(out: Record<string, unknown>, signal?: AbortSignal): Promise<Blob> {
  const url = (out.audio as { url?: string } | undefined)?.url;
  if (!url) throw new Error('fal.ai: в ответе нет аудио');
  const res = await netFetch(url, { signal });
  if (!res.ok) throw new Error(`fal.ai ${res.status}: аудио не скачивается`);
  return res.blob();
}

const fal: SampleProvider = {
  id: 'fal',
  title: 'fal.ai (генерация и морфинг)',
  keyHint: 'Взять: fal.ai → Keys. Формат «id:secret» целиком',
  supportsTransform: true,
  async generate({ apiKey, prompt, seconds, signal }) {
    const out = await falRun(apiKey, FAL_T2S, {
      prompt,
      duration: seconds,
      output_format: 'wav',
      enable_prompt_expansion: false,
    }, 180000, signal);
    return falAudioOf(out, signal);
  },
  async transform({ apiKey, prompt, audio, strength, duration, signal }) {
    signal?.throwIfAborted();
    // Сила → init_noise_level модели: 0.1 держится исходник, 1.0 —
    // полная переделка (сколько шума подмешивается в источник).
    const input: Record<string, unknown> = {
      prompt,
      audio_url: await toDataUri(audio),
      init_noise_level: Math.min(1, 0.1 + strength * 0.85),
      output_format: 'wav',
      enable_prompt_expansion: false,
    };
    if (duration && duration > 0.2 && duration <= 47) input.duration = duration;
    signal?.throwIfAborted();
    const out = await falRun(apiKey, FAL_A2A, input, 180000, signal);
    return falAudioOf(out, signal);
  },
};

// fal — первый и дефолтный: умеет и генерацию, и морфинг, и доступен без
// гео-ограничений (ElevenLabs из ряда регионов не отдаёт CORS — «Failed
// to fetch»; выбрать его можно вручную в настройках ИИ).
export const PROVIDERS: SampleProvider[] = [fal, elevenlabs];
export const DEFAULT_PROVIDER = fal.id;
