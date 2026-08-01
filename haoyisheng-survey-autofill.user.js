// ==UserScript==
// @name         北京好医生全员培训问卷自动填充
// @namespace    https://haoyisheng.com/
// @version      1.2
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/haoyisheng-survey-autofill.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/haoyisheng-survey-autofill.user.js
// @description  在调查问卷页面添加一键填充按钮，自动答题，第15题仅第一个横线填无，其余留空
// @author       ggvisPro
// @modified     2026-07-06 00:52:51 CST
// @match        https://bjsqypx.haoyisheng.com/qypx/bj/dcwj.jsp*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=haoyisheng.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 1. 创建悬浮的一键填充按钮
    const btn = document.createElement('button');
    btn.innerText = '🚀 一键自动填充';
    btn.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        padding: 12px 24px;
        background-color: #4CAF50;
        color: white;
        font-size: 16px;
        font-weight: bold;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        transition: all 0.3s;
    `;
    btn.onmouseover = () => btn.style.backgroundColor = '#45a049';
    btn.onmouseout = () => btn.style.backgroundColor = '#4CAF50';
    document.body.appendChild(btn);

    // 2. 预设目标答案列表（严格按截图匹配）
    const targetAnswers = [
        '医疗', '初级', '三级医院', '是', '部分知道', '很大',
        '很满意',
        '非常容易',
        '非常好',
        '开阔思路', '提高临床诊治和防控能力',
        '医学理论', '公共业务知识技能教育'
    ];

    // 3. 点击事件逻辑
    btn.addEventListener('click', function() {
        let filledCount = 0;

        // --- A. 处理选择题 (单选/多选) ---
        const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        inputs.forEach(input => {
            let parentText = (input.parentElement.innerText || input.parentElement.textContent).replace(/\s+/g, '');
            for (let answer of targetAnswers) {
                if (parentText.includes(answer) && parentText.length <= answer.length + 4) {
                    if (!input.checked) {
                        input.click();
                        filledCount++;
                    }
                    break;
                }
            }
        });

        // --- B. 精准处理第15题（首行填无，其余留空） ---
        // 抓取页面上所有可见的文本输入框
        const textInputs = Array.from(document.querySelectorAll('textarea, input[type="text"]'))
                                .filter(el => el.style.display !== 'none' && !el.readOnly);

        // 使用 XPath 定位到包含 "15.对于" 的题干元素
        const xpath = "//*[contains(text(), '15.对于')]";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const q15Title = result.singleNodeValue;

        let filledQ15FirstLine = false;

        textInputs.forEach(input => {
            // 判断输入框是否在第15题题干之后
            if (q15Title && (q15Title.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                if (!filledQ15FirstLine) {
                    input.value = '无'; // 第一个横线填无
                    filledQ15FirstLine = true;
                    filledCount++;
                } else {
                    input.value = '';   // 后续横线强制清空
                }
            }
        });

        // 4. 视觉反馈
        btn.innerText = `✅ 填充完毕！`;
        btn.style.backgroundColor = '#2196F3';
        setTimeout(() => {
            btn.innerText = '🚀 一键自动填充';
            btn.style.backgroundColor = '#4CAF50';
        }, 3000);
    });
})();
