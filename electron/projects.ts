import { promises as fs } from "node:fs";
import { join, basename } from "node:path";
import type { ProjectInfo } from "./types.js";

/**
 * Scans the user's organisation-projects/ folder and returns one ProjectInfo per
 * subdirectory that looks like a project (has a package.json, README, or .git).
 *
 * Pulls the first non-heading paragraph of README.md as a description.
 */
export async function listProjects(orgRoot: string): Promise<ProjectInfo[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(orgRoot);
  } catch {
    return [];
  }

  const out: ProjectInfo[] = [];

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const path = join(orgRoot, name);
    let stat;
    try {
      stat = await fs.stat(path);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const [readme, launchPost, design, hasMarker] = await Promise.all([
      readIfExists(join(path, "README.md")),
      exists(join(path, "obsidian", "outreach", "posts", "01-launch-day-founder-post.md")).then(async (e) => {
        if (e) return true;
        // Also try common alternate locations for a "launch post"
        return (
          (await exists(join(path, "LAUNCH.md"))) ||
          (await exists(join(path, "docs", "launch.md")))
        );
      }),
      exists(join(path, "DESIGN.md")),
      anyExists([
        join(path, "package.json"),
        join(path, ".git"),
        join(path, "Cargo.toml"),
        join(path, "pyproject.toml"),
        join(path, "go.mod"),
        join(path, "README.md"),
      ]),
    ]);

    if (!hasMarker) continue;

    out.push({
      id: name,
      name: prettyName(name),
      path,
      hasReadme: readme !== null,
      hasLaunchPost: launchPost,
      hasDesignDoc: design,
      description: readme ? extractDescription(readme) : null,
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function anyExists(paths: string[]): Promise<boolean> {
  for (const p of paths) {
    if (await exists(p)) return true;
  }
  return false;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return null;
  }
}

function prettyName(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function extractDescription(readme: string): string | null {
  // Pre-clean: drop HTML comments wholesale.
  const cleaned = readme.replace(/<!--[\s\S]*?-->/g, "");

  // Split into paragraphs (one or more blank lines).
  const paragraphs = cleaned.split(/\r?\n\s*\r?\n/);

  for (const raw of paragraphs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Skip headings, blockquotes, hrs.
    if (/^#{1,6}\s/.test(trimmed)) continue;
    if (trimmed.startsWith(">")) continue;
    if (/^[-_*]{3,}\s*$/.test(trimmed)) continue;

    // Skip pure-HTML blocks (centered badge/logo headers, tables of contents, etc).
    // A paragraph counts as "pure HTML" if stripping all tags leaves no prose.
    const naked = stripMarkup(trimmed);
    if (!naked || naked.length < 20) continue;

    // Skip image-only / badge-only paragraphs (pure markdown imagery, no prose).
    if (/^(!\[|\[!\[)/.test(trimmed)) {
      const afterImagery = trimmed
        .replace(/\[?!\[[^\]]*\]\([^)]+\)\]?(\([^)]+\))?/g, "")
        .trim();
      if (afterImagery.length < 20) continue;
    }

    let text = naked;
    if (text.length > 240) text = text.slice(0, 237) + "...";
    return text;
  }

  return null;
}

/**
 * Strip HTML tags, image markdown, link markdown, and emphasis characters
 * to leave just the prose. Whitespace collapsed to single spaces.
 */
function stripMarkup(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")                    // HTML tags
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")        // ![alt](src)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")      // [text](href) → text
    .replace(/`([^`]+)`/g, "$1")                  // `code`
    .replace(/[*_~]+/g, "")                       // emphasis chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Suppress unused-symbol warning for `basename` while keeping it available
 * for future use (e.g. when adding a project-from-arbitrary-path picker).
 */
void basename;
