/**
 * The colours you have chosen for projects, one file per agent:
 * `data/project-colors.json` and `data/codex-project-colors.json`.
 *
 * Kept like the hidden projects (hidden-projects.ts), for the same reasons: in
 * `data/` so it follows you across devices and `DASHBOARD_DATA_DIR` moves it
 * with the archive, not in `config/projects.json` because that file is written
 * by hand, and not in the usage report because changing a colour must not cost
 * a parse. One file per agent because the two have separate project id spaces.
 *
 * Ids and `#RRGGBB` values only - nothing a stranger could read a project out
 * of that its directory name would not already say.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { dataDir } from './data-dir';
import { isValidProjectId } from './hidden-projects';
import { isHexColor } from './project-colors';
import type { ProviderId } from './providers';

const FILES: Record<ProviderId, string> = {
  claude: 'project-colors.json',
  codex: 'codex-project-colors.json',
};

const VERSION = 1;

/** A bound on the file, since every save rewrites all of it. */
export const MAX_PROJECT_COLORS = 2000;

export function projectColorsPath(provider: ProviderId): string {
  return path.join(dataDir(), FILES[provider] ?? FILES.claude);
}

function sanitize(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  for (const [id, color] of Object.entries(value).slice(0, MAX_PROJECT_COLORS)) {
    // `constructor` and friends are not ids anyone has; skipping them keeps a
    // hand-edited file from reaching Object.prototype on assignment.
    if (id === '__proto__' || id === 'constructor' || id === 'prototype') continue;
    if (isValidProjectId(id) && isHexColor(color)) out[id] = color.toUpperCase();
  }
  return out;
}

/**
 * One agent's chosen colours. Fails soft to none - missing, unreadable,
 * corrupt - since the worst case is the logo's colour or a fallback.
 */
export function loadProjectColors(provider: ProviderId): Record<string, string> {
  const file = projectColorsPath(provider);
  if (!existsSync(file)) return {};
  try {
    return sanitize((JSON.parse(readFileSync(file, 'utf8')) as { colors?: unknown })?.colors);
  } catch {
    return {};
  }
}

/**
 * Set (`#RRGGBB`) or clear (`null`) one project's colour, and return every
 * colour as it now stands. Synchronous and written through a temporary file,
 * like `setProjectHidden`, so two quick saves cannot interleave and a crash
 * leaves the old file. Throws on bad input or a failed write.
 */
export function saveProjectColor(
  provider: ProviderId,
  id: string,
  color: string | null,
): Record<string, string> {
  if (!isValidProjectId(id)) throw new Error('Not a project id.');
  if (color !== null && !isHexColor(color)) throw new Error('A colour is #RRGGBB.');
  if (id === '__proto__' || id === 'constructor' || id === 'prototype') {
    throw new Error('Not a project id.');
  }

  const current = loadProjectColors(provider);
  if (color === null) delete current[id];
  else current[id] = color.toUpperCase();
  if (Object.keys(current).length > MAX_PROJECT_COLORS) {
    throw new Error(`No more than ${MAX_PROJECT_COLORS} projects can have a colour.`);
  }

  const file = projectColorsPath(provider);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(
    temp,
    `${JSON.stringify({ version: VERSION, colors: current }, null, 2)}\n`,
    'utf8',
  );
  renameSync(temp, file);
  return current;
}
