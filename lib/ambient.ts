/**
 * Ambient sound for a study block, synthesised on the device.
 *
 * Nothing here ships as an asset. A minute of even modestly encoded audio is
 * megabytes, public/sw.js pre-caches the app shell, and the CSP is `media-src
 * 'self'` — so a CDN loop is blocked, a bundled loop taxes every install for a
 * feature most students will never open, and licensed lo-fi is a rights problem
 * on top of both. Noise, by contrast, is a few lines of arithmetic: we generate
 * a short loop into a WAV blob the first time it's asked for and reuse it.
 *
 * Why a WAV blob and an <audio> element rather than an AudioContext graph —
 * which would be the obvious way to make noise — is the whole reason this file
 * exists. iOS suspends an AudioContext the moment the PWA is backgrounded or
 * the screen locks, and a student who starts a 45-minute block and pockets
 * their phone is the *primary* case, not an edge one. Media-element playback is
 * the only path that keeps running there (and the only one that gets
 * lock-screen controls). So the synthesis happens once, up front, and the
 * result is handed to an element that can survive the pocket.
 *
 * Everything below is pure and deterministic given an RNG, so the awkward
 * properties — that the loop doesn't click when it wraps, that the signal never
 * clips — are unit-testable without any audio hardware.
 */

export type AmbienceId = "rain" | "brown" | "waves";

export interface Ambience {
  id: AmbienceId;
  label: string;
  /** One line for the picker — what it actually sounds like. */
  hint: string;
}

export const AMBIENCES: Ambience[] = [
  { id: "rain", label: "Rain", hint: "Steady rainfall" },
  { id: "brown", label: "Deep noise", hint: "Low, even hum" },
  { id: "waves", label: "Waves", hint: "Slow surf" },
];

/**
 * 24 kHz mono. Noise has no melodic detail to protect, so the usual 44.1 kHz
 * buys nothing but bytes — and these bytes live in memory on a phone. It does
 * cost the very top octave, which is why `rain` synthesises its sparkle well
 * below the Nyquist limit rather than relying on raw white noise.
 */
const SAMPLE_RATE = 24_000;
/** Long enough that the ear stops hearing a repeat; ~960KB of PCM at 24 kHz. */
const LOOP_SECONDS = 20;
/** Crossfade length. Long enough to hide the seam, short enough to not smear. */
const FADE_SECONDS = 0.75;

/** Deterministic when handed an RNG; `Math.random` in real use. */
export type Rng = () => number;

/** White noise in [-1, 1). */
const white = (rng: Rng): number => rng() * 2 - 1;

/**
 * One-pole lowpass. `a` is the smoothing coefficient in (0, 1]: smaller is
 * darker. Written as a closure because every voice below is a short chain of
 * these and the alternative is five loose variables in the sample loop.
 */
function lowpass(a: number): (x: number) => number {
  let y = 0;
  return (x) => {
    y += a * (x - y);
    return y;
  };
}

/**
 * The voices.
 *
 * Each returns a function producing one sample per call, at unity-ish
 * amplitude; normalisation happens once at the end over the whole buffer, so
 * these only have to get the *character* right.
 */
const VOICES: Record<AmbienceId, (rng: Rng) => () => number> = {
  /**
   * Brown noise: white, integrated, with a leak so it can't wander off into
   * DC. The leak coefficient is what keeps it a hum rather than a rumble that
   * slowly drifts the waveform to one rail.
   */
  brown: (rng) => {
    let last = 0;
    return () => {
      last = (last + 0.02 * white(rng)) / 1.02;
      return last * 3.5;
    };
  },

  /**
   * Rain: a wide hiss bed plus discrete droplets.
   *
   * Pure lowpassed white sounds like a radio between stations, not weather —
   * what the ear reads as "rain" is the irregular grain on top. So a sparse
   * Poisson-ish trigger fires short decaying blips at a few thousand a second,
   * bandlimited well under Nyquist so 24 kHz sampling doesn't alias them into
   * a metallic ring.
   */
  rain: (rng) => {
    const bed = lowpass(0.18);
    const grainLp = lowpass(0.45);
    /** Mean droplets per sample — ~2,600/s, which reads as steady rainfall. */
    const density = 0.11;
    let drop = 0;
    return () => {
      if (rng() < density) drop = white(rng);
      // Fast exponential decay: each droplet is a click, not a tone.
      drop *= 0.86;
      return bed(white(rng)) * 1.6 + grainLp(drop) * 0.9;
    };
  },

  /**
   * Waves: brown noise under a slow swell.
   *
   * The envelope is a raised cosine over ~9 seconds — deliberately not a
   * divisor of LOOP_SECONDS, so the swell and the loop point drift against
   * each other instead of landing together and announcing the repeat. The
   * crossfade at the seam covers the discontinuity that leaves behind.
   */
  waves: (rng) => {
    let last = 0;
    let phase = 0;
    const step = (2 * Math.PI) / (9.3 * SAMPLE_RATE);
    const surf = lowpass(0.3);
    return () => {
      last = (last + 0.02 * white(rng)) / 1.02;
      phase += step;
      // 0.18 floor: the tide going out shouldn't be silence.
      const swell = 0.18 + 0.82 * Math.pow((1 - Math.cos(phase)) / 2, 1.6);
      return (last * 3.2 + surf(white(rng)) * 0.35) * swell;
    };
  },
};

/**
 * Render one seamless loop.
 *
 * The seam is the only hard part. A buffer of noise played on repeat clicks
 * audibly at the wrap, because the last sample and the first are unrelated
 * values. So we generate `length + fade` samples and crossfade the surplus
 * tail back over the head: the loop's final sample is then followed — on the
 * wrap — by material that genuinely preceded it in the source, and the join is
 * continuous. Weights are equal-*power* (sin/cos, summing to one in energy)
 * rather than linear, because the two sides are uncorrelated noise and linear
 * weights would dip the volume in the middle of the fade.
 */
export function synthesize(
  id: AmbienceId,
  {
    rng = Math.random,
    sampleRate = SAMPLE_RATE,
    seconds = LOOP_SECONDS,
    fadeSeconds = FADE_SECONDS,
  }: {
    rng?: Rng;
    sampleRate?: number;
    seconds?: number;
    fadeSeconds?: number;
  } = {},
): Float32Array {
  const length = Math.floor(sampleRate * seconds);
  const fade = Math.min(Math.floor(sampleRate * fadeSeconds), length >> 1);
  const voice = VOICES[id](rng);

  const raw = new Float32Array(length + fade);
  for (let i = 0; i < raw.length; i++) raw[i] = voice();

  const out = new Float32Array(length);
  out.set(raw.subarray(0, length));
  for (let i = 0; i < fade; i++) {
    const t = ((i + 1) / (fade + 1)) * (Math.PI / 2);
    out[i] = raw[i] * Math.sin(t) + raw[length + i] * Math.cos(t);
  }

  // Normalise last, over the finished buffer. Peak rather than RMS: the point
  // is a guarantee that nothing clips when it's encoded to 16-bit, and the
  // headroom keeps the loudest droplet off the rail.
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const gain = 0.85 / peak;
    for (let i = 0; i < out.length; i++) out[i] *= gain;
  }
  return out;
}

/**
 * 16-bit mono PCM in a WAV container — the plainest thing every browser can
 * decode, and small enough to build by hand rather than pulling an encoder in.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE,
): ArrayBuffer {
  const bytesPerSample = 2;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true); // file size minus the first 8 bytes
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk length
  view.setUint16(20, 1, true); // format 1 = uncompressed PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a stray value past ±1 would wrap to the opposite
    // rail as a loud crack rather than merely distorting.
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, Math.round(s * 32767), true);
  }
  return buffer;
}

/**
 * Rendered loops, kept for the life of the page.
 *
 * Synthesis is ~500k samples and takes tens of milliseconds — cheap once,
 * needless on every Pomodoro cycle. The blob URLs are deliberately never
 * revoked: the alternative is tearing one down mid-session because a component
 * unmounted, and three of these is under 3MB in the worst case where a student
 * auditions all of them.
 */
const cache = new Map<AmbienceId, string>();

/** A `blob:` URL for the loop, generating it on first use. Browser only. */
export function ambienceUrl(id: AmbienceId): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const wav = encodeWav(synthesize(id));
  const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
  cache.set(id, url);
  return url;
}
