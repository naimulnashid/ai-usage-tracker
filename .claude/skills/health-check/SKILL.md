---
name: health-check
description: Run this repo's maintenance checklist and report what needs doing next - uncommitted or unpushed work, CI, docs and CHANGELOG drift, stale README screenshots and loading skeletons, open pull requests and whether they are worth landing, security advisories, dead code, dependency freshness, and whether a release is due. Use when the user asks for a health check, "is the project healthy", "what's left to do", or after finishing a batch of changes.
---

# Project health check

A checklist for after a batch of changes, or any time. It **finds and
recommends**; it does not publish. Work through the sections in order, then
report (format at the end).

**What you may do without asking:** read anything, run the local checks, fix
trivial local drift (a stale sentence in the CHANGELOG, an unused export) as
normal commits. **Ask first** before anything outward-facing or hard to undo:
landing a pull request, cutting a release, closing a PR, changing repository
settings. Machine-specific steps - a private mirror, a local service, sibling
repos - live in `CLAUDE.local.md` under *Health check: this machine*; run those
too when that file exists.

Re-read the privacy rules at the top of `CONTRIBUTING.md` before writing anything:
the report may quote file names and commit subjects, never real project names,
paths or spend.

## 1. Working tree and sync

```bash
git status --short --branch
git fetch --prune origin
git log --oneline origin/main..HEAD     # unpushed
git log --oneline HEAD..origin/main     # not pulled
git stash list
```

Healthy: on `main`, nothing uncommitted, nothing unpushed or unpulled, no
stashes. Watch for:

- **Scratch leftovers** - a temporary `.claude/launch.json` entry, files in
  `out/`, `demo-data/` or `screenshots/` that should stay untracked (they are
  gitignored; confirm with `git check-ignore -v <path>`).
- **The block `next dev` writes into the local design notes** (*This is NOT
  the Next.js you know*). It is regenerated; those notes are not in this
  repository, so it never shows in a diff here.
- Every mirror named in `CLAUDE.local.md` is in step with `origin`.

## 2. Quality gates, locally and in CI

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
gh run list --branch main --limit 5
```

Healthy: all five pass locally, and the latest CI run on `main` succeeded for
the commit you pushed (`headSha` matches `git rev-parse HEAD`). A red CI run on
`main` outranks everything else in this list.

## 3. Documentation follows the code

The latest tag is the baseline: `git describe --tags --abbrev=0`.

```bash
git log --oneline $(git describe --tags --abbrev=0)..HEAD
```

- **CHANGELOG.md**: every user-visible `feat:`/`fix:` since the tag has an
  entry under `## [Unreleased]`, and no entry describes something that has
  since changed again (a control that moved, a default that flipped).
  `chore:`, `ci:`, `docs:` and test-only commits need none.
- **README.md**: the *What it shows* list, the configuration and file tables
  (anything new written to `data/`?), and the screenshot alt texts still match
  the pages.
- **The design notes** (local, not in this repository): each change that
  altered a documented rule, measurement or trap has its section updated. Grep for the old wording of anything you
  renamed or moved.
- **SECURITY.md / CONTRIBUTING.md**: still true.

## 4. README screenshots

Stale when the UI changed after the images were last made:

```bash
git log -1 --format=%ci -- docs/screenshots
git log --oneline --since="$(git log -1 --format=%cI -- docs/screenshots)" -- src/app src/components
```

Any `feat:` or visible `fix:` in that second list means they are out of date.
Regenerate with the recipe in the README (*Trying it without your own data*):
`npm run demo:data`, a server on the demo port with its own throwaway
`DASHBOARD_PASSWORD` and `SESSION_SECRET`, a cookie minted with
`issueSession()`, then `npm run demo:shots`. **Never from real data**, and never
with a copied real session cookie - see *The README screenshots are full
pages* in the design notes. Look at every image before committing it, and update
the alt texts to what the images now show.

## 5. Loading skeletons

The skeletons mirror each page at measured heights (`ProviderMeta.skeleton` in
`src/lib/providers.ts`). Stale when a page changed shape after the last
measurement:

```bash
git log -1 --format=%ci -- src/lib/providers.ts
git log --oneline --since="$(git log -1 --format=%cI -- src/lib/providers.ts)" -- src/app src/components src/app/globals.css
```

Shape changes are: a section added, removed or moved; a legend or table
gaining or losing rows; subtitle copy that could wrap differently; a control
added to a panel head or legend row. For each, re-measure both agents at 997px
and 1680px with the iframe recipe in *Loading skeletons mirror the real
sections* (the design notes), store the mid-range, and record the two measurements
in the comment beside it. A page-order change also means reordering the
skeleton JSX.

## 6. Open pull requests

```bash
gh pr list --state open --json number,title,author,createdAt,headRefName,mergeable
gh pr checks <n>
```

For each PR, decide with this order of priority:

| Kind | Worth it? | Action |
|---|---|---|
| Fixes a security advisory in a shipped (non-dev) dependency | **Yes, now** | Land it before anything else, then consider a patch release (section 10). |
| Dependabot patch/minor, CI green | Yes, cheap | Land it. Read the release notes for anything touching this app's features first. |
| Dependabot major | Only if read | Read the migration guide; land in its own commit with the code changes it needs, or close it with a comment saying why and when to revisit. Majors are grouped separately by the update config so they get this attention. |
| `next` and `eslint-config-next` | Together | They must stay on the same major - the update config groups them. |
| Superseded (a newer PR or a manual bump covers it) | No | Close with a comment naming what superseded it. |
| From a contributor | Review | Check it against `CONTRIBUTING.md` and the privacy rules; never land anything carrying real transcripts, paths or figures. |
| Stale for weeks with failing checks | Usually no | `@dependabot rebase` once; if it still fails, find out why before spending more on it. |

**Dependency PRs do not open here.** Since 2026-10-01 Dependabot runs on the
maintainer's private copy, where dependency and security fixes are applied
first and then published here as ordinary commits; this repo has no
`.github/dependabot.yml`. A Dependabot PR on this repo would duplicate that
work - close it and apply the bump upstream.

**How to land one** is the maintainer's call and may be recorded in
`CLAUDE.local.md` (for example, keeping every commit on `main` authored by the
maintainer rather than a bot). Follow that record rather than the merge button.
After landing: sections 2 and 10, and restart any local deployment.

## 7. Security

```bash
npm audit --omit=dev          # shipped dependencies: act on critical/high now
npm audit                     # dev tooling: fix when convenient
gh api repos/{owner}/{repo}/dependabot/alerts --jq '[.[]|select(.state=="open")]|length'
git ls-files | grep -iE '(^|/)\.env|\.pem$|\.key$|\.sqlite$|\.jsonl$|^data/|^out/' | grep -v '\.env\.example$'
```

- A **critical or high advisory in a shipped dependency** is the top item in
  the report. Say whether this app actually uses the affected code path, but
  fix it either way.
- **Dependabot alerts are OFF on this public repo by design**, so the
  `dependabot/alerts` call returns 403 here: alerts are read on the
  maintainer's private copy, where the fixes are made. Ask the owner for its
  count rather than reporting the 403 as a finding.
- **Secret scanning, push protection and private vulnerability reporting
  should be ON** here (Settings -> Code security); report any that is off.
  Changing them is the owner's decision.
- The `git ls-files` line must print nothing: no env files, keys, archives,
  transcripts or reports tracked.
- **Privacy sweep** of what is tracked: `git grep -nE 'C:\\\\Users\\\\[A-Za-z]+'`
  and `git grep -nE '/(home|Users)/[a-z]+'` may only find placeholders (`you`, `me`).
  Commit messages count too: `git log --format=%B $(git describe --tags --abbrev=0)..HEAD`.
- Workflows in `.github/workflows` use pinned major versions and the least
  `permissions:` they need.

## 8. Dead code

```bash
npx tsc --noEmit --noUnusedLocals --noUnusedParameters
node .claude/skills/health-check/unused-exports.mjs
```

- `tsc` with the unused flags should print nothing.
- The script lists exports nothing else imports. **`(UNUSED)` entries are dead
  code**: delete them, and their tests if the tests exist only for them.
  "Used in its own file" entries are informational - several are documented
  entry points (`discoverFiles`, `loadHistory`); do not churn them.
- Each dependency in `package.json` is still imported somewhere
  (`git grep -l "<name>" -- src scripts tests`), and each `npm` script and file
  in `scripts/` is still referenced by the README or another script.
- `git grep -nE 'TODO|FIXME|XXX'` - resolve or list them.

## 9. Dependency freshness

```bash
npm outdated
```

- Patch/minor lag is fine if Dependabot has a PR open for it on the private copy.
- **Held majors** are listed, with the reason, in the `ignore:` block of the
  private copy's `.github/dependabot.yml` (a local-only file in this checkout), and `npm outdated` will keep showing them - that is
  expected, not a finding. Only report one when its reason has lifted. For
  ESLint 10 and TypeScript 7, the test is the plugins `eslint-config-next`
  bundles, not its own open-ended peer ranges:

  ```bash
  for p in typescript-eslint eslint-plugin-react eslint-plugin-import eslint-plugin-jsx-a11y eslint-plugin-react-hooks; do
    echo "$p: eslint $(npm view $p@latest peerDependencies.eslint) | ts $(npm view $p@latest peerDependencies.typescript)"
  done
  ```

  When every range admits the new major (and `eslint-config-next`'s latest
  depends on those versions), propose the upgrade and remove its `ignore`.
- `next` and `eslint-config-next` share a major.
- The Node versions in `.github/workflows/ci.yml`, `.nvmrc` and `engines` are
  still supported releases (check the Node release schedule). When they move,
  move `@types/node`'s major with them - the update config deliberately does not.

## 10. Is a release due?

```bash
git describe --tags --abbrev=0
git log --oneline $(git describe --tags --abbrev=0)..HEAD
gh release list --limit 3
```

| Since the last tag | Release |
|---|---|
| A security fix in a shipped dependency, or a user-facing bug fix | **Patch** (0.12.x), soon |
| New features or visible changes (anything under *Added*/*Changed*) | **Minor** (0.x.0) - batch a few, but do not sit on them for weeks |
| A breaking change to config files, `data/` formats or the API routes | Minor while on 0.x, with an upgrade note at the top of the entry |
| Only `docs:`, `ci:`, `chore:`, tests | None |

To cut one (ask first):

1. **Reconcile the CHANGELOG with the commits first.** List every `feat:` and
   `fix:` since the tag (`git log --format=%s <tag>..HEAD | grep -E
   '^(feat|fix)'`) and make sure each has an entry. The first run of this
   checklist found five shipped features with none.
2. `npm version x.y.z --no-git-tag-version` (updates the lockfile too).
3. Add `## [x.y.z] - YYYY-MM-DD` directly under `## [Unreleased]`, so the
   entries move into the release and Unreleased starts empty.
4. Commit `chore: release vx.y.z`, then `git tag -a vx.y.z -m vx.y.z`, and push
   the commit and the tag.
5. `gh release create vx.y.z --title "vx.y.z — <what it is about>" --notes-file
   <notes>`, where the notes open with anything a user must act on (a security
   fix, a raised Node floor), then a few highlights, then that CHANGELOG
   section.
6. Rebuild and restart any local deployment: the version lives in
   `package.json`, which the launchers' stale-build check watches.

Screenshots (section 4) should be current before a release.

## 11. Repository hygiene

```bash
gh issue list --state open
git branch -r --merged origin/main | grep -v 'origin/main$'
gh api repos/{owner}/{repo}/rulesets --jq '.[].name'
```

- Open issues are triaged (labelled, answered, or closed).
- No remote branches left over from landed PRs (Dependabot deletes its own
  when the PR closes; others are deleted by hand).
- The branch ruleset protecting `main` still exists.
- The repo description, topics and social preview still describe the app.

## Report

Lead with anything urgent (red CI, a critical advisory, unpushed work). Then:

| Area | Status | Finding | Next step |
|---|---|---|---|
| Working tree & sync | ✅ / ⚠️ / ❌ | ... | ... |

one row per section, and finish with **Needs your decision**: each outward
action you recommend (land PR #n, cut vX.Y.Z, turn on alerts), with a one-line
reason, so the owner can answer them in one reply.
