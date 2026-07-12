/**
 * Avatar encoding.
 *
 * The profile lives inside the store document, which is JSON-serialized to
 * localStorage and synced to Postgres — so an avatar has to *be* data, not a
 * pointer to it. An object URL (`blob:…`) dies with the page, and a `File`
 * can't be serialized at all. We downscale the picked image to a small square
 * and inline it as a data URI, which survives a reload and syncs across
 * devices like any other field.
 */

/** Stored avatar is a square this many CSS pixels on a side. */
const SIZE = 256;

/** Reject absurd inputs before we spend memory decoding them. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/**
 * Ceiling on the encoded string. The avatar rides along in every sync PUT and
 * in the localStorage document, so it has to stay small — ~180 KB of base64.
 */
const MAX_ENCODED_CHARS = 240_000;

/** JPEG qualities to try, best first, until the result fits under the ceiling. */
const QUALITY_STEPS = [0.82, 0.7, 0.55, 0.4];

export type AvatarError = "not_an_image" | "too_large" | "decode_failed";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed" satisfies AvatarError));
    };
    img.src = url;
  });
}

/**
 * Turn a picked file into a square data URI, or throw an `AvatarError` message.
 * Center-crops to a square (so faces stay centered) then scales to `SIZE`.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("not_an_image" satisfies AvatarError);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("too_large" satisfies AvatarError);
  }

  const img = await loadImage(file);

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (side === 0) throw new Error("decode_failed" satisfies AvatarError);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("decode_failed" satisfies AvatarError);

  // JPEG has no alpha — fill first so transparent PNGs land on white, not black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);

  for (const q of QUALITY_STEPS) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_ENCODED_CHARS) return url;
  }
  // Even the lowest quality is too big (pathological input) — bail rather than
  // wedge a giant string into every future sync request.
  throw new Error("too_large" satisfies AvatarError);
}

/** Human-readable message for an error thrown by `fileToAvatarDataUrl`. */
export function avatarErrorMessage(err: unknown): string {
  const code = (err as Error)?.message;
  if (code === "not_an_image") return "That file isn't an image.";
  if (code === "too_large") return "That image is too large — try a smaller one.";
  return "Couldn't read that image. Try another.";
}

/**
 * True for avatar values we can actually render after a reload. Legacy
 * profiles (and pre-fix syncs) hold `blob:` URLs that are already dead —
 * treat them as "no avatar" and fall back to initials.
 */
export function isPersistableAvatar(url: string | null | undefined): boolean {
  return typeof url === "string" && url.startsWith("data:image/");
}
