import { readFile } from "node:fs/promises";
import { Input, ALL_FORMATS, BufferSource, UrlSource } from "mediabunny";

/**
 * Get the duration of an audio file in seconds.
 *
 * Reads the file off disk into a buffer first because mediabunny's `UrlSource`
 * doesn't support the `file:` URL scheme in Node (Node's undici fetch returns
 * "not implemented... yet" for `file:`). `BufferSource` works in all runtimes.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  const buffer = await readFile(filePath);
  // Use the underlying ArrayBuffer slice that exactly matches this Buffer's view
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(arrayBuffer),
  });
  return input.computeDuration();
}

/**
 * Get the duration of a remote audio URL.
 * Falls through to mediabunny's UrlSource (HTTP/HTTPS only).
 */
export async function getRemoteAudioDuration(url: string): Promise<number> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new UrlSource(url, { getRetryDelay: () => null }),
  });
  return input.computeDuration();
}

/**
 * Convert a local file path on disk to a file:// URL.
 * Kept for backward compat; new code should pass file paths directly to getAudioDuration.
 * Windows-aware: uses forward slashes and correctly prefixes the drive letter.
 */
export function pathToFileUrl(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}
