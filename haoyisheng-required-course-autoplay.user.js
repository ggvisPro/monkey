// ==UserScript==
// @name         好医生必修课自动化
// @namespace    https://haoyisheng.com/
// @version      0.0.1
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/haoyisheng-required-course-autoplay.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/haoyisheng-required-course-autoplay.user.js
// @description  好医生必修课
// @author       ggvisPro
// @modified     2026-07-06 00:52:51 CST
// @match        https://bjsqypx.haoyisheng.com/qypx/bj/cc.jsp*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=haoyisheng.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 确保页面加载完成后再执行
    window.addEventListener('load', function() {
        // 检查页面是否存在播放器容器
        let playerContainer = document.querySelector('#playerContainer');
        if (!playerContainer) {
            console.error('Player container not found!');
            return;
        }

        // 创建播放器
        let player = createCCH5Player({
            vid: '0933F8A2B62E3AEA0498CE5AAF1F53F5',
            siteid: '4066F9F39D08AB88',
            width: '600',
            height: '400',
            autoStart: true,
            isShowQuestions: false,
            playtype: 1,
            banDrag: false,
            rate_allow_change: true,
            progressbar_enable: '1',
            parentNode: '#playerContainer'
        });

        console.log('CC Player initialized:', player);
    });
})();
