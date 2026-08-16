// Скрэтч-процессор barlow: игла читает буфер сэмпла по позиции 0..1,
// позиция — a-rate AudioParam (автоматизируется «жестом»).
// Игла инерционна (one-pole сглаживание ~4 мс): резкие скачки цели
// превращаются в плавный ход пластинки — без этого чтение «булькает»
// алиасингом на рывках. off > 0.5 завершает узел по расписанию.

const SMOOTH_TAU = 0.004; // инерция иглы, с

class ScratchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'position', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'a-rate' },
      { name: 'off', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.buffer = null;
    this.pos = 0; // сглаженная позиция иглы
    this.coef = 1 - Math.exp(-1 / (SMOOTH_TAU * sampleRate));
    this.port.onmessage = (e) => {
      if (e.data.type === 'buffer') this.buffer = e.data.samples;
      else if (e.data.type === 'reset') this.pos = e.data.pos ?? 0;
    };
  }

  process(_inputs, outputs, params) {
    if (params.off[0] > 0.5) return false;
    const out = outputs[0][0];
    if (!this.buffer) {
      out.fill(0);
      return true;
    }
    const buf = this.buffer;
    const len = buf.length;
    const pos = params.position;
    const single = pos.length === 1;
    const k = this.coef;
    let p = this.pos;
    for (let i = 0; i < out.length; i++) {
      const target = single ? pos[0] : pos[i];
      p += (target - p) * k;
      const x = Math.min(0.99999, Math.max(0, p)) * (len - 2);
      const i0 = Math.floor(x);
      const frac = x - i0;
      out[i] = buf[i0] * (1 - frac) + buf[i0 + 1] * frac;
    }
    this.pos = p;
    return true;
  }
}

registerProcessor('barlow-scratch', ScratchProcessor);
