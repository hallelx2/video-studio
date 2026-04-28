/**
 * Convert an absolute filesystem path to a `studio-media://` URL the
 * renderer can hand to <img>, <video>, <audio>, or <iframe>. The Electron
 * main process registers a handler that streams these with proper MIME
 * types and Range support — see electron/main.ts.
 *
 * URL shape: `studio-media:///<urlencoded-path>` so Windows drive letters
 * (`C:`) and spaces survive intact.
 */
export function pathToMediaUrl(absolutePath: string): string {
  // Normalize Windows backslashes so the URL is consistent across platforms.
  const normalized = absolutePath.replace(/\\/g, "/");
  return `studio-media:///${encodeURIComponent(normalized)}`;
}
