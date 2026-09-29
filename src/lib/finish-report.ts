import { withHistory } from './history';
import {
  describeRates,
  loadModelSettings,
  RATE_CARD_FILES,
  withCustomRates,
} from './model-settings';
import { loadPricing } from './pricing';
import type { UsageReport } from './types';

/**
 * The last step of every parse, shared by the API route and the dump scripts
 * so that `npm run parse` still writes exactly what the page receives: fold in
 * the archive (re-pricing its days at today's rates), then say where each
 * model's rate came from.
 */
export function finishReport(report: UsageReport): UsageReport {
  const provider = report.provider ?? 'claude';
  const card = loadPricing(RATE_CARD_FILES[provider]);
  const custom = loadModelSettings(provider).pricing;
  const finished = withHistory(report, withCustomRates(card, custom));
  return {
    ...finished,
    modelRates: describeRates(card, custom, Object.keys(finished.global.perModel)),
  };
}
