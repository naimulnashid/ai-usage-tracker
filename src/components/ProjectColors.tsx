'use client';

import { useEffect, useMemo, useState } from 'react';
import { logoKey } from '@/lib/project-logos';
import {
  assignProjectColors,
  dominantColorFromPixels,
  type ProjectColorSource,
} from '@/lib/project-colors';
import { loadManifest } from './ProjectLogo';
import { useProvider } from './ProviderScope';
import { useUsage } from './UsageProvider';

/** Logos are drawn this small to be read: plenty for one dominant colour. */
const SAMPLE = 64;

/** One extraction per logo URL per page load, shared by every chart. */
const pending = new Map<string, Promise<string | null>>();
/** The same results, synchronously - so a chart mounted later paints in colour at once. */
const settled = new Map<string, string | null>();

function extract(url: string): Promise<string | null> {
  let job = pending.get(url);
  if (!job) {
    job = new Promise<string | null>((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = SAMPLE;
          canvas.height = SAMPLE;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) return resolve(null);
          // Contain, like the logo box does, so a wide mark is not squashed.
          // An SVG with no intrinsic size reports 0 and fills the square.
          const w = img.naturalWidth || SAMPLE;
          const h = img.naturalHeight || SAMPLE;
          const scale = Math.min(SAMPLE / w, SAMPLE / h);
          const dw = w * scale;
          const dh = h * scale;
          context.drawImage(img, (SAMPLE - dw) / 2, (SAMPLE - dh) / 2, dw, dh);
          const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
          resolve(dominantColorFromPixels(data, SAMPLE, SAMPLE));
        } catch {
          // A tainted canvas or a decode failure: this project falls back.
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      // Same origin (public/), so the canvas stays readable.
      img.src = url;
    }).then((color) => {
      settled.set(url, color);
      return color;
    });
    pending.set(url, job);
  }
  return job;
}

export interface ProjectColors {
  /** The colour a project is drawn in. Every project in the report has one. */
  colorOf: (id: string) => string;
  /** Where that colour came from, for the colour editor. */
  sourceOf: (id: string) => ProjectColorSource;
}

/**
 * Every project's chart colour: the one you chose, else its logo's dominant
 * colour, else a fallback - see src/lib/project-colors.ts.
 *
 * Computed over the WHOLE report's project list, in the report's order, so the
 * donut on the Projects page and the daily chart on the overview hand every
 * project the same colour. Logos are read in the browser from the same folder
 * the marks come from; until one has been read the project shows its fallback,
 * and the chart takes the real colour a moment later.
 */
export function useProjectColors(): ProjectColors {
  const provider = useProvider();
  const { report, projectColors } = useUsage();
  const [logoColors, setLogoColors] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(settled),
  );
  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});

  const projects = report?.projects;

  useEffect(() => {
    if (!projects?.length) return;
    let live = true;
    void loadManifest(provider.id).then(async (logos) => {
      const urls: Record<string, string> = {};
      for (const project of projects) {
        const url = logos[logoKey(project.name)];
        if (url) urls[project.id] = url;
      }
      if (!live) return;
      setLogoUrls(urls);
      const results = await Promise.all(
        Object.values(urls).map(async (url) => [url, await extract(url)] as const),
      );
      if (live) setLogoColors((previous) => ({ ...previous, ...Object.fromEntries(results) }));
    });
    return () => {
      live = false;
    };
  }, [projects, provider.id]);

  return useMemo(() => {
    const assigned = assignProjectColors(projects ?? [], projectColors, (id) => {
      const url = logoUrls[id];
      return url ? logoColors[url] : null;
    });
    return {
      colorOf: (id: string) => assigned.get(id)?.color ?? 'var(--accent)',
      sourceOf: (id: string) => assigned.get(id)?.source ?? 'auto',
    };
  }, [projects, projectColors, logoUrls, logoColors]);
}
