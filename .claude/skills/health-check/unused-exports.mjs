// Lists exports in src/ that nothing else imports - candidates for dead code.
//
// A heuristic, deliberately dependency-free (no knip, nothing downloaded): it
// finds `export function|const|class|type|interface NAME` and looks for NAME
// as a whole word in every OTHER file under src/, tests/ and scripts/. Next's
// own conventions (a page's default export, `metadata`, `viewport`, route
// handlers...) are skipped, since the framework is what imports them.
//
// Usage: node .claude/skills/health-check/unused-exports.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const walk = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
        return /\.(tsx?|mjs|js)$/.test(e.name) ? [p] : [];
      })
    : [];

const sources = walk(path.join(root, 'src'));
const everything = [
  ...sources,
  ...walk(path.join(root, 'tests')),
  ...walk(path.join(root, 'scripts')),
];
const text = new Map(everything.map((f) => [f, fs.readFileSync(f, 'utf8')]));

// Names Next.js or the tooling import by convention.
const FRAMEWORK = new Set([
  'default',
  'metadata',
  'viewport',
  'generateMetadata',
  'generateStaticParams',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'runtime',
  'config',
  'proxy',
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'contentType',
  'size',
  'alt',
]);

const unused = [];
for (const file of sources) {
  const body = text.get(file);
  for (const m of body.matchAll(
    /export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    const name = m[1];
    if (FRAMEWORK.has(name)) continue;
    const word = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    const usedElsewhere = [...text].some(([f, t]) => f !== file && word.test(t));
    // Used inside its own file only: exported for no reason, but not dead.
    const usesInOwnFile = body.split(word).length - 1;
    if (!usedElsewhere)
      unused.push(
        `${path.relative(root, file)}: ${name}${usesInOwnFile > 1 ? ' (used in its own file - drop the export?)' : ' (UNUSED)'}`,
      );
  }
}
console.log(unused.length ? unused.join('\n') : 'No unused exports found.');
