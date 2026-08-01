// ==UserScript==
// @name         好医生CME自动化
// @namespace    https://cmechina.net/
// @version      0.0.1
// @updateURL    https://raw.githubusercontent.com/ggvisPro/monkey/main/cmechina-cme-automation.user.js
// @downloadURL  https://raw.githubusercontent.com/ggvisPro/monkey/main/cmechina-cme-automation.user.js
// @description  自动填写 CME 考试答案并提交，自动点击第一个未学习课程，伪造学习完成跳转考试，自动点击继续学习下一节
// @author       ggvisPro
// @modified     2026-07-06 00:52:51 CST
// @match        https://www.cmechina.net/cme/exam.jsp?*
// @match        https://www.cmechina.net/cme/course.jsp?*
// @match        https://www.cmechina.net/cme/study2.jsp?*
// @match        https://www.cmechina.net/cme/examQuizPass.jsp?*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=cmechina.net
// @grant        GM_xmlhttpRequest
// @connect      weixin.haoyisheng.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // 判断当前页面类型
    const currentUrl = window.location.href;
    if (currentUrl.includes('exam.jsp')) {
        // 考试页面逻辑
        handleExamPage();
    } else if (currentUrl.includes('course.jsp')) {
        // 课程页面逻辑
        handleCoursePage();
    } else if (currentUrl.includes('study2.jsp')) {
        // 学习页面逻辑
        waitForPageLoad(handleStudyPage);
    } else if (currentUrl.includes('examQuizPass.jsp')) {
        // 考试通过页面逻辑
        handleExamPassPage();
    }

    // 处理考试页面
    function handleExamPage() {
        // 获取页面中的 course_id 和 paper_id
        const courseId = document.querySelector('input[name="course_id"]').value;
        const paperId = document.querySelector('input[name="paper_id"]').value;

        // 构建答案请求 URL
        const answerUrl = `https://weixin.haoyisheng.com/wx/getTestsNew?test_id=${courseId}-${paperId}&project=(null)&token=`;

        // 使用 GM_xmlhttpRequest 获取答案数据
        GM_xmlhttpRequest({
            method: "GET",
            url: answerUrl,
            onload: function (response) {
                if (response.status === 200) {
                    const data = JSON.parse(response.responseText);
                    if (data.status === 0 && data.tests) {
                        autoFillAnswers(data.tests);
                    } else {
                        alert('获取答案失败：' + data.msg);
                    }
                } else {
                    alert('请求答案失败，状态码：' + response.status);
                }
            },
            onerror: function (error) {
                alert('请求答案时发生错误：' + error);
            }
        });
    }

    // 自动填写答案
    function autoFillAnswers(tests) {
        tests.forEach(test => {
            const questionId = test.questionID;
            const correctAnswer = test.answer;
            const radioInputs = document.querySelectorAll(`input[name="ques_${questionId}"]`);
            radioInputs.forEach(input => {
                if (input.value === correctAnswer) {
                    input.checked = true;
                }
            });
        });

        // 提交答案
        document.querySelector('.btn1').click();
    }

    // 处理课程页面
    function handleCoursePage() {
        // 查找所有课程列表项
        const courseItems = document.querySelectorAll('.course_list');

        // 寻找第一个未学习的课程
        for (let item of courseItems) {
            const statusSpan = item.querySelector('span.wxx');
            if (statusSpan && statusSpan.textContent.includes('未学习')) {
                // 获取链接元素
                const link = item.querySelector('.course_tit a');
                if (link) {
                    // 模拟点击链接
                    console.log('找到第一个未学习课程，准备点击：', link.textContent);
                    link.click();
                    return; // 点击后退出循环
                }
            }
        }

        // 如果没有找到未学习课程
        console.log('没有找到未学习课程');
        alert('所有课程均已学习或未找到未学习课程');
    }

    // 处理学习页面
    function handleStudyPage() {
        questionIsOk = true;
        gotoExam();
    }

    // 处理考试通过页面
    function handleExamPassPage() {
        // 查找"继续学习下一节"按钮
        const continueButton = document.querySelector('.show_exam_btns a[href*="course.jsp"]');
        if (continueButton) {
            console.log('找到"继续学习下一节"按钮，准备点击');
            // 模拟点击按钮
            continueButton.click();
        } else {
            console.log('未找到"继续学习下一节"按钮');
            alert('未找到"继续学习下一节"按钮');
        }
    }

    // 等待页面加载完成
    function waitForPageLoad(callback) {
        if (document.readyState === 'complete') {
            callback();
        } else {
            window.addEventListener('load', callback);
        }
    }
})();
