<!--
Thanks for this. The checklist is short on purpose: the first item is the one
that cannot be undone once it is merged, and the last two are the mistakes this
codebase actually makes.
-->

## What this changes

<!-- And why. Link an issue if there is one. -->

## Checklist

- [ ] **No real project names, paths, usernames or spend figures** anywhere in
      the diff — code, comments, tests, fixtures **or the commit messages**.
      This repository is public and the app reads private transcripts.
- [ ] `npm run typecheck && npm test && npm run lint && npm run format:check`
- [ ] Conventional commit messages

### If you changed a parser

- [ ] Captured `npm run parse` / `npm run parse:codex` output before and after
      and diffed it, and anything that moved is something I meant to move.
      (Live usage grows as you work: expect today's date and the project you
      are working in to differ.)
- [ ] Added or updated a test — `tests/` builds its fixtures at run time, so
      nothing derived from a real transcript is ever committed.

### If you changed a panel's copy, shape or spacing

- [ ] Re-measured its loading skeleton, or confirmed the height did not move.
      The constants are in `ProviderMeta.skeleton`, and adding a single
      sentence to a subtitle has already invalidated one of them.
