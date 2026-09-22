import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RAIL_INIT_SCRIPT, RAIL_STORAGE_KEY } from '../src/lib/rail';

/**
 * Runs the before-paint script against a stand-in <html> and storage, and
 * returns the `data-rail` it left behind.
 */
function railAfterInit(stored: string | null | Error): string | undefined {
  const dataset: Record<string, string> = {};
  const document = { documentElement: { dataset } };
  const localStorage = {
    getItem(key: string) {
      if (stored instanceof Error) throw stored;
      return key === RAIL_STORAGE_KEY ? stored : null;
    },
  };
  new Function('document', 'localStorage', RAIL_INIT_SCRIPT)(document, localStorage);
  return dataset.rail;
}

describe('the rail before first paint', () => {
  it('starts collapsed when this browser has never chosen', () => {
    assert.equal(railAfterInit(null), 'collapsed');
  });

  it('stays expanded for a browser that chose it', () => {
    assert.equal(railAfterInit('expanded'), undefined);
  });

  it('stays collapsed for a browser that chose that', () => {
    assert.equal(railAfterInit('collapsed'), 'collapsed');
  });

  it('falls back to collapsed when storage is blocked, rather than breaking', () => {
    assert.equal(railAfterInit(new Error('SecurityError')), 'collapsed');
  });

  it('reads a key the old expanded-by-default rail never wrote', () => {
    // The old key could hold 'expanded' from before the default changed, which
    // would have kept those browsers expanded for good.
    assert.notEqual(RAIL_STORAGE_KEY, 'aiusage.rail');
  });
});
