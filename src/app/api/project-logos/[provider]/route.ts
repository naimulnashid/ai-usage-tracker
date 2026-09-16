import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { IMAGE_EXTENSIONS, logoKey } from '@/lib/project-logos';
import { getProvider } from '@/lib/providers';

/**
 * What is in this agent's project-logo folder, keyed by project name.
 *
 * A logo is claimed by filename: `public/claude_code_project_logos/My
 * App.png` is the mark for the project displayed as "My App". That is
 * the whole contract — drop a file in, name it after the project, and it
 * appears. There is no config file to keep in step, which is the point: the
 * alternative was a hand-kept map that silently goes stale the moment a project
 * is renamed.
 *
 * **The folder is per agent** (`ProviderMeta.projectLogoDir`), not shared. The
 * two agents key projects independently and the same name can exist in both, so
 * one folder would hand Claude Code's mark to a Codex project of the same name.
 * The agent is a route param validated against the registry, exactly like
 * `/api/usage/<agent>`; an unknown one is a 404 rather than a fallback.
 *
 * Listing the directory server-side rather than guessing extensions in the
 * browser means a project with no logo costs nothing — no 404 per candidate
 * extension, and its monogram renders on first paint instead of after two
 * failed requests.
 *
 * This reads a directory of images the user put there themselves. Nothing here
 * comes out of a transcript, so it is well clear of the
 * never-copy-anything-out-of-.claude/projects rule.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED = new Set<string>(IMAGE_EXTENSIONS);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: raw } = await params;
  const provider = getProvider(raw);
  if (!provider) {
    return NextResponse.json({ error: `Unknown agent "${raw}".` }, { status: 404 });
  }

  const dir = provider.projectLogoDir;
  let files: string[];
  try {
    files = await readdir(path.join(process.cwd(), 'public', dir));
  } catch {
    // No folder is the normal state for a fresh checkout, not an error.
    return NextResponse.json({ logos: {} }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const logos: Record<string, string> = {};
  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (!ALLOWED.has(extension)) continue;
    const key = logoKey(path.basename(file, extension));
    if (!key) continue;
    // Encode the segment, not the slashes - these filenames carry spaces.
    logos[key] = `/${dir}/${encodeURIComponent(file)}`;
  }

  return NextResponse.json({ logos }, { headers: { 'Cache-Control': 'no-store' } });
}
