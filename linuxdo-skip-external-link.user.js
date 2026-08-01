// ==UserScript==
// @name         Linux.do 自动跳过外部链接提示
// @namespace    https://linux.do/
// @version      1.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-skip-external-link.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-skip-external-link.user.js
// @description  自动点击"打开外部链接"弹窗中的"继续"按钮
// @author       ggvisPro
// @modified     2026-07-06 00:45:57 CST
// @match        https://linux.do/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=linux.do
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 创建一个观察器来监听 DOM 的变化（处理动态弹出的窗口）
    const observer = new MutationObserver((mutationsList, observer) => {
        // 查找页面上的所有按钮
        const buttons = document.querySelectorAll('button');

        for (let btn of buttons) {
            // 检查按钮文本是否为"继续"
            if (btn.textContent.trim() === '继续') {
                // 进一步确认当前确实是在"外部链接"的弹窗场景下，防止误点其他业务的"继续"按钮
                const pageText = document.body.textContent;
                if (pageText.includes('打开外部链接') && pageText.includes('此链接指向本站以外的网站')) {
                    btn.click();
                    console.log('[自动跳过] 已自动点击外部链接的"继续"按钮');
                    break;
                }
            }
        }
    });

    // 启动观察器，监听 body 内部所有子节点的变化
    observer.observe(document.body, { childList: true, subtree: true });
})();
