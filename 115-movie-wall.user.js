// ==UserScript==
// @name         115网盘影视墙
// @namespace    https://115.com/
// @version      4.0.3
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-movie-wall.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-movie-wall.user.js
// @description  将115网盘影视文件夹变为精美影视墙，海报数据来自TMDB。TMDB Read Access Token (v4) 运行时由用户输入并持久化，源码不含任何 token。
// @author       ggvisPro
// @modified     2026-07-06 00:26:46 CST
// @match        https://115.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=115.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.themoviedb.org
// @connect      image.tmdb.org
// @run-at       document-idle
// ==/UserScript==

(function(){
'use strict';

const CFG={
  IMG:'https://image.tmdb.org/t/p/', PS:'w342', BD:'w780',
  ROOT:'影视',
  CAT:{'动漫2020+':'tv','动漫2010+':'tv','动漫2009-':'tv','欧美剧':'tv','国产剧':'tv','日韩剧':'tv','美漫':'tv','纪录片':'tv','综艺':'tv','Others':'tv','电影':'movie'},
  SHORT:{'动漫2020+':'动漫20','动漫2010+':'动漫10','动漫2009-':'动漫09','欧美剧':'欧美','国产剧':'国产','日韩剧':'日韩','美漫':'美漫','纪录片':'纪录','综艺':'综艺','Others':'Others','电影':'电影'},
  PFX:'mw6_', TTL:30*24*3600*1000, CW:185, GAP:20, P115:200, PW:60,
};

const S={active:false,vm:'wall',mt:'tv',cat:'',rootCid:null,catCids:{},cid:null,cards:[],filter:'',sort:'year',sd:'desc',fc:'all',wp:0,af:[]};

/* ── 自定义文件夹（持久化到 GM_setValue） ── */
const CF={
  _key:'mw_custom_folders',
  getAll(){try{return JSON.parse(GM_getValue(this._key,'{}'));}catch{return {};}},
  set(cid,type,name){const all=this.getAll();all[String(cid)]={type,name,ts:Date.now()};GM_setValue(this._key,JSON.stringify(all));},
  remove(cid){const all=this.getAll();delete all[String(cid)];GM_setValue(this._key,JSON.stringify(all));},
  get(cid){return this.getAll()[String(cid)]||null;},
  has(cid){return !!this.getAll()[String(cid)];},
};

/* ── 缓存 ── */
const $={
  g(k){try{const r=localStorage.getItem(CFG.PFX+k);if(!r)return null;const o=JSON.parse(r);if(Date.now()-o.t>CFG.TTL){localStorage.removeItem(CFG.PFX+k);return null;}return o.d;}catch{return null;}},
  s(k,d){try{localStorage.setItem(CFG.PFX+k,JSON.stringify({t:Date.now(),d}));}catch{}},
  d(k){localStorage.removeItem(CFG.PFX+k);},
  clear(){const ks=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(CFG.PFX))ks.push(k);}ks.forEach(k=>localStorage.removeItem(k));},
  exportAll(){const data={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(CFG.PFX))data[k]=localStorage.getItem(k);}return data;},
  importAll(data){for(const[k,v]of Object.entries(data)){if(k.startsWith(CFG.PFX))localStorage.setItem(k,v);}},
};

function parseName(n){let c=n.replace(/\(\d+\)$/,'').trim();const m=c.match(/[\(（](\d{4})[\)）]\s*$/);let y=m?m[1]:null,t=m?c.replace(/[\(（]\d{4}[\)）]\s*$/,'').trim():c;t=t.replace(/\s*[-–]\s*Season\s*\d+/i,'').trim();return{title:t,year:y};}

/* ── TMDB token（运行时输入并持久化，源码不含任何 token）──
   v4 Read Access Token 申请：https://www.themoviedb.org/settings/api */
const TMDB_TOKEN_STORAGE='mw_tmdb_token';
let _tmdbTokenDeclined=false;
function tmdbToken(){return (GM_getValue(TMDB_TOKEN_STORAGE,'')||'').trim();}
function setTmdbToken(t){GM_setValue(TMDB_TOKEN_STORAGE,(t||'').trim());_tmdbTokenDeclined=false;}
function ensureTmdbToken(){
  let t=tmdbToken();if(t)return t;
  if(_tmdbTokenDeclined)return '';
  t=(prompt('请输入 TMDB Read Access Token (v4)\n申请地址: https://www.themoviedb.org/settings/api')||'').trim();
  if(t){setTmdbToken(t);return t;}
  _tmdbTokenDeclined=true;return '';
}

/* ── 限速队列 ── */
const RL={
  _a:Promise.resolve(),_b:Promise.resolve(),
  async a115(cid,off=0,lim=200){await(this._a=this._a.then(()=>new Promise(r=>setTimeout(r,2000+Math.random()*500))));const r=await fetch(`https://webapi.115.com/files?aid=1&cid=${cid}&offset=${off}&limit=${lim}&type=0&show_dir=1&fc_mix=0&natsort=1&count_folders=1&format=json&custom_order=0`,{credentials:'include'});return r.json();},
  async tmdb(p){await(this._b=this._b.then(()=>new Promise(r=>setTimeout(r,250))));const tok=ensureTmdbToken();if(!tok)return Promise.reject(new Error('未设置 TMDB Read Access Token'));return new Promise((res,rej)=>{GM_xmlhttpRequest({method:'GET',url:`https://api.themoviedb.org/3${p}`,headers:{'Authorization':`Bearer ${tok}`,'Content-Type':'application/json;charset=utf-8'},onload(r){try{res(JSON.parse(r.responseText));}catch(e){rej(e);}},onerror:rej,ontimeout:rej});});},
};

/* ── TMDB ── */
async function tSearch(title,year,type){
  const ck=`s_${type}_${title}_${year||''}`;const cc=$.g(ck);if(cc!==null)return cc;
  const tr=async(q,l,y)=>{let u=`/search/${type}?query=${encodeURIComponent(q)}&language=${l}&page=1`;if(y)u+=type==='movie'?`&year=${y}`:`&first_air_date_year=${y}`;return(await RL.tmdb(u)).results?.[0]||null;};
  let r=null;try{r=await tr(title,'zh-CN',year);}catch{}
  if(!r&&year){try{r=await tr(title,'zh-CN',null);}catch{}}
  if(!r){try{r=await tr(title,'en-US',year);}catch{}}
  $.s(ck,r);return r;
}
async function tDetail(id,type){const ck=`d_${type}_${id}`;const cc=$.g(ck);if(cc)return cc;try{const d=await RL.tmdb(`/${type}/${id}?language=zh-CN`);$.s(ck,d);return d;}catch{return null;}}

/* ── 115 API ── */
async function fetchFolders(cid){
  const items=[];let off=0,tot=Infinity;
  while(off<tot){const d=await RL.a115(cid,off,CFG.P115);if(!d||d.errNo!==0)break;tot=d.count||0;if(d.data)items.push(...d.data);off+=CFG.P115;if(!d.data?.length)break;}
  return items.filter(i=>i.cid&&!i.fid).map(i=>({name:i.n,cid:i.cid}));
}

async function scanLocal(cid){
  const ck=`lc_${cid}`;const cc=$.g(ck);if(cc)return cc;
  const seasonEps={};
  try{
    const items=[];let off=0,tot=Infinity;
    while(off<tot){const d=await RL.a115(cid,off,CFG.P115);if(!d||d.errNo!==0)break;tot=d.count||0;if(d.data)items.push(...d.data);off+=CFG.P115;if(!d.data?.length)break;}
    for(const it of items){if(it.fid){const m=it.n.match(/S(\d+)E(\d+)/i);if(m&&+m[1]!==0){const sn=+m[1];if(!seasonEps[sn])seasonEps[sn]=new Set();seasonEps[sn].add(m[1]+'E'+m[2]);}}}
    if(!Object.keys(seasonEps).length){
      for(const sf of items.filter(i=>i.cid&&!i.fid)){
        const sm=sf.n.match(/Season\s*(\d+)/i)||sf.n.match(/S(\d+)/i)||sf.n.match(/第(\d+)季/);
        if(!sm||+sm[1]===0)continue;const sn=+sm[1];if(!seasonEps[sn])seasonEps[sn]=new Set();
        try{const sub=[];let o2=0,t2=Infinity;
          while(o2<t2){const d2=await RL.a115(sf.cid,o2,CFG.P115);if(!d2||d2.errNo!==0)break;t2=d2.count||0;if(d2.data)sub.push(...d2.data);o2+=CFG.P115;if(!d2.data?.length)break;}
          for(const f of sub){if(f.fid){const m2=f.n.match(/S(\d+)E(\d+)/i);if(m2&&+m2[1]!==0)seasonEps[sn].add(m2[1]+'E'+m2[2]);}}
        }catch{}
      }
    }
  }catch{}
  const perSeason={};let totalEps=0;
  for(const[sn,eps]of Object.entries(seasonEps)){perSeason[sn]=eps.size;totalEps+=eps.size;}
  const result={seasons:Object.keys(seasonEps).length,episodes:totalEps,perSeason};
  $.s(ck,result);return result;
}

/* ── URL / 路径 ── */
function getCid(){return new URLSearchParams(location.search).get('cid')||'0';}
function getBread(){
  for(const sel of ['.place-list a','.path-tab a','.nav-path a','.breadcrumb a','.file-path a','[class*="path"] a','[class*="bread"] a']){
    const els=document.querySelectorAll(sel);if(els.length>0){const a=[];els.forEach(e=>{const t=e.textContent.trim();if(t)a.push(t);});if(a.length)return a;}}
  return[];
}
function shouldActivate(){
  const cid=getCid();
  /* 优先：自定义文件夹 */
  const custom=CF.get(cid);
  if(custom)return{active:true,mt:custom.type,cat:custom.name||'自定义',isCustom:true};
  /* 原有逻辑：面包屑 */
  const p=getBread(),i=p.indexOf(CFG.ROOT);
  if(i===-1)return cidBased();if(i===p.length-1)return{active:false};
  const cat=p[i+1];if(!(cat in CFG.CAT))return{active:false};
  return(p.length-1-i===1)?{active:true,mt:CFG.CAT[cat],cat}:{active:false};
}
function cidBased(){const cid=getCid(),sv=$.g('cat_cids')||{};for(const[c,cc]of Object.entries(sv))if(String(cc)===String(cid)&&c in CFG.CAT)return{active:true,mt:CFG.CAT[c],cat:c};return{active:false};}
async function discoverCids(){const sv=$.g('cat_cids');if(sv&&Object.keys(sv).length>0){S.catCids=sv;return;}const rid=await findRoot();if(!rid)return;const fs=await fetchFolders(rid);const m={};for(const f of fs)if(f.name in CFG.CAT)m[f.name]=f.cid;S.catCids=m;$.s('cat_cids',m);}
async function findRoot(){if(S.rootCid)return S.rootCid;const sv=$.g('root_cid');if(sv){S.rootCid=sv;return sv;}try{const d=await RL.a115('0',0,500);if(d?.data)for(const i of d.data)if(i.n===CFG.ROOT&&i.cid){S.rootCid=i.cid;$.s('root_cid',i.cid);return i.cid;}}catch{}return null;}

/* ── 样式 ── */
function injectCSS(){
  if(document.getElementById('mw-css'))return;const el=document.createElement('style');el.id='mw-css';
  el.textContent=`
:root{--mw-bg:#F5F0EA;--mw-sf:#FFF;--mw-p:#D97706;--mw-pl:#F59E0B;--mw-t:#1A1A1A;--mw-t2:#6B7280;--mw-tm:#9CA3AF;--mw-bd:#E5DDD3;--mw-ac:#B45309;--mw-r:12px;--mw-sh:0 2px 8px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);--mw-shh:0 8px 24px rgba(0,0,0,.12),0 2px 8px rgba(0,0,0,.06);}
#mw-root{position:absolute;top:0;left:0;right:0;bottom:0;overflow-y:auto;overflow-x:hidden;background:var(--mw-bg);padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;z-index:10;box-sizing:border-box;}
.mw-bar{display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
.mw-bar-title{font-size:18px;font-weight:700;color:var(--mw-t);}
.mw-bar-cnt{font-size:12px;color:var(--mw-tm);font-weight:400;margin-left:4px;}
.mw-sep{width:1px;height:20px;background:var(--mw-bd);margin:0 2px;flex-shrink:0;}
.mw-sbox{display:flex;align-items:center;background:var(--mw-sf);border:1.5px solid var(--mw-bd);border-radius:8px;padding:4px 10px;gap:5px;}
.mw-sbox:focus-within{border-color:var(--mw-p);box-shadow:0 0 0 3px rgba(217,119,6,.12);}
.mw-sbox input{border:0;outline:0;background:0;font-size:12px;color:var(--mw-t);width:100px;}
.mw-sbox input::placeholder{color:var(--mw-tm);}
.mw-grp{display:flex;align-items:center;gap:2px;padding:2px;background:#F0EBE3;border-radius:16px;}
.mw-ch{padding:3px 9px;font-size:11px;font-weight:500;border:0;border-radius:14px;background:transparent;color:var(--mw-t2);cursor:pointer;transition:all .12s;white-space:nowrap;user-select:none;}
.mw-ch:hover:not(.on){background:rgba(217,119,6,.08);}
.mw-ch.on{background:var(--mw-p);color:#FFF;box-shadow:0 1px 4px rgba(217,119,6,.3);}
.mw-ch .arr{font-size:9px;margin-left:2px;opacity:.7;}
.mw-cats{display:flex;gap:3px;align-items:center;flex-wrap:wrap;}
.mw-ct{padding:2px 7px;font-size:10px;font-weight:500;border-radius:4px;cursor:pointer;transition:all .12s;color:var(--mw-t2);background:var(--mw-sf);border:1px solid var(--mw-bd);white-space:nowrap;user-select:none;line-height:1.5;}
.mw-ct:hover{border-color:var(--mw-p);color:var(--mw-p);}
.mw-ct.on{background:var(--mw-p);color:#FFF;border-color:var(--mw-p);font-weight:600;}
.mw-bar-r{margin-left:auto;display:flex;align-items:center;gap:6px;}
.mw-ib{padding:4px 10px;font-size:11px;border:1.5px solid var(--mw-bd);border-radius:8px;background:var(--mw-sf);color:var(--mw-t2);cursor:pointer;transition:all .12s;white-space:nowrap;}
.mw-ib:hover{border-color:var(--mw-p);color:var(--mw-p);}
.mw-cc{font-size:10px;color:var(--mw-tm);cursor:pointer;text-decoration:underline;background:0;border:0;padding:0;}.mw-cc:hover{color:var(--mw-p);}
.mw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${CFG.CW}px,1fr));gap:${CFG.GAP}px;}
.mw-c{position:relative;background:var(--mw-sf);border-radius:var(--mw-r);overflow:hidden;box-shadow:var(--mw-sh);transition:transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s;cursor:pointer;}
.mw-c:hover{transform:translateY(-6px);box-shadow:var(--mw-shh);}
.mw-c-p{position:relative;width:100%;padding-top:150%;background:#E8E0D6;overflow:hidden;}
.mw-c-p img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;transition:transform .4s;}
.mw-c:hover .mw-c-p img{transform:scale(1.05);}
.mw-c-p .mw-ph{position:absolute;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--mw-tm);font-size:40px;background:linear-gradient(135deg,#E8E0D6,#D6CEC4);}
.mw-c-rt{position:absolute;top:8px;right:8px;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);color:#FBBF24;font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;display:flex;align-items:center;gap:3px;}
.mw-c-rt svg{width:11px;height:11px;}
.mw-c-i{padding:10px 12px 10px;}
.mw-c-t{font-size:13px;font-weight:600;color:var(--mw-t);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px;}
.mw-c-tags{display:flex;gap:4px;flex-wrap:wrap;align-items:center;}
.mw-tag{font-size:10px;padding:1px 7px;border-radius:4px;font-weight:600;line-height:1.6;}
.mw-tag-g{background:#DCFCE7;color:#166534;}.mw-tag-y{background:#FEF3C7;color:#92400E;}
.mw-tag-yr{background:#F3F0EB;color:var(--mw-t2);}
.mw-c-ov{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to top,rgba(0,0,0,.85) 0%,rgba(0,0,0,.3) 40%,transparent 60%);opacity:0;transition:opacity .3s;display:flex;flex-direction:column;justify-content:flex-end;padding:14px;pointer-events:none;}
.mw-c:hover .mw-c-ov{opacity:1;pointer-events:auto;}
.mw-c-bs{display:flex;gap:6px;justify-content:flex-end;}
.mw-c-bs button{background:rgba(255,255,255,.15);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.25);color:#FFF;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;transition:background .2s;white-space:nowrap;}
.mw-c-bs button:hover{background:var(--mw-p);border-color:var(--mw-p);}
/* popup */
.mw-pop{position:fixed;z-index:99998;background:var(--mw-sf);border-radius:14px;border:1px solid var(--mw-bd);box-shadow:0 12px 48px rgba(0,0,0,.22);width:380px;max-width:90vw;max-height:70vh;overflow-y:auto;padding:0;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;transform:translateY(6px);}
.mw-pop.vis{opacity:1;pointer-events:auto;transform:translateY(0);cursor:pointer;}
.mw-pop-bd{width:100%;height:170px;object-fit:cover;display:block;border-radius:14px 14px 0 0;}
.mw-pop-b{padding:16px 18px 18px;}
.mw-pop-t{font-size:16px;font-weight:700;color:var(--mw-t);margin-bottom:3px;}
.mw-pop-sub{font-size:11px;color:var(--mw-tm);margin-bottom:8px;}
.mw-pop-ov{font-size:12px;color:var(--mw-t2);line-height:1.7;margin-bottom:12px;}
.mw-pop-tg{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;}
.mw-pop-tg span{font-size:10px;padding:2px 8px;border-radius:20px;background:#FEF3C7;color:var(--mw-ac);font-weight:500;}
.mw-pop-ss{margin-bottom:14px;}
.mw-pop-ss-title{font-size:11px;font-weight:600;color:var(--mw-t);margin-bottom:6px;}
.mw-pop-ss-grid{display:flex;flex-wrap:wrap;gap:4px;}
.mw-pop-ss-item{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600;line-height:1.5;}
.mw-pop-ss-g{background:#DCFCE7;color:#166534;}.mw-pop-ss-y{background:#FEF3C7;color:#92400E;}
/* misc */
.mw-ld{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--mw-tm);gap:10px;font-size:14px;}
.mw-sp{width:20px;height:20px;border:2.5px solid var(--mw-bd);border-top-color:var(--mw-p);border-radius:50%;animation:mwsp .7s linear infinite;}
@keyframes mwsp{to{transform:rotate(360deg)}}
.mw-pg{height:3px;background:var(--mw-bd);border-radius:2px;margin-bottom:14px;overflow:hidden;}
.mw-pg-f{height:100%;background:linear-gradient(90deg,var(--mw-p),var(--mw-pl));border-radius:2px;transition:width .3s;width:0%;}
.mw-mask{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;}
.mw-modal{background:var(--mw-sf);border-radius:16px;padding:28px;width:520px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);}
.mw-modal h3{font-size:18px;font-weight:700;color:var(--mw-t);margin:0 0 20px;}
.mw-modal label{display:block;font-size:13px;font-weight:500;color:var(--mw-t2);margin-bottom:6px;}
.mw-modal input[type="text"],.mw-modal select{width:100%;padding:9px 14px;border:1.5px solid var(--mw-bd);border-radius:10px;font-size:14px;color:var(--mw-t);margin-bottom:16px;outline:0;box-sizing:border-box;}
.mw-modal input:focus,.mw-modal select:focus{border-color:var(--mw-p);box-shadow:0 0 0 3px rgba(217,119,6,.12);}
.mw-ma{display:flex;gap:10px;justify-content:flex-end;margin-top:8px;}
.mw-ma button{padding:9px 22px;border-radius:10px;font-size:14px;font-weight:500;border:0;cursor:pointer;transition:all .2s;}
.mw-bp{background:var(--mw-p);color:#FFF;}.mw-bp:hover{background:var(--mw-ac);}
.mw-bs{background:#F3F0EB;color:var(--mw-t2);}.mw-bs:hover{background:#E8E0D6;}
.mw-bd2{background:#FEE2E2;color:#DC2626;}.mw-bd2:hover{background:#FECACA;}
.mw-sr{max-height:260px;overflow-y:auto;border:1.5px solid var(--mw-bd);border-radius:10px;margin-bottom:16px;}
.mw-sri{display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;transition:background .15s;border-bottom:1px solid var(--mw-bd);}
.mw-sri:last-child{border-bottom:0;}.mw-sri:hover{background:#FFFBF5;}.mw-sri.sel{background:#FEF3C7;}
.mw-sri img{width:40px;height:60px;object-fit:cover;border-radius:6px;background:#E8E0D6;flex-shrink:0;}
.mw-more{display:flex;justify-content:center;padding:24px;grid-column:1/-1;}
.mw-more button{padding:10px 32px;font-size:14px;font-weight:500;border:1.5px solid var(--mw-bd);border-radius:10px;background:var(--mw-sf);color:var(--mw-t2);cursor:pointer;transition:all .2s;}
.mw-more button:hover{border-color:var(--mw-p);color:var(--mw-p);background:#FFFBF5;}
.mw-hidden{display:none!important;}
.mw-empty{text-align:center;padding:60px 20px;color:var(--mw-tm);grid-column:1/-1;}
/* FAB */
#mw-fab{position:fixed;bottom:210px;right:24px;z-index:99997;width:50px;height:50px;padding:0;border-radius:15px;border:0;background:linear-gradient(135deg,#DA7756 0%,#C4643F 100%);color:#FFF;font-size:22px;cursor:pointer;box-shadow:0 4px 16px rgba(218,119,86,.35);display:flex;align-items:center;justify-content:center;transition:all .2s;}
#mw-fab:hover{transform:translateY(-2px) scale(1.05);box-shadow:0 6px 24px rgba(218,119,86,.45);}

/* 管理列表 */
.mw-cf-list{max-height:240px;overflow-y:auto;border:1.5px solid var(--mw-bd);border-radius:10px;margin-bottom:16px;}
.mw-cf-item{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--mw-bd);font-size:13px;}
.mw-cf-item:last-child{border-bottom:0;}
.mw-cf-item .mw-cf-info{flex:1;min-width:0;}
.mw-cf-item .mw-cf-name{font-weight:600;color:var(--mw-t);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mw-cf-item .mw-cf-type{font-size:11px;color:var(--mw-tm);margin-top:2px;}
.mw-cf-item .mw-cf-del{padding:4px 10px;font-size:11px;border:1px solid #FCA5A5;border-radius:6px;background:#FEF2F2;color:#DC2626;cursor:pointer;white-space:nowrap;flex-shrink:0;margin-left:10px;}
.mw-cf-item .mw-cf-del:hover{background:#FEE2E2;}
/* 设置面板按钮 */
.mw-set-btn{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;font-size:14px;text-align:left;border:1.5px solid var(--mw-bd);border-radius:10px;background:var(--mw-sf);color:var(--mw-t);cursor:pointer;transition:all .15s;}
.mw-set-btn:hover{border-color:var(--mw-p);color:var(--mw-p);background:#FFFBF5;}
.mw-set-btn .mw-set-icon{font-size:18px;flex-shrink:0;width:28px;text-align:center;}
.mw-set-btn .mw-set-desc{font-size:11px;color:var(--mw-tm);margin-top:2px;}
.mw-set-btn.danger{border-color:#FCA5A5;color:#DC2626;}
.mw-set-btn.danger:hover{background:#FEF2F2;border-color:#F87171;}
  `;document.head.appendChild(el);
}

const IC={
  star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  search:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
};
const GN={28:'动作',12:'冒险',16:'动画',35:'喜剧',80:'犯罪',99:'纪录',18:'剧情',10751:'家庭',14:'奇幻',36:'历史',27:'恐怖',10402:'音乐',9648:'悬疑',10749:'爱情',878:'科幻',53:'惊悚',10752:'战争',37:'西部',10759:'动作冒险',10765:'科幻奇幻',10767:'脱口秀'};

/* ── 弹窗 (影视卡片hover) ── */
let pop=null,popT=null;
function getPop(){if(!pop){pop=document.createElement('div');pop.className='mw-pop';document.body.appendChild(pop);pop.addEventListener('mouseenter',()=>clearTimeout(popT));pop.addEventListener('mouseleave',()=>hidePop());}return pop;}
function showPop(td,mt,anchor,extra,detail){
  if(!td)return;const p=getPop();
  const t=td.title||td.name||'',ot=td.original_title||td.original_name||'',yr=(td.release_date||td.first_air_date||'').substring(0,4),rt=td.vote_average?td.vote_average.toFixed(1):null,ov=td.overview||'暂无简介',bg=td.backdrop_path?CFG.IMG+CFG.BD+td.backdrop_path:'',url=mt==='movie'?`https://www.themoviedb.org/movie/${td.id}`:`https://www.themoviedb.org/tv/${td.id}`,gs=(td.genre_ids||[]).map(id=>GN[id]).filter(Boolean);
  let ssHtml='';
  if(mt==='tv'&&detail&&extra?.perSeason){
    const seasons=detail.seasons?.filter(s=>s.season_number>0)||[];
    if(seasons.length){
      let items='';
      for(const s of seasons){
        const sn=s.season_number,tmdbEps=s.episode_count||0,localEps=extra.perSeason[sn]||0;
        const full=tmdbEps>0&&localEps>=tmdbEps;
        items+=`<span class="mw-pop-ss-item ${full?'mw-pop-ss-g':'mw-pop-ss-y'}">S${String(sn).padStart(2,'0')} ${localEps}/${tmdbEps}集</span>`;
      }
      ssHtml=`<div class="mw-pop-ss"><div class="mw-pop-ss-title">各季收录</div><div class="mw-pop-ss-grid">${items}</div></div>`;
    }
  }
  p.innerHTML=`${bg?`<img class="mw-pop-bd" src="${bg}">`:''}
    <div class="mw-pop-b">
      <div class="mw-pop-t">${t}${yr?` <span style="font-weight:400;color:var(--mw-tm);">(${yr})</span>`:''}</div>
      ${ot&&ot!==t?`<div class="mw-pop-sub">${ot}</div>`:''}
      ${rt?`<div class="mw-pop-tg"><span>⭐ ${rt}</span>${gs.map(g=>`<span>${g}</span>`).join('')}</div>`:''}
      <div class="mw-pop-ov">${ov}</div>
      ${ssHtml}
    </div>`;
  p.style.cursor='pointer';
  p.onclick=(e)=>{if(!e.target.closest('a'))window.open(url,'_blank');};
  p.style.cssText='position:fixed;left:-9999px;top:0;opacity:1;pointer-events:none;';
  p.classList.add('vis');const ph=p.offsetHeight;p.classList.remove('vis');
  p.style.cssText='';
  const rect=anchor.getBoundingClientRect(),pw=380;
  let left=rect.left+rect.width/2-pw/2,top=rect.top-ph-8;
  if(top<10){top=Math.max(10,rect.top);left=rect.right+12;if(left+pw>innerWidth-10)left=rect.left-pw-12;}
  if(left<10)left=10;if(left+pw>innerWidth-10)left=innerWidth-pw-10;
  p.style.left=left+'px';p.style.top=Math.max(10,top)+'px';p.classList.add('vis');
}
function hidePop(d=180){clearTimeout(popT);popT=setTimeout(()=>{if(pop)pop.classList.remove('vis');},d);}

/* ── 卡片 ── */
function getCardMt(name){const man=$.g(`m_${name}`);return man?.type||S.mt;}
function mkCard(name,td,cid,extra){
  const el=document.createElement('div');el.className='mw-c';el.dataset.fn=name;el.dataset.cid=cid||'';
  const poster=td?.poster_path?CFG.IMG+CFG.PS+td.poster_path:null;
  const title=td?(td.title||td.name||name):parseName(name).title;
  const yr=td?((td.release_date||td.first_air_date||'').substring(0,4)):parseName(name).year;
  const rt=td?.vote_average?td.vote_average.toFixed(1):null;
  const ot=td?(td.original_title||td.original_name||''):'';
  const mt=getCardMt(name);
  const url=td?(mt==='movie'?`https://www.themoviedb.org/movie/${td.id}`:`https://www.themoviedb.org/tv/${td.id}`):null;
  let tagsArr=[];
  if(yr)tagsArr.push(`<span class="mw-tag mw-tag-yr">${yr}</span>`);
  if(extra&&mt==='tv'&&(extra.tmdbSeasons||extra.tmdbEpisodes)){
    const ls=extra.localSeasons||0,ts=extra.tmdbSeasons||0,le=extra.localEpisodes||0,te=extra.tmdbEpisodes||0;
    const sf=ts>0&&ls>=ts,ef=te>0&&le>=te;
    if(ts)tagsArr.push(`<span class="mw-tag ${sf?'mw-tag-g':'mw-tag-y'}">${ls}/${ts}季</span>`);
    if(te)tagsArr.push(`<span class="mw-tag ${ef?'mw-tag-g':'mw-tag-y'}">${le}/${te}集</span>`);
  }
  const tagsHtml=tagsArr.length?`<div class="mw-c-tags">${tagsArr.join('')}</div>`:'';
  el.innerHTML=`<div class="mw-c-p">
    ${poster?`<img src="${poster}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="mw-ph" style="display:none">🎬</div>`:`<div class="mw-ph">🎬</div>`}
    ${rt&&rt!=='0.0'?`<span class="mw-c-rt">${IC.star} ${rt}</span>`:''}
    <div class="mw-c-ov"><div class="mw-c-bs">
      ${url?`<button data-a="tmdb" data-u="${url}">🔗 TMDB</button>`:''}
      <button data-a="refresh">🔄</button>
      <button data-a="edit">✏️ 修正</button>
    </div></div>
  </div><div class="mw-c-i"><div class="mw-c-t" title="${title}${ot&&ot!==title?' ('+ot+')':''}">${title}</div>${tagsHtml}</div>`;
  let ht;
  el.addEventListener('mouseenter',()=>{if(td)ht=setTimeout(async()=>{
    const det=td.id?await tDetail(td.id,mt):null;
    showPop(td,mt,el,extra,det);
  },1000);});
  el.addEventListener('mouseleave',()=>{clearTimeout(ht);hidePop();});
  el.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(b){e.stopPropagation();if(b.dataset.a==='edit')editModal(name,cid);else if(b.dataset.a==='tmdb')window.open(b.dataset.u,'_blank');else if(b.dataset.a==='refresh'){$.d(`lc_${cid}`);refreshCard(name,cid);}return;}if(cid)navTo(cid);});
  return el;
}
function navTo(cid){location.href=`https://115.com/?cid=${cid}&offset=0&mode=wangpan`;}

/* ── 修正对话框 ── */
async function editModal(name,cid){
  injectCSS();
  const{title}=parseName(name);const cmt=getCardMt(name);const mask=document.createElement('div');mask.className='mw-mask';
  mask.innerHTML=`<div class="mw-modal"><h3>修正匹配 — ${name}</h3><label>搜索名称</label><input type="text" class="j-q" value="${title}"><label>类型</label><select class="j-tp"><option value="movie" ${cmt==='movie'?'selected':''}>电影</option><option value="tv" ${cmt==='tv'?'selected':''}>剧集</option></select><label>搜索结果</label><div class="mw-sr"><div class="mw-ld"><div class="mw-sp"></div>搜索中…</div></div><div class="mw-ma"><button class="mw-bd2 j-rst">重置</button><button class="mw-bs j-cancel">取消</button><button class="mw-bp j-ok" disabled>确认</button></div></div>`;
  document.body.appendChild(mask);
  const qi=mask.querySelector('.j-q'),ti=mask.querySelector('.j-tp'),rl=mask.querySelector('.mw-sr'),ok=mask.querySelector('.j-ok');let sel=null;
  async function doS(){const q=qi.value.trim(),tp=ti.value;if(!q)return;rl.innerHTML='<div class="mw-ld"><div class="mw-sp"></div>搜索中…</div>';ok.disabled=true;sel=null;
    try{const d=await RL.tmdb(`/search/${tp}?query=${encodeURIComponent(q)}&language=zh-CN&page=1`);if(!d.results?.length){rl.innerHTML='<div style="padding:16px;text-align:center;color:#9CA3AF;">未找到</div>';return;}rl.innerHTML='';
      d.results.slice(0,10).forEach(it=>{const div=document.createElement('div');div.className='mw-sri';const src=it.poster_path?CFG.IMG+'w92'+it.poster_path:'';
        div.innerHTML=`${src?`<img src="${src}">`:'<div style="width:40px;height:60px;background:#E8E0D6;border-radius:6px;flex-shrink:0;"></div>'}<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:600;color:var(--mw-t);">${it.title||it.name||'?'}</div><div style="font-size:12px;color:var(--mw-tm);">${(it.release_date||it.first_air_date||'').substring(0,4)} · ${it.original_title||it.original_name||''}</div></div>`;
        div.addEventListener('click',()=>{rl.querySelectorAll('.mw-sri').forEach(e=>e.classList.remove('sel'));div.classList.add('sel');sel=it;ok.disabled=false;});rl.appendChild(div);});
    }catch{rl.innerHTML='<div style="padding:16px;text-align:center;color:#DC2626;">失败</div>';}
  }
  doS();let st;qi.addEventListener('input',()=>{clearTimeout(st);st=setTimeout(doS,500);});ti.addEventListener('change',doS);
  mask.querySelector('.j-cancel').addEventListener('click',()=>mask.remove());mask.addEventListener('click',e=>{if(e.target===mask)mask.remove();});
  mask.querySelector('.j-rst').addEventListener('click',()=>{const{title:t,year:y}=parseName(name);['movie','tv'].forEach(tp=>{$.d(`s_${tp}_${t}_${y||''}`);$.d(`s_${tp}_${t}_`);});$.d(`m_${name}`);$.d(`lc_${cid}`);mask.remove();refreshCard(name,cid);});
  ok.addEventListener('click',()=>{if(!sel)return;$.s(`m_${name}`,{id:sel.id,type:ti.value,data:sel});const{title:t,year:y}=parseName(name);$.s(`s_${ti.value}_${t}_${y||''}`,sel);mask.remove();refreshCard(name,cid,sel);});
}
async function refreshCard(name,cid,td){if(!td){const{title,year}=parseName(name);td=await tSearch(title,year,getCardMt(name));}const grid=document.querySelector('.mw-grid');if(!grid)return;const extra=await getExtra(td,cid,name);const old=grid.querySelector(`.mw-c[data-fn="${CSS.escape(name)}"]`);if(old){const nc=mkCard(name,td,cid,extra);old.replaceWith(nc);}const ci=S.cards.findIndex(c=>c.name===name);if(ci!==-1){S.cards[ci].tmdb=td;S.cards[ci].extra=extra;S.cards[ci].el=grid.querySelector(`.mw-c[data-fn="${CSS.escape(name)}"]`);}}
async function getExtra(td,cid,name){
  const mt=name?getCardMt(name):S.mt;
  const extra={tmdbSeasons:0,tmdbEpisodes:0,localSeasons:0,localEpisodes:0,perSeason:{}};
  if(td?.id&&mt==='tv'){const det=await tDetail(td.id,'tv');if(det){const realSeasons=det.seasons?.filter(s=>s.season_number>0)||[];extra.tmdbSeasons=realSeasons.length;extra.tmdbEpisodes=realSeasons.reduce((sum,s)=>sum+(s.episode_count||0),0);}}
  if(cid&&mt==='tv'){const local=await scanLocal(cid);extra.localSeasons=local.seasons;extra.localEpisodes=local.episodes;extra.perSeason=local.perSeason||{};}
  return extra;
}

/* ═══════════════════════════════════════════════
   功能1: 自定义文件夹转化
   ═══════════════════════════════════════════════ */

function showConvertModal(){
  injectCSS();
  const cid=getCid();
  if(cid==='0')return;
  const bread=getBread();
  const folderName=bread.length?bread[bread.length-1]:'文件夹';

  const mask=document.createElement('div');mask.className='mw-mask';
  mask.innerHTML=`<div class="mw-modal" style="width:400px;">
    <h3>🎬 转化为影视墙</h3>
    <div style="font-size:13px;color:var(--mw-t2);margin-bottom:16px;padding:10px 14px;background:#F9F6F2;border-radius:8px;">
      <div style="font-weight:600;color:var(--mw-t);margin-bottom:4px;">${folderName}</div>
      <div style="font-size:11px;color:var(--mw-tm);">CID: ${cid}</div>
    </div>
    <label>影视类型</label>
    <select class="j-tp">
      <option value="tv">剧集 (TV)</option>
      <option value="movie">电影 (Movie)</option>
    </select>
    <label>显示名称（可选）</label>
    <input type="text" class="j-nm" value="${folderName}" placeholder="工具栏标题">
    <div class="mw-ma">
      <button class="mw-bs j-cancel">取消</button>
      <button class="mw-bp j-ok">✅ 确认转化</button>
    </div>
  </div>`;
  document.body.appendChild(mask);

  mask.querySelector('.j-cancel').addEventListener('click',()=>mask.remove());
  mask.addEventListener('click',e=>{if(e.target===mask)mask.remove();});
  mask.querySelector('.j-ok').addEventListener('click',()=>{
    const type=mask.querySelector('.j-tp').value;
    const name=mask.querySelector('.j-nm').value.trim()||folderName;
    CF.set(cid,type,name);
    mask.remove();
    destroy();
    S.active=true;S.mt=type;S.cat=name;
    setTimeout(renderWall,200);
  });
}

function removeConvert(){
  const cid=getCid();
  if(!CF.has(cid))return;
  if(!confirm('取消将此文件夹转化为影视墙？\n（TMDB匹配缓存不会被清除）'))return;
  CF.remove(cid);
  destroy();
  location.reload();
}

function showManageModal(){
  injectCSS();
  const mask=document.createElement('div');mask.className='mw-mask';

  function renderList(){
    const current=Object.entries(CF.getAll());
    if(!current.length)return '<div style="padding:20px;text-align:center;color:var(--mw-tm);">暂无自定义文件夹</div>';
    return '<div class="mw-cf-list">'+current.map(([cid,info])=>`
      <div class="mw-cf-item" data-cid="${cid}">
        <div class="mw-cf-info">
          <div class="mw-cf-name">${info.name||'未命名'}</div>
          <div class="mw-cf-type">${info.type==='tv'?'剧集':'电影'} · CID: ${cid}</div>
        </div>
        <button class="mw-cf-del" data-cid="${cid}">删除</button>
      </div>`).join('')+'</div>';
  }

  mask.innerHTML=`<div class="mw-modal" style="width:480px;">
    <h3>📁 已转化的文件夹</h3>
    <div id="mw-cf-body">${renderList()}</div>
    <div class="mw-ma"><button class="mw-bs j-cancel">关闭</button></div>
  </div>`;
  document.body.appendChild(mask);

  mask.addEventListener('click',e=>{
    if(e.target===mask){mask.remove();return;}
    const del=e.target.closest('.mw-cf-del');
    if(del){
      const cid=del.dataset.cid;
      CF.remove(cid);
      mask.querySelector('#mw-cf-body').innerHTML=renderList();
      if(String(cid)===String(getCid())&&S.active){destroy();location.reload();}
    }
  });
  mask.querySelector('.j-cancel').addEventListener('click',()=>mask.remove());
}

/* ═══════════════════════════════════════════════
   功能2: 配置导出 / 导入
   ═══════════════════════════════════════════════ */

function exportConfig(){
  const data={
    _version:'4.0.0',
    _exportTime:new Date().toISOString(),
    customFolders:CF.getAll(),
    cache:$.exportAll(),
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`115影视墙配置_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},100);
}

function importConfig(){
  const input=document.createElement('input');
  input.type='file';input.accept='.json';
  input.addEventListener('change',()=>{
    const file=input.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        if(!data._version){alert('无效的配置文件');return;}
        showImportPreview(data);
      }catch{alert('解析配置文件失败');}
    };
    reader.readAsText(file);
  });
  input.click();
}

function showImportPreview(data){
  injectCSS();
  const cfCount=Object.keys(data.customFolders||{}).length;
  const cacheCount=Object.keys(data.cache||{}).length;
  const manualKeys=Object.keys(data.cache||{}).filter(k=>k.includes(CFG.PFX+'m_')).length;

  const mask=document.createElement('div');mask.className='mw-mask';
  mask.innerHTML=`<div class="mw-modal" style="width:440px;">
    <h3>📥 导入配置</h3>
    <div style="font-size:13px;color:var(--mw-t2);margin-bottom:16px;line-height:1.8;">
      <div>📅 导出时间: ${data._exportTime||'未知'}</div>
      <div>📁 自定义文件夹: <b>${cfCount}</b> 个</div>
      <div>💾 缓存条目: <b>${cacheCount}</b> 条</div>
      <div>✏️ 手动修正: <b>${manualKeys}</b> 条</div>
    </div>
    <div style="font-size:12px;color:#DC2626;margin-bottom:16px;">⚠️ 导入会覆盖当前同名设置，建议先导出备份</div>
    <div class="mw-ma">
      <button class="mw-bs j-cancel">取消</button>
      <button class="mw-bp j-ok">确认导入</button>
    </div>
  </div>`;
  document.body.appendChild(mask);

  mask.querySelector('.j-cancel').addEventListener('click',()=>mask.remove());
  mask.addEventListener('click',e=>{if(e.target===mask)mask.remove();});
  mask.querySelector('.j-ok').addEventListener('click',()=>{
    if(data.customFolders){
      const existing=CF.getAll();
      const merged={...existing,...data.customFolders};
      GM_setValue(CF._key,JSON.stringify(merged));
    }
    if(data.cache){$.importAll(data.cache);}
    mask.remove();
    alert('导入成功！页面即将刷新。');
    location.reload();
  });
}

/* ── 设置面板 ── */
function showSettingsModal(){
  injectCSS();
  const mask=document.createElement('div');mask.className='mw-mask';
  mask.innerHTML=`<div class="mw-modal" style="width:420px;">
    <h3>⚙️ 影视墙设置</h3>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
      <button class="mw-set-btn" id="j-tmdbtoken">
        <span class="mw-set-icon">🔑</span>
        <div><div>设置 TMDB Token</div><div class="mw-set-desc">输入 / 更换 TMDB Read Access Token (v4)，留空清除</div></div>
      </button>
      <button class="mw-set-btn" id="j-export">
        <span class="mw-set-icon">📤</span>
        <div><div>导出配置</div><div class="mw-set-desc">保存所有设置和手动修正到 JSON 文件</div></div>
      </button>
      <button class="mw-set-btn" id="j-import">
        <span class="mw-set-icon">📥</span>
        <div><div>导入配置</div><div class="mw-set-desc">从 JSON 文件恢复设置</div></div>
      </button>
      <button class="mw-set-btn" id="j-manage">
        <span class="mw-set-icon">📁</span>
        <div><div>管理自定义文件夹</div><div class="mw-set-desc">查看 / 删除已转化的文件夹</div></div>
      </button>
      <button class="mw-set-btn danger" id="j-clearcache">
        <span class="mw-set-icon">🗑️</span>
        <div><div>清除 TMDB 缓存</div><div class="mw-set-desc">不影响手动修正和文件夹设置</div></div>
      </button>
    </div>
    <div class="mw-ma"><button class="mw-bs j-cancel">关闭</button></div>
  </div>`;
  document.body.appendChild(mask);

  mask.querySelector('.j-cancel').addEventListener('click',()=>mask.remove());
  mask.addEventListener('click',e=>{if(e.target===mask)mask.remove();});
  mask.querySelector('#j-export').addEventListener('click',()=>{mask.remove();exportConfig();});
  mask.querySelector('#j-import').addEventListener('click',()=>{mask.remove();importConfig();});
  mask.querySelector('#j-manage').addEventListener('click',()=>{mask.remove();showManageModal();});
  mask.querySelector('#j-tmdbtoken').addEventListener('click',()=>{
    const input=prompt('TMDB Read Access Token (v4)\n申请地址: https://www.themoviedb.org/settings/api\n留空则清除当前 token:',tmdbToken());
    if(input===null)return;
    setTmdbToken(input.trim());
    mask.remove();
    alert(input.trim()?'TMDB Token 已保存，页面即将刷新以加载海报':'已清除 TMDB Token，页面即将刷新');
    location.reload();
  });
  mask.querySelector('#j-clearcache').addEventListener('click',()=>{
    if(!confirm('清除所有 TMDB 缓存？\n（手动修正和自定义文件夹不受影响）'))return;
    const ks=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k?.startsWith(CFG.PFX)&&!k.startsWith(CFG.PFX+'m_'))ks.push(k);
    }
    ks.forEach(k=>localStorage.removeItem(k));
    mask.remove();
    alert('缓存已清除！页面即将刷新。');
    location.reload();
  });
}

/* ── 影视墙渲染 ── */
async function renderWall(){
  const cid=getCid();S.cid=cid;S.vm='wall';injectCSS();hideNative();
  const isCustom=CF.has(cid);
  let root=document.getElementById('mw-root');
  if(!root){root=document.createElement('div');root.id='mw-root';const m=findMain();if(m){(m.parentElement||m).style.position='relative';(m.parentElement||m).appendChild(root);}else document.body.appendChild(root);}
  const cc=$.g('cat_cids')||S.catCids||{};
  let cats='';
  if(Object.keys(cc).length>1){cats='<div class="mw-cats">';for(const cn of Object.keys(CFG.CAT)){if(!cc[cn])continue;cats+=`<span class="mw-ct${cn===S.cat?' on':''}" data-cid="${cc[cn]}">${CFG.SHORT[cn]||cn}</span>`;}cats+='</div>';}
  root.innerHTML=`<div class="mw-bar">
    <div class="mw-bar-title">${S.cat}<span class="mw-bar-cnt" id="mw-cnt"></span></div>
    <span class="mw-sep"></span>
    <div class="mw-sbox"><span style="color:var(--mw-tm);flex-shrink:0;">${IC.search}</span><input type="text" id="mw-si" placeholder="搜索…"></div>
    <span class="mw-sep"></span>
    <div class="mw-grp"><span class="mw-ch on" data-s="year">年份<span class="arr">↓</span></span><span class="mw-ch" data-s="rating">评分</span><span class="mw-ch" data-s="name">名称</span></div>
    ${S.mt==='tv'?`<span class="mw-sep"></span><div class="mw-grp"><span class="mw-ch on" data-f="all">全部</span><span class="mw-ch" data-f="complete">齐全</span><span class="mw-ch" data-f="incomplete">缺集</span></div>`:''}
    <span class="mw-sep"></span>${cats}
    <div class="mw-bar-r">
      ${isCustom?`<button class="mw-ib" id="mw-unconv" style="border-color:#FCA5A5;color:#DC2626;">🚫 取消转化</button>`:''}
      <button class="mw-ib" id="mw-tv">📋 列表</button>
      <button class="mw-ib" id="mw-settings">⚙️ 设置</button>
    </div>
  </div>
  <div class="mw-pg"><div class="mw-pg-f" id="mw-pf"></div></div>
  <div class="mw-grid" id="mw-grid"><div class="mw-ld" style="grid-column:1/-1;"><div class="mw-sp"></div>正在加载…</div></div>`;
  bindBar(root);
  try{const folders=await fetchFolders(cid);S.af=folders;const grid=root.querySelector('#mw-grid');grid.innerHTML='';if(!folders.length){grid.innerHTML='<div class="mw-empty">📂 空</div>';return;}document.getElementById('mw-cnt').textContent=`${folders.length} 部`;S.cards=[];S.wp=0;S.fc='all';renderPage(grid,folders);}
  catch(e){console.error('[mw]',e);root.querySelector('#mw-grid').innerHTML='<div class="mw-empty">❌ 加载失败</div>';}
}
function renderPage(grid,folders){const s=S.wp*CFG.PW,e=Math.min(s+CFG.PW,folders.length);if(s>=folders.length)return;const batch=folders.slice(s,e);for(const f of batch){const cd={name:f.name,cid:f.cid,tmdb:null,extra:null,el:null};const c=mkCard(f.name,null,f.cid);cd.el=c;S.cards.push(cd);grid.appendChild(c);}S.wp++;const om=grid.querySelector('.mw-more');if(om)om.remove();if(e<folders.length){const m=document.createElement('div');m.className='mw-more';m.innerHTML=`<button>加载更多（还剩 ${folders.length-e} 部）</button>`;m.querySelector('button').addEventListener('click',()=>{m.remove();renderPage(grid,folders);});grid.appendChild(m);}loadBatch(batch);}
async function loadBatch(batch){const CONC=3,pf=document.getElementById('mw-pf'),tot=S.af.length,q=[...batch];
  async function w(){while(q.length){const f=q.shift();if(!f)break;try{const man=$.g(`m_${f.name}`);const cardMt=man?.type||S.mt;let d=man?.data||null;if(!d){const{title,year}=parseName(f.name);d=await tSearch(title,year,cardMt);}const ci=S.cards.findIndex(c=>c.name===f.name);if(ci!==-1){S.cards[ci].tmdb=d;const ex=await getExtra(d,f.cid,f.name);S.cards[ci].extra=ex;const nc=mkCard(f.name,d,f.cid,ex);S.cards[ci].el.replaceWith(nc);S.cards[ci].el=nc;}}catch(e){console.warn('[mw]',f.name,e);}if(pf){const done=S.cards.filter(c=>c.tmdb!==null).length;pf.style.width=`${Math.min(100,done/tot*100).toFixed(1)}%`;}}}
  const ws=[];for(let i=0;i<CONC;i++)ws.push(w());await Promise.all(ws);
  if(pf&&S.cards.filter(c=>c.tmdb!==null).length>=tot){pf.style.width='100%';setTimeout(()=>{const b=pf.parentElement;if(b)b.style.display='none';},500);}
}

/* ── 工具栏绑定 ── */
function bindBar(root){
  const si=root.querySelector('#mw-si');if(si){let t;si.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{S.filter=si.value.trim().toLowerCase();applySort();},300);});}
  root.querySelectorAll('[data-s]').forEach(b=>{b.addEventListener('click',()=>{
    if(S.sort===b.dataset.s){S.sd=S.sd==='desc'?'asc':'desc';}else{S.sort=b.dataset.s;S.sd='desc';root.querySelectorAll('[data-s]').forEach(x=>x.classList.remove('on'));b.classList.add('on');}
    root.querySelectorAll('[data-s] .arr').forEach(a=>a.remove());const ar=document.createElement('span');ar.className='arr';ar.textContent=S.sd==='desc'?'↓':'↑';b.appendChild(ar);applySort();
  });});
  root.querySelectorAll('[data-f]').forEach(b=>{b.addEventListener('click',()=>{root.querySelectorAll('[data-f]').forEach(x=>x.classList.remove('on'));b.classList.add('on');S.fc=b.dataset.f;applySort();});});
  root.querySelectorAll('.mw-ct').forEach(b=>{b.addEventListener('click',()=>{const cid=b.dataset.cid;if(cid)navTo(cid);});});
  const tv=root.querySelector('#mw-tv');if(tv)tv.addEventListener('click',()=>toggleView());
  const settingsBtn=root.querySelector('#mw-settings');if(settingsBtn)settingsBtn.addEventListener('click',()=>showSettingsModal());
  const unconvBtn=root.querySelector('#mw-unconv');if(unconvBtn)unconvBtn.addEventListener('click',()=>removeConvert());
}
function toggleView(){if(S.vm==='wall'){S.vm='native';const r=document.getElementById('mw-root');if(r)r.classList.add('mw-hidden');showNative();if(!document.getElementById('mw-fab')){const f=document.createElement('button');f.id='mw-fab';f.textContent='🍿';f.addEventListener('click',()=>toggleView());document.body.appendChild(f);}}else{S.vm='wall';const f=document.getElementById('mw-fab');if(f)f.remove();hideNative();const r=document.getElementById('mw-root');if(r)r.classList.remove('mw-hidden');}}
function applySort(){
  const grid=document.querySelector('#mw-grid');if(!grid)return;let items=[...S.cards];
  if(S.filter)items=items.filter(c=>{const fl=c.name.toLowerCase();const tl=c.tmdb?((c.tmdb.title||c.tmdb.name||'')+' '+(c.tmdb.original_title||c.tmdb.original_name||'')).toLowerCase():'';return fl.includes(S.filter)||tl.includes(S.filter);});
  if(S.fc==='complete')items=items.filter(c=>c.extra&&c.extra.tmdbEpisodes>0&&c.extra.localEpisodes>=c.extra.tmdbEpisodes);
  else if(S.fc==='incomplete')items=items.filter(c=>!c.extra||!c.extra.tmdbEpisodes||c.extra.localEpisodes<c.extra.tmdbEpisodes);
  const dir=S.sd==='asc'?1:-1;
  items.sort((a,b)=>{switch(S.sort){case 'rating':return dir*((b.tmdb?.vote_average||0)-(a.tmdb?.vote_average||0));case 'year':{const ya=a.tmdb?(a.tmdb.release_date||a.tmdb.first_air_date||''):(parseName(a.name).year||'');const yb=b.tmdb?(b.tmdb.release_date||b.tmdb.first_air_date||''):(parseName(b.name).year||'');return dir*yb.localeCompare(ya);}default:return dir*a.name.localeCompare(b.name,'zh-CN');}});
  grid.innerHTML='';if(!items.length){grid.innerHTML='<div class="mw-empty">🔍 无结果</div>';return;}
  items.forEach(c=>grid.appendChild(c.el));const ce=document.getElementById('mw-cnt');if(ce)ce.textContent=`${items.length} 部`;
}

/* ── DOM ── */
function findMain(){for(const s of ['.list-contents','.list-main','.file-list-wrap','.list-cell','[class*="file-list"]','#js_data_list','.main-wrap','.right-main-wrap']){const el=document.querySelector(s);if(el)return el;}return null;}
function hideNative(){['.list-contents','.list-main','.file-list-wrap','.list-cell','[class*="file-list"]','#js_data_list','.list-thumb','.file-box'].forEach(sel=>{document.querySelectorAll(sel).forEach(el=>{if(!el.classList.contains('mw-hidden')&&el.id!=='mw-root'){el.classList.add('mw-hidden');el.dataset.mwh='1';}});});}
function showNative(){document.querySelectorAll('[data-mwh]').forEach(el=>{el.classList.remove('mw-hidden');delete el.dataset.mwh;});}
function destroy(){const r=document.getElementById('mw-root');if(r)r.remove();const f=document.getElementById('mw-fab');if(f)f.remove();removeConvertBtn();showNative();S.active=false;S.cards=[];S.vm='wall';S.af=[];}

/* ── 工具栏注入（iframe 内） ── */
function getIframeDoc(){
  try{const f=document.querySelector('iframe[rel="wangpan"]')||document.querySelector('iframe[name="wangpan"]');
    if(f&&f.contentDocument&&f.contentDocument.body)return f.contentDocument;}catch{}return null;
}
function findToolbarInIframe(doc){
  /* 策略1: 常见选择器 */
  for(const sel of ['.left-tvf','[rel="left_tvf"]','.file-opr','.file-opr-bar','[class*="file-opr"]','.btn-operate','[class*="toolbar"]','[class*="operate"]']){
    const el=doc.querySelector(sel);if(el)return el;}
  /* 策略2: 找含有"上传"文本的按钮，向上找父级工具栏 */
  const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    const n=walker.currentNode;
    if(n.textContent.trim()==='上传'||n.textContent.trim()==='筛选'){
      let p=n.parentElement;
      for(let i=0;i<6&&p;i++){
        /* 找到同时包含"上传"和"筛选"的容器 */
        if(p.textContent.includes('上传')&&p.textContent.includes('筛选')&&p.children.length>=3){
          return p;}
        p=p.parentElement;
      }
    }
  }
  return null;
}
function removeConvertBtn(){
  /* 从 iframe 中移除 */
  try{const doc=getIframeDoc();if(doc){const b=doc.getElementById('mw-convert-btn');if(b)b.remove();}}catch{}
  /* 从主页面移除（fallback） */
  const b2=document.getElementById('mw-convert-btn');if(b2)b2.remove();
}
function injectConvertBtn(){
  const cid=getCid();
  if(S.active||cid==='0'){removeConvertBtn();return;}
  if(CF.has(cid)){removeConvertBtn();return;}

  /* 已存在则不重复注入 */
  const doc=getIframeDoc();
  if(doc&&doc.getElementById('mw-convert-btn'))return;
  if(document.getElementById('mw-convert-btn'))return;

  /* 尝试注入到 iframe 工具栏 */
  if(doc){
    const toolbar=findToolbarInIframe(doc);
    if(toolbar){
      /* 注入样式 */
      if(!doc.getElementById('mw-tb-css')){
        const st=doc.createElement('style');st.id='mw-tb-css';
        st.textContent=`
#mw-convert-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;margin-left:6px;font-size:13px;font-weight:500;border:1px solid #D1D5DB;border-radius:8px;background:#FFF;color:#374151;cursor:pointer;transition:all .15s;vertical-align:middle;line-height:1;white-space:nowrap;height:34px;box-sizing:border-box;}
#mw-convert-btn:hover{border-color:#D97706;color:#D97706;background:#FFFBF5;}
#mw-convert-btn .mw-btn-icon{font-size:15px;}
        `;doc.head.appendChild(st);
      }
      const btn=doc.createElement('button');btn.id='mw-convert-btn';btn.type='button';
      btn.innerHTML='<span class="mw-btn-icon">🎬</span>';
      btn.title='将此文件夹转化为影视墙';
      btn.addEventListener('click',()=>showConvertModal());
      /* 尝试插入到筛选按钮后面 */
      const filterBtn=doc.getElementById('js_filter_btn');
      if(filterBtn&&filterBtn.parentElement===toolbar){
        filterBtn.insertAdjacentElement('afterend',btn);
      } else {
        /* 找到更多按钮(.more-box)或模式切换面板前面插入 */
        const ref=toolbar.querySelector('.panel-btn-model,.more-box,[class*="panel-btn"]');
        if(ref){toolbar.insertBefore(btn,ref);}
        else{toolbar.appendChild(btn);}
      }
      return;
    }
  }

  /* Fallback: 注入到主页面导航栏 */
  injectCSS();
  const navRight=document.querySelector('.right-side')||document.querySelector('.panel-nav');
  if(navRight&&!document.getElementById('mw-convert-btn')){
    const btn=document.createElement('button');btn.id='mw-convert-btn';btn.type='button';
    btn.innerHTML='🎬 影视墙';btn.title='将此文件夹转化为影视墙';
    btn.style.cssText='display:inline-flex;align-items:center;gap:4px;padding:5px 12px;margin-left:8px;font-size:12px;font-weight:500;border:1px solid #D1D5DB;border-radius:8px;background:#FFF;color:#374151;cursor:pointer;transition:all .15s;vertical-align:middle;';
    btn.addEventListener('mouseenter',()=>{btn.style.borderColor='#D97706';btn.style.color='#D97706';});
    btn.addEventListener('mouseleave',()=>{btn.style.borderColor='#D1D5DB';btn.style.color='#374151';});
    btn.addEventListener('click',()=>showConvertModal());
    navRight.appendChild(btn);
  }
}

/* ── 路由 ── */
let lastCid=null;
function onRoute(){
  const cid=getCid();if(cid===lastCid&&S.active)return;
  const ck=shouldActivate();
  if(ck.active){if(S.active&&cid===S.cid)return;destroy();S.active=true;lastCid=cid;S.mt=ck.mt;S.cat=ck.cat;setTimeout(renderWall,400);}
  else if(S.active){destroy();lastCid=null;}
  setTimeout(injectConvertBtn,500);
}

function init(){
  console.log('[影视墙] v4.0');
  discoverCids().then(()=>onRoute());
  const oP=history.pushState;history.pushState=function(...a){oP.apply(this,a);setTimeout(onRoute,300);};
  const oR=history.replaceState;history.replaceState=function(...a){oR.apply(this,a);setTimeout(onRoute,300);};
  window.addEventListener('popstate',()=>setTimeout(onRoute,300));
  window.addEventListener('hashchange',()=>setTimeout(onRoute,300));
  const mo=new MutationObserver(()=>{clearTimeout(mo._t);mo._t=setTimeout(onRoute,600);});
  mo.observe(document.body,{childList:true,subtree:true});
  setInterval(onRoute,3000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
