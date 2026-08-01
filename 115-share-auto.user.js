// ==UserScript==
// @name         115 分享一键自动化（同意协议 + 长期 + 访问码 + 复制）
// @namespace    https://115.com/
// @version      0.4.0
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/115-share-auto.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/115-share-auto.user.js
// @description  115 网盘分享：自动同意协议弹窗、设置长期有效、选第一个访问码并复制分享文本，全程无感。
// @author       ggvisPro
// @modified     2026-07-05 23:57:20 CST
// @match        https://115.com/*
// @match        https://*.115.com/*
// @match        https://115cdn.com/*
// @match        https://*.115cdn.com/*
// @match        https://cdnres.115.com/site/static/components_vue/shareFiles/shareFilesModal.html*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=115.com
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      webapi.115.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ---------- 常量 ----------
  const AUTO_FLAG = "__tm115ShareAutoDone";
  const HIDDEN_FLAG = "tm115ShareAutoHidden";
  const AGREEMENT_FLAG = "tm115ShareAgreementHandled";
  const LOG_PREFIX = "[115-share-auto]";
  const SHARE_MODAL_PATH = "/site/static/components_vue/shareFiles/shareFilesModal.html";
  const AGREEMENT_SELECTOR = "#js_agreement_input_for_share_file";
  const AGREEMENT_CONFIRM_SELECTOR = 'a.dgac-confirm[btn="confirm"]';
  const TOAST_ID = "tm115-share-auto-toast";
  const STYLE_ID = "tm115-share-auto-style";
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------- 样式 ----------
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOAST_ID} {
        position: fixed;
        right: 24px;
        top: 24px;
        z-index: 2147483647;
        max-width: min(360px, calc(100vw - 48px));
        padding: 10px 14px;
        border-radius: 6px;
        background: rgba(20, 20, 20, 0.88);
        color: #fff;
        font-size: 13px;
        line-height: 1.45;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: none;
      }
      #${TOAST_ID}.is-show {
        opacity: 1;
        transform: translateY(0);
      }
      #file_share_modal_main.${HIDDEN_FLAG} {
        position: fixed !important;
        left: -10000px !important;
        top: -10000px !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* 协议弹窗预隐藏，避免闪烁；JS 里再二次兜底 */
      .dialog-box:has(${AGREEMENT_SELECTOR}) {
        visibility: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function showToast(message) {
    ensureStyle();

    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("is-show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove("is-show");
    }, 2200);
  }

  function notifyParent(message) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { source: "115-share-auto", type: "toast", message },
          "*"
        );
        return;
      }
    } catch (err) {
      console.debug(LOG_PREFIX, "通知父页面失败", err);
    }
    showToast(message);
  }

  function postParentAction(type, message) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { source: "115-share-auto", type, message },
          "*"
        );
        return;
      }
    } catch (err) {
      console.debug(LOG_PREFIX, "通知父页面失败", err);
    }
    if (message) showToast(message);
  }

  // ---------- 新增：自动同意分享协议弹窗 ----------
  function autoConfirmShareAgreement() {
    const dialogs = document.querySelectorAll(".dialog-box");
    for (const dialog of dialogs) {
      if (dialog.dataset[AGREEMENT_FLAG]) continue;
      if (!dialog.querySelector(AGREEMENT_SELECTOR)) continue;

      dialog.dataset[AGREEMENT_FLAG] = "1";
      // 双保险：不支持 :has() 的浏览器也能隐藏
      dialog.style.setProperty("visibility", "hidden", "important");
      dialog.style.setProperty("pointer-events", "none", "important");

      const confirmBtn = dialog.querySelector(AGREEMENT_CONFIRM_SELECTOR);
      if (confirmBtn) {
        confirmBtn.click();
        console.log(LOG_PREFIX, "已自动同意分享协议");
      }
    }
  }

  // ---------- 分享弹窗(iframe)处理 ----------
  function isShareModalFrame(iframe) {
    const src = iframe?.getAttribute?.("src") || "";
    return src.includes(SHARE_MODAL_PATH);
  }

  function getShareFrameHost(iframe) {
    const dialogBox = iframe.closest(".dialog-box");
    if (dialogBox) return dialogBox;

    let node = iframe;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    for (let depth = 0; depth < 8 && node?.parentElement && node.parentElement !== document.body; depth += 1) {
      node = node.parentElement;
      const className = String(node.className || "");
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const looksLikeDialog =
        /dialog|modal|popup|pop|layer|window|frame|box/i.test(className) ||
        style.position === "fixed" ||
        style.position === "absolute";
      const looksLikeWholePage =
        viewportWidth &&
        viewportHeight &&
        rect.width >= viewportWidth * 0.9 &&
        rect.height >= viewportHeight * 0.9;

      if (looksLikeDialog && !looksLikeWholePage && rect.width > 120 && rect.height > 80) {
        return node;
      }
    }
    return iframe;
  }

  function hideShareModalHosts() {
    const frames = Array.from(document.querySelectorAll("iframe")).filter(isShareModalFrame);
    let foundShareDialog = frames.length > 0;

    frames.forEach((iframe) => {
      const host = getShareFrameHost(iframe);
      host.dataset[HIDDEN_FLAG] = "1";
      host.style.setProperty("visibility", "hidden", "important");
      host.style.setProperty("pointer-events", "none", "important");
    });

    document.querySelectorAll(".dialog-box").forEach((dialog) => {
      const hasShareFrame = Array.from(dialog.querySelectorAll("iframe")).some(isShareModalFrame);
      if (!hasShareFrame) return;

      foundShareDialog = true;
      dialog.dataset[HIDDEN_FLAG] = "1";
      dialog.style.setProperty("visibility", "hidden", "important");
      dialog.style.setProperty("pointer-events", "none", "important");
    });

    if (!foundShareDialog) return;

    document.querySelectorAll(".dialog-back-mask").forEach((mask) => {
      mask.dataset[HIDDEN_FLAG] = "1";
      mask.style.setProperty("display", "none", "important");
      mask.style.setProperty("pointer-events", "none", "important");
    });
  }

  function closeShareModalHosts() {
    const dialogs = Array.from(document.querySelectorAll(".dialog-box")).filter((dialog) =>
      Array.from(dialog.querySelectorAll("iframe")).some(isShareModalFrame)
    );
    if (!dialogs.length) return;

    dialogs.forEach((dialog) => {
      const close = dialog.querySelector('[btn="close"], .close');
      if (close) close.click();
      if (dialog.isConnected) dialog.remove();
    });

    document.querySelectorAll(".dialog-back-mask").forEach((mask) => mask.remove());
  }

  function hideInnerModal() {
    ensureStyle();
    const root = document.querySelector("#file_share_modal_main");
    if (root) root.classList.add(HIDDEN_FLAG);
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
  }

  function getVueVm() {
    const root = document.querySelector("#file_share_modal_main");
    if (!root || !root.__vue__) return null;
    return findShareVm(root.__vue__);
  }

  function findShareVm(vm) {
    if (!vm) return null;
    if ("shareInfo" in vm && "expDate" in vm && "radioCode" in vm) return vm;

    const children = vm.$children || [];
    for (const child of children) {
      const found = findShareVm(child);
      if (found) return found;
    }
    return vm;
  }

  function getShareCode(vm) {
    return (
      vm?.inComeData?.shareCode ||
      vm?.shareInfo?.share_code ||
      document.querySelector(".link-sharing input")?.value?.match(/\/s\/([^?#]+)/)?.[1] ||
      ""
    );
  }

  function postUpdateShare(params) {
    const body = new URLSearchParams(params).toString();

    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "POST",
          url: "https://webapi.115.com/share/updateshare",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          data: body,
          onload: (res) => {
            try {
              const json = JSON.parse(res.responseText || "{}");
              json.state ? resolve(json) : reject(json);
            } catch (err) {
              reject(err);
            }
          },
          onerror: reject,
        });
      });
    }

    if (window.$?.ajax) {
      return new Promise((resolve, reject) => {
        window.$.ajax({
          url: "https://webapi.115.com/share/updateshare",
          type: "post",
          dataType: "json",
          data: params,
          xhrFields: { withCredentials: true },
          success: (json) => (json?.state ? resolve(json) : reject(json)),
          error: reject,
        });
      });
    }

    return fetch("https://webapi.115.com/share/updateshare", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body,
    }).then((res) => res.json());
  }

  async function setLongExpiration(vm, shareCode) {
    if (!shareCode) return false;

    await postUpdateShare({ share_code: shareCode, share_duration: "-1" });

    if (vm) {
      vm.expDate = "-1";
      vm.shareExpTime = -1;
      if (vm.shareInfo) {
        vm.shareInfo.share_ex_time = -1;
        vm.shareInfo.share_ex_duration = "长期";
        vm.shareInfo.share_duration = -1;
      }
      syncExpirationDom();
      setTimeout(syncExpirationDom, 100);
      setTimeout(syncExpirationDom, 500);
      return true;
    }

    const input = document.querySelector('input[name="r1"][value="-1"]');
    if (input && !input.checked) {
      const label = input.closest("label") || input;
      label.click();
      syncExpirationDom();
      return true;
    }
    return false;
  }

  function syncExpirationDom() {
    const expiration = document.querySelector(".expiration");
    if (!expiration) return;

    const textNode = expiration.querySelector("div > p:first-child em");
    if (textNode) textNode.textContent = "长期";

    const radios = expiration.querySelectorAll('input[name="r1"]');
    radios.forEach((radio) => {
      const isLong = radio.value === "-1";
      radio.checked = isLong;
      if (isLong) radio.setAttribute("checked", "checked");
      else radio.removeAttribute("checked");
    });
  }

  function getReceiveCodeFromLink(link) {
    const match = String(link || "").match(/[?&]password=([^&#\s]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function getReceiveCode(vm) {
    return (
      vm?.shareInfo?.receive_code ||
      vm?.shareInfo?.custom_receive_code ||
      getReceiveCodeFromLink(vm?.linkUrl) ||
      ""
    );
  }

  function getFirstAccessCode(vm) {
    if (vm?.codeList) {
      const firstCode = vm.codeList.systemCode?.text || "";
      if (firstCode) return firstCode;
    }

    const radios = Array.from(document.querySelectorAll('input[name="rf1"]'));
    const firstRadio = radios.find((radio) => isVisible(radio.closest("label") || radio));
    return firstRadio?.value || "";
  }

  async function setFirstAccessCode(vm, shareCode) {
    let firstCode = getFirstAccessCode(vm);
    if (!firstCode) return getReceiveCode(vm);

    if (getReceiveCode(vm) !== firstCode) {
      const json = await postUpdateShare({ share_code: shareCode, receive_code: firstCode });
      firstCode = json?.data?.[shareCode]?.receive_code || json?.data?.receive_code || firstCode;
    }

    if (vm) {
      vm.radioCode = firstCode;
      if (vm.shareInfo) {
        vm.shareInfo.receive_code = firstCode;
        vm.shareInfo.custom_receive_code = firstCode;
      }
      if (vm.linkUrl) vm.linkUrl = normalizeShareLink(vm.linkUrl, firstCode);
    }

    const radio = Array.from(document.querySelectorAll('input[name="rf1"]')).find(
      (item) => item.value === firstCode
    );
    if (radio && !radio.checked) radio.checked = true;

    return firstCode;
  }

  function normalizeShareLink(link, receiveCode) {
    const raw = String(link || "").split("#")[0].replace(/[?&]+$/, "");
    if (!raw) return "";
    if (!receiveCode) return `${raw}#`;

    const clean = raw.replace(/([?&])password=[^&#\s]*/g, "").replace(/[?&]+$/, "");
    const joiner = clean.includes("?") ? "&" : "?";
    return `${clean}${joiner}password=${encodeURIComponent(receiveCode)}#`;
  }

  function buildCopyText(vm, receiveCode) {
    const title =
      vm?.shareInfo?.share_title ||
      document.querySelector(".info-file span")?.textContent?.trim() ||
      document.title ||
      "";

    const rawLink =
      vm?.shareInfo?.share_url ||
      vm?.linkUrl ||
      document.querySelector(".link-sharing input")?.value ||
      "";

    const link = normalizeShareLink(rawLink, receiveCode || getReceiveCode(vm));
    if (!link) return "";

    const parts = [link];
    if (title) parts.push(title);
    parts.push("复制这段内容，可在115App中直接打开！");
    return parts.join("\n");
  }

  function copyText(text) {
    if (!text) return false;

    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return true;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }

  function clickPageCopyButton() {
    const btn = document.querySelector(".link-sharing .button");
    if (btn && isVisible(btn)) btn.click();
  }

  async function automateShareModal() {
    const root = document.querySelector("#file_share_modal_main");
    if (!root) {
      hideShareModalHosts();
      return;
    }
    hideInnerModal();

    const vm = getVueVm();
    const shareCode = getShareCode(vm);
    if (!shareCode) return;
    if (root[AUTO_FLAG] === shareCode) return;

    root[AUTO_FLAG] = shareCode;

    try {
      await setLongExpiration(vm, shareCode);
      await sleep(300);

      const receiveCode = await setFirstAccessCode(vm, shareCode);
      await sleep(800);

      const latestVm = getVueVm() || vm;
      const text = buildCopyText(latestVm, receiveCode);
      if (copyText(text)) {
        console.log(LOG_PREFIX, "已复制分享文本", shareCode);
        postParentAction("done", "分享链接已复制");
      } else {
        clickPageCopyButton();
        console.log(LOG_PREFIX, "已点击页面复制按钮", shareCode);
        postParentAction("done", "已触发复制分享链接");
      }
    } catch (err) {
      root[AUTO_FLAG] = "";
      console.error(LOG_PREFIX, "自动处理失败", err);
      notifyParent("分享自动处理失败，请打开控制台查看");
    }
  }

  // ---------- 跨 frame 消息 ----------
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "115-share-auto") return;
    if (event.data.type === "toast" && event.data.message) {
      hideShareModalHosts();
      showToast(event.data.message);
    } else if (event.data.type === "done") {
      closeShareModalHosts();
      if (event.data.message) showToast(event.data.message);
    }
  });

  // ---------- 主循环 ----------
  function tick() {
    autoConfirmShareAgreement();
    hideShareModalHosts();
    automateShareModal();
  }

  const observer = new MutationObserver(tick);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  tick();
  setInterval(tick, 1000);
})();
