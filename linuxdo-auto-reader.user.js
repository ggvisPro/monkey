// ==UserScript==
// @name         Linux.do Auto Reader
// @namespace    https://linux.do/
// @version      1.1.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-auto-reader.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-auto-reader.user.js
// @description  自动"阅读"帖子全部楼层，消灭未读小蓝点。支持持久化速度配置。
// @author       ggvisPro
// @modified     2026-07-05 08:00:45 PDT
// @match        https://linux.do/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // ===== Speed presets =====
  const PRESETS = {
    slow:   { label: '慢速 (~6s/楼)',  min: 4500, max: 8000, batchDelay: [5000, 9000], pauseChance: 0.12, pauseMin: 8000,  pauseMax: 16000 },
    normal: { label: '正常 (~3s/楼)', min: 2000, max: 4500, batchDelay: [3000, 6000], pauseChance: 0.10, pauseMin: 6000,  pauseMax: 12000 },
    fast:   { label: '快速 (~1.5s/楼)', min: 800,  max: 2200, batchDelay: [1500, 3500], pauseChance: 0.06, pauseMin: 4000,  pauseMax: 8000  },
    turbo:  { label: '极速 (~0.5s/楼)', min: 200,  max: 800,  batchDelay: [500, 1500],  pauseChance: 0.03, pauseMin: 2000,  pauseMax: 5000  }
  };

  // ===== Persistent settings =====
  function getSettings() {
    try { return Object.assign({ speed: 'normal' }, JSON.parse(GM_getValue('autoReaderSettings', '{}'))); }
    catch(e) { return { speed: 'normal' }; }
  }
  function saveSettings(s) {
    GM_setValue('autoReaderSettings', JSON.stringify(s));
  }

  // ===== Utilities =====
  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  function getTopicId() {
    const m = location.pathname.match(/\/t\/[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function getCsrf() {
    const el = document.querySelector('meta[name="csrf-token"]');
    return el ? el.getAttribute('content') : null;
  }

  // ===== Send a batch of timings (cumulative, like real browser) =====
  function sendBatch(csrf, topicId, batchNums, batchTimes) {
    const parts = [];
    for (let i = 0; i < batchNums.length; i++) {
      parts.push(`timings[${batchNums[i]}]=${batchTimes[i]}`);
    }
    parts.push(`topic_time=${batchTimes[batchTimes.length - 1]}`, `topic_id=${topicId}`);
    return fetch('/topics/timings', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': csrf,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: parts.join('&')
    });
  }

  // ===== Fetch all posts including those beyond chunk_size =====
  async function fetchAllPosts(topicId) {
    const resp = await fetch(`/t/${topicId}.json?track_visit=true`, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    if (!resp.ok) throw new Error(`Topic fetch failed: HTTP ${resp.status}`);
    const data = await resp.json();

    const loadedPosts = data.post_stream.posts;
    const streamIds = data.post_stream.stream || [];

    // Find IDs not in the initial chunk
    const loadedIdSet = new Set(loadedPosts.map(p => p.id));
    const missingIds = streamIds.filter(id => !loadedIdSet.has(id));

    const allPosts = [...loadedPosts];

    // Fetch missing posts in batches of 20
    for (let i = 0; i < missingIds.length; i += 50) {
      const batch = missingIds.slice(i, i + 50);
      const params = batch.map(id => `post_ids[]=${id}`).join('&');
      try {
        const r = await fetch(`/t/${topicId}/posts.json?${params}`, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        });
        if (r.ok) {
          const extra = await r.json();
          const extraPosts = extra.post_stream ? extra.post_stream.posts : [];
          allPosts.push(...extraPosts);
        }
      } catch(e) { /* continue */ }
    }

    allPosts.sort((a, b) => a.post_number - b.post_number);
    return { allPosts, totalInStream: streamIds.length };
  }

  // ===== Main reading engine =====
  class AutoReader {
    constructor(panel) {
      this.panel = panel;
      this.stopped = false;
      this.startTime = 0;
    }

    setStatus(msg, color) {
      const el = this.panel.querySelector('.ar-status');
      if (el) { el.textContent = msg; if (color) el.style.color = color; }
    }

    setDetail(msg) {
      const el = this.panel.querySelector('.ar-detail');
      if (el) el.textContent = msg;
    }

    setProgress(n, total) {
      const bar = this.panel.querySelector('.ar-bar');
      if (bar) bar.style.width = Math.round(n / total * 100) + '%';
    }

    async run(topicId, csrf, cfg) {
      this.startTime = Date.now();
      this.setStatus('Fetching topic...', '#d29922');

      const { allPosts } = await fetchAllPosts(topicId);
      const unread = allPosts.filter(p => !p.read);
      const posts = unread.length > 0 ? unread : allPosts;

      if (posts.length === 0) {
        this.setStatus('No posts to read!', '#3fb950');
        return;
      }

      const infoEl = this.panel.querySelector('.ar-info');
      if (infoEl) {
        infoEl.textContent = `Topic #${topicId} | ${unread.length} unread / ${allPosts.length} total`;
      }

      let idx = 0;
      const total = posts.length;
      const batchSize = 5;
      let rateLimited = false;

      while (idx < total && !this.stopped) {
        const batchStart = idx;
        const batchEnd = Math.min(idx + batchSize, total);
        const batchNums = [];
        const batchTimes = [];
        let cumulative = 0;

        // Read each post in this batch, accumulating times
        for (let b = batchStart; b < batchEnd && !this.stopped; b++) {
          const post = posts[b];
          const readTime = rand(cfg.min, cfg.max);
          cumulative += readTime;

          idx++;
          const pct = Math.round(idx / total * 100);
          this.setStatus(`Reading ${idx}/${total} (${pct}%)`, '#58a6ff');
          this.setDetail(`@${post.username} - post #${post.post_number}`);
          this.setProgress(idx, total);

          await wait(readTime);
          batchNums.push(post.post_number);
          batchTimes.push(cumulative);

          // Transition jitter within batch
          if (b < batchEnd - 1 && !this.stopped) await wait(rand(200, 1200));
          // Micro-pause
          if (!this.stopped && Math.random() < 0.02) await wait(rand(100, 400));
        }

        // Send the batch
        if (batchNums.length > 0 && !this.stopped) {
          const resp = await sendBatch(csrf, topicId, batchNums, batchTimes);
          if (resp.status === 429) {
            const retrySec = parseInt(resp.headers.get('retry-after') || '3600');
            const mins = Math.ceil(retrySec / 60);
            this.setStatus(`Rate limited! Retry in ~${mins}min`, '#f85149');
            this.setDetail('Server said: too many requests');
            rateLimited = true;
            this.stopped = true;
            break;
          }
        }

        // Pause between batches
        if (idx < total && !this.stopped) {
          this.setStatus(`Scrolling... (${idx}/${total})`, '#8b949e');
          await wait(rand(cfg.batchDelay[0], cfg.batchDelay[1]));
        }

        // Occasional longer pause
        if (!this.stopped && Math.random() < cfg.pauseChance) {
          this.setStatus('Paused (re-reading)...', '#d29922');
          await wait(rand(cfg.pauseMin, cfg.pauseMax));
        }
      }

      // Confirmation wait
      if (!this.stopped && !rateLimited && idx > 0) {
        this.setStatus('Confirming with server...', '#d29922');
        this.setDetail('Waiting for read status to sync');
        await wait(rand(2000, 4000));
      }

      // Done
      const elapsed = Math.round((Date.now() - this.startTime) / 1000);
      const mm = Math.floor(elapsed / 60);
      const ss = elapsed % 60;
      if (rateLimited) {
        this.setStatus(`Rate limited at ${idx}/${total}`, '#f85149');
        this.setDetail('Come back after the retry period');
      } else {
        this.setStatus(`Done! ${idx} posts read`, '#3fb950');
        this.setDetail(`Total time: ${mm}m ${ss}s`);
      }
      this.setProgress(total, total);
    }

    stop() { this.stopped = true; }
  }

  // ===== UI: Create floating panel =====
  function createPanel(settings, onStart, onClose) {
    const old = document.getElementById('__auto_reader_panel');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = '__auto_reader_panel';

    // Build speed radio HTML
    const speedOptions = Object.entries(PRESETS).map(([key, p]) =>
      `<label class="ar-speed-label" style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12px;padding:4px 0">
        <input type="radio" name="ar_speed" value="${key}" ${key === settings.speed ? 'checked' : ''} style="accent-color:#58a6ff">
        <span>${p.label}</span>
      </label>`
    ).join('');

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-weight:700;font-size:14px">Auto Reader</span>
        <button class="ar-close" style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;line-height:1">&times;</button>
      </div>
      <div class="ar-speed-group" style="margin-bottom:10px;border:1px solid #30363d;border-radius:6px;padding:8px">
        ${speedOptions}
      </div>
      <div class="ar-status" style="font-size:13px;color:#8b949e;margin-bottom:6px">Ready</div>
      <div class="ar-detail" style="font-size:12px;color:#6e7681;margin-bottom:6px"></div>
      <div style="height:6px;background:#21262d;border-radius:3px;overflow:hidden;margin-bottom:6px">
        <div class="ar-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#238636,#3fb950);border-radius:3px;transition:width .4s ease"></div>
      </div>
      <div class="ar-info" style="font-size:11px;color:#6e7681;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px">
        <button class="ar-start" style="flex:1;padding:7px;background:#238636;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">Start</button>
        <button class="ar-stop" style="flex:1;padding:7px;background:#484f58;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600" disabled>Stop</button>
      </div>
    `;

    panel.style.cssText = 'position:fixed;bottom:20px;right:20px;width:280px;background:#161b22;border:1px solid #30363d;border-radius:12px;padding:16px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#c9d1d9;box-shadow:0 8px 30px rgba(0,0,0,.5)';
    document.body.appendChild(panel);

    // Event: close
    panel.querySelector('.ar-close').onclick = () => { panel.remove(); onClose(); };

    // Event: start
    panel.querySelector('.ar-start').onclick = () => {
      const selected = panel.querySelector('input[name="ar_speed"]:checked');
      const speed = selected ? selected.value : 'normal';
      settings.speed = speed;
      saveSettings(settings);
      onStart(panel, speed);
    };

    return panel;
  }

  // ===== UI: Small trigger button =====
  function createTriggerButton() {
    const btn = document.createElement('div');
    btn.id = '__auto_reader_trigger';
    btn.textContent = 'AR';
    btn.title = 'Auto Reader';
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;width:44px;height:44px;background:#238636;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;cursor:pointer;z-index:99998;box-shadow:0 4px 14px rgba(0,0,0,.4);font-family:-apple-system,sans-serif;transition:transform .15s;user-select:none';
    btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
    return btn;
  }

  // ===== Entry point =====
  function init() {
    const topicId = getTopicId();
    if (!topicId) return; // Not on a topic page

    const csrf = getCsrf();
    if (!csrf) return; // Not logged in

    const settings = getSettings();
    let reader = null;
    let panelOpen = false;

    const trigger = createTriggerButton();
    document.body.appendChild(trigger);

    trigger.onclick = () => {
      if (panelOpen) return;
      panelOpen = true;
      trigger.style.display = 'none';

      const panel = createPanel(
        settings,
        // onStart
        async (panel, speed) => {
          const cfg = PRESETS[speed] || PRESETS.normal;
          reader = new AutoReader(panel);

          const startBtn = panel.querySelector('.ar-start');
          const stopBtn = panel.querySelector('.ar-stop');
          startBtn.disabled = true;
          startBtn.style.background = '#484f58';
          stopBtn.disabled = false;
          stopBtn.style.background = '#da3633';

          stopBtn.onclick = () => {
            reader.stop();
            reader.setStatus('Stopped by user', '#d29922');
            stopBtn.disabled = true;
            stopBtn.style.background = '#484f58';
            startBtn.disabled = false;
            startBtn.style.background = '#238636';
          };

          try {
            await reader.run(topicId, csrf, cfg);
          } catch(err) {
            reader.setStatus('Error: ' + err.message, '#f85149');
          }

          startBtn.disabled = false;
          startBtn.style.background = '#238636';
          stopBtn.disabled = true;
          stopBtn.style.background = '#484f58';
        },
        // onClose
        () => {
          if (reader) reader.stop();
          panelOpen = false;
          trigger.style.display = 'flex';
        }
      );
    };
  }

  init();
})();
