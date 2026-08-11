import { describe, expect, it } from "vitest";
import { AMBIENCES, encodeWav, synthesize, type AmbienceId } from "./ambient";

/**
 * A deterministic stand-in for Math.random, so a synthesis bug fails the same
 * way twice. Mulberry32 — small, and its output is uniform enough that the
 * amplitude assertions below mean something.
 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ids = AMBIENCES.map((a) => a.id);
/** Short and low-rate: the properties under test are rate-independent. */
const opts = (rng = seeded(1)) => ({
  rng,
  sampleRate: 800,
  seconds: 1,
  fadeSeconds: 0.25,
});

describe("synthesize", () => {
  it.each(ids)("%s returns exactly the requested length", (id) => {
    expect(synthesize(id, opts())).toHaveLength(800);
  });

  it.each(ids)("%s never exceeds the normalised peak", (id) => {
    for (const s of synthesize(id, opts())) {
      expect(Math.abs(s)).toBeLessThanOrEqual(0.85 + 1e-6);
    }
  });

  it.each(ids)("%s actually reaches that peak", (id) => {
    // Guards the normaliser: a silent buffer would pass every other check here.
    const peak = synthesize(id, opts()).reduce(
      (m, s) => Math.max(m, Math.abs(s)),
      0,
    );
    expect(peak).toBeCloseTo(0.85, 5);
  });

  it.each(ids)("%s is deterministic for a given seed", (id) => {
    expect(Array.from(synthesize(id, opts(seeded(7))))).toEqual(
      Array.from(synthesize(id, opts(seeded(7)))),
    );
  });

  /**
   * The one that matters. A loop that clicks is the failure this design exists
   * to avoid, and a click is a discontinuity at the wrap — so the step from the
   * last sample back to the first must be no worse than a typical step inside
   * the buffer. Compared against a high percentile rather than the mean because
   * noise is spiky by nature and the mean would be a meaninglessly low bar.
   */
  it.each(ids)("%s joins seamlessly when it wraps", (id) => {
    const out = synthesize(id, opts());
    const steps: number[] = [];
    for (let i = 1; i < out.length; i++) steps.push(Math.abs(out[i] - out[i - 1]));
    steps.sort((a, b) => a - b);
    const p99 = steps[Math.floor(steps.length * 0.99)];
    const seam = Math.abs(out[0] - out[out.length - 1]);
    expect(seam).toBeLessThanOrEqual(p99);
  });

  /**
   * The crossfade is what closes the seam, not luck in the sample values.
   *
   * Averaged over many seeds rather than asserted on one, because an unfaded
   * seam is a single draw from a random walk: any given pair of unrelated
   * samples can land close together by chance, and about one seed in ten does.
   * In aggregate the difference is not close.
   */
  it.each(ids)("%s owes its seam to the crossfade, not to chance", (id) => {
    const seam = (a: Float32Array) => Math.abs(a[0] - a[a.length - 1]);
    const mean = (fadeSeconds: number) => {
      let sum = 0;
      for (let s = 1; s <= 24; s++) {
        sum += seam(synthesize(id, { ...opts(seeded(s)), fadeSeconds }));
      }
      return sum / 24;
    };
    expect(mean(0.25)).toBeLessThan(mean(0) / 2);
  });
});

describe("encodeWav", () => {
  const header = (buf: ArrayBuffer) => new DataView(buf);
  const tag = (buf: ArrayBuffer, at: number, len: number) =>
    String.fromCharCode(...new Uint8Array(buf, at, len));

  it("writes a RIFF/WAVE header of the right size", () => {
    const buf = encodeWav(new Float32Array(10), 24000);
    expect(buf.byteLength).toBe(44 + 20); // header + 10 mono 16-bit samples
    expect(tag(buf, 0, 4)).toBe("RIFF");
    expect(tag(buf, 8, 4)).toBe("WAVE");
    expect(tag(buf, 12, 4)).toBe("fmt ");
    expect(tag(buf, 36, 4)).toBe("data");
    expect(header(buf).getUint32(4, true)).toBe(36 + 20);
    expect(header(buf).getUint32(40, true)).toBe(20);
  });

  it("declares mono 16-bit PCM at the given rate", () => {
    const v = header(encodeWav(new Float32Array(4), 22050));
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // channels
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(28, true)).toBe(22050 * 2); // byte rate
    expect(v.getUint16(32, true)).toBe(2); // block align
    expect(v.getUint16(34, true)).toBe(16); // bit depth
  });

  it("scales full-scale samples to the 16-bit rails", () => {
    const v = header(encodeWav(Float32Array.from([0, 1, -1]), 24000));
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32767);
  });

  /**
   * Clamping is what stops an out-of-range sample wrapping to the opposite
   * rail, which is audible as a crack rather than as distortion.
   */
  it("clamps out-of-range input instead of wrapping it", () => {
    const v = header(encodeWav(Float32Array.from([2, -2]), 24000));
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32767);
  });
});

describe("AMBIENCES", () => {
  it("has a voice for every listed id and no duplicates", () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(() => synthesize(id as AmbienceId, opts())).not.toThrow();
    }
  });
});
