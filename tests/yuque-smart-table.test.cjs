// Run with Node >= 18 and jsdom available on NODE_PATH (see README).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const tool = require('../yuque-smart-table.user.js');
const script = readFileSync(require.resolve('../yuque-smart-table.user.js'), 'utf8');
const html = body => new JSDOM(`<div class="ne-engine" contenteditable="true">${body}</div>`);
const tableOf = body => html(`<table>${body}</table>`).window.document.querySelector('table');
const metric = ({ el }) => {
  const len = el.textContent.length;
  return { min: 70, preferred: Math.min(500, 70 + len * 7), max: Math.min(600, 90 + len * 10) };
};

test('2, 4, 12, 30, 100 columns: long content gets space; minima and finite widths survive', () => {
  for (const n of [2, 4, 12, 30, 100]) {
    const t = tableOf(`<tr>${Array.from({ length: n }, (_, i) => `<td>${i === n - 1 ? '长内容'.repeat(50) : '短'}</td>`).join('')}</tr>`);
    const grid = tool.gridOf(t);
    const p = tool.planWidths(grid, metric, { density: 'balanced', width: Math.max(750, n * 120) });
    assert.equal(grid.columns, n);
    assert.equal(p.widths.length, n);
    assert(p.widths.every((w, i) => Number.isInteger(w) && w >= p.minimum[i]));
    assert(p.widths.at(-1) > p.widths[0]);
  }
});

test('too many columns overflow instead of shrinking to unreadable widths', () => {
  const grid = tool.gridOf(tableOf(`<tr>${'<td>项目</td>'.repeat(29)}<td>${'长段落'.repeat(50)}</td></tr>`));
  const p = tool.planWidths(grid, metric, { width: 750 });
  assert(p.overflow);
  assert(p.widths.every(w => w >= 80));
  assert(p.widths[29] > p.widths[0] * 2);
});

test('rowspan, colspan and rowspan=0 preserve logical coordinates', () => {
  const t = tableOf('<tbody><tr><td rowspan="0">A</td><td colspan="2">B</td></tr><tr><td>C</td><td>D</td></tr></tbody><tbody><tr><td>E</td><td>F</td><td>G</td></tr></tbody>');
  const g = tool.gridOf(t);
  assert.equal(g.columns, 3);
  assert.equal(g.cells.find(c => c.el.textContent === 'A').down, 2);
  assert.equal(g.cells.find(c => c.el.textContent === 'C').col, 1);
  assert.equal(g.cells.find(c => c.el.textContent === 'E').col, 0);
  assert.equal(g.cells.find(c => c.el.textContent === 'B').span, 2);
});

test('nested tables do not add rows or columns to their parent', () => {
  const t = tableOf('<tr><td><table><tr><td>nested</td><td>nested</td></tr></table></td><td>outer</td></tr>');
  const g = tool.gridOf(t);
  assert.equal(g.rows.length, 1);
  assert.equal(g.columns, 2);
});

test('colspan demand constrains sum of covered columns, with no added columns', () => {
  const g = tool.gridOf(tableOf('<tr><td colspan="3">long</td></tr><tr><td>a</td><td>b</td><td>c</td></tr>'));
  const p = tool.planWidths(g, c => c.span > 1 ? { min: 390, preferred: 600, max: 900 } : { min: 60, preferred: 70, max: 100 }, { width: 300 });
  assert.equal(p.widths.length, 3);
  assert(p.widths.reduce((a, b) => a + b) >= 390);
});

test('rare long content at the end of a large table is sampled', () => {
  const t = tableOf(Array.from({ length: 1000 }, (_, r) => `<tr><td>短</td><td>${r === 999 ? '说明'.repeat(200) : '短'}</td></tr>`).join(''));
  const p = tool.planWidths(tool.gridOf(t), metric, { width: 750 });
  assert(p.widths[1] > p.widths[0]);
  assert(p.sampled < 250);
});

test('bounded allocation keeps exact integer total and respects short-column caps', () => {
  const p = tool.allocate([80, 80, 80], [120, 220, 400], [120, 250, 600], 801);
  assert.equal(p.reduce((a, b) => a + b), 801);
  assert(p[0] <= 120);
  assert.deepEqual(tool.allocate([100, 100], [130, 130], [150, 150], 50), [100, 100]);
});

test('native commands disable fit before resizing and restore its original state', async () => {
  const state = { widths: [187, 187, 187, 188], fit: true }, commands = [];
  const adapter = {
    read: () => structuredClone(state),
    exec: async (name, i, w) => {
      commands.push(name);
      if (name === 'tableColumnAdaptation') state.fit = !state.fit;
      if (name === 'tableColumnWidth') { assert.equal(state.fit, false); state.widths[i] = w; }
      return true;
    },
  };
  const before = adapter.read();
  await tool.writeNative(adapter, { widths: [120, 140, 300, 190], fit: false });
  assert.equal(commands[0], 'tableColumnAdaptation');
  await tool.writeNative(adapter, before);
  assert.deepEqual(adapter.read(), before);
});

test('native command failure and silent no-op are reported', async () => {
  const state = { widths: [100, 100], fit: false };
  await assert.rejects(tool.writeNative({ read: () => structuredClone(state), exec: () => false }, { widths: [90, 110], fit: false }), /未能应用/);
  await assert.rejects(tool.writeNative({ read: () => structuredClone(state), exec: () => true }, { widths: [90, 110], fit: false }), /回读不一致/);
});

function mountedFixture() {
  const dom = new JSDOM('<!doctype html><div class="ne-editor-wrap"><div class="ne-card-toolbar"><div data-testid="ne-card-toolbar-item-columnAdaptation">自适应宽度</div></div><div class="ne-engine" contenteditable="true"><ne-table-wrap class="ne-table-focus"><table class="ne-table" id="fixture"><colgroup><col width="150"><col width="150"></colgroup><tbody><tr><td>项目</td><td>解释</td></tr><tr><td>甲</td><td>较长的说明文字，需要更多空间。</td></tr></tbody></table></ne-table-wrap></div></div>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://www.yuque.com/test/doc' });
  const w = dom.window, t = w.document.querySelector('table');
  Object.defineProperty(t, 'isContentEditable', { get: () => true });
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 750, height: 200, left: 0, top: 0, right: 750, bottom: 200 });
  w.HTMLCanvasElement.prototype.getContext = () => ({ measureText: s => ({ width: [...s].length * 14 }) });
  const view = { nodeName: 'table', attrs: { id: 'fixture', colWidths: [150, 150], colCount: 2, rowCount: 2, fitWidth: true } };
  const calls = [];
  view._virtualNode = { renderer: { kernel: { queryCommandSupported: () => true }, execCommand: (name, id, i, width) => {
    calls.push(name);
    assert.equal(id, 'fixture');
    if (name === 'tableColumnAdaptation') view.attrs.fitWidth = !view.attrs.fitWidth;
    else if (name === 'tableColumnWidth') {
      view.attrs.colWidths[i] = width;
      t.querySelectorAll('col')[i].setAttribute('width', String(width));
    } else throw new Error('Unexpected command: ' + name);
    return true;
  } } };
  t._neRef = view;
  w.eval(script);
  return { w, t, view, calls, root: w.document };
}

test('native menu injection has no preview UI; one click applies and restore preserves content', async () => {
  const f = mountedFixture();
  const original = f.t.outerHTML;
  assert.equal(f.t.outerHTML, original);
  assert.equal(f.calls.length, 0);
  assert.equal(f.root.querySelector('#yuque-smart-table-tool'), null);
  assert.equal(f.root.querySelector('[role=dialog]'), null);
  const button = f.root.querySelector('[data-yq-smart="layout"]');
  assert.equal(button.closest('.ne-card-toolbar').children[1], button);
  assert.equal(button.disabled, false);
  button.click();
  await new Promise(r => setTimeout(r, 150));
  assert.match(f.root.querySelector('#yuque-smart-table-notice').textContent, /已智能排版/);
  assert(f.calls.every(c => ['tableColumnWidth', 'tableColumnAdaptation'].includes(c)));
  const restore = f.root.querySelector('[data-yq-smart="restore"]');
  assert.equal(restore.hidden, false);
  restore.click();
  await new Promise(r => setTimeout(r, 150));
  assert.equal(f.t.outerHTML, original);
  assert.equal(f.view.attrs.fitWidth, true);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
  f.w.close();
});

test('menu remount reinjects once; image toolbar is ignored; missing adapter fails closed', async () => {
  const f = mountedFixture();
  const toolbar = f.root.querySelector('.ne-card-toolbar');
  toolbar.innerHTML = '<div data-testid="ne-card-toolbar-item-columnAdaptation">自适应宽度</div>';
  const other = f.w.document.createElement('div'); other.className = 'ne-card-toolbar'; other.textContent = '图片裁剪';
  f.w.document.body.append(other);
  await new Promise(r => setTimeout(r, 80));
  assert.equal(toolbar.querySelectorAll('[data-yq-smart="layout"]').length, 1);
  assert.equal(other.querySelectorAll('[data-yq-smart]').length, 0);
  delete f.t._neRef;
  f.root.dispatchEvent(new f.w.Event('selectionchange'));
  await new Promise(r => setTimeout(r, 40));
  assert.equal(toolbar.querySelector('[data-yq-smart="layout"]').disabled, true);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
  f.w.close();
});

test('switching selected table targets the new table, never the first table', async () => {
  const f = mountedFixture();
  const second = f.t.cloneNode(true); second.id = 'second';
  Object.defineProperty(second, 'isContentEditable', { get: () => true });
  const view = { nodeName: 'table', attrs: { id: 'second', colWidths: [150, 150], fitWidth: false } };
  let count = 0;
  view._virtualNode = { renderer: { execCommand: (name, id, i, width) => {
    assert.equal(id, 'second'); count++;
    if (name === 'tableColumnWidth') view.attrs.colWidths[i] = width;
    return true;
  } } };
  second._neRef = view;
  const wrap = f.w.document.createElement('ne-table-wrap'); wrap.className = 'ne-table-focus'; wrap.append(second);
  f.t.closest('ne-table-wrap').className = '';
  f.root.querySelector('.ne-engine').append(wrap);
  await new Promise(r => setTimeout(r, 50));
  f.root.querySelector('[data-yq-smart="layout"]').click();
  await new Promise(r => setTimeout(r, 150));
  assert(count > 0);
  assert.equal(f.calls.length, 0);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
  f.w.close();
});

test('ambiguous selected tables disable action instead of guessing', async () => {
  const f = mountedFixture();
  const second = f.t.closest('ne-table-wrap').cloneNode(true);
  f.root.querySelector('.ne-engine').append(second);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(f.root.querySelector('[data-yq-smart="layout"]').disabled, true);
  assert.equal(f.calls.length, 0);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));
  f.w.close();
});
