/**
 * The projects you have chosen to hide from the Projects page, one list per
 * agent.
 *
 * **A view preference, not a filter on the data.** A hidden project still
 * counts in every total, on every chart and in the share-of-spend donut, where
 * it is summed into the remainder slice rather than named. Hiding one only
 * takes its card out of the ranked list until "Show all projects" puts it back.
 * Nothing here may ever change a number - same rule as merging.
 *
 * Not to be confused with `diagnostics.emptyProjectsHidden`: those are folders
 * the PARSER drops because they hold nothing but replayed history. These are
 * real projects the USER chose not to look at.
 *
 * **Why a file in the data folder, and not the browser's storage:** this
 * dashboard is used from more than one device, and a project hidden on the
 * desktop should be hidden on the phone too. And why not `config/projects.json`,
 * where the other project overrides live: that file is written by hand and
 * carries its documentation as `_comment` keys and blank lines, and an app
 * rewriting it would reformat it on the first click. This file belongs to the
 * app; that one belongs to you.
 *
 * **Why not part of the usage report:** toggling a project must not cost a
 * full parse of every transcript - the same reasoning as the project logos.
 *
 * One file per agent, like the archive, because the two have separate project
 * id spaces: `data/hidden-projects.json` and `data/codex-hidden-projects.json`.
 * Ids only, never names or paths - the file says nothing a stranger could read
 * a project out of that the directory name would not.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { dataDir } from './data-dir';
import type { ProviderId } from './providers';

const FILES: Record<ProviderId, string> = {
  claude: 'hidden-projects.json',
  codex: 'codex-hidden-projects.json',
};

const VERSION = 1;

/** Real ids are an encoded working directory: a few hundred characters at most. */
export const MAX_PROJECT_ID_LENGTH = 1024;

/**
 * Far more than anyone has projects. A bound on how large a request can make
 * the file, since every write is a read-modify-write of the whole thing.
 */
export const MAX_HIDDEN_PROJECTS = 2000;

interface HiddenProjectsFile {
  version: number;
  hidden: string[];
}

export function hiddenProjectsPath(provider: ProviderId): string {
  return path.join(dataDir(), FILES[provider] ?? FILES.claude);
}

export function isValidProjectId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PROJECT_ID_LENGTH;
}

/** Deduplicated, sorted, and only strings that could be an id. */
function sanitize(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isValidProjectId))].sort().slice(0, MAX_HIDDEN_PROJECTS);
}

/**
 * The hidden ids for one agent.
 *
 * Fails soft to an empty list - missing, unreadable, corrupt, wrong shape -
 * because that is the harmless direction: at worst a project you hid shows up
 * again. Throwing here would take the Projects page down over a preference.
 */
export function loadHiddenProjects(provider: ProviderId): string[] {
  const file = hiddenProjectsPath(provider);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<HiddenProjectsFile> | null;
    return sanitize(parsed?.hidden);
  } catch {
    return [];
  }
}

/**
 * Hide or show one project, and return the whole list as it now stands.
 *
 * Synchronous on purpose: the read, the change and the write happen in one
 * turn of the event loop, so two quick clicks cannot interleave and lose one.
 * Written to a temporary file and renamed into place, like the archive, so a
 * crash mid-write leaves the old list rather than half a new one.
 *
 * Throws when the write fails - unlike reading, a lost write is something the
 * person who clicked should be told about.
 */
export function setProjectHidden(provider: ProviderId, id: string, hidden: boolean): string[] {
  if (!isValidProjectId(id)) throw new Error('Not a project id.');

  const current = new Set(loadHiddenProjects(provider));
  if (hidden === current.has(id)) return [...current].sort();
  if (hidden) current.add(id);
  else current.delete(id);
  if (current.size > MAX_HIDDEN_PROJECTS) {
    throw new Error(`No more than ${MAX_HIDDEN_PROJECTS} projects can be hidden.`);
  }

  const list = [...current].sort();
  const file = hiddenProjectsPath(provider);
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  const body: HiddenProjectsFile = { version: VERSION, hidden: list };
  writeFileSync(temp, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
  return list;
}
