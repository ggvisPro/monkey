// ==UserScript==
// @name         语雀表格智能排版
// @namespace    https://github.com/ggvisPro/monkey
// @version      1.1.0
// @description  在语雀原生表格菜单注入智能排版，一键按内容调整任意列数，支持恢复；保存更新由用户操作。
// @author       ggvisPro
// @match        https://aliyuque.antfin.com/*
// @match        https://yuque.alibaba-inc.com/*
// @match        https://yuque.com/*
// @match        https://*.yuque.com/*
// @grant        none
// @sandbox      raw
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const LIMITS = { columns: 256, cells: 50000, samples: 100, chars: 8000 };
  const DENSITY = { compact: { lines: 6, min: 64, max: 420 }, balanced: { lines: 4, min: 80, max: 560 }, spacious: { lines: 2.5, min: 96, max: 720 } };
  const sum = a => a.reduce((n, x) => n + x, 0);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Physical cellIndex is not the logical column index when there are merged cells.
  function gridOf(table) {
    const rows = Array.from(table.rows).filter(r => r.closest('table') === table);
    const occupied = [], cells = [];
    let columns = 0;
    rows.forEach((row, r) => {
      let c = 0;
      for (const cell of row.cells) {
        while ((occupied[c] || 0) > r) c++;
        const span = Math.max(1, cell.colSpan || 1);
        let down = cell.rowSpan;
        if (down === 0) {
          down = 1;
          while (r + down < rows.length && rows[r + down].parentElement === row.parentElement) down++;
        }
        down = Math.max(1, Math.min(down || 1, rows.length - r));
        if (c + span > LIMITS.columns || cells.length >= LIMITS.cells) throw new Error('表格超过处理上限（256 列 / 50000 个已加载单元格）。请分段处理。');
        for (let j = c; j < c + span; j++) {
          if ((occupied[j] || 0) > r) throw new Error('合并单元格相互重叠，已停止排版。');
          occupied[j] = r + down;
        }
        cells.push({ el: cell, row: r, col: c, span, down });
        c += span;
        columns = Math.max(columns, c);
      }
    });
    if (!columns) throw new Error('这张表暂时没有已加载的单元格。');
    return { rows, cells, columns };
  }

  // Bounded proportional allocation, using content demand rather than equal shares.
  function allocate(minimum, preferred, maximum, target) {
    const widths = minimum.slice();
    let remaining = Math.max(0, target - sum(widths));
    for (const caps of [preferred, maximum]) {
      const gaps = caps.map((cap, i) => Math.max(0, cap - widths[i]));
      const need = sum(gaps);
      if (!need || !remaining) continue;
      const ratio = Math.min(1, remaining / need);
      gaps.forEach((gap, i) => { widths[i] += gap * ratio; });
      remaining -= need * ratio;
    }
    const rounded = widths.map(Math.floor);
    let extra = Math.round(sum(widths)) - sum(rounded);
    const order = widths.map((x, i) => ({ i, fraction: x - rounded[i] })).sort((a, b) => b.fraction - a.fraction);
    for (const { i } of order) if (extra-- > 0) rounded[i]++;
    return rounded;
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * q)];
  }

  function planWidths(grid, measure, options) {
    const mode = DENSITY[options.density] || DENSITY.balanced;
    const minimum = Array(grid.columns).fill(mode.min);
    const preferred = minimum.slice(), maximum = minimum.map(x => x * 1.4);
    const labels = Array.from({ length: grid.columns }, (_, i) => `第 ${i + 1} 列`);
    const buckets = Array.from({ length: grid.columns }, () => []), merged = [];
    for (const cell of grid.cells) {
      (cell.span === 1 ? buckets[cell.col] : merged).push(cell);
    }
    let sampled = 0;
    const measurements = new Map();
    const metric = cell => {
      if (!measurements.has(cell)) { measurements.set(cell, measure(cell, mode)); sampled++; }
      return measurements.get(cell);
    };
    buckets.forEach((bucket, i) => {
      if (!bucket.length) return;
      const chosen = new Set(bucket.slice(0, 3));
      // Uniform samples + longest entries + media. One unusually long late row is retained.
      const count = Math.min(LIMITS.samples, bucket.length);
      for (let j = 0; j < count; j++) chosen.add(bucket[Math.floor(j * bucket.length / count)]);
      bucket.slice().sort((a, b) => b.el.textContent.length - a.el.textContent.length).slice(0, 4).forEach(c => chosen.add(c));
      bucket.filter(c => c.el.querySelector('img,svg,video,canvas')).slice(0, 4).forEach(c => chosen.add(c));
      const metrics = [...chosen].map(metric);
      const first = bucket[0].el.textContent.trim();
      if (first) labels[i] = first.replace(/\s+/g, ' ').slice(0, 32);
      minimum[i] = Math.max(mode.min, ...metrics.map(m => m.min));
      preferred[i] = Math.max(minimum[i], quantile(metrics.map(m => m.preferred), 0.85), Math.max(...metrics.map(m => m.preferred)) * 0.75);
      maximum[i] = Math.max(preferred[i], ...metrics.map(m => m.max));
    });
    // colspan constrains the SUM of covered columns; it never becomes a phantom column.
    merged.forEach(cell => {
      const m = metric(cell);
      for (const [values, required] of [[minimum, m.min], [preferred, m.preferred], [maximum, m.max]]) {
        const existing = sum(values.slice(cell.col, cell.col + cell.span));
        if (existing < required) for (let c = cell.col; c < cell.col + cell.span; c++) values[c] += (required - existing) / cell.span;
      }
    });
    for (let i = 0; i < grid.columns; i++) {
      minimum[i] = Math.ceil(minimum[i]);
      preferred[i] = Math.max(minimum[i], preferred[i]);
      maximum[i] = Math.max(preferred[i], maximum[i]);
    }
    // Once horizontal scrolling is unavoidable, spend enough width for readable content.
    // Returning all minima here would make a 30-column table narrow AND need scrolling.
    const target = options.content || sum(minimum) > options.width ? sum(preferred) : options.width;
    const widths = allocate(minimum, preferred, maximum, target);
    return { widths, minimum, preferred, maximum, labels, sampled, overflow: sum(widths) > options.width + 1 };
  }

  // The adapter follows Lakex 1.71.0's renderer reference and native commands.
  // No document replacement, synthetic input, DOM-to-model guessing or save clicks.
  function nativeAdapter(table) {
    if (!table.isConnected || !table.isContentEditable) return null;
    let el = table;
    while (el && !el.matches('.ne-engine')) {
      const ref = el._neRef;
      const view = ref?.viewNode || ref;
      const vnode = view?._virtualNode || (ref?.renderer ? ref : null);
      const renderer = vnode?.renderer;
      if (view?.nodeName === 'table' && Array.isArray(view.attrs?.colWidths) && typeof renderer?.execCommand === 'function') {
        const id = view.attrs.id || view.id;
        if (!id || (table.id && table.id !== id)) return null;
        const supported = renderer.kernel?.queryCommandSupported;
        if (typeof supported === 'function' && !['tableColumnWidth', 'tableColumnAdaptation'].every(n => supported.call(renderer.kernel, n))) return null;
        return {
          id,
          read: () => {
            const live = table.isConnected ? table : table.ownerDocument.getElementById(id);
            const current = live && nativeAdapter(live);
            if (!current) throw new Error('表格已移除或编辑器引用已失效，请重新点击智能排版。');
            const attrs = current.attrs;
            return { widths: Array.from(attrs.colWidths, Number), fit: !!attrs.fitWidth };
          },
          attrs: view._modelNode?.attrs || view.attrs,
          exec: (name, ...args) => renderer.execCommand(name, id, ...args),
        };
      }
      el = el.parentElement;
    }
    return null;
  }

  function sameWidths(a, b) { return a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1); }

  async function writeNative(adapter, target) {
    let state = adapter.read();
    if (state.widths.length !== target.widths.length) throw new Error('列数已变化，请重新点击智能排版。');
    // fitWidth resizes adjacent columns; turn it off before assigning independent widths.
    if (state.fit && await adapter.exec('tableColumnAdaptation') === false) throw new Error('编辑器拒绝切换列宽模式。');
    for (let i = 0; i < target.widths.length; i++) {
      const width = target.widths[i];
      if (Math.abs(state.widths[i] - width) < 1) continue;
      if (await adapter.exec('tableColumnWidth', i, width, state.widths.slice()) === false) throw new Error(`第 ${i + 1} 列未能应用。`);
      state.widths[i] = width;
      // Yield on wide tables so the editor can paint and process its normal transaction queue.
      if (i % 12 === 11) await sleep(0);
    }
    if (target.fit && await adapter.exec('tableColumnAdaptation') === false) throw new Error('编辑器拒绝恢复自适应模式。');
    for (let i = 0; i < 8; i++) {
      await sleep(60);
      const readback = adapter.read();
      if (sameWidths(readback.widths, target.widths) && readback.fit === target.fit) return;
    }
    throw new Error('编辑器列宽回读不一致，不能确认应用成功。');
  }

  // Export pure logic only when required from Node; normal userscript has no global API.
  if (typeof module === 'object' && module.exports && typeof document === 'undefined') {
    module.exports = { gridOf, allocate, planWidths, nativeAdapter, writeNative, sameWidths };
    return;
  }
  const STYLE_ID = 'yuque-smart-table-menu-style';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ne-card-toolbar [data-yq-smart]{font:inherit;color:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;border:0;background:transparent;cursor:pointer;flex-shrink:0;padding:6px 9px;border-radius:4px;line-height:1.4}
    .ne-card-toolbar [data-yq-smart]:hover{background:rgba(127,127,127,.12)}
    .ne-card-toolbar [data-yq-smart]:focus-visible{outline:2px solid #1677ff;outline-offset:-2px}
    .ne-card-toolbar [data-yq-smart]:disabled{opacity:.45;cursor:not-allowed}
    .ne-card-toolbar [data-yq-smart][hidden]{display:none!important}
    .ne-card-toolbar [data-yq-smart] svg{width:20px;height:20px;flex:none}
    #yuque-smart-table-notice{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483000;max-width:min(600px,90vw);padding:10px 16px;border-radius:7px;background:#292929;color:white;font:14px/1.5 sans-serif;box-shadow:0 3px 16px #0002;pointer-events:none}
  `;
  document.head.appendChild(style);
  const applied = new WeakMap();
  let busy = false, queued = false, stopped = false, noticeTimer;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const textOf = cell => (cell.innerText || cell.textContent || '').replace(/[\u200b\ufeff]/g, '').trim();

  function notify(message) {
    let box = document.getElementById('yuque-smart-table-notice');
    if (!box) { box = document.createElement('div'); box.id = 'yuque-smart-table-notice'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    box.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => box.remove(), 6000);
  }

  function currentTable(toolbar) {
    const scope = toolbar.closest('.ne-editor-wrap,.ne-editor-body') || document;
    const focused = [...new Set(scope.querySelectorAll('ne-table-wrap.ne-table-focus table.ne-table,ne-table-wrap.ne-focused table.ne-table'))]
      .filter(t => t.isConnected && t.getBoundingClientRect().width > 0 && !t.parentElement.closest('table'));
    if (focused.length === 1) return focused[0];
    if (focused.length > 1) return null; // Never guess between two selected tables.
    const anchor = document.getSelection()?.anchorNode;
    const el = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
    const table = el?.closest('table.ne-table');
    return table && scope.contains(table) ? table : null;
  }

  function availableWidth(table) {
    const engine = table.closest('.ne-engine,.ne-viewer,.lake-content,.lake-content-editor,.lake-content-viewer');
    const box = engine || table.parentElement;
    const style = getComputedStyle(box);
    return Math.max(240, Math.floor(box.getBoundingClientRect().width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)));
  }

  function measureCell(cell, density) {
    const el = cell.el, cs = getComputedStyle(el);
    const font = parseFloat(cs.fontSize) || 14;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${font}px ${cs.fontFamily}`;
    const spacing = parseFloat(cs.letterSpacing) || 0;
    const measure = text => ctx.measureText(text).width + Math.max(0, [...text].length - 1) * spacing;
    const text = textOf(el).slice(0, LIMITS.chars);
    const lines = text.split(/\n+/);
    const widths = lines.map(measure);
    const padding = Math.max(20, (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 2);
    const unwrapped = Math.max(0, ...widths) + padding;
    const media = Array.from(el.querySelectorAll('img,svg,video,canvas')).filter(m => m.closest('table') === el.closest('table'));
    const mediaWidth = Math.max(0, ...media.map(m => clamp(m.getBoundingClientRect().width || 180, 120, density.max)));
    const header = cell.row === 0 || el.tagName === 'TH';
    const longestWord = Math.max(0, ...((text.match(/[A-Za-z0-9_./:@-]+/g) || []).map(s => measure(s.slice(0, 30)))));
    const min = Math.max(density.min, header ? Math.min(unwrapped, 160) : Math.min(longestWord + padding, 145), media.length ? 140 : 0);
    const desired = Math.max(Math.min(unwrapped, 180), sum(widths) / density.lines + padding, mediaWidth + padding);
    return { min, preferred: clamp(desired, min, density.max), max: Math.max(min, Math.min(density.max, Math.max(unwrapped, mediaWidth + padding))) };
  }

  async function apply(toolbar, restore = false) {
    if (busy) return;
    // Resolve at click time, not when the menu was first mounted or previously used.
    const table = currentTable(toolbar);
    if (!table) { notify('请先选中需要排版的表格。'); return; }
    const adapter = nativeAdapter(table);
    if (!adapter) { notify('当前编辑器接口不可用，请进入编辑态后再试。'); return; }
    const record = applied.get(table);
    if (restore && !record) return;
    let before;
    try {
      const grid = gridOf(table);
      const state = adapter.read();
      if (restore && (!sameWidths(state.widths, record.after.widths) || state.fit !== record.after.fit)) throw new Error('列宽已被后续编辑修改，未覆盖。请使用语雀撤销功能。');
      const target = restore ? record.before : { widths: planWidths(grid, measureCell, { density: 'balanced', width: availableWidth(table) }).widths, fit: false };
      if (target.widths.length !== grid.columns || state.widths.length !== grid.columns) throw new Error('表格列数与编辑器不一致，请等待加载后重试。');
      if (!target.widths.every(w => Number.isFinite(w) && w >= 1 && w <= 40000)) throw new Error('列宽数据无效。');
      before = state;
      busy = true; refresh();
      await writeNative(adapter, target);
      const live = table.isConnected ? table : table.ownerDocument.getElementById(adapter.id);
      if (!live) throw new Error('表格已离开页面，请返回后检查列宽。');
      applied.delete(table);
      if (!restore) applied.set(live, { before: record?.before || before, after: target });
      notify(restore ? '已恢复排版前列宽。' : `已智能排版 ${target.widths.length} 列，请直接查看原表。`);
    } catch (e) {
      let recovery = '';
      if (before && busy) {
        try { await writeNative(adapter, before); recovery = ' 已回退本次列宽变更。'; }
        catch { recovery = ' 自动回退未确认，请检查原表并使用语雀撤销。'; }
      }
      notify(e.message + recovery);
    } finally { busy = false; refresh(); }
  }

  function makeButton(toolbar, kind) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.yqSmart = kind;
    button.className = 'ne-card-toolbar-item ne-card-toolbar-item-has-title';
    if (kind === 'layout') {
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 11h18M8 11v10M16 11v10M6 2v3M3 3.5h6M17 2v3M15.5 3.5h3"/></svg><span>智能排版</span>';
      button.title = '按内容直接调整当前表格列宽';
    } else {
      button.textContent = '↶'; button.title = '恢复智能排版前列宽'; button.setAttribute('aria-label', button.title);
    }
    // Keep the editor selection and stop its overlay boundary from closing the toolbar.
    for (const event of ['pointerdown', 'mousedown']) button.addEventListener(event, e => { e.preventDefault(); e.stopPropagation(); });
    button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); apply(toolbar, kind === 'restore'); });
    return button;
  }

  function refresh() {
    for (const toolbar of document.querySelectorAll('.ne-card-toolbar')) {
      // Verified on the actual Yuque table toolbar. Never inject into image/code toolbars.
      const anchor = toolbar.querySelector('[data-testid="ne-card-toolbar-item-columnAdaptation"]') || toolbar.querySelector('[data-testid="ne-card-toolbar-item-equallyColumn"]');
      if (!anchor) continue;
      let button = toolbar.querySelector('[data-yq-smart="layout"]');
      if (!button) { button = makeButton(toolbar, 'layout'); anchor.after(button); }
      let restore = toolbar.querySelector('[data-yq-smart="restore"]');
      if (!restore) { restore = makeButton(toolbar, 'restore'); button.after(restore); }
      const table = currentTable(toolbar);
      button.disabled = busy || !table || !nativeAdapter(table);
      restore.disabled = button.disabled;
      restore.hidden = !table || !applied.has(table);
      const label = busy ? '排版中…' : '智能排版';
      if (button.lastElementChild.textContent !== label) button.lastElementChild.textContent = label;
    }
  }
  function schedule() {
    if (queued || stopped) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (!stopped) refresh(); });
  }
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => !m.target.closest?.('[data-yq-smart],#yuque-smart-table-notice') &&
      (m.type === 'childList' || m.target.matches?.('ne-table-wrap,.ne-card-toolbar')))) schedule();
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', event => { if (!event.persisted) { stopped = true; observer.disconnect(); clearTimeout(noticeTimer); } });
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('pointerup', schedule, true);
  refresh();
})();
