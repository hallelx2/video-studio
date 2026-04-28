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
  // Authority "local" gives the URL a proper host — empty-authority forms
  // (`studio-media:///...`) have been observed to fail canonicalization in
  // Chromium's URL parser, killing the request before the handler runs.
  const normalized = absolutePath.replace(/\\/g, "/");
  return `studio-media://local/${encodeURIComponent(normalized)}`;
}
