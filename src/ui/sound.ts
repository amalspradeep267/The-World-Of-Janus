// Small synthesized sound effects (Web Audio), so the game ships no audio files.
// Only significant moments get a sound; ordinary clicks stay silent.

export type Sfx =
  | 'dice'
  | 'paper'
  | 'night'
  | 'envoy'
  | 'offer'
  | 'coin'
  | 'order'
  | 'reveal'
  | 'gavel'
  | 'win'
  | 'lose';

const MUTE_KEY = 'janus:muted';
let ctx: AudioContext | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

/** In practice mode every seat is mounted at once; only the visible seat should make noise. */
let audibleSeat: string | null = null;
export function setAudibleSeat(seat: string | null) {
  audibleSeat = seat;
}

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, slideTo?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

function noise(a: AudioContext, start: number, dur: number, gain = 0.2, filterFreq = 2000) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filterFreq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

export function play(sfx: Sfx, seat?: string | null) {
  if (muted || (audibleSeat !== null && seat != null && seat !== audibleSeat)) return;
  const a = audio();
  if (!a) return;
  switch (sfx) {
    case 'dice': // a few clacks on a table
      [0, 0.09, 0.2, 0.27, 0.36].forEach((t, i) => noise(a, t, 0.05, 0.35 - i * 0.05, 1800 + i * 300));
      break;
    case 'paper': // a page rustle
      noise(a, 0, 0.25, 0.12, 3500);
      noise(a, 0.12, 0.2, 0.08, 5000);
      break;
    case 'night': // a low, soft gong
      tone(a, 110, 0, 1.4, 'sine', 0.2);
      tone(a, 165, 0, 1.1, 'sine', 0.08);
      break;
    case 'envoy': // a knock and a chime
      noise(a, 0, 0.05, 0.4, 400);
      noise(a, 0.14, 0.05, 0.4, 400);
      tone(a, 880, 0.3, 0.5, 'triangle', 0.1);
      break;
    case 'offer':
      tone(a, 660, 0, 0.18, 'triangle', 0.1);
      tone(a, 990, 0.1, 0.25, 'triangle', 0.08);
      break;
    case 'coin':
      tone(a, 1400, 0, 0.12, 'square', 0.04);
      tone(a, 2100, 0.06, 0.3, 'triangle', 0.08);
      break;
    case 'order': // a wax seal stamp
      tone(a, 180, 0, 0.12, 'sine', 0.25, 60);
      noise(a, 0, 0.06, 0.15, 800);
      break;
    case 'reveal': // a mysterious rising arpeggio
      [440, 554, 659, 880].forEach((f, i) => tone(a, f, i * 0.09, 0.6, 'sine', 0.08));
      break;
    case 'gavel':
      noise(a, 0, 0.08, 0.6, 300);
      tone(a, 90, 0, 0.3, 'sine', 0.3, 50);
      noise(a, 0.3, 0.08, 0.6, 300);
      tone(a, 90, 0.3, 0.3, 'sine', 0.3, 50);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.14, 0.5, 'triangle', 0.12));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(a, f, i * 0.25, 0.7, 'sine', 0.12));
      break;
  }
}
