import path from 'node:path';

/**
 * The folder this app writes its own state into: the daily archives and the
 * list of projects you have hidden. Gitignored.
 *
 * `DASHBOARD_DATA_DIR` moves it, and anything that reads transcripts that are
 * not yours must set it - see `historyPath()` for what goes wrong otherwise.
 * Everything written here goes through this one function, so a demo run moves
 * all of it at once rather than moving the archive and leaving the rest behind.
 */
export function dataDir(): string {
  return process.env.DASHBOARD_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
}
