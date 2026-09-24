import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { APP_ICON_SIZES } from '@/lib/app-icon';

/**
 * The installed app's icon as a PNG, rasterised from `src/app/icon.svg`.
 *
 * The manifest needs PNGs: an SVG icon is not reliably turned into a Windows
 * shortcut icon. Drawing them from the favicon at build time, rather than
 * committing two PNGs, keeps one mark with one source - the reasoning that
 * keeps a `favicon.ico` out of this repo (see CLAUDE.md) applies to these too.
 *
 * Prerendered at build (`dynamicParams = false`), so the file is read once
 * there and never at request time, and any size not listed 404s.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return APP_ICON_SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  const svg = await readFile(path.join(process.cwd(), 'src', 'app', 'icon.svg'));
  const src = `data:image/svg+xml;base64,${svg.toString('base64')}`;

  return new ImageResponse(<img src={src} width={size} height={size} alt="" />, {
    width: size,
    height: size,
  });
}
