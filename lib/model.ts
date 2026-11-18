// The token radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// other pre-token protocol the snapshot can rank: the early rows the radar exists to find. A protocol
// is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); the
// live-token protocols are kept apart and shown with the market's own values, never mixed into the
// ranked board. Wrapped, staked and bridged products and exchange listings are left out of the
// ranking for the same reason the watchlist leaves them out: they are not protocols waiting on a
// launch of their own.
//
// Implied value follows only from the snapshot's own figures, in five factors:
//
//   category multiple = a comps curve where the snapshot carries enough live comparables: the
//                         log-linear fit of market-cap / TVL on TVL among the live-token
//                         protocols of the same category (at least 6), so the multiple is the one
//                         the market pays at this protocol's own size. With 3 to 5 comparables the
//                         category median is shrunk toward the snapshot-wide median; with fewer,
//                         the snapshot-wide median. Clamped to [0.05, 1.50]. No multiple is typed
//                         in; the market in the snapshot sets it.
//   growth multiplier = 1 + 0.6 x clamp(change_7d, -60, +150) / 100
//   maturity          = 0.65 + 0.35 x min(age_days, 1460) / 1460   (age unknown: 365 days)
//   chain breadth     = 1 + 0.02 x min(chains - 1, 5)              (at most 1.10)
//   implied           = round(tvl_usd x category multiple x growth multiplier x maturity x chain breadth)
//
// Age is the time since DefiLlama first listed the protocol: the best record of how long it has run
// with no token. A protocol that has grown fast, run long with no token, sits in a category the
// market already pays a high multiple for, and is live on many chains scores highest. No protocol
// name is ever special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_category_sample: number;
  /** Shrinkage prior weight: a category median is n / (n + shrink_k) its own median. */
  shrink_k: number;
  /** Live comparables needed in a category before the comps curve is fitted. */
  min_curve_sample: number;
  /** Chain-breadth step: each extra chain past the first adds this much, up to chain_cap_extra. */
  chain_step: number;
  chain_cap_extra: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.6,
  growth_floor: -60,
  growth_cap: 150,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1460,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_category_sample: 3,
  shrink_k: 3,
  min_curve_sample: 6,
  chain_step: 0.02,
  chain_cap_extra: 0.1,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 32;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    multiple_kind: 'curve' | 'median' | 'global';
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  multiple_kind: 'curve' | 'median' | 'global';
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** One live comparable for a category: the market's own numbers, not a model. */
export interface CompRow {
  slug: string;
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  mcap_tvl: number;
}

/** How one category's multiple was set, for the dashboard's multiples table. */
export interface MultipleMeta {
  kind: 'curve' | 'median' | 'global';
  /** Live comparables in the category. */
  n: number;
  /** The multiple at the $100M TVL reference size, so curve and median rows compare. */
  at_100m: number;
}

/** A category's comps curve: log10(mcap/TVL) = intercept + slope x log10(TVL). */
export interface CompsCurve {
  intercept: number;
  slope: number;
  n: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  multiples: Record<string, number>;
  curves: Record<string, CompsCurve>;
  multiple_meta: Record<string, MultipleMeta>;
  comps: Record<string, CompRow[]>;
  global_multiple: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
/** Categories that are a wrapped, staked or bridged product rather than a protocol of their own. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** Exchange names a protocol name must not begin with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool,
 *  not a wrapped, staked or bridged product of a token that already trades. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  for (const e of EXCHANGES) if (p.name.startsWith(e)) return false;
  return true;
}

/**
 * The category multiples, computed from this snapshot's own live-token protocols. For each category
 * the snapshot carries live comparables for, in order of evidence:
 *
 *   6 or more live comparables: a comps curve, the ordinary-least-squares log-linear fit of
 *     log10(market-cap / TVL) on log10(TVL), so the multiple is the one the market pays at the
 *     protocol's own size. The fitted value is clamped to [multiple_floor, multiple_cap].
 *   3 to 5 live comparables: the category median, shrunk toward the snapshot-wide median with
 *     weight n / (n + shrink_k), so a thin category does not speak louder than its evidence.
 *   fewer: the snapshot-wide median of every live market-cap / TVL ratio.
 *
 * Nothing here is typed in: the snapshot's own market sets every multiple, curve and fallback.
 */
export function categoryMultiples(
  snapshot: Snapshot,
  model: ModelConstants,
): { multiples: Record<string, number>; global: number; curves: Record<string, CompsCurve>; meta: Record<string, MultipleMeta> } {
  const byCategory = new Map<string, { tvl: number; ratio: number }[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) continue;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    all.push(ratio);
    const list = byCategory.get(p.category ?? 'Other') ?? [];
    list.push({ tvl: p.tvl_usd, ratio });
    byCategory.set(p.category ?? 'Other', list);
  }
  const clamp = (n: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, n));
  const global = all.length > 0 ? clamp(median(all)) : 0.25;
  const multiples: Record<string, number> = {};
  const curves: Record<string, CompsCurve> = {};
  const meta: Record<string, MultipleMeta> = {};
  const at100m = (curve: CompsCurve): number => clamp(Math.pow(10, curve.intercept + curve.slope * 8));
  for (const [category, points] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const ratios = points.map((pt) => pt.ratio);
    const catMedian = clamp(median(ratios));
    if (points.length >= model.min_curve_sample) {
      const xs = points.map((pt) => Math.log10(pt.tvl));
      const ys = points.map((pt) => Math.log10(pt.ratio));
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let sxx = 0;
      let sxy = 0;
      for (let i = 0; i < xs.length; i++) {
        sxx += (xs[i]! - mx) * (xs[i]! - mx);
        sxy += (xs[i]! - mx) * (ys[i]! - my);
      }
      if (sxx > 0) {
        const slope = sxy / sxx;
        const curve: CompsCurve = { intercept: my - slope * mx, slope, n: points.length };
        curves[category] = curve;
        multiples[category] = catMedian;
        meta[category] = { kind: 'curve', n: points.length, at_100m: at100m(curve) };
        continue;
      }
    }
    if (points.length >= model.min_category_sample) {
      const w = points.length / (points.length + model.shrink_k);
      multiples[category] = clamp(w * catMedian + (1 - w) * global);
      meta[category] = { kind: 'median', n: points.length, at_100m: multiples[category]! };
    } else {
      meta[category] = { kind: 'global', n: points.length, at_100m: global };
    }
  }
  return { multiples, global, curves, meta };
}

/** The multiple one category gets at one protocol's size: its comps curve when the snapshot fitted
 *  one, else the shrunk category median, else the snapshot-wide median. */
export function multipleFor(
  category: string | null,
  tvlUsd: number,
  multiples: Record<string, number>,
  curves: Record<string, CompsCurve>,
  global: number,
  model: ModelConstants,
): { multiple: number; kind: 'curve' | 'median' | 'global' } {
  if (category !== null && Object.prototype.hasOwnProperty.call(curves, category)) {
    const curve = curves[category]!;
    const fitted = Math.pow(10, curve.intercept + curve.slope * Math.log10(Math.max(1, tvlUsd)));
    return { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, fitted)), kind: 'curve' };
  }
  if (category !== null && Object.prototype.hasOwnProperty.call(multiples, category)) {
    return { multiple: multiples[category]!, kind: 'median' };
  }
  return { multiple: global, kind: 'global' };
}

/** The chain-breadth factor: each chain past the first adds chain_step, up to chain_cap_extra. */
export function chainMultiplier(chains: number, model: ModelConstants): number {
  const extra = Math.min(Math.max(chains - 1, 0), 5) * model.chain_step;
  return 1 + Math.min(extra, model.chain_cap_extra);
}

/** The five factors and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: Record<string, number>,
  curves: Record<string, CompsCurve>,
  globalMultiple: number,
): {
  implied: number;
  categoryMultiple: number;
  multipleKind: 'curve' | 'median' | 'global';
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const { multiple: categoryMultiple, kind: multipleKind } = multipleFor(protocol.category, protocol.tvl_usd, multiples, curves, globalMultiple, model);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = chainMultiplier(protocol.chains.length, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * categoryMultiple * growthMult * maturityMult * chainMult));
  return { implied, categoryMultiple, multipleKind, growthPct, growthMult, maturityMult, chainMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const { multiples, curves, global } = categoryMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no longer carries (it
  // cannot, but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other pre-token protocol the snapshot can rank, below the watchlist
  // floor or left off the list. Never a replacement for a watchlist row: a chosen protocol stays.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, multiples, curves, global);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const watchlist = new Set(snapshot.watchlist);
  const total = scored.length;
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: watchlist.has(s.p.slug),
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      category_multiple: round4(s.categoryMultiple),
      growth_pct: round4(s.growthPct),
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      multiple_kind: s.multipleKind,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, i + 1, total).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, from the chain's own fee level. */
export function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return '$4–$9 of gas per transaction';
  if (c === 'solana') return 'under $0.05 of gas per transaction';
  if (
    c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'polygon' || c === 'binance' ||
    c === 'avalanche' || c === 'berachain' || c === 'monad' || c === 'plasma' || c === 'hyperliquid l1' ||
    c === 'zksync' || c === 'linea' || c === 'blast' || c === 'scroll' || c === 'mantle' || c === 'mode'
  ) {
    return '$0.05–$0.50 of gas per transaction';
  }
  return '$0.50–$2 of gas per transaction';
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one position on a ${name} market.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different touchpoint from the first. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $10 against the supply on ${name}, then repay it the same week so the position shows both sides.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Swap $10 through the ${name} pool on ${chain} so the wallet shows trading volume as well as liquidity.`;
  if (c.includes('bridge')) return `Bridge $10 back through ${name} so the wallet shows activity in both directions.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim or restake the first staking rewards on ${name} instead of leaving them untouched.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name}, then open a fresh one half the size so the wallet shows repeat trading.`;
  if (c.includes('prediction')) return `Place a second $5 position on a different ${name} market to show breadth, not a single bet.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Move $25 of the deposit to a second ${name} vault on ${chain} so the wallet touches two vaults.`;
  if (c.includes('stable')) return `Swap $10 of the stable asset through ${name} so the wallet shows use, not only a mint.`;
  if (c.includes('rwa')) return `Check the yield accrual on the ${name} position and reinvest the first payout instead of withdrawing it.`;
  if (c.includes('insurance')) return `Extend the ${name} cover by one week so the wallet shows a renewal, not a single purchase.`;
  return `Use a second feature of ${name} on ${chain}, such as a swap or a vote, with $10.`;
}

/** A compact dollar figure for a farm step: $2.75B, $376.0M, $51.1M, $900K. */
export function compactUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}

/**
 * A protocol's farm plan: nine steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age, growth and rank), never from a
 * hand-written list of names. Gas follows the chain's fee level; capital follows TVL; the hold
 * follows age; the second step states the protocol's own numbers, so the plan is visibly about
 * this protocol and no other.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, rank: number, total: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const growth = p.change_7d === null ? 'an unreported 7-day change' : `${p.change_7d > 0 ? '+' : ''}${p.change_7d.toFixed(2)}% over 7 days`;
  const ageText = age === null ? 'an unreported listing date' : `${age} days listed`;
  const chainText = p.chains.length === 0 ? 'an unnamed chain' : p.chains.length === 1 ? chain : `${p.chains.length} chains, starting with ${chain}`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `no cost to create, about ${gas} for the first transaction`,
      time: '5 minutes',
    },
    {
      text: `Start from the numbers: ${p.name} holds ${compactUsd(p.tvl_usd)} of TVL on ${chainText}, with ${growth} and ${ageText} with no token on record, so the radar ranks it #${rank} of ${total}.`,
      cost: 'nothing to read, and the snapshot is the source',
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about ${gas}`,
      time: '10 minutes',
    },
    {
      text: `Open ${p.name}'s own docs and points page first and confirm a points or rewards program exists before you deposit any more.`,
      cost: 'nothing to check, and no program means no farm',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about ${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, and plan the unwind before the token launches so you are not rushed.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && (p.category === null || !PRODUCT_CATEGORIES.has(p.category)) && p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? Math.round((p.mcap_usd / p.tvl_usd) * 1000) / 1000 : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    multiple_kind: row.model.multiple_kind,
    watchlist: row.watchlist,
  };
}

/** The live comparables of each category the board ranks, top 5 by market cap: the evidence the
 *  multiples table and the detail view show, from the snapshot's own live-token protocols. */
export function liveComps(snapshot: Snapshot): Record<string, CompRow[]> {
  const byCategory = new Map<string, CompRow[]>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) continue;
    if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) continue;
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const list = byCategory.get(p.category ?? 'Other') ?? [];
    list.push({ slug: p.slug, name: p.name, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, mcap_tvl: Math.round(ratio * 1000) / 1000 });
    byCategory.set(p.category ?? 'Other', list);
  }
  const out: Record<string, CompRow[]> = {};
  for (const [category, rows] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    out[category] = rows.sort((a, b) => b.mcap_usd - a.mcap_usd).slice(0, 5);
  }
  return out;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const { multiples, curves, meta, global } = categoryMultiples(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    multiples,
    curves,
    multiple_meta: meta,
    comps: liveComps(snapshot),
    global_multiple: global,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
