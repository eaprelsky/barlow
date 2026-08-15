// ИИ-генерация сэмплов. Архитектура провайдер-агностик: интерфейс один,
// реализации добавляются (следующий кандидат — fal.ai, см. docs/DESIGN.md).
// Ключи живут в localStorage — barlow локальный личный инструмент;
// для публикации ключи должны уйти за прокси (Tauri решит это нативно).

export interface GenerateParams {
  apiKey: string;
  prompt: string;
  seconds: number;
}

export interface SampleProvider {
  id: string;
  title: string;
  generate(params: GenerateParams): Promise<Blob>;
}

const elevenlabs: SampleProvider = {
  id: 'elevenlabs',
  title: 'ElevenLabs (звуковые эффекты)',
  async generate({ apiKey, prompt, seconds }) {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
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

export const PROVIDERS: SampleProvider[] = [elevenlabs];
export const DEFAULT_PROVIDER = elevenlabs.id;
