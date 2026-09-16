'use client';

import { useEffect, useState } from 'react';
import { initialsOf, logoKey } from '@/lib/project-logos';
import { useProvider } from '@/components/ProviderScope';

/**
 * The mark for one project, or its initials when there isn't one.
 *
 * The manifest is fetched once per agent per page load and shared by every
 * instance through a module-level cache — a dozen project rows must not become
 * a dozen requests. It is deliberately not part of the usage report: logos are
 * a folder the user drops files into, and coupling them to the parser would
 * mean a re-parse of every transcript to pick up a new PNG.
 *
 * Keyed by agent because the folders are per agent: the two have separate
 * project name spaces, so one shared manifest would cross them.
 */

const manifests = new Map<string, Promise<Record<string, string>>>();

function loadManifest(providerId: string): Promise<Record<string, string>> {
  let pending = manifests.get(providerId);
  if (!pending) {
    pending = fetch(`/api/project-logos/${providerId}`)
      .then((response) => (response.ok ? response.json() : { logos: {} }))
      .then((body) => (body?.logos as Record<string, string>) ?? {})
      // A missing manifest means every project falls back to its monogram,
      // which is a perfectly readable page. It must never take the list down.
      .catch(() => ({}));
    manifests.set(providerId, pending);
  }
  return pending;
}

export function ProjectLogo({ name, size = 38 }: { name: string; size?: number }) {
  const provider = useProvider();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadManifest(provider.id).then((logos) => {
      if (live) setSrc(logos[logoKey(name)] ?? null);
    });
    return () => {
      live = false;
    };
  }, [name, provider.id]);

  // The box is reserved at its final size from the first paint, so the row
  // does not reflow when the manifest lands a moment later.
  return (
    <span
      className="project-logo"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a user-dropped
        // file of unknown dimensions; next/image would need a loader config for
        // no benefit on a localhost-only page.
        <img src={src} alt="" className="project-logo-img" onError={() => setSrc(null)} />
      ) : (
        <span className="project-logo-fallback num">{initialsOf(name)}</span>
      )}
    </span>
  );
}
