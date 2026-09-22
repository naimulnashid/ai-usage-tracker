/**
 * Captures the README's screenshots from a running dashboard.
 *
 *   npm run demo:shots -- <baseUrl> <cookie>
 *
 * Paired with `make-demo-data.ts`, and only meaningful with it: the whole point
 * is that a screenshot of this dashboard is otherwise a screenshot of somebody's
 * real projects, paths and spend, which the privacy rules make uncommittable.
 * Point this at a server running on the synthetic tree and the images contain
 * nothing real. `README.md` has the full recipe.
 *
 * Chrome over the DevTools protocol rather than a screenshot library: Chrome is
 * already on the machine, Node has a WebSocket, and this needs no dependency
 * that would then have to be kept current for something run twice a year.
 *
 * The `cookie` argument is a session for that server. It is passed in rather
 * than minted here so this script never handles a password.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = [
  `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

/** Width x height of the browser window each shot is taken in. */
const VIEWPORT = { width: 1440, height: 900 };
/** Captured at 2x and downscaled by the caller, so the result is supersampled. */
const SCALE = 2;
/**
 * Chrome's largest capturable surface, in device pixels. Full-page shots run
 * into it: a project page with a long day-by-day table was 7,963px tall, which
 * is 15,926 at 2x. A taller page is captured at a lower scale rather than
 * failing or coming back cut short.
 */
const MAX_DEVICE_PX = 16_384;

interface Shot {
  name: string;
  path: string;
  /** Extra settling time for a page with more charts to animate in. */
  settleMs?: number;
}

const SHOTS: Shot[] = [
  { name: 'overview-claude', path: '/claude' },
  { name: 'overview-codex', path: '/codex' },
  { name: 'projects', path: '/claude/projects' },
  { name: 'project-detail', path: '/claude/projects/C--Users-you-Projects-Recipe-Box' },
];

/* ------------------------------------------------------------------ CDP -- */

class Cdp {
  private ws!: WebSocket;
  private next = 1;
  private pending = new Map<number, (value: Record<string, unknown>) => void>();

  static async attach(wsUrl: string): Promise<Cdp> {
    const cdp = new Cdp();
    cdp.ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      cdp.ws.addEventListener('open', () => resolve(), { once: true });
      cdp.ws.addEventListener('error', () => reject(new Error('CDP socket failed')), {
        once: true,
      });
    });
    cdp.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data)) as {
        id?: number;
        result?: Record<string, unknown>;
        error?: { message: string };
      };
      if (msg.id && cdp.pending.has(msg.id)) {
        const resolve = cdp.pending.get(msg.id)!;
        cdp.pending.delete(msg.id);
        if (msg.error) throw new Error(`${msg.error.message}`);
        resolve(msg.result ?? {});
      }
    });
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }

  /** Runs an expression in the page and returns its value. */
  async evaluate<T>(expression: string): Promise<T> {
    const res = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: T } };
    return res.result?.value as T;
  }

  close(): void {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- Main -- */

async function main(): Promise<void> {
  const [baseUrl, cookie] = process.argv.slice(2);
  if (!baseUrl || !cookie) {
    console.error('usage: npm run demo:shots -- <baseUrl> <sessionCookie>');
    process.exit(1);
  }
  if (!CHROME) {
    console.error('No Chrome or Edge found. Install one, or take the shots by hand.');
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'docs', 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
  const port = 9333;

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    ],
    { stdio: 'ignore' },
  );

  try {
    // Wait for the debugging endpoint rather than guessing at a delay.
    let target: { webSocketDebuggerUrl: string } | null = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/new?url=about:blank`, {
          method: 'PUT',
        });
        if (res.ok) target = (await res.json()) as { webSocketDebuggerUrl: string };
      } catch {
        // Not listening yet.
      }
    }
    if (!target) throw new Error('Chrome never opened its debugging port');

    const cdp = await Cdp.attach(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      ...VIEWPORT,
      deviceScaleFactor: SCALE,
      mobile: false,
    });

    const url = new URL(baseUrl);
    const [name, value] = cookie.split('=');
    await cdp.send('Network.setCookie', {
      name,
      value,
      domain: url.hostname,
      path: '/',
    });

    for (const shot of SHOTS) {
      await cdp.send('Page.navigate', { url: new URL(shot.path, baseUrl).href });

      // Two separate waits. The data has to land, which can take a full parse;
      // the entry animations then have to settle, or every card is caught
      // mid-fade (see CLAUDE.md on `.rise`). They are separate because a
      // looping animation would make "all finished" never come true, and that
      // should cost a blurry card rather than the whole run.
      let loaded = false;
      for (let i = 0; i < 160 && !loaded; i++) {
        await sleep(250);
        loaded = await cdp.evaluate<boolean>(`(() => {
          const root = document.querySelector('main.shell')?.firstElementChild;
          if (!root || root.matches('[aria-busy="true"]')) return false;
          // Deliberately .card and not .card.panel: the projects page's rows
          // are cards without the panel class, so a panel count of two is
          // never reached there and the wait times out on a rendered page.
          return document.querySelectorAll('.card').length >= 2;
        })()`);
      }
      if (!loaded) throw new Error(`${shot.path} never rendered its data`);

      for (let i = 0; i < 20; i++) {
        const settled = await cdp.evaluate<boolean>(
          `document.getAnimations().every((a) => a.playState === 'finished')`,
        );
        if (settled) break;
        await sleep(150);
      }
      await sleep(shot.settleMs ?? 400);

      // The whole page, not the first screen. The window is grown to the
      // page's height rather than captured "beyond the viewport": the rail is
      // `100vh` tall, so a capture past the viewport showed it stopping dead
      // after the first 900px. Grown, the page is one real frame of that
      // height, rail and all. Re-read until it holds, since the page's own
      // `min-height: 100vh` means growing the window can grow the page.
      let height = VIEWPORT.height;
      let scale = SCALE;
      for (let i = 0; i < 5; i++) {
        const content = await cdp.evaluate<number>(
          'Math.ceil(document.documentElement.scrollHeight)',
        );
        if (content <= height) break;
        height = content;
        scale = Math.min(SCALE, MAX_DEVICE_PX / height);
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          ...VIEWPORT,
          height,
          deviceScaleFactor: scale,
          mobile: false,
        });
        await sleep(300);
      }

      // WebP rather than PNG: these are 2x captures of a dark UI, where the
      // supersampled gradients defeat PNG's compression - the same image is
      // ~295 KB as a PNG and ~77 KB here, indistinguishable at q92. Chrome
      // encodes it directly, so the script produces exactly what is committed
      // rather than needing a conversion step that could drift from it.
      const res = (await cdp.send('Page.captureScreenshot', {
        format: 'webp',
        quality: 92,
        captureBeyondViewport: false,
      })) as { data: string };
      const file = path.join(outDir, `${shot.name}.webp`);
      fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
      const kb = (fs.statSync(file).size / 1024).toFixed(0);
      console.log(
        `  ${path.relative(process.cwd(), file)}  ${kb} KB, ${VIEWPORT.width}x${height} at ${scale.toFixed(2)}x`,
      );

      // Back to the window's own size, so the next page is measured from a
      // screen and not from this page's height.
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        ...VIEWPORT,
        deviceScaleFactor: SCALE,
        mobile: false,
      });
    }

    cdp.close();
  } finally {
    chrome.kill();
    // Chrome holds its profile directory open for a moment after kill(), and a
    // failure to delete a temp folder must not mask why the run failed.
    await sleep(500);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // A leftover temp profile is the OS's problem, not this script's.
    }
  }
}

main().catch((err) => {
  console.error('Screenshots failed:', err);
  process.exit(1);
});
