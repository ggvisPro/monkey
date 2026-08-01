// ==UserScript==
// @name         115 网盘剧集整理器
// @namespace    https://115.com/
// @version      3.2
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-series-organizer.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-series-organizer.user.js
// @description  整理/展平/清理 115 网盘剧集文件，Claude 风格 UI
// @author       ggvisPro
// @modified     2026-07-06 00:04:48 CST
// @match        https://115.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=115.com
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const C = {
    bg:'#FAF9F7',card:'#FFFFFF',border:'#E8E2D9',
    primary:'#C96442',primaryHov:'#B5532F',primaryGhost:'rgba(201,100,66,0.08)',
    text:'#2D2B28',textSec:'#6B6560',textMuted:'#9B9590',
    accent:'#F0EBE3',success:'#3D8C5C',successBg:'#EEF7F0',
    error:'#C23B22',errorBg:'#FDF0ED',warn:'#B8860B',warnBg:'#FFF8E7',
    tag:'#F5E6DC',shadow:'rgba(0,0,0,0.08)',
  };

  GM_addStyle(`
    #claude-org-fab{position:fixed;bottom:148px;right:24px;z-index:99999;width:52px;height:52px;border-radius:16px;background:${C.primary};color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px ${C.shadow},0 1px 4px ${C.shadow};transition:all .2s ease}
    #claude-org-fab:hover{background:${C.primaryHov};transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.12)}
    #claude-org-fab svg{width:24px;height:24px}
    #claude-org-panel{position:fixed;bottom:212px;right:24px;z-index:99998;width:440px;max-height:65vh;border-radius:16px;background:${C.bg};border:1px solid ${C.border};box-shadow:0 16px 48px rgba(0,0,0,.10),0 2px 8px ${C.shadow};display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,'SF Pro Text','Helvetica Neue','PingFang SC',sans-serif}
    #claude-org-panel.show{display:flex}
    .co-header{padding:20px 24px 16px;border-bottom:1px solid ${C.border};display:flex;align-items:center;gap:12px;flex-shrink:0}
    .co-header-icon{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,${C.primary},#D98A6A);display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;flex-shrink:0}
    .co-header-text h3{margin:0;font-size:15px;font-weight:600;color:${C.text};letter-spacing:-.01em}
    .co-header-text p{margin:2px 0 0;font-size:12px;color:${C.textMuted}}
    .co-tabs{display:flex;gap:0;padding:12px 24px 0;background:${C.bg};flex-shrink:0}
    .co-tab{flex:1;padding:9px 6px;border:1.5px solid ${C.border};background:${C.card};color:${C.textSec};font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s ease;text-align:center;white-space:nowrap;position:relative}
    .co-tab:first-child{border-radius:10px 0 0 10px}
    .co-tab:last-child{border-radius:0 10px 10px 0}
    .co-tab:not(:first-child){border-left:none}
    .co-tab:hover{background:${C.primaryGhost};color:${C.primary}}
    .co-tab.active{background:${C.primary};color:#fff;border-color:${C.primary};z-index:1}
    .co-tab.active+.co-tab{border-left-color:${C.primary}}
    .co-tab-icon{font-size:14px;display:block;margin-bottom:2px}
    .co-tab-label{display:block;font-size:11px;font-weight:500}
    .co-action-bar{padding:12px 24px;flex-shrink:0;display:flex;gap:8px}
    .co-action-bar .co-btn{flex:1}
    .co-body{padding:0 24px 20px;overflow-y:auto;flex:1;min-height:0}
    .co-body::-webkit-scrollbar{width:5px}
    .co-body::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}
    .co-group{background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:16px;margin-bottom:12px}
    .co-group-title{font-size:14px;font-weight:600;color:${C.text};margin:0 0 4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .co-group-sub{font-size:12px;color:${C.textMuted};margin:0 0 12px}
    .co-season-tag{display:inline-block;padding:2px 10px;border-radius:6px;background:${C.tag};color:${C.primary};font-size:11px;font-weight:600}
    .co-warn-tag{display:inline-block;padding:2px 10px;border-radius:6px;background:${C.warnBg};color:${C.warn};font-size:11px;font-weight:600}
    .co-danger-tag{display:inline-block;padding:2px 10px;border-radius:6px;background:${C.errorBg};color:${C.error};font-size:11px;font-weight:600}
    .co-file{display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12.5px;color:${C.textSec};border-bottom:1px solid ${C.accent}}
    .co-file:last-child{border-bottom:none}
    .co-file-icon{width:18px;height:18px;border-radius:4px;background:${C.accent};display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;color:${C.primary}}
    .co-file-icon.danger{background:${C.errorBg};color:${C.error}}
    .co-file-name{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .co-file-path{color:${C.textMuted};font-size:11px}
    .co-file-size{color:${C.textMuted};font-size:11px;flex-shrink:0}
    .co-file-type{color:${C.textMuted};font-size:10px;flex-shrink:0;padding:1px 6px;background:${C.accent};border-radius:4px}
    .co-btn{padding:10px;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all .15s ease;letter-spacing:-.01em;text-align:center}
    .co-btn-primary{background:${C.primary};color:#fff}
    .co-btn-primary:hover:not(:disabled){background:${C.primaryHov}}
    .co-btn-primary:disabled{background:${C.border};color:${C.textMuted};cursor:not-allowed}
    .co-btn-danger{background:${C.error};color:#fff}
    .co-btn-danger:hover:not(:disabled){background:#A82E18}
    .co-btn-danger:disabled{background:${C.border};color:${C.textMuted};cursor:not-allowed}
    .co-btn-ghost{background:${C.accent};color:${C.textSec}}
    .co-btn-ghost:hover:not(:disabled){background:${C.border}}
    .co-progress-wrap{background:${C.accent};border-radius:6px;height:6px;overflow:hidden;margin:12px 0 6px}
    .co-progress-bar{height:100%;border-radius:6px;background:linear-gradient(90deg,${C.primary},#D98A6A);transition:width .3s ease;width:0%}
    .co-progress-text{font-size:12px;color:${C.textMuted};text-align:center}
    .co-status{padding:10px 14px;border-radius:10px;font-size:12.5px;margin-bottom:12px;display:none;line-height:1.5}
    .co-status.success{display:block;background:${C.successBg};color:${C.success}}
    .co-status.error{display:block;background:${C.errorBg};color:${C.error}}
    .co-status.info{display:block;background:${C.accent};color:${C.textSec}}
    .co-status.warn{display:block;background:${C.warnBg};color:${C.warn}}
    .co-empty{text-align:center;padding:32px 16px;color:${C.textMuted}}
    .co-empty-icon{font-size:36px;margin-bottom:8px}
    .co-empty p{margin:4px 0;font-size:13px}

    /* ── 清理筛选器 ── */
    .co-filter-panel{background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:16px;margin-bottom:12px}
    .co-filter-title{font-size:13px;font-weight:600;color:${C.text};margin:0 0 12px;display:flex;align-items:center;justify-content:space-between}
    .co-filter-title-left{display:flex;align-items:center;gap:6px}
    .co-filter-row{display:flex;align-items:center;gap:8px;margin-bottom:10px}
    .co-filter-row:last-child{margin-bottom:0}
    .co-filter-check{width:16px;height:16px;accent-color:${C.primary};cursor:pointer;flex-shrink:0;margin:0}
    .co-filter-label{font-size:12px;color:${C.textSec};font-weight:600;width:56px;flex-shrink:0;cursor:pointer;user-select:none}
    .co-filter-input{flex:1;padding:6px 10px;border:1.5px solid ${C.border};border-radius:8px;font-size:12px;color:${C.text};background:${C.bg};outline:none;transition:border-color .15s;font-family:inherit;min-width:0}
    .co-filter-input:focus{border-color:${C.primary}}
    .co-filter-input::placeholder{color:${C.textMuted}}
    .co-filter-input:disabled{opacity:.45;cursor:not-allowed}
    .co-filter-narrow{width:80px;flex:none}
    .co-filter-unit{font-size:11px;color:${C.textMuted};flex-shrink:0}
    .co-filter-sep{font-size:11px;color:${C.textMuted};flex-shrink:0}
    .co-logic-toggle{display:inline-flex;border:1.5px solid ${C.border};border-radius:8px;overflow:hidden;flex-shrink:0}
    .co-logic-opt{padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;background:${C.card};color:${C.textSec};border:none;transition:all .15s;user-select:none}
    .co-logic-opt:first-child{border-right:1.5px solid ${C.border}}
    .co-logic-opt.active{background:${C.primary};color:#fff}
    .co-logic-opt:hover:not(.active){background:${C.primaryGhost};color:${C.primary}}
    .co-config-bar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid ${C.accent}}
    .co-config-btn{padding:4px 10px;border:1.5px solid ${C.border};border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;background:${C.card};color:${C.textSec};transition:all .15s;white-space:nowrap}
    .co-config-btn:hover{background:${C.primaryGhost};color:${C.primary};border-color:${C.primary}}
    .co-config-divider{width:1px;height:16px;background:${C.border};flex-shrink:0}
    .co-config-hint{font-size:10px;color:${C.textMuted};flex:1;text-align:right}
    .co-save-row{display:flex;gap:6px;align-items:center;margin-top:8px}
    .co-save-input{flex:1;padding:5px 10px;border:1.5px solid ${C.border};border-radius:8px;font-size:12px;color:${C.text};background:${C.bg};outline:none;font-family:inherit}
    .co-save-input:focus{border-color:${C.primary}}
    .co-save-confirm{padding:5px 12px;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;background:${C.primary};color:#fff;transition:all .15s}
    .co-save-confirm:hover{background:${C.primaryHov}}
    .co-save-cancel{padding:5px 12px;border:none;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;background:${C.accent};color:${C.textSec};transition:all .15s}
    .co-save-cancel:hover{background:${C.border}}
    .co-match-tags{display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap}
    .co-match-tag{padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600;line-height:1.4}
    .co-match-tag.ext{background:#F5E6DC;color:${C.primary}}
    .co-match-tag.kw{background:#E3E9F5;color:#4A6FA5}
    .co-match-tag.sz{background:#F5DCF0;color:#8B4A83}
    .co-match-tag.type{background:#DCF0E8;color:#3D7A5C}
    .co-match-tag.default{background:${C.accent};color:${C.textMuted}}

    /* 类型多选 */
    .co-type-chips{display:flex;gap:4px;flex-wrap:wrap;flex:1}
    .co-type-chip{padding:3px 8px;border:1.5px solid ${C.border};border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;background:${C.card};color:${C.textSec};transition:all .15s;user-select:none;white-space:nowrap}
    .co-type-chip:hover{border-color:${C.primary};color:${C.primary}}
    .co-type-chip.active{background:${C.primary};color:#fff;border-color:${C.primary}}
    .co-type-chip:disabled,.co-type-chip[disabled]{opacity:.4;pointer-events:none}
  `);

  /* ─── 115 API ─── */
  // type: 0=全部 1=文档 2=图片 3=音频 4=视频 5=压缩包 6=软件
  const FILE_TYPES = {
    0: { label:'全部',  icon:'📁' },
    1: { label:'文档',  icon:'📄' },
    2: { label:'图片',  icon:'🖼' },
    3: { label:'音频',  icon:'🎵' },
    4: { label:'视频',  icon:'🎬' },
    5: { label:'压缩包', icon:'📦' },
    6: { label:'软件',  icon:'💿' },
  };

  const API = {
    /**
     * 列出文件
     * @param {string} cid    文件夹 ID
     * @param {object} opts   可选参数
     * @param {number} opts.limit  返回数量上限（默认 1150）
     * @param {number} opts.type   文件类型过滤（0=全部 1=文档 2=图片 3=音频 4=视频 5=压缩包 6=软件）
     * @param {string} opts.suffix 后缀过滤（逗号分隔，如 "nfo,txt,jpg"）
     */
    async listFiles(cid, opts = {}) {
      const { limit = 1150, type = 0, suffix = '' } = typeof opts === 'number' ? { limit: opts } : opts;
      const params = new URLSearchParams({
        aid: '1', cid, o: 'file_name', asc: '1', offset: '0',
        show_dir: '1', limit: String(limit), natsort: '1', format: 'json',
      });
      if (type > 0) params.set('type', String(type));
      if (suffix) params.set('suffix', suffix);
      const r = await fetch(`https://webapi.115.com/files?${params}`, { credentials: 'include' });
      return r.json();
    },
    async createFolder(pid, name) {
      const body = new URLSearchParams({ pid, cname: name });
      const r = await fetch('https://webapi.115.com/files/add', { method: 'POST', body, credentials: 'include' });
      return r.json();
    },
    async moveFiles(pid, fids) {
      const body = new URLSearchParams();
      body.append('pid', pid);
      fids.forEach((id, i) => body.append(`fid[${i}]`, id));
      body.append('move_proid', '');
      const r = await fetch('https://webapi.115.com/files/move', { method: 'POST', body, credentials: 'include' });
      return r.json();
    },
    async deleteFiles(fids) {
      const body = new URLSearchParams();
      fids.forEach((id, i) => body.append(`fid[${i}]`, id));
      body.append('ignore_warn', '1');
      const r = await fetch('https://webapi.115.com/rb/delete', { method: 'POST', body, credentials: 'include' });
      return r.json();
    },
    async deleteFolder(cid, pid) {
      const body = new URLSearchParams();
      body.append('fid[0]', cid);
      body.append('pid', pid || '');
      body.append('ignore_warn', '1');
      const r = await fetch('https://webapi.115.com/rb/delete', { method: 'POST', body, credentials: 'include' });
      return r.json();
    },
  };

  /* ─── Helpers ─── */
  const VIDEO_EXT = new Set(['mkv','mp4','avi','wmv','flv','mov','m4v','rmvb','rm','ts','webm','vob','mpg','mpeg','3gp','f4v']);
  const SUB_EXT   = new Set(['srt','ass','ssa','sub','idx','sup','vtt','smi','lrc']);
  function isVideo(n){ return VIDEO_EXT.has(extOf(n)); }
  function isSub(n){ return SUB_EXT.has(extOf(n)); }
  function isMedia(n){ return isVideo(n)||isSub(n); }
  function extOf(n){ return (n.split('.').pop()||'').toLowerCase(); }
  function isFolder(item){ return !!item.pid; }

  /**
   * 客户端文件类型推断（对应 115 API 的 type 分类）
   * 用于 OR 模式下无法全部走服务端时的 fallback
   */
  const TYPE_EXT_MAP = {
    // 1=文档
    doc:1,docx:1,xls:1,xlsx:1,ppt:1,pptx:1,pdf:1,txt:1,rtf:1,csv:1,
    odt:1,ods:1,odp:1,epub:1,mobi:1,azw3:1,chm:1,djvu:1,md:1,tex:1,
    nfo:1,log:1,htm:1,html:1,xml:1,json:1,yaml:1,yml:1,ini:1,cfg:1,
    // 2=图片
    jpg:2,jpeg:2,png:2,gif:2,bmp:2,webp:2,svg:2,ico:2,tif:2,tiff:2,
    psd:2,ai:2,eps:2,raw:2,cr2:2,nef:2,heic:2,heif:2,avif:2,jxl:2,
    // 3=音频
    mp3:3,flac:3,aac:3,ogg:3,wav:3,wma:3,m4a:3,ape:3,alac:3,opus:3,
    aiff:3,dsd:3,dsf:3,dff:3,tak:3,tta:3,ac3:3,dts:3,mka:3,
    // 4=视频
    mkv:4,mp4:4,avi:4,wmv:4,flv:4,mov:4,m4v:4,rmvb:4,rm:4,ts:4,
    webm:4,vob:4,mpg:4,mpeg:4,'3gp':4,f4v:4,
    // 5=压缩包
    zip:5,rar:5,'7z':5,tar:5,gz:5,bz2:5,xz:5,zst:5,lz:5,
    cab:5,iso:5,dmg:5,pkg:5,deb:5,rpm:5,
    // 6=软件
    exe:6,msi:6,app:6,apk:6,ipa:6,bat:6,sh:6,cmd:6,com:6,dll:6,sys:6,
  };
  function guessType(name) {
    return TYPE_EXT_MAP[extOf(name)] || 0;
  }

  function parseEpisode(name) {
    const m = name.match(/\.S(\d{1,2})E(\d{1,3})\./i)
           || name.match(/\[S(\d{1,2})E(\d{1,3})\]/i)
           || name.match(/S(\d{1,2})\.?E(\d{1,3})/i);
    if (!m) return null;
    return { season: parseInt(m[1],10), episode: parseInt(m[2],10) };
  }

  function parseSeasonFolder(name) {
    const trimmed = name.trim();
    let m = trimmed.match(/^Season[\s._-]*(\d+)$/i);
    if (m) return parseInt(m[1], 10);
    m = trimmed.match(/^S[\s._-]*(\d+)$/i);
    if (m) return parseInt(m[1], 10);
    m = trimmed.match(/^第\s*(\d+)\s*季$/);
    if (m) return parseInt(m[1], 10);
    const CN_NUM = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
    m = trimmed.match(/^第([一二三四五六七八九十]+)季$/);
    if (m) {
      const cn = m[1];
      if (cn.length === 1) return CN_NUM[cn] || null;
      if (cn === '十') return 10;
      if (cn.startsWith('十')) return 10 + (CN_NUM[cn[1]] || 0);
      if (cn.endsWith('十')) return (CN_NUM[cn[0]] || 0) * 10;
      if (cn.includes('十')) {
        const parts = cn.split('十');
        return (CN_NUM[parts[0]] || 0) * 10 + (CN_NUM[parts[1]] || 0);
      }
      return null;
    }
    return null;
  }

  function fmtSize(b) {
    if (!b||b<=0) return '';
    if (b<1048576) return (b/1024).toFixed(1)+' KB';
    if (b<1073741824) return (b/1048576).toFixed(1)+' MB';
    return (b/1073741824).toFixed(2)+' GB';
  }

  function getCid() { return new URLSearchParams(window.location.search).get('cid')||'0'; }
  const delay = ms => new Promise(r => setTimeout(r, ms));

  function softRefresh() {
    try {
      const iframe = document.querySelector('iframe[rel="wangpan"]');
      if (iframe?.contentDocument) {
        const links = iframe.contentDocument.querySelectorAll('.file-path a');
        if (links.length) { links[links.length-1].click(); return; }
      }
    } catch {}
    try {
      const cid = getCid();
      if (cid && cid !== '0') {
        const h = location.hash;
        location.hash = '#';
        setTimeout(() => { location.hash = h; }, 50);
      }
    } catch {}
  }

  /* ═══════════════════════════════════
     清理筛选器系统
     ═══════════════════════════════════ */
  const DEFAULT_FILTER = {
    logic: 'or',
    extEnabled: false,
    extList: '',
    kwEnabled: false,
    kwList: '',
    sizeEnabled: false,
    sizeMin: '',
    sizeMax: '',
    typeEnabled: false,
    typeList: [],  // array of type numbers: [1,2,3,5,6]
  };

  let cleanFilter = { ...DEFAULT_FILTER };

  function loadPresets() {
    try { return JSON.parse(GM_getValue('co_clean_presets', '[]')); } catch { return []; }
  }
  function savePresets(list) { GM_setValue('co_clean_presets', JSON.stringify(list)); }
  function loadLastFilter() {
    try { const s = GM_getValue('co_clean_last', ''); if (s) Object.assign(cleanFilter, JSON.parse(s)); } catch {}
  }
  function saveLastFilter() { GM_setValue('co_clean_last', JSON.stringify(cleanFilter)); }

  function matchFilter(file) {
    const results = [];

    // 类型筛选（客户端 guessType 推断）
    if (cleanFilter.typeEnabled && cleanFilter.typeList.length > 0) {
      const ft = guessType(file.name);
      if (ft > 0 && cleanFilter.typeList.includes(ft)) results.push('type');
    }

    // 格式筛选
    if (cleanFilter.extEnabled && cleanFilter.extList.trim()) {
      const exts = cleanFilter.extList.split(/[,，;；\s]+/).map(e => e.replace(/^\./,'').toLowerCase().trim()).filter(Boolean);
      if (exts.includes(extOf(file.name))) results.push('ext');
    }

    // 关键词筛选
    if (cleanFilter.kwEnabled && cleanFilter.kwList.trim()) {
      const kws = cleanFilter.kwList.split(/[,，;；]+/).map(k => k.trim()).filter(Boolean);
      const target = file.name.toLowerCase();
      if (kws.some(kw => target.includes(kw.toLowerCase()))) results.push('kw');
    }

    // 文件大小筛选
    if (cleanFilter.sizeEnabled) {
      const minMB = parseFloat(cleanFilter.sizeMin);
      const maxMB = parseFloat(cleanFilter.sizeMax);
      const sizeMB = (file.size || 0) / 1048576;
      let hit = false;
      if (!isNaN(minMB) && !isNaN(maxMB)) hit = sizeMB >= minMB && sizeMB <= maxMB;
      else if (!isNaN(minMB)) hit = sizeMB >= minMB;
      else if (!isNaN(maxMB)) hit = sizeMB <= maxMB;
      if (hit) results.push('size');
    }

    const enabledCount = [
      cleanFilter.typeEnabled && cleanFilter.typeList.length > 0,
      cleanFilter.extEnabled && cleanFilter.extList.trim(),
      cleanFilter.kwEnabled && cleanFilter.kwList.trim(),
      cleanFilter.sizeEnabled,
    ].filter(Boolean).length;

    if (enabledCount === 0) {
      return { matched: !isMedia(file.name), reasons: ['default'] };
    }

    if (cleanFilter.logic === 'and') {
      return { matched: results.length === enabledCount, reasons: results };
    } else {
      return { matched: results.length > 0, reasons: results };
    }
  }

  function matchTagsHTML(reasons) {
    const labels = { ext:'格式', kw:'关键词', size:'大小', type:'类型', default:'非媒体' };
    return `<span class="co-match-tags">${reasons.map(r => `<span class="co-match-tag ${r}">${labels[r]||r}</span>`).join('')}</span>`;
  }

  function describeFilter() {
    const parts = [];
    if (cleanFilter.typeEnabled && cleanFilter.typeList.length > 0) {
      const names = cleanFilter.typeList.map(t => FILE_TYPES[t]?.label || t).join('、');
      parts.push(`类型为 ${names}`);
    }
    if (cleanFilter.extEnabled && cleanFilter.extList.trim()) {
      const exts = cleanFilter.extList.split(/[,，;；\s]+/).filter(Boolean).map(e => '.'+e.replace(/^\./,'')).join(' ');
      parts.push(`格式含 ${exts}`);
    }
    if (cleanFilter.kwEnabled && cleanFilter.kwList.trim()) {
      const kws = cleanFilter.kwList.split(/[,，;；]+/).map(k=>k.trim()).filter(Boolean).join(' / ');
      parts.push(`文件名含「${kws}」`);
    }
    if (cleanFilter.sizeEnabled) {
      const min = parseFloat(cleanFilter.sizeMin), max = parseFloat(cleanFilter.sizeMax);
      if (!isNaN(min) && !isNaN(max)) parts.push(`${min}~${max} MB`);
      else if (!isNaN(min)) parts.push(`≥ ${min} MB`);
      else if (!isNaN(max)) parts.push(`≤ ${max} MB`);
    }
    if (!parts.length) return '默认：清理所有非视频/字幕文件';
    return parts.join(cleanFilter.logic === 'and' ? ' 且 ' : ' 或 ');
  }

  /* ─── UI Core ─── */
  let currentMode = 'organize';
  let scanResult = null;

  function createUI() {
    loadLastFilter();

    const fab = document.createElement('button');
    fab.id = 'claude-org-fab';
    fab.title = '剧集整理';
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;
    document.body.appendChild(fab);

    const panel = document.createElement('div');
    panel.id = 'claude-org-panel';
    panel.innerHTML = `
      <div class="co-header">
        <div class="co-header-icon">✦</div>
        <div class="co-header-text"><h3>剧集文件管理</h3><p>整理 · 展平 · 清理</p></div>
      </div>
      <div class="co-tabs">
        <button class="co-tab active" data-mode="organize"><span class="co-tab-icon">📂</span><span class="co-tab-label">归入 Season</span></button>
        <button class="co-tab" data-mode="flatten"><span class="co-tab-icon">📤</span><span class="co-tab-label">展平 Season</span></button>
        <button class="co-tab" data-mode="clean"><span class="co-tab-icon">🧹</span><span class="co-tab-label">清理杂项</span></button>
      </div>
      <div class="co-action-bar" id="co-action-bar"></div>
      <div class="co-body" id="co-body"></div>`;
    document.body.appendChild(panel);

    panel.querySelectorAll('.co-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        panel.querySelectorAll('.co-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentMode = tab.dataset.mode;
        scanResult = null;
        doScan();
      });
    });

    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasHidden = !panel.classList.contains('show');
      panel.classList.toggle('show');
      if (wasHidden) doScan();
    });

    document.addEventListener('mousedown', (e) => {
      if (!panel.classList.contains('show')) return;
      if (panel.contains(e.target) || e.target === fab || fab.contains(e.target)) return;
      panel.classList.remove('show');
    });
  }

  /* ─── Action Bar ─── */
  function renderActionBar(type, extra) {
    const bar = document.getElementById('co-action-bar');
    if (!bar) return;
    // 清理模式下「重新扫描」直接触发 scanClean（不回到初始面板）
    const rescanFn = currentMode === 'clean' ? scanClean : doScan;

    if (type === 'scanning') {
      bar.innerHTML = `<button class="co-btn co-btn-primary" disabled>扫描中…</button>`;
    } else if (type === 'execute') {
      const L = {
        organize: { t: '开始归入 Season', c: 'co-btn-primary' },
        flatten:  { t: '开始展平',         c: 'co-btn-primary' },
        clean:    { t: '确认清理（移入回收站）', c: 'co-btn-danger' },
      }[currentMode];
      bar.innerHTML = `
        <button class="co-btn co-btn-ghost" id="co-act-rescan">重新扫描</button>
        <button class="co-btn ${L.c}" id="co-act-exec">${L.t}</button>`;
      bar.querySelector('#co-act-rescan').addEventListener('click', rescanFn);
      bar.querySelector('#co-act-exec').addEventListener('click', doExecute);
    } else if (type === 'executing') {
      bar.innerHTML = `<button class="co-btn co-btn-primary" disabled>${extra?.label||'执行中…'}</button>`;
    } else if (type === 'done') {
      bar.innerHTML = `<button class="co-btn co-btn-ghost" id="co-act-rescan">重新扫描</button>`;
      bar.querySelector('#co-act-rescan').addEventListener('click', rescanFn);
    } else if (type === 'empty') {
      bar.innerHTML = `<button class="co-btn co-btn-primary" id="co-act-rescan">重新扫描</button>`;
      bar.querySelector('#co-act-rescan').addEventListener('click', rescanFn);
    } else if (type === 'clean-ready') {
      bar.innerHTML = `<button class="co-btn co-btn-primary" id="co-act-scan" style="flex:1">🔍 开始扫描</button>`;
      bar.querySelector('#co-act-scan').addEventListener('click', scanClean);
    }
  }

  function doScan() {
    scanResult = null;
    if (currentMode === 'clean') {
      showCleanPanel();  // 不自动扫描，等用户手动确认
    } else {
      ({organize: scanOrganize, flatten: scanFlatten})[currentMode]();
    }
  }
  function doExecute() {
    if (!scanResult) return;
    ({organize: execOrganize, flatten: execFlatten, clean: execClean})[currentMode]();
  }

  /* ─── Progress / Status ─── */
  function progressHTML() {
    return `<div id="co-progress-area" style="display:none"><div class="co-progress-wrap"><div class="co-progress-bar" id="co-bar"></div></div><div class="co-progress-text" id="co-progress-text">准备中…</div></div><div class="co-status" id="co-status"></div>`;
  }
  function showProgress(total) {
    let done = 0;
    const bar = document.getElementById('co-bar');
    const txt = document.getElementById('co-progress-text');
    const area = document.getElementById('co-progress-area');
    if (area) area.style.display = 'block';
    return msg => { done++; const p = Math.round(done/total*100); if(bar)bar.style.width=p+'%'; if(txt)txt.textContent=msg; };
  }
  function setStatus(type, msg) {
    const el = document.getElementById('co-status');
    if (!el) return;
    el.className = 'co-status '+type;
    el.textContent = msg;
    el.style.display = 'block';
  }

  /* ═══════════════════════════════════
     1. 归入 Season
     ═══════════════════════════════════ */
  async function scanOrganize() {
    const body = document.getElementById('co-body');
    body.innerHTML = `<div class="co-status info" style="display:block">正在扫描文件…</div>`;
    renderActionBar('scanning');

    const cid = getCid();
    let data;
    try { data = await API.listFiles(cid); } catch(e) {
      body.innerHTML = `<div class="co-status error" style="display:block">扫描失败：${e.message}</div>`;
      renderActionBar('empty'); return;
    }
    if (!data.data?.length) {
      body.innerHTML = `<div class="co-empty"><div class="co-empty-icon">📭</div><p>当前文件夹为空</p></div>`;
      renderActionBar('empty'); return;
    }

    const seasons = {};
    const unmatched = [];
    const folderName = data.path?.[data.path.length-1]?.name || '';

    for (const f of data.data) {
      if (!isFolder(f)) {
        const info = parseEpisode(f.n);
        if (info) {
          if (!seasons[info.season]) seasons[info.season] = [];
          seasons[info.season].push({ file: f.n, fid: f.fid, size: f.s||0, episode: info.episode });
        } else {
          unmatched.push(f);
        }
      }
    }

    if (!Object.keys(seasons).length) {
      body.innerHTML = `<div class="co-empty"><div class="co-empty-icon">🤔</div><p>未检测到剧集文件</p><p style="font-size:11px;color:${C.textMuted}">需要 S01E01 格式的文件名</p></div>`;
      renderActionBar('empty'); return;
    }

    scanResult = { cid, seasons, folderName };

    let html = '';
    for (const s of Object.keys(seasons).sort((a,b)=>a-b)) {
      const eps = seasons[s].sort((a,b)=>a.episode-b.episode);
      const total = eps.reduce((sum,e)=>sum+e.size,0);
      html += `<div class="co-group">
        <div class="co-group-title">${folderName} <span class="co-season-tag">Season ${s}</span></div>
        <div class="co-group-sub">${eps.length} 集 · ${fmtSize(total)}</div>
        ${eps.map(e=>`<div class="co-file"><div class="co-file-icon">▶</div><div class="co-file-name" title="${e.file}">${e.file}</div><div class="co-file-size">${fmtSize(e.size)}</div></div>`).join('')}
      </div>`;
    }
    if (unmatched.length) {
      html += `<div class="co-group" style="opacity:.6"><div class="co-group-title" style="color:${C.textMuted}">未匹配 <span style="font-size:11px;font-weight:400">${unmatched.length} 个</span></div>
        ${unmatched.map(e=>`<div class="co-file"><div class="co-file-icon" style="color:${C.textMuted}">?</div><div class="co-file-name" title="${e.n}">${e.n}</div></div>`).join('')}</div>`;
    }
    html += progressHTML();
    body.innerHTML = html;
    renderActionBar('execute');
  }

  async function execOrganize() {
    if (!scanResult) return;
    const { cid, seasons } = scanResult;
    renderActionBar('executing', { label: '整理中…' });
    const nums = Object.keys(seasons);
    const tick = showProgress(nums.length * 2);

    try {
      for (const s of nums.sort((a,b)=>a-b)) {
        const seasonName = `Season ${s}`;
        let seasonCid;
        const res = await API.createFolder(cid, seasonName);
        if (res.errno===0||res.error==='') { seasonCid=res.cid||res.file_id; }
        else if (res.errno===20004) {
          const lr = await API.listFiles(cid);
          const ex = lr.data?.find(f=>f.n===seasonName&&isFolder(f));
          if (ex) seasonCid=ex.cid; else throw new Error(`${seasonName} 已存在但无法定位`);
        } else throw new Error(`创建 ${seasonName} 失败`);
        tick(`${seasonName} 就绪`);

        const fids = seasons[s].map(e=>e.fid);
        const mr = await API.moveFiles(seasonCid, fids);
        if (mr.state===false&&mr.errno) throw new Error(`移动失败: ${mr.error||JSON.stringify(mr)}`);
        tick(`已移动 ${fids.length} 个文件到 ${seasonName}`);
        await delay(300);
      }
      document.getElementById('co-bar').style.width='100%';
      setStatus('success','✓ 整理完成！文件已归入 Season 文件夹。');
      renderActionBar('done');
      setTimeout(softRefresh, 600);
    } catch(e) {
      setStatus('error','✗ '+e.message);
      renderActionBar('execute');
    }
  }

  /* ═══════════════════════════════════
     2. 展平 Season
     ═══════════════════════════════════ */
  async function scanFlatten() {
    const body = document.getElementById('co-body');
    body.innerHTML = `<div class="co-status info" style="display:block">正在扫描 Season 子文件夹…</div>`;
    renderActionBar('scanning');

    const cid = getCid();
    let data;
    try { data = await API.listFiles(cid); } catch(e) {
      body.innerHTML = `<div class="co-status error" style="display:block">扫描失败：${e.message}</div>`;
      renderActionBar('empty'); return;
    }

    const folderName = data.path?.[data.path.length-1]?.name || '当前文件夹';
    const seasonFolders = [];

    for (const f of (data.data||[])) {
      if (!isFolder(f)) continue;
      const seasonNum = parseSeasonFolder(f.n);
      if (seasonNum === null) continue;
      const inner = await API.listFiles(f.cid);
      seasonFolders.push({
        name: f.n, cid: f.cid, parentCid: cid, seasonNum,
        files: (inner.data||[]).filter(x=>!isFolder(x)).map(x=>({fid:x.fid,name:x.n,size:x.s||0})),
      });
      await delay(150);
    }

    seasonFolders.sort((a, b) => a.seasonNum - b.seasonNum);

    if (!seasonFolders.length) {
      body.innerHTML = `<div class="co-empty"><div class="co-empty-icon">📭</div><p>未找到 Season 子文件夹</p><p style="font-size:12px;color:${C.textMuted}">支持识别：Season 1 / S01 / 第一季 等格式</p></div>`;
      renderActionBar('empty'); return;
    }

    scanResult = { cid, seasonFolders, folderName };

    let html = '', totalFiles = 0;
    for (const sf of seasonFolders) {
      totalFiles += sf.files.length;
      const total = sf.files.reduce((s,f)=>s+f.size,0);
      html += `<div class="co-group">
        <div class="co-group-title">${folderName} <span class="co-warn-tag">${sf.name} → 上移</span></div>
        <div class="co-group-sub">${sf.files.length} 个文件 · ${fmtSize(total)}</div>
        ${sf.files.map(f=>`<div class="co-file"><div class="co-file-icon">↑</div><div class="co-file-name" title="${f.name}">${f.name}</div><div class="co-file-size">${fmtSize(f.size)}</div></div>`).join('')}
      </div>`;
    }
    html += `<div class="co-status warn" style="display:block">⚠ 将把 ${totalFiles} 个文件从 ${seasonFolders.length} 个 Season 文件夹移到「${folderName}」下，并删除空 Season 文件夹</div>`;
    html += progressHTML();
    body.innerHTML = html;
    renderActionBar('execute');
  }

  async function execFlatten() {
    if (!scanResult) return;
    const { cid: parentCid, seasonFolders } = scanResult;
    renderActionBar('executing', { label: '展平中…' });
    const tick = showProgress(seasonFolders.length * 3);

    try {
      for (const sf of seasonFolders) {
        if (sf.files.length > 0) {
          const fids = sf.files.map(f=>f.fid);
          const mr = await API.moveFiles(parentCid, fids);
          if (mr.state===false&&mr.errno) throw new Error(`移动 ${sf.name} 文件失败`);
          tick(`已移出 ${sf.name} 的 ${fids.length} 个文件`);
        } else { tick(`${sf.name} 无文件`); }
        await delay(300);

        tick(`正在删除 ${sf.name}…`);
        const dr = await API.deleteFolder(sf.cid, sf.parentCid);
        if (dr.state===false&&dr.errno) {
          console.warn(`删除 ${sf.name} 失败:`, dr);
          tick(`⚠ ${sf.name} 删除失败`);
        } else {
          tick(`已删除 ${sf.name}`);
        }
        await delay(200);
      }
      document.getElementById('co-bar').style.width='100%';
      setStatus('success',`✓ 展平完成！已移出所有文件并删除 Season 文件夹。`);
      renderActionBar('done');
      setTimeout(softRefresh, 600);
    } catch(e) {
      setStatus('error','✗ '+e.message);
      renderActionBar('execute');
    }
  }

  /* ═══════════════════════════════════
     3. 清理杂项（增强版：多条件筛选器）
     ═══════════════════════════════════ */

  /** 从 DOM 读取当前筛选器值 */
  function syncFilterFromDOM() {
    const g = id => document.getElementById(id);
    if (!g('co-f-ext-on')) return;
    cleanFilter.extEnabled = g('co-f-ext-on').checked;
    cleanFilter.extList = g('co-f-ext').value;
    cleanFilter.kwEnabled = g('co-f-kw-on').checked;
    cleanFilter.kwList = g('co-f-kw').value;
    cleanFilter.sizeEnabled = g('co-f-sz-on').checked;
    cleanFilter.sizeMin = g('co-f-sz-min').value;
    cleanFilter.sizeMax = g('co-f-sz-max').value;
    // type chips
    cleanFilter.typeEnabled = g('co-f-type-on').checked;
    cleanFilter.typeList = [];
    document.querySelectorAll('#co-type-chips .co-type-chip.active').forEach(c => {
      cleanFilter.typeList.push(parseInt(c.dataset.typeVal, 10));
    });
    saveLastFilter();
  }

  /** 用当前筛选器重新过滤已缓存的文件列表并渲染结果 */
  function applyFilterAndRender() {
    if (!scanResult || !scanResult.allFiles) return;
    const { allFiles } = scanResult;
    const results = document.getElementById('co-clean-results');
    if (!results) return;

    const matched = [];
    for (const f of allFiles) {
      const r = matchFilter(f);
      if (r.matched) matched.push({ ...f, reasons: r.reasons });
    }

    scanResult.junk = matched;

    if (!matched.length) {
      results.innerHTML = `<div class="co-empty"><div class="co-empty-icon">✨</div><p>没有匹配的文件</p><p style="font-size:12px;color:${C.textMuted}">${describeFilter()}</p></div>`;
      renderActionBar('empty');
      return;
    }

    const totalSize = matched.reduce((s,f)=>s+f.size,0);
    results.innerHTML = `<div class="co-group">
      <div class="co-group-title">待清理文件 <span class="co-danger-tag">${matched.length} 个 · ${fmtSize(totalSize)}</span></div>
      <div class="co-group-sub">${describeFilter()}</div>
      ${matched.map(f=>{
        const ph = f.path ? `<span class="co-file-path">${f.path}</span>` : '';
        return `<div class="co-file"><div class="co-file-icon danger">✗</div><div class="co-file-name" title="${f.path}${f.name}">${ph}${f.name}</div>${matchTagsHTML(f.reasons)}<div class="co-file-type">.${f.ext}</div><div class="co-file-size">${fmtSize(f.size)}</div></div>`;
      }).join('')}
    </div>
    <div class="co-status warn" style="display:block">⚠ 将把 ${matched.length} 个文件移入回收站（可恢复）</div>` + progressHTML();
    renderActionBar('execute');
  }

  /** 渲染筛选器面板 + 绑定事件 + 挂载实时预览 */
  function renderFilterUI() {
    const f = cleanFilter;
    const presets = loadPresets();
    const presetBtns = presets.map((p, i) =>
      `<button class="co-config-btn" data-preset-idx="${i}" title="单击加载 / 右键删除">${p.name}</button>`
    ).join('');

    // 类型 chips（1~6 全部可选，用户可能想清理低质量视频等）
    const typeChips = [1,2,3,4,5,6].map(t => {
      const info = FILE_TYPES[t];
      const active = f.typeEnabled && f.typeList.includes(t) ? 'active' : '';
      const disabled = f.typeEnabled ? '' : 'disabled';
      return `<button class="co-type-chip ${active}" ${disabled} data-type-val="${t}">${info.icon} ${info.label}</button>`;
    }).join('');

    const html = `<div class="co-filter-panel" id="co-filter-panel">
      <div class="co-filter-title">
        <span class="co-filter-title-left">🔍 清理筛选条件</span>
        <div class="co-logic-toggle" id="co-logic-toggle">
          <button class="co-logic-opt ${f.logic==='and'?'active':''}" data-logic="and">全部满足</button>
          <button class="co-logic-opt ${f.logic==='or'?'active':''}" data-logic="or">任一满足</button>
        </div>
      </div>
      <div class="co-filter-row">
        <input type="checkbox" class="co-filter-check" id="co-f-type-on" ${f.typeEnabled?'checked':''}>
        <label class="co-filter-label" for="co-f-type-on">类型</label>
        <div class="co-type-chips" id="co-type-chips">${typeChips}</div>
      </div>
      <div class="co-filter-row">
        <input type="checkbox" class="co-filter-check" id="co-f-ext-on" ${f.extEnabled?'checked':''}>
        <label class="co-filter-label" for="co-f-ext-on">格式</label>
        <input type="text" class="co-filter-input" id="co-f-ext" placeholder="nfo, txt, jpg, png …" value="${escAttr(f.extList)}" ${f.extEnabled?'':'disabled'}>
      </div>
      <div class="co-filter-row">
        <input type="checkbox" class="co-filter-check" id="co-f-kw-on" ${f.kwEnabled?'checked':''}>
        <label class="co-filter-label" for="co-f-kw-on">关键词</label>
        <input type="text" class="co-filter-input" id="co-f-kw" placeholder="sample, trailer …" value="${escAttr(f.kwList)}" ${f.kwEnabled?'':'disabled'}>
      </div>
      <div class="co-filter-row">
        <input type="checkbox" class="co-filter-check" id="co-f-sz-on" ${f.sizeEnabled?'checked':''}>
        <label class="co-filter-label" for="co-f-sz-on">大小</label>
        <input type="text" class="co-filter-input co-filter-narrow" id="co-f-sz-min" placeholder="最小" value="${escAttr(f.sizeMin)}" ${f.sizeEnabled?'':'disabled'}>
        <span class="co-filter-unit">MB</span>
        <span class="co-filter-sep">~</span>
        <input type="text" class="co-filter-input co-filter-narrow" id="co-f-sz-max" placeholder="最大" value="${escAttr(f.sizeMax)}" ${f.sizeEnabled?'':'disabled'}>
        <span class="co-filter-unit">MB</span>
      </div>
      <div class="co-config-bar" id="co-config-bar">
        <button class="co-config-btn" id="co-cfg-save">💾 保存预设</button>
        <button class="co-config-btn" id="co-cfg-reset">↺ 重置</button>
        ${presets.length ? '<span class="co-config-divider"></span>'+presetBtns : '<span class="co-config-hint">保存预设方便下次快速使用</span>'}
      </div>
      <div id="co-save-dialog" style="display:none"></div>
    </div>`;

    return html;
  }

  function escAttr(s) { return (s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

  /** 绑定筛选器面板所有事件 */
  function bindFilterPanel() {
    const panel = document.getElementById('co-filter-panel');
    if (!panel) return;

    // AND/OR
    panel.querySelectorAll('#co-logic-toggle .co-logic-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        cleanFilter.logic = btn.dataset.logic;
        panel.querySelectorAll('#co-logic-toggle .co-logic-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        saveLastFilter();
        liveRefresh();
      });
    });

    // 类型 checkbox + chips
    const typeOn = document.getElementById('co-f-type-on');
    const typeChipsEl = document.getElementById('co-type-chips');
    typeOn.addEventListener('change', () => {
      const chips = typeChipsEl.querySelectorAll('.co-type-chip');
      chips.forEach(c => { if (typeOn.checked) c.removeAttribute('disabled'); else c.setAttribute('disabled',''); });
      liveRefresh();
    });
    typeChipsEl.querySelectorAll('.co-type-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        liveRefresh();
      });
    });

    // 各个 checkbox → 启用/禁用对应 input
    const pairs = [
      ['co-f-ext-on', 'co-f-ext'],
      ['co-f-kw-on',  'co-f-kw'],
    ];
    pairs.forEach(([cbId, inputId]) => {
      const cb = document.getElementById(cbId);
      const input = document.getElementById(inputId);
      cb.addEventListener('change', () => { input.disabled = !cb.checked; liveRefresh(); });
      input.addEventListener('input', debounced(liveRefresh, 300));
    });

    // 大小 checkbox
    const szOn = document.getElementById('co-f-sz-on');
    const szMin = document.getElementById('co-f-sz-min');
    const szMax = document.getElementById('co-f-sz-max');
    szOn.addEventListener('change', () => {
      szMin.disabled = !szOn.checked;
      szMax.disabled = !szOn.checked;
      liveRefresh();
    });
    szMin.addEventListener('input', debounced(liveRefresh, 300));
    szMax.addEventListener('input', debounced(liveRefresh, 300));

    // 保存预设
    document.getElementById('co-cfg-save').addEventListener('click', showSaveDialog);

    // 重置
    document.getElementById('co-cfg-reset').addEventListener('click', () => {
      Object.assign(cleanFilter, { ...DEFAULT_FILTER });
      saveLastFilter();
      refreshFilterDOM();
      liveRefresh();
    });

    // 预设按钮
    bindPresetButtons();
  }

  function liveRefresh() {
    syncFilterFromDOM();
    // 仅当已有扫描缓存时才实时过滤；未扫描时只保存配置
    if (!scanResult?.allFiles) return;

    // 如果上次扫描用了服务端 suffix，且现在 suffix 条件变化了 → 需要重新扫描
    if (scanResult.pushedSuffix) {
      const currentSuffix = buildSuffixParam();
      if (currentSuffix !== scanResult.pushedSuffix) {
        const resultsEl = document.getElementById('co-clean-results');
        if (resultsEl) {
          resultsEl.innerHTML = `<div class="co-status warn" style="display:block">
            ⚠ 格式条件已变更（上次扫描用了服务端过滤），请重新扫描以获取准确结果
          </div>`;
        }
        renderActionBar('clean-ready');
        return;
      }
    }

    applyFilterAndRender();
  }

  let _debounceTimers = {};
  function debounced(fn, ms) {
    const key = fn.name || Math.random();
    return function(...args) {
      clearTimeout(_debounceTimers[key]);
      _debounceTimers[key] = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** 刷新筛选器 DOM 值（用于重置/加载预设后） */
  function refreshFilterDOM() {
    const f = cleanFilter;
    const g = id => document.getElementById(id);
    if (!g('co-f-ext-on')) return;
    g('co-f-ext-on').checked = f.extEnabled;
    g('co-f-ext').value = f.extList;
    g('co-f-ext').disabled = !f.extEnabled;
    g('co-f-kw-on').checked = f.kwEnabled;
    g('co-f-kw').value = f.kwList;
    g('co-f-kw').disabled = !f.kwEnabled;
    g('co-f-sz-on').checked = f.sizeEnabled;
    g('co-f-sz-min').value = f.sizeMin;
    g('co-f-sz-min').disabled = !f.sizeEnabled;
    g('co-f-sz-max').value = f.sizeMax;
    g('co-f-sz-max').disabled = !f.sizeEnabled;
    // type
    g('co-f-type-on').checked = f.typeEnabled;
    document.querySelectorAll('#co-type-chips .co-type-chip').forEach(c => {
      const val = parseInt(c.dataset.typeVal, 10);
      c.classList.toggle('active', f.typeList.includes(val));
      if (f.typeEnabled) c.removeAttribute('disabled'); else c.setAttribute('disabled','');
    });
    // logic toggle
    const panel = document.getElementById('co-filter-panel');
    if (panel) {
      panel.querySelectorAll('#co-logic-toggle .co-logic-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.logic === f.logic);
      });
    }
  }

  function showSaveDialog() {
    const dialog = document.getElementById('co-save-dialog');
    if (!dialog) return;
    dialog.style.display = 'block';
    dialog.innerHTML = `<div class="co-save-row">
      <input type="text" class="co-save-input" id="co-preset-name" placeholder="输入预设名称…" maxlength="20">
      <button class="co-save-confirm" id="co-preset-confirm">保存</button>
      <button class="co-save-cancel" id="co-preset-cancel">取消</button>
    </div>`;
    const nameInput = document.getElementById('co-preset-name');
    nameInput.focus();
    document.getElementById('co-preset-confirm').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.style.borderColor = C.error; return; }
      const presets = loadPresets();
      const idx = presets.findIndex(p => p.name === name);
      const entry = { name, filter: { ...cleanFilter } };
      if (idx >= 0) presets[idx] = entry; else presets.push(entry);
      savePresets(presets);
      dialog.style.display = 'none';
      refreshPresetsUI();
    });
    document.getElementById('co-preset-cancel').addEventListener('click', () => { dialog.style.display='none'; });
    nameInput.addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('co-preset-confirm').click(); });
  }

  function bindPresetButtons() {
    document.querySelectorAll('[data-preset-idx]').forEach(btn => {
      const idx = parseInt(btn.dataset.presetIdx, 10);
      btn.addEventListener('click', () => {
        const presets = loadPresets();
        if (presets[idx]) {
          Object.assign(cleanFilter, presets[idx].filter);
          saveLastFilter();
          refreshFilterDOM();
          liveRefresh();
        }
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const presets = loadPresets();
        if (presets[idx] && confirm(`删除预设「${presets[idx].name}」？`)) {
          presets.splice(idx, 1);
          savePresets(presets);
          refreshPresetsUI();
        }
      });
    });
  }

  function refreshPresetsUI() {
    const bar = document.getElementById('co-config-bar');
    if (!bar) return;
    const presets = loadPresets();
    const presetBtns = presets.map((p, i) =>
      `<button class="co-config-btn" data-preset-idx="${i}" title="单击加载 / 右键删除">${p.name}</button>`
    ).join('');

    // 重建整个 config bar
    bar.innerHTML = `
      <button class="co-config-btn" id="co-cfg-save">💾 保存预设</button>
      <button class="co-config-btn" id="co-cfg-reset">↺ 重置</button>
      ${presets.length ? '<span class="co-config-divider"></span>'+presetBtns : '<span class="co-config-hint">保存预设方便下次快速使用</span>'}`;

    document.getElementById('co-cfg-save').addEventListener('click', showSaveDialog);
    document.getElementById('co-cfg-reset').addEventListener('click', () => {
      Object.assign(cleanFilter, { ...DEFAULT_FILTER });
      saveLastFilter();
      refreshFilterDOM();
      liveRefresh();
    });
    bindPresetButtons();
  }

  /**
   * 构建服务端 suffix 参数（如果格式筛选已启用）
   * 115 API 的 suffix 参数支持逗号分隔多个后缀
   */
  function buildSuffixParam() {
    if (!cleanFilter.extEnabled || !cleanFilter.extList.trim()) return '';
    return cleanFilter.extList.split(/[,，;；\s]+/)
      .map(e => e.replace(/^\./,'').toLowerCase().trim())
      .filter(Boolean).join(',');
  }

  /**
   * 清理面板初始化：仅展示筛选器，不自动扫描
   * 用户需要手动点击「开始扫描」
   */
  function showCleanPanel() {
    const body = document.getElementById('co-body');
    body.innerHTML = renderFilterUI() + `<div id="co-clean-results">
      <div class="co-empty">
        <div class="co-empty-icon">🔍</div>
        <p>配置好筛选条件后，点击下方「开始扫描」</p>
        <p style="font-size:11px;color:${C.textMuted}">扫描会递归遍历子文件夹，请确认条件后再执行</p>
      </div>
    </div>`;
    renderActionBar('clean-ready');
    bindFilterPanel();
  }

  /**
   * 扫描清理：递归扫描，suffix 走服务端过滤以减少数据量
   * type / 关键词 / 大小 均在客户端过滤
   */
  async function scanClean() {
    // 先同步最新的筛选器状态
    syncFilterFromDOM();

    const resultsEl = document.getElementById('co-clean-results');
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="co-status info" style="display:block">正在扫描文件…</div>`;
    }
    renderActionBar('scanning');

    const cid = getCid();
    const allFiles = [];
    let dirCount = 0, fileCount = 0;

    // 服务端 suffix 过滤：减少每次 API 返回的文件数量
    const suffix = buildSuffixParam();
    // 是否有仅客户端的筛选条件（关键词/大小/类型）
    const hasClientFilter = (cleanFilter.kwEnabled && cleanFilter.kwList.trim())
                          || cleanFilter.sizeEnabled
                          || (cleanFilter.typeEnabled && cleanFilter.typeList.length > 0);
    // 是否需要全量扫描（无 suffix 且有客户端条件，或无任何条件 → 默认清理非媒体）
    const needFullScan = !suffix || hasClientFilter;

    /**
     * 递归扫描策略：
     * - 有 suffix 且无其他客户端条件 → 只传 suffix（服务端过滤，大幅减少数据）
     * - 有 suffix 且有客户端条件（OR 模式）→ 全量扫描（否则 suffix 会漏掉仅匹配客户端条件的文件）
     * - 有 suffix 且有客户端条件（AND 模式）→ 传 suffix（AND 语义下 suffix 是必要条件，可安全下推）
     * - 无 suffix → 全量扫描
     */
    const pushSuffix = suffix && (cleanFilter.logic === 'and' || !hasClientFilter);

    async function scanDir(dirCid, prefix) {
      const opts = {};
      if (pushSuffix) opts.suffix = suffix;

      const data = await API.listFiles(dirCid, opts);
      for (const f of (data.data||[])) {
        if (isFolder(f)) {
          dirCount++;
          if (resultsEl && dirCount % 3 === 0) {
            const st = resultsEl.querySelector('.co-status');
            if (st) st.textContent = `正在扫描… ${dirCount} 个文件夹 / ${fileCount} 个文件`;
          }
          await scanDir(f.cid, prefix+f.n+'/');
          await delay(120);
        } else {
          fileCount++;
          allFiles.push({ fid:f.fid, name:f.n, size:f.s||0, path:prefix, ext:extOf(f.n) });
        }
      }
    }

    try {
      await scanDir(cid, '');
    } catch(e) {
      if (resultsEl) resultsEl.innerHTML = `<div class="co-status error" style="display:block">扫描失败：${e.message}</div>`;
      renderActionBar('clean-ready');
      return;
    }

    scanResult = { allFiles, cid, pushedSuffix: pushSuffix ? suffix : '' };

    if (pushSuffix) {
      console.log(`[115整理器] 服务端 suffix 过滤: ${suffix}，遍历 ${dirCount} 个目录，获取 ${fileCount} 个文件`);
    } else {
      console.log(`[115整理器] 全量扫描，遍历 ${dirCount} 个目录，获取 ${fileCount} 个文件`);
    }

    applyFilterAndRender();
  }

  async function execClean() {
    if (!scanResult?.junk?.length) return;
    const { junk } = scanResult;
    renderActionBar('executing', { label: '清理中…' });
    const bs = 50, batches = [];
    for (let i=0;i<junk.length;i+=bs) batches.push(junk.slice(i,i+bs));
    const tick = showProgress(batches.length);

    try {
      for (let i=0;i<batches.length;i++) {
        const fids = batches[i].map(f=>f.fid);
        const res = await API.deleteFiles(fids);
        if (res.state===false&&res.errno) throw new Error(`删除失败`);
        tick(`已清理 ${Math.min((i+1)*bs,junk.length)} / ${junk.length}`);
        await delay(300);
      }
      document.getElementById('co-bar').style.width='100%';
      setStatus('success',`✓ 清理完成！已将 ${junk.length} 个文件移入回收站。`);
      renderActionBar('done');
      setTimeout(softRefresh, 600);
    } catch(e) {
      setStatus('error','✗ '+e.message);
      renderActionBar('execute');
    }
  }

  /* ─── 初始化 ─── */
  const chk = setInterval(() => {
    if (document.querySelector('[class*="file"]')||document.querySelector('main')) { clearInterval(chk); createUI(); }
  }, 500);
  setTimeout(() => { clearInterval(chk); if (!document.getElementById('claude-org-fab')) createUI(); }, 5000);
})();
