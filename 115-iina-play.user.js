// ==UserScript==
// @name         115 直链 IINA 播放
// @namespace    https://115.com/
// @version      1.3.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-iina-play.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-iina-play.user.js
// @description  在 115 网盘文件行的悬浮菜单（鼠标悬停出现）注入「IINA 播放」按钮，提取原画直链并跳转 IINA 播放
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
    return request('GET', 'https://webapi.115.com/files/video?pickcode=' + pickcode + '&share_id=0&local=1')
      .then(function (j) {
        if (j && j.state && j.origin_file_url) return j.origin_file_url;
        throw new Error(j && (j.msg || j.error) || 'no url');
      });
  }

  // 通过 iina:// 协议跳转 IINA（IINA 会使用你设置好的 user-agent 请求）
  function openInIINA(url) {
    var f = document.createElement('iframe');
    f.style.display = 'none';
    f.src = 'iina://weblink?url=' + encodeURIComponent(url);
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

  function injectRow(li) {
    if (!li.getAttribute('pick_code')) return; // 文件夹没有 pick_code，跳过
    var ico = (li.getAttribute('ico') || '').toLowerCase();
    if (!VIDEO_EXTS.test(ico)) return; // 非视频文件，跳过
    var opr = li.querySelector('.file-opr');
    if (!opr || opr.querySelector('[menu="qw_iina"]')) return;
    var a = document.createElement('a');
    a.href = 'javascript:;';
    a.setAttribute('menu', 'qw_iina');
    a.innerHTML =
      '<i class="icon-operate" style="background:none;font-style:normal;font-size:12px;line-height:20px;text-align:center;color:#1e6fd9;">&#9654;</i>' +
      '<span>IINA</span>';
    a.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      play(li);
    });
    a.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    a.addEventListener('dblclick', function (e) { e.stopPropagation(); e.preventDefault(); });
    opr.insertBefore(a, opr.firstChild);
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
