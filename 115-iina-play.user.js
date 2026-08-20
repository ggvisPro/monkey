// ==UserScript==
// @name         115 直链 IINA 播放
// @namespace    https://115.com/
// @version      1.4.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-iina-play.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-iina-play.user.js
// @description  在 115 网盘文件行的悬浮菜单注入「IINA」和「列表」按钮，支持单集播放或按名称连播当前及后续视频
// @match        *://115.com/*
// @connect      115.com
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var gmxhr = (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest.bind(GM) : GM_xmlhttpRequest;

  function request(method, url, body) {
    return new Promise(function (resolve, reject) {
      gmxhr({
        method: method,
        url: url,
        data: body || undefined,
        headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined,
        responseType: 'text',
        onload: function (r) {
          try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error('响应解析失败')); }
        },
        onerror: function () { reject(new Error('网络错误')); }
      });
    });
  }

  function unescapeUrl(s) {
    return String(s).replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  }

  // 提取原画直链：使用 webapi.115.com 接口（与网页播放器同源，稳定可用）
  function getDirectUrl(pickcode) {
    return request('GET', 'https://webapi.115.com/files/video?pickcode=' + encodeURIComponent(pickcode) + '&share_id=0&local=1')
      .then(function (j) {
        if (j && j.state && j.origin_file_url) return j.origin_file_url;
        throw new Error(j && (j.msg || j.error) || 'no url');
      });
  }

  // 通过 iina:// 协议跳转 IINA（IINA 会使用你设置好的 user-agent 请求）
  function openInIINA(url, enqueue) {
    var f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = enqueue
      ? 'iina://open?url=' + encodeURIComponent(url) + '&new_window=0&enqueue=1'
      : 'iina://weblink?url=' + encodeURIComponent(url);
    document.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 4000);
  }

  var busy = {};
  function play(li) {
    var pc = li.getAttribute('pick_code');
    var name = li.getAttribute('title') || '未命名';
    if (!pc) { alert('该文件没有 pickcode，无法提取直链'); return; }
    if (busy[pc]) return;
    busy[pc] = true;
    getDirectUrl(pc).then(function (url) {
      openInIINA(url);
    }).catch(function (e) {
      alert('《' + name + '》直链提取失败：' + e.message);
    }).then(function () {
      delete busy[pc];
    });
  }

  var VIDEO_EXTS = /^(mp4|mkv|avi|mov|wmv|flv|webm|m4v|ts|mpg|mpeg|3gp|rmvb|rm|asf|vob|f4v|ogv|divx)$/i;

  function getCurrentCid() {
    return new URLSearchParams(location.search).get('cid') || '0';
  }

  function itemName(item) {
    return String(item.n || item.file_name || item.name || '');
  }

  function itemPickcode(item) {
    return String(item.pc || item.pick_code || item.pickcode || '');
  }

  function isVideoItem(item) {
    var name = itemName(item);
    var ext = String(item.ico || item.suffix || '').toLowerCase();
    if (!ext && name.indexOf('.') !== -1) ext = name.split('.').pop().toLowerCase();
    return !!itemPickcode(item) && VIDEO_EXTS.test(ext);
  }

  // 从接口取得当前文件夹的全部条目，不依赖页面当前渲染了多少行。
  function getFolderVideos(cid) {
    var all = [];
    var offset = 0;
    var limit = 500;

    function nextPage() {
      var url = 'https://webapi.115.com/files?aid=1'
        + '&cid=' + encodeURIComponent(cid)
        + '&o=file_name&asc=1&offset=' + offset
        + '&show_dir=1&limit=' + limit
        + '&type=4&natsort=1&format=json&fc_mix=0&custom_order=0';
      return request('GET', url).then(function (j) {
        if (!j || j.state === false || !Array.isArray(j.data)) {
          throw new Error(j && (j.error || j.msg) || '获取文件列表失败');
        }
        all = all.concat(j.data);
        offset += j.data.length;
        var count = Number(j.count || 0);
        if (j.data.length && offset < count) return nextPage();
        return all.filter(isVideoItem);
      });
    }

    return nextPage().then(function (items) {
      var collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
      return items.sort(function (a, b) {
        var byName = collator.compare(itemName(a), itemName(b));
        return byName || itemPickcode(a).localeCompare(itemPickcode(b));
      });
    });
  }

  function getDirectUrls(items, concurrency) {
    var results = new Array(items.length);
    var cursor = 0;

    function worker() {
      function take() {
        var index = cursor++;
        if (index >= items.length) return Promise.resolve();
        return getDirectUrl(itemPickcode(items[index])).then(function (url) {
          results[index] = { item: items[index], url: url };
        }).catch(function (error) {
          results[index] = { item: items[index], error: error };
        }).then(take);
      }
      return take();
    }

    var workers = [];
    var count = Math.min(concurrency, items.length);
    for (var i = 0; i < count; i++) workers.push(worker());
    return Promise.all(workers).then(function () { return results; });
  }

  var playlistBusy = false;
  function playList(li, button) {
    var pc = li.getAttribute('pick_code');
    var name = li.getAttribute('title') || '未命名';
    if (!pc) { alert('该文件没有 pickcode，无法生成播放列表'); return; }
    if (playlistBusy) return;

    playlistBusy = true;
    var label = button.querySelector('span');
    if (label) label.textContent = '生成中';

    getFolderVideos(getCurrentCid()).then(function (items) {
      var start = -1;
      for (var i = 0; i < items.length; i++) {
        if (itemPickcode(items[i]) === pc) { start = i; break; }
      }
      if (start === -1) throw new Error('在当前文件夹列表中找不到《' + name + '》');
      return getDirectUrls(items.slice(start), 3);
    }).then(function (results) {
      var playable = results.filter(function (result) { return result && result.url; });
      var failed = results.filter(function (result) { return result && result.error; });
      if (!playable.length) throw new Error('所有直链都提取失败');

      // 先打开当前集，给 IINA 留出建立播放窗口的时间，再顺序入队后续集。
      openInIINA(playable[0].url, false);
      for (var i = 1; i < playable.length; i++) {
        (function (url, delay) {
          setTimeout(function () { openInIINA(url, true); }, delay);
        })(playable[i].url, 700 + i * 250);
      }

      if (failed.length) {
        var failedNames = failed.map(function (result) { return itemName(result.item); });
        alert('已加入 ' + playable.length + ' 集，以下 ' + failed.length + ' 集直链提取失败：\n' + failedNames.join('\n'));
      }
    }).catch(function (e) {
      alert('《' + name + '》播放列表生成失败：' + e.message);
    }).then(function () {
      playlistBusy = false;
      if (label) label.textContent = '列表';
    });
  }

  function makeMenuButton(menu, icon, text, color, onClick) {
    var a = document.createElement('a');
    a.href = 'javascript:;';
    a.setAttribute('menu', menu);
    a.innerHTML =
      '<i class="icon-operate" style="background:none;font-style:normal;font-size:12px;line-height:20px;text-align:center;color:' + color + ';">' + icon + '</i>' +
      '<span>' + text + '</span>';
    a.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      onClick(a);
    });
    a.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    a.addEventListener('dblclick', function (e) { e.stopPropagation(); e.preventDefault(); });
    return a;
  }

  function injectRow(li) {
    if (!li.getAttribute('pick_code')) return; // 文件夹没有 pick_code，跳过
    var ico = (li.getAttribute('ico') || '').toLowerCase();
    if (!VIDEO_EXTS.test(ico)) return; // 非视频文件，跳过
    var opr = li.querySelector('.file-opr');
    if (!opr) return;

    var iinaButton = opr.querySelector('[menu="qw_iina"]');
    if (!iinaButton) {
      iinaButton = makeMenuButton('qw_iina', '&#9654;', 'IINA', '#1e6fd9', function () { play(li); });
      opr.insertBefore(iinaButton, opr.firstChild);
    }

    if (!opr.querySelector('[menu="qw_iina_list"]')) {
      var listButton = makeMenuButton('qw_iina_list', '&#9776;', '列表', '#7a55c7', function (button) {
        playList(li, button);
      });
      opr.insertBefore(listButton, iinaButton.nextSibling);
    }
  }

  var timer = null;
  function injectAll() {
    var lis = document.querySelectorAll('li[rel=item]');
    for (var i = 0; i < lis.length; i++) injectRow(lis[i]);
  }
  function scheduleInject() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; injectAll(); }, 120);
  }

  new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });
  injectAll();
  // 列表是异步渲染的，补几次延时重试兜底
  setTimeout(injectAll, 1000);
  setTimeout(injectAll, 3000);
  setTimeout(injectAll, 8000);
})();
