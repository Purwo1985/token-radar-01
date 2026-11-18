// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, plus a model sandbox that re-scores the page live. No network:
// every byte it shows is in data.js.
//
// The model in this file is the same arithmetic main.ts writes to board.json: the page recomputes a
// row from the snapshot figures and checks the number board.json carries, so the page's code and the
// board's data are visibly the same arithmetic. The farm plan is the same derivation too: category,
// chains, TVL and age decide the action, the capital, the hold and every cost and time. No name is
// special-cased. The pure functions are also exposed as window.__radarFns so a test can check the
// page's steps against board.json row for row.
(function () {
  'use strict';

  var PAGE_SIZE = 50;

  // ---- the model, pure functions -------------------------------------------

  function clampGrowth(g, model) {
    return Math.min(model.growth_cap, Math.max(model.growth_floor, g === null || g === undefined ? 0 : g));
  }
  function impliedOf(row, model, multiples, globalMultiple, useMultiples) {
    var catMult = useMultiples === false ? 0.25 : (row.category !== null && multiples && Object.prototype.hasOwnProperty.call(multiples, row.category) ? multiples[row.category] : globalMultiple);
    var growth = clampGrowth(row.change_7d, model);
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return { implied: Math.max(1, Math.round(row.tvl_usd * catMult * growthMult * maturity)), categoryMultiple: catMult, growthPct: growth, growthMult: growthMult, maturityMult: maturity };
  }
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return '$4–$9 of gas per transaction';
    if (c === 'solana') return 'under $0.05 of gas per transaction';
    if (c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'polygon' || c === 'binance' ||
        c === 'avalanche' || c === 'berachain' || c === 'monad' || c === 'plasma' || c === 'hyperliquid l1' ||
        c === 'zksync' || c === 'linea' || c === 'blast' || c === 'scroll' || c === 'mantle' || c === 'mode') {
      return '$0.05–$0.50 of gas per transaction';
    }
    return '$0.50–$2 of gas per transaction';
  }
  function gasMid(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 6.5;
    if (c === 'solana') return 0.03;
    if (c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'polygon' || c === 'binance' ||
        c === 'avalanche' || c === 'berachain' || c === 'monad' || c === 'plasma' || c === 'hyperliquid l1' ||
        c === 'zksync' || c === 'linea' || c === 'blast' || c === 'scroll' || c === 'mantle' || c === 'mode') {
      return 0.25;
    }
    return 1.25;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one position on a ' + name + ' market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow $10 against the supply on ' + name + ', then repay it the same week so the position shows both sides.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap $10 through the ' + name + ' pool on ' + chain + ' so the wallet shows trading volume as well as liquidity.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 back through ' + name + ' so the wallet shows activity in both directions.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Claim or restake the first staking rewards on ' + name + ' instead of leaving them untouched.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Close the hedge on ' + name + ', then open a fresh one half the size so the wallet shows repeat trading.';
    if (c.indexOf('prediction') >= 0) return 'Place a second $5 position on a different ' + name + ' market to show breadth, not a single bet.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Move $25 of the deposit to a second ' + name + ' vault on ' + chain + ' so the wallet touches two vaults.';
    if (c.indexOf('stable') >= 0) return 'Swap $10 of the stable asset through ' + name + ' so the wallet shows use, not only a mint.';
    if (c.indexOf('rwa') >= 0) return 'Check the yield accrual on the ' + name + ' position and reinvest the first payout instead of withdrawing it.';
    if (c.indexOf('insurance') >= 0) return 'Extend the ' + name + ' cover by one week so the wallet shows a renewal, not a single purchase.';
    return 'Use a second feature of ' + name + ' on ' + chain + ', such as a swap or a vote, with $10.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'no cost to create, about ' + gas + ' for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gas, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about ' + gas, time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about ' + gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, and plan the unwind before the token launches so you are not rushed.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  window.__radarFns = { impliedOf: impliedOf, farmSteps: farmSteps, capitalFor: capitalFor, gasFor: gasFor, gasMid: gasMid, holdDaysFor: holdDaysFor };

  // ---- page state ----------------------------------------------------------

  var DATA = window.RADAR;
  if (!DATA) return;
  var DEFAULTS = { growth_weight: DATA.model.growth_weight, maturity_floor: DATA.model.maturity_floor, useMultiples: true };
  var state = {
    q: '', category: 'all', minTvl: 0, growth: 'all', watchOnly: false,
    tab: 'pre-token', sort: 'implied', dir: -1, page: 1, selected: null,
    sandbox: { growth_weight: DEFAULTS.growth_weight, maturity_floor: DEFAULTS.maturity_floor, useMultiples: true }
  };
  var app = document.getElementById('board');

  function sandboxActive() {
    return state.sandbox.growth_weight !== DEFAULTS.growth_weight ||
      state.sandbox.maturity_floor !== DEFAULTS.maturity_floor ||
      state.sandbox.useMultiples !== DEFAULTS.useMultiples;
  }
  function sandboxModel() {
    return {
      growth_weight: state.sandbox.growth_weight, growth_floor: DATA.model.growth_floor, growth_cap: DATA.model.growth_cap,
      maturity_floor: state.sandbox.maturity_floor, maturity_range: DATA.model.maturity_range,
      maturity_days: DATA.model.maturity_days, unknown_age_days: DATA.model.unknown_age_days
    };
  }
  function shownImplied(row) {
    if (!sandboxActive()) return row.implied_value_usd;
    return impliedOf(row, sandboxModel(), DATA.multiples, DATA.global_multiple, state.sandbox.useMultiples).implied;
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('minTvl')) state.minTvl = Number(params.get('minTvl')) || 0;
    if (params.get('growth')) state.growth = params.get('growth');
    if (params.get('watch') === '1') state.watchOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.minTvl) params.set('minTvl', String(state.minTvl));
    if (state.growth !== 'all') params.set('growth', state.growth);
    if (state.watchOnly) params.set('watch', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (state.growth === 'growing' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'falling' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    var active = sandboxActive();
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = active ? shownImplied(a) : a.implied_value_usd; bv = active ? shownImplied(b) : b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more pre-token protocols below that floor, every one the snapshot can rank. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function movers() {
    var top = DATA.rows.filter(function (r) { return r.change_7d !== null; })
      .sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    return el('section', { class: 'movers' },
      el('h2', { text: 'Fastest growing this week' }),
      el('ol', null, top.map(function (r) {
        return el('li', null,
          el('span', { text: '#' + r.rank + ' ' }),
          el('b', { text: r.name }),
          el('span', { class: 'pos', text: ' ' + fmtPct(r.change_7d) }),
          el('span', { class: 'sub', text: ' · ' + fmtUsd(r.implied_value_usd) + ' implied' })
        );
      }))
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; state.page = 1; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; state.page = 1; writeHash(); render(); });
    var tvl = el('select', { id: 'minTvl', 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['50000000', 'TVL $50M+'], ['100000000', 'TVL $100M+'], ['500000000', 'TVL $500M+'], ['1000000000', 'TVL $1B+']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: Number(o[0]) === state.minTvl ? 'selected' : null });
      })
    );
    tvl.addEventListener('change', function () { state.minTvl = Number(tvl.value); state.page = 1; writeHash(); render(); });
    var growth = el('select', { id: 'growth', 'aria-label': 'Filter by growth' },
      [['all', 'Any growth'], ['growing', 'Growing (7d +)'], ['falling', 'Falling (7d -)']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.growth ? 'selected' : null });
      })
    );
    growth.addEventListener('change', function () { state.growth = growth.value; state.page = 1; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watch.addEventListener('change', function () { state.watchOnly = watch.checked; state.page = 1; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; state.page = 1; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; state.page = 1; render(); } });
    var count = state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'minTvl', text: 'Size' }), tvl),
      el('div', { class: 'field' }, el('label', { for: 'growth', text: '7-day growth' }), growth),
      el('label', { class: 'check', for: 'watch' }, watch, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: count })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col', class: key === 'tvl' || key === 'growth' || key === 'age' || key === 'implied' ? 'num' : null },
      el('button', { type: 'button', class: 'sortbtn', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    var active = sandboxActive();
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.minTvl = 0; state.growth = 'all'; state.watchOnly = false; state.page = 1; writeHash(); render(); } })
      ));
    }
    var pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var pageRows = list.slice(start, start + PAGE_SIZE);
    var max = 1;
    list.forEach(function (r) { max = Math.max(max, active ? shownImplied(r) : r.implied_value_usd); });
    var tbody = el('tbody');
    pageRows.forEach(function (r) {
      var shownRank = active ? list.indexOf(r) + 1 : r.rank;
      var shownValue = active ? shownImplied(r) : r.implied_value_usd;
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(shownRank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', null, r.name, r.watchlist ? el('span', { class: 'badge', text: 'WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownValue / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownValue) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var pager = el('div', { class: 'pager' },
      el('span', { text: 'Showing ' + (start + 1) + '–' + Math.min(start + PAGE_SIZE, list.length) + ' of ' + list.length + ' rows' + (active ? ' · sandbox values' : '') }),
      el('button', { class: 'button', type: 'button', text: 'Previous', disabled: state.page <= 1 ? 'disabled' : null, onclick: function () { if (state.page > 1) { state.page--; render(); } } }),
      el('button', { class: 'button', type: 'button', text: 'Next', disabled: state.page >= pages ? 'disabled' : null, onclick: function () { if (state.page < pages) { state.page++; render(); } } })
    );
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: active ? 'Sandbox view: implied values recomputed with your settings below. Select a row for its model and farm plan.' : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      ),
      pager
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(2) + 'x' }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market-cap / TVL ratios are the comparables the category multiples come from. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multRows = Object.keys(DATA.multiples).sort(function (a, b) { return DATA.multiples[b] - DATA.multiples[a]; }).map(function (c) {
      return el('tr', null, el('td', { text: c }), el('td', { class: 'num', text: DATA.multiples[c].toFixed(3) + 'x' }));
    });
    var gw = el('input', { type: 'range', id: 'sb-growth', min: '0', max: '1', step: '0.05', value: String(state.sandbox.growth_weight), 'aria-label': 'Growth weight' });
    gw.addEventListener('input', function () { state.sandbox.growth_weight = Number(gw.value); state.page = 1; render(); });
    var mf = el('input', { type: 'range', id: 'sb-maturity', min: '0.4', max: '0.9', step: '0.05', value: String(state.sandbox.maturity_floor), 'aria-label': 'Maturity floor' });
    mf.addEventListener('input', function () { state.sandbox.maturity_floor = Number(mf.value); state.page = 1; render(); });
    var cm = el('input', { type: 'checkbox', id: 'sb-mult', checked: state.sandbox.useMultiples ? 'checked' : null, 'aria-label': 'Use live category multiples' });
    cm.addEventListener('change', function () { state.sandbox.useMultiples = cm.checked; state.page = 1; render(); });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The category multiple is the median market-cap / TVL of the live-token protocols in the same category, computed from this snapshot at run time; a category with fewer than ' + m.min_category_sample + ' live comparables uses the snapshot-wide median of ' + DATA.global_multiple.toFixed(3) + 'x. Multiples are clamped to ' + m.multiple_floor + '–' + m.multiple_cap + 'x.' }),
      el('table', { class: 'mult-table' },
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live multiple' }))),
        el('tbody', null, multRows)
      ),
      el('div', { class: 'sandbox' },
        el('h3', { text: 'Model sandbox — re-score the board live' }),
        el('p', { class: 'sub', text: 'Move a slider and the table above re-ranks with your settings. The submitted board uses the defaults; the sandbox changes this page only.' }),
        el('div', { class: 'grid' },
          el('div', null, el('label', { for: 'sb-growth' }, 'Growth weight: ', el('b', { text: state.sandbox.growth_weight.toFixed(2) })), gw),
          el('div', null, el('label', { for: 'sb-maturity' }, 'Maturity floor: ', el('b', { text: state.sandbox.maturity_floor.toFixed(2) })), mf),
          el('label', { class: 'check', for: 'sb-mult' }, cm, 'Use live category multiples (off: flat 0.25x)')
        ),
        el('div', { class: 'row' },
          el('button', { class: 'button', type: 'button', text: 'Reset to the submitted model', onclick: function () { state.sandbox = { growth_weight: DEFAULTS.growth_weight, maturity_floor: DEFAULTS.maturity_floor, useMultiples: true }; state.page = 1; render(); } }),
          sandboxActive() ? el('span', { class: 'sandbox-note', text: 'Sandbox view is on: the table shows your recomputed values, not the submitted board.' }) : null
        )
      )
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', { text: 'Method: the snapshot is DefiLlama\u2019s public protocol index as fetched on ' + DATA.as_of + '. "No token" means the record carries no token, never that the protocol has none. Wrapped, staked and bridged products and exchange listings are left out of the ranking, as the watchlist leaves them out.' }),
      el('p', { text: 'Implied value is this entry\u2019s own model, not a price and not a prediction that a token is issued, or when. Airdrops are never guaranteed; never pay to claim one.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, DATA.multiples, DATA.global_multiple, true);
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var gasTx = Math.round((3 + Math.ceil(hold / 7)) * gasMid(chain) * 100) / 100;
    var multNote = row.category !== null && Object.prototype.hasOwnProperty.call(DATA.multiples, row.category)
      ? 'median market-cap / TVL of the live ' + row.category + ' protocols in this snapshot'
      : 'snapshot-wide median: too few live ' + (row.category || 'Other') + ' comparables';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · on the watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: row.category_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub why', text: 'Why this rank: ' + fmtUsd(row.tvl_usd) + ' of TVL x ' + row.category_multiple.toFixed(3) + 'x (' + multNote + ') x ' + row.growth_multiplier + ' growth x ' + row.maturity_multiplier + ' maturity = ' + fmtUsd(row.implied_value_usd) + '.' }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed.implied) + (recomputed.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      })),
      el('div', { class: 'farm-total', text: 'Out of pocket: about $' + gasTx.toFixed(2) + ' of gas in total on ' + chain + ' (' + (3 + Math.ceil(hold / 7)) + ' transactions across the ' + hold + '-day hold). The $' + capital + ' of capital stays in the position and is recoverable.' }),
      el('p', { class: 'risk', text: 'Records no token — not proof it has none. A token may never be issued, and a farm plan is never a guarantee of an airdrop. Never pay to claim, and never share a seed phrase.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(movers());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
