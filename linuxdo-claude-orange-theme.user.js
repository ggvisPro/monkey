// ==UserScript==
// @name         Linux.do Claude Orange Theme
// @namespace    https://linux.do/
// @version      1.0.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-claude-orange-theme.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/linuxdo-claude-orange-theme.user.js
// @description  将 LINUX DO 论坛的主题色美化为 Claude 的标志性暖橙色。
// @author       ggvisPro
// @modified     2026-07-05 23:51:32 CST
// @match        https://linux.do/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=linux.do
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // Claude 经典橙色系
  const claudeOrange = '#D97757';
  const claudeOrangeHover = '#C56546';
  const claudeBgHint = 'rgba(217, 119, 87, 0.08)'; // 极浅的橙色背景，用于悬停

  const css = `
    /* 1. 核心变量替换：改变 Discourse 论坛全局的主要强调色 */
    :root {
      --tertiary: ${claudeOrange} !important;
      --tertiary-hover: ${claudeOrangeHover} !important;
      --tertiary-low: rgba(217, 119, 87, 0.2) !important;
      --tertiary-medium: rgba(217, 119, 87, 0.5) !important;
      --tertiary-high: rgba(217, 119, 87, 0.8) !important;
    }

    /* 2. 顶部导航栏美化：增加一条类似 Claude 官网的橙色顶部强调线 */
    .d-header {
      border-top: 3px solid ${claudeOrange} !important;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03) !important;
    }

    /* 3. 侧边栏/导航标签美化：优化选中和悬停状态 */
    .nav-pills > li > a.active,
    .nav-pills > li > a:hover,
    .sidebar-section-link-wrapper .sidebar-section-link:hover,
    .sidebar-section-link-wrapper .sidebar-section-link.active {
      color: ${claudeOrange} !important;
      background-color: ${claudeBgHint} !important;
      transition: all 0.2s ease;
    }

    /* 4. 主要按钮美化：如"新建话题"、"回复"按钮 */
    .btn-primary {
      background-color: ${claudeOrange} !important;
      border-color: ${claudeOrange} !important;
      color: #ffffff !important;
      transition: all 0.2s ease-in-out !important;
    }
    .btn-primary:hover {
      background-color: ${claudeOrangeHover} !important;
      border-color: ${claudeOrangeHover} !important;
      box-shadow: 0 2px 6px rgba(217, 119, 87, 0.3) !important;
    }

    /* 5. 话题列表交互反馈：鼠标悬停在帖子整行时的微弱底色 */
    .topic-list-item:hover {
      background-color: ${claudeBgHint} !important;
      transition: background-color 0.2s ease;
    }

    /* 6. 全局链接平滑过渡 */
    a {
      transition: color 0.15s ease-in-out;
    }
  `;

  // 注入 CSS 样式
  GM_addStyle(css);
})();
