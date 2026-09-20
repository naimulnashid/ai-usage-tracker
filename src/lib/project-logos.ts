/**
 * Project marks live in one folder per agent (`ProviderMeta.projectLogoDir`),
 * claimed by filename: the file `My App.png` is the logo for the project
 * displayed as "My App". The folders' contents are gitignored - they are named
 * after the user's projects.
 *
 * That is the entire contract — no config file to keep in step with the
 * project list, which would go stale the first time a folder is renamed.
 *
 * Client-safe: no `node:` imports. The directory listing lives in
 * `src/app/api/project-logos/[provider]/route.ts`.
 */

export const IMAGE_EXTENSIONS = [
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
] as const;

/**
 * Normalises a project name or a filename stem to the key both sides match on.
 *
 * Case- and separator-insensitive, so "My_App" finds a file named
 * "My App.png" and "Some App - Web" is not defeated by the spacing around its
 * dash. Deliberately loose: the failure mode of a miss
 * is a silently absent logo, which is hard to notice and annoying to debug.
 */
export function logoKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Initials for the fallback tile — at most two, so it stays legible at 38px. */
export function initialsOf(name: string): string {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
