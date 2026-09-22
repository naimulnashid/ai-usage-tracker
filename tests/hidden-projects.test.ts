import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { isSameOrigin } from '../src/lib/auth';
import {
  MAX_PROJECT_ID_LENGTH,
  hiddenProjectsPath,
  loadHiddenProjects,
  setProjectHidden,
} from '../src/lib/hidden-projects';
import { tempDir } from './helpers';

const APP = 'C--Users-you-Projects-my-app';
const OTHER = 'C--Users-you-Projects-other';

const root = tempDir();
let dir: string;
const previous = process.env.DASHBOARD_DATA_DIR;

// A fresh data folder per test, so no test sees another's list.
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(root, 'case-'));
  process.env.DASHBOARD_DATA_DIR = dir;
});

afterEach(() => {
  if (previous === undefined) delete process.env.DASHBOARD_DATA_DIR;
  else process.env.DASHBOARD_DATA_DIR = previous;
});

describe('hidden projects', () => {
  it('starts empty, with no file', () => {
    assert.deepEqual(loadHiddenProjects('claude'), []);
    assert.equal(fs.existsSync(hiddenProjectsPath('claude')), false);
  });

  it('hides and shows a project, and reads back what it wrote', () => {
    assert.deepEqual(setProjectHidden('claude', OTHER, true), [OTHER]);
    assert.deepEqual(setProjectHidden('claude', APP, true), [APP, OTHER]);
    assert.deepEqual(loadHiddenProjects('claude'), [APP, OTHER]);
    assert.deepEqual(setProjectHidden('claude', OTHER, false), [APP]);
    assert.deepEqual(loadHiddenProjects('claude'), [APP]);
  });

  it('treats hiding twice as hiding once', () => {
    setProjectHidden('claude', APP, true);
    assert.deepEqual(setProjectHidden('claude', APP, true), [APP]);
    assert.deepEqual(setProjectHidden('claude', OTHER, false), [APP]);
  });

  it('keeps one list per agent, since their project ids are separate spaces', () => {
    setProjectHidden('claude', APP, true);
    assert.deepEqual(loadHiddenProjects('codex'), []);
    assert.notEqual(hiddenProjectsPath('claude'), hiddenProjectsPath('codex'));
  });

  it('writes into DASHBOARD_DATA_DIR, so a demo run never touches your real list', () => {
    setProjectHidden('codex', APP, true);
    assert.equal(path.dirname(hiddenProjectsPath('codex')), dir);
    assert.ok(fs.existsSync(path.join(dir, 'codex-hidden-projects.json')));
  });

  it('fails soft on a corrupt or wrongly shaped file', () => {
    fs.writeFileSync(hiddenProjectsPath('claude'), '{ not json');
    assert.deepEqual(loadHiddenProjects('claude'), []);
    fs.writeFileSync(hiddenProjectsPath('claude'), JSON.stringify({ hidden: 'nope' }));
    assert.deepEqual(loadHiddenProjects('claude'), []);
    fs.writeFileSync(hiddenProjectsPath('claude'), 'null');
    assert.deepEqual(loadHiddenProjects('claude'), []);
  });

  it('drops entries that could not be an id when reading a hand-edited file', () => {
    fs.writeFileSync(
      hiddenProjectsPath('claude'),
      JSON.stringify({ version: 1, hidden: [APP, 7, '', null, APP, 'x'.repeat(5000)] }),
    );
    assert.deepEqual(loadHiddenProjects('claude'), [APP]);
  });

  it('refuses an id that is empty or absurdly long', () => {
    assert.throws(() => setProjectHidden('claude', '', true));
    assert.throws(() => setProjectHidden('claude', 'x'.repeat(MAX_PROJECT_ID_LENGTH + 1), true));
    assert.deepEqual(loadHiddenProjects('claude'), []);
  });

  it('leaves no temporary file behind', () => {
    setProjectHidden('claude', APP, true);
    assert.deepEqual(fs.readdirSync(dir), ['hidden-projects.json']);
  });
});

describe('isSameOrigin', () => {
  const request = (headers: Record<string, string>) =>
    // `host` is a forbidden header for a browser, not for this constructor.
    new Request('http://127.0.0.1:7842/api/hidden-projects/claude', { method: 'PUT', headers });

  it('accepts a write from the page itself, on localhost or the LAN', () => {
    assert.equal(
      isSameOrigin(request({ origin: 'http://127.0.0.1:7842', host: '127.0.0.1:7842' })),
      true,
    );
    assert.equal(
      isSameOrigin(request({ origin: 'http://192.168.1.20:7842', host: '192.168.1.20:7842' })),
      true,
    );
  });

  it('refuses a write another site asked a browser to make', () => {
    assert.equal(
      isSameOrigin(request({ origin: 'http://evil.example', host: '127.0.0.1:7842' })),
      false,
    );
    // Same host, different port: another local app is another origin.
    assert.equal(
      isSameOrigin(request({ origin: 'http://127.0.0.1:7843', host: '127.0.0.1:7842' })),
      false,
    );
    assert.equal(isSameOrigin(request({ origin: 'null', host: '127.0.0.1:7842' })), false);
  });

  it('lets a client with no Origin through to the cookie check', () => {
    assert.equal(isSameOrigin(request({ host: '127.0.0.1:7842' })), true);
  });
});
