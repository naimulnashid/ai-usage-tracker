/**
 * Writes a synthetic transcript tree for both agents.
 *
 *   npm run demo:data              -> ./demo-data
 *   npm run demo:data -- <dir>     -> somewhere else
 *
 * Why this exists: every screenshot of this dashboard is otherwise a screenshot
 * of somebody's real projects, paths and spend. The privacy rules at the top of
 * CLAUDE.md make that uncommittable, which has meant no screenshots at all.
 * This produces a tree that looks like real usage and contains nothing.
 *
 * It is not a mock. The output goes through the real parsers, so the numbers on
 * the page are computed the same way yours are — which means the generator has
 * to reproduce the traps those parsers exist to handle, or the demo would be a
 * picture of a codebase that does not exist:
 *
 *   Claude Code  streaming partials (one line per update, same message id,
 *                growing output_tokens), session replay across files, nested
 *                subagent transcripts, cache writes split by TTL.
 *   Codex        cumulative totals rather than per-turn, a repeated reading
 *                that must contribute zero, cached tokens already inside
 *                input, reasoning already inside output, auto-review threads
 *                as their own model.
 *
 * Deterministic: same seed, same bytes, so a screenshot can be reproduced and
 * a diff means something changed.
 */
import fs from 'node:fs';
import path from 'node:path';

/* ---------------------------------------------------------------------------
 * A seeded PRNG. `Math.random()` would make every run a different dashboard.
 * ------------------------------------------------------------------------ */

let seed = 20260921;
function rand(): number {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];
const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');

/* ---------------------------------------------------------------------------
 * Invented projects. Obviously fictional on purpose - a demo that looked like
 * somebody's real work would defeat the point of having one.
 * ------------------------------------------------------------------------ */

const HOME = 'C:\\Users\\you\\Projects';

const CLAUDE_PROJECTS = [
  { name: 'Recipe Box', weight: 34 },
  { name: 'Weather Widget', weight: 22 },
  { name: 'Invoice Tool', weight: 18 },
  { name: 'Bird Log', weight: 12 },
  { name: 'Chess Clock', weight: 8 },
  { name: 'Tide Table', weight: 6 },
];

const CODEX_PROJECTS = [
  { name: 'Recipe Box', weight: 62 },
  { name: 'Label Printer', weight: 38 },
];

/** The same lossy encoding Claude Code uses for a project directory. */
const encodeDir = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, '-');

const CLAUDE_MODELS = [
  { id: 'claude-opus-5', share: 46 },
  { id: 'claude-opus-4-8', share: 18 },
  { id: 'claude-fable-5', share: 14 },
  { id: 'claude-sonnet-5', share: 20 },
  { id: '<synthetic>', share: 2 },
];

function weighted<T extends { share?: number; weight?: number }>(xs: readonly T[]): T {
  const total = xs.reduce((n, x) => n + (x.share ?? x.weight ?? 1), 0);
  let r = rand() * total;
  for (const x of xs) {
    r -= x.share ?? x.weight ?? 1;
    if (r <= 0) return x;
  }
  return xs[xs.length - 1];
}

const DAYS = 54;
const iso = (ms: number) => new Date(ms).toISOString();

/** Working hours, so the heat map and the peak-hour card have a shape. */
function dayStart(daysAgo: number): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - daysAgo * 86_400_000 + int(8, 15) * 3_600_000;
}

/* ---------------------------------------------------------------------------
 * Claude Code
 * ------------------------------------------------------------------------ */

interface ClaudeLine {
  type: string;
  timestamp: string;
  cwd: string;
  requestId?: string;
  message?: Record<string, unknown>;
}

/**
 * One assistant turn, written the way Claude Code writes it: several lines
 * sharing a message id, output_tokens growing as the response streams. Only
 * the last is the truth, and the parser's job is to keep that one.
 */
function assistantTurn(at: number, cwd: string, model: string): ClaudeLine[] {
  const id = `msg_${hex(20)}`;
  const requestId = `req_${hex(16)}`;
  const input = int(3, 40);
  const cacheRead = int(12_000, 190_000);
  const write5m = int(900, 14_000);
  const write1h = rand() < 0.25 ? int(400, 6_000) : 0;
  const finalOutput = int(120, 3_400);

  // Two to four streaming partials, then the final line.
  const steps = int(2, 4);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const last = i === steps;
    return {
      type: 'assistant',
      timestamp: iso(at + i * int(700, 4_000)),
      cwd,
      requestId,
      message: {
        id,
        model,
        usage: {
          input_tokens: input,
          // The placeholder Claude Code writes on early partials, recovered by
          // keeping the maximum per message id.
          output_tokens: last ? finalOutput : Math.max(1, Math.round(finalOutput * (i / steps))),
          cache_read_input_tokens: cacheRead,
          cache_creation: {
            ephemeral_5m_input_tokens: write5m,
            ephemeral_1h_input_tokens: write1h,
          },
        },
      },
    };
  });
}

function userLine(at: number, cwd: string): ClaudeLine {
  return { type: 'user', timestamp: iso(at), cwd };
}

function writeClaude(root: string): { files: number; sessions: number } {
  const dir = path.join(root, 'claude', 'projects');
  fs.mkdirSync(dir, { recursive: true });
  let files = 0;
  let sessions = 0;

  // Keep one earlier session per project so a later one can replay it, which
  // is what makes de-duplication visible in the demo.
  const previous = new Map<string, ClaudeLine[]>();

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    // A believable week: quiet weekends, the odd day off.
    const dow = new Date(dayStart(daysAgo)).getUTCDay();
    const busy = dow === 0 || dow === 6 ? rand() < 0.35 : rand() < 0.88;
    if (!busy) continue;

    for (const project of CLAUDE_PROJECTS) {
      if (rand() * 100 > project.weight) continue;

      const cwd = `${HOME}\\${project.name}`;
      const projectDir = path.join(dir, encodeDir(cwd));
      fs.mkdirSync(projectDir, { recursive: true });

      const sessionId = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
      let at = dayStart(daysAgo);
      const lines: ClaudeLine[] = [];

      // Trap 1, second mechanism: a resumed session replays the earlier
      // conversation into the new file. Every one of these is a duplicate the
      // parser must credit to the original session only.
      const replay = previous.get(project.name);
      if (replay && rand() < 0.4) lines.push(...replay.slice(0, int(4, 12)));

      const turns = int(4, 22);
      for (let t = 0; t < turns; t++) {
        lines.push(userLine(at, cwd));
        at += int(4_000, 40_000);
        lines.push(...assistantTurn(at, cwd, weighted(CLAUDE_MODELS).id));
        at += int(20_000, 260_000);
        // An occasional long gap, which the idle cutoff should drop rather
        // than counting as runtime.
        if (rand() < 0.08) at += int(40, 220) * 60_000;
      }

      fs.writeFileSync(
        path.join(projectDir, `${sessionId}.jsonl`),
        lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
        'utf8',
      );
      previous.set(project.name, lines.filter((l) => l.type === 'assistant').slice(0, 12));
      files += 1;
      sessions += 1;

      // Trap 3: subagents live in a nested directory a flat scan never sees.
      if (rand() < 0.22) {
        const subDir = path.join(projectDir, sessionId, 'subagents');
        fs.mkdirSync(subDir, { recursive: true });
        let subAt = dayStart(daysAgo) + int(60_000, 400_000);
        const subLines: ClaudeLine[] = [];
        for (let t = 0; t < int(2, 7); t++) {
          subLines.push(...assistantTurn(subAt, cwd, weighted(CLAUDE_MODELS).id));
          subAt += int(15_000, 120_000);
        }
        fs.writeFileSync(
          path.join(subDir, `agent-${hex(8)}.jsonl`),
          subLines.map((l) => JSON.stringify(l)).join('\n') + '\n',
          'utf8',
        );
        files += 1;
      }
    }
  }

  return { files, sessions };
}

/* ---------------------------------------------------------------------------
 * Codex
 * ------------------------------------------------------------------------ */

interface CodexTotals {
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
}

function writeCodex(root: string): { files: number; threads: number } {
  const home = path.join(root, 'codex');
  const sessionsRoot = path.join(home, 'sessions');
  fs.mkdirSync(sessionsRoot, { recursive: true });
  const index: string[] = [];
  let files = 0;
  let threads = 0;

  const THREAD_NAMES = [
    'Fix the printer queue',
    'Port the importer',
    'Tidy the label layout',
    'Chase a flaky test',
    'Rewrite the CSV reader',
  ];

  for (let daysAgo = DAYS; daysAgo >= 0; daysAgo--) {
    if (rand() < 0.45) continue; // Codex gets used less often than the other

    for (const project of CODEX_PROJECTS) {
      if (rand() * 100 > project.weight) continue;

      const cwd = `${HOME}\\${project.name}`;
      const start = dayStart(daysAgo);
      const day = new Date(start);
      const dir = path.join(
        sessionsRoot,
        String(day.getUTCFullYear()),
        String(day.getUTCMonth() + 1).padStart(2, '0'),
        String(day.getUTCDate()).padStart(2, '0'),
      );
      fs.mkdirSync(dir, { recursive: true });

      const threadId = `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
      threads += 1;
      index.push(JSON.stringify({ id: threadId, thread_name: pick(THREAD_NAMES) }));

      const write = (id: string, model: string, parent: string | null, turns: number) => {
        const lines: string[] = [];
        let at = start + (parent ? int(30_000, 300_000) : 0);
        const emit = (o: unknown) => lines.push(JSON.stringify(o));

        emit({
          type: 'session_meta',
          timestamp: iso(at),
          payload: {
            id,
            cwd,
            ...(parent ? { parent_thread_id: parent, thread_source: 'subagent' } : {}),
          },
        });
        // Trap 5: the model is state, written only when it changes.
        emit({ type: 'turn_context', timestamp: iso(at), payload: { model, cwd } });

        // Trap 1: totals are CUMULATIVE. Per-turn usage is the delta.
        const totals: CodexTotals = {
          input_tokens: 0,
          cached_input_tokens: 0,
          cache_write_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 0,
        };

        for (let t = 0; t < turns; t++) {
          at += int(8_000, 90_000);
          const cached = int(20_000, 240_000);
          // Trap 2: input INCLUDES the cached part, typically ~98% of it.
          const fresh = int(200, 2_600);
          const output = int(150, 2_900);
          // Trap 3: reasoning is INSIDE output, never added to it.
          const reasoning = Math.round(output * (0.3 + rand() * 0.45));

          const last = {
            input_tokens: cached + fresh,
            cached_input_tokens: cached,
            cache_write_input_tokens: 0,
            output_tokens: output,
            reasoning_output_tokens: reasoning,
            total_tokens: cached + fresh + output,
          };
          for (const k of Object.keys(totals) as (keyof CodexTotals)[]) totals[k] += last[k];

          emit({
            type: 'event_msg',
            timestamp: iso(at),
            payload: {
              type: 'token_count',
              info: { total_token_usage: { ...totals }, last_token_usage: last },
            },
          });

          // Codex sometimes emits the same reading twice. The repeat carries a
          // full last_token_usage while the running total does not move, so
          // summing per-turn figures would count it again. The delta method
          // makes it contribute zero - which is the point of writing one here.
          if (rand() < 0.09) {
            emit({
              type: 'event_msg',
              timestamp: iso(at + 400),
              payload: {
                type: 'token_count',
                info: { total_token_usage: { ...totals }, last_token_usage: last },
              },
            });
          }
        }

        const stamp = new Date(start).toISOString().slice(0, 19).replace(/:/g, '-');
        fs.writeFileSync(
          path.join(dir, `rollout-${stamp}-${id}.jsonl`),
          lines.join('\n') + '\n',
          'utf8',
        );
        files += 1;
      };

      write(threadId, 'gpt-5.6-sol', null, int(6, 40));

      // Trap 4: the guardian auto-review is its own file, its own model band,
      // and real spend the user never asked for.
      const reviews = int(0, 3);
      for (let r = 0; r < reviews; r++) {
        write(
          `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`,
          'codex-auto-review',
          threadId,
          int(2, 9),
        );
      }
    }
  }

  fs.writeFileSync(path.join(home, 'session_index.jsonl'), index.join('\n') + '\n', 'utf8');
  return { files, threads };
}

/* ------------------------------------------------------------------------ */

function main(): void {
  const target = path.resolve(process.argv[2] ?? 'demo-data');
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  const claude = writeClaude(target);
  const codex = writeCodex(target);

  const dataDir = path.join(target, 'archive');
  const q = (p: string) => (p.includes(' ') ? `"${p}"` : p);

  console.log(`Demo transcripts written to ${target}`);
  console.log(`  Claude Code  ${claude.files} files (${claude.sessions} sessions, plus subagents)`);
  console.log(`  Codex        ${codex.files} files (${codex.threads} threads, plus auto-reviews)`);
  console.log('');
  console.log('Point the dashboard at them:');
  console.log('');
  console.log(`  CLAUDE_CONFIG_DIR=${q(path.join(target, 'claude'))} \\`);
  console.log(`  CODEX_HOME=${q(path.join(target, 'codex'))} \\`);
  console.log(`  DASHBOARD_DATA_DIR=${q(dataDir)} \\`);
  console.log('  npm run dev');
  console.log('');
  console.log('DASHBOARD_DATA_DIR is not optional: without it these synthetic');
  console.log('days are folded into your real archive in ./data, and the merge');
  console.log('keeps whichever copy has more messages. That is not reversible.');
}

main();
