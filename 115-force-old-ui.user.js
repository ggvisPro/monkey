// ==UserScript==
// @name         115网盘强制旧版
// @namespace    https://115.com/
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-force-old-ui.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-force-old-ui.user.js
// @description  将115网盘新版界面自动跳转到旧版
// @author       ggvisPro
// @modified     2026-07-06 00:22:10 CST
// @match        https://115.com/storage/netdisk*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=115.com
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const url = new URL(location.href);

    // 只处理新版路径 /storage/netdisk
    if (!url.pathname.startsWith('/storage/netdisk')) return;

    const cid = url.searchParams.get('cid') || '0';
    const offset = url.searchParams.get('offset') || '0';

    const oldUrl = `https://115.com/?cid=${cid}&offset=${offset}&mode=wangpan`;

    location.replace(oldUrl);
})();
