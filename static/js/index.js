/**
 * 餐厅打饭仿真系统 - 核心逻辑
 * 功能：1.ECharts实例初始化 2.实现文档定义的5个前端内部渲染函数 3.页面交互（按钮/表单）4.提示展示 5.全局状态管理
 * 依赖：api.js（接口）、socket.js（SocketIO）、ECharts CDN
 * 渲染规范：严格遵循文档中前端内部渲染函数的输入、功能、样式要求
 */

import { startSimulation, endSimulation } from "./api.js";
import { socket, isSocketConnected } from "./socket.js";

// 全局状态：标识当前是否正在仿真，避免重复启动
let isSimulating = false;
// ECharts实例：全局挂载，方便渲染函数调用
let windowBarChartIns = null;    // 窗口等待人数柱状图
let tablePieChartIns = null;     // 桌子占用饼状图
let windowLineChartIns = null;   // 窗口排队人数折线图
let tableLineChartIns = null;    // 桌子占用折线图

// 页面元素：提前获取，避免重复DOM查询
const $simulationForm = document.getElementById("simulationForm");
const $startBtn = document.getElementById("startBtn");
const $endBtn = document.getElementById("endBtn");
const $tipBox = document.getElementById("tipBox");
const $resultArea = document.getElementById("resultArea");
const $windowEval = document.getElementById("windowEval");
const $tableEval = document.getElementById("tableEval");

/**
 * 提示展示函数：统一处理页面提示（加载/成功/失败）
 * @param {string} type - 提示类型：loading/success/error
 * @param {string} msg - 提示内容
 */
const showTip = (type, msg) => {
    $tipBox.className = `simulation__tip simulation__tip--${type}`;
    $tipBox.innerText = msg;
    // 成功提示3秒后自动隐藏，加载/失败手动隐藏
    if (type === "success") {
        setTimeout(() => $tipBox.style.display = "none", 3000);
    }
};

/**
 * 隐藏提示框
 */
const hideTip = () => {
    $tipBox.style.display = "none";
};

/**
 * 表单参数获取与校验：前端提前校验，与后端validate_params规则一致
 * @returns {object|false} - 校验通过返回参数对象，失败返回false
 */
const getAndCheckFormParams = () => {
    const formData = new FormData($simulationForm);
    const params = {
        dining_time: parseInt(formData.get("dining_time")),
        meal_time: parseInt(formData.get("meal_time")),
        max_people: parseInt(formData.get("max_people")),
        window_num: parseInt(formData.get("window_num")),
        table_num: parseInt(formData.get("table_num"))
    };
    // 校验：参数是否为有效数字、非负、窗口/桌子数≥1
    for (const [key, value] of Object.entries(params)) {
        if (isNaN(value)) {
            showTip("error", `【${key}】必须为数字`);
            return false;
        }
        if (value < 0) {
            showTip("error", `【${key}】不能为负数`);
            return false;
        }
    }
    if (params.window_num < 1) {
        showTip("error", "窗口数不能小于1");
        return false;
    }
    if (params.table_num < 1) {
        showTip("error", "桌子数不能小于1");
        return false;
    }
    return params;
};

/**
 * ECharts图表初始化：页面加载完成后执行，初始化4个图表实例
 */
const initECharts = () => {
    // 1.窗口等待人数柱状图
    windowBarChartIns = echarts.init(document.getElementById("windowBarChart"));
    windowBarChartIns.setOption({
        title: { text: "各窗口当前等待人数", left: "center" },
        xAxis: { type: "category", data: [], name: "窗口编号" },
        yAxis: { type: "value", name: "等待人数", min: 0 },
        series: [{ type: "bar", data: [], itemStyle: { color: "#32c76b" } }],
        tooltip: { trigger: "axis" }
    });

    // 2.桌子占用饼状图
    tablePieChartIns = echarts.init(document.getElementById("tablePieChart"));
    tablePieChartIns.setOption({
        title: { text: "桌子占用状态", left: "center" },
        tooltip: { trigger: "item" },
        legend: { orient: "vertical", left: "left", top: "center" },
        series: [{
            name: "桌子数",
            type: "pie",
            radius: ["40%", "70%"],
            data: [],
            label: { show: true, formatter: "{b}: {c} ({d}%)" }
        }]
    });

    // 3.窗口排队人数折线图
    windowLineChartIns = echarts.init(document.getElementById("windowLineChart"));
    windowLineChartIns.setOption({
        title: { text: "各窗口排队人数变化趋势", left: "center" },
        xAxis: { type: "category", data: [], name: "仿真时间(秒)" },
        yAxis: { type: "value", name: "等待人数", min: 0 },
        series: [],
        tooltip: { trigger: "axis" },
        legend: { top: "bottom" }
    });

    // 4.桌子占用折线图
    tableLineChartIns = echarts.init(document.getElementById("tableLineChart"));
    tableLineChartIns.setOption({
        title: { text: "桌子占用数变化趋势", left: "center" },
        xAxis: { type: "category", data: [], name: "仿真时间(秒)" },
        yAxis: { type: "value", name: "桌子数", min: 0 },
        series: [
            { name: "已使用桌子", type: "line", data: [], color: "#f53f3f" },
            { name: "剩余桌子", type: "line", data: [], color: "#1890ff" }
        ],
        tooltip: { trigger: "axis" },
        legend: { top: "bottom" }
    });

    // 窗口大小变化时，图表自适应
    window.addEventListener("resize", () => {
        windowBarChartIns.resize();
        tablePieChartIns.resize();
        windowLineChartIns.resize();
        tableLineChartIns.resize();
    });
};

/**
 * 前端内部渲染函数1：更新窗口等待人数柱状图
 * 严格遵循文档：人数≥20柱子变红，横轴为窗口编号，纵轴为等待人数
 * @param {array} windowPeople - 各窗口等待人数数组
 */
window.updateWindowBarChart = (windowPeople) => {
    if (!windowBarChartIns) return;
    // 构造横轴数据：窗口编号1,2,3...n
    const xAxisData = windowPeople.map((_, index) => `窗口${index + 1}`);
    // 构造柱子颜色：≥20为红色#f53f3f，否则绿色#32c76b
    const itemStyle = {
        color: (params) => windowPeople[params.dataIndex] >= 20 ? "#f53f3f" : "#32c76b"
    };
    // 更新图表
    windowBarChartIns.setOption({
        xAxis: { data: xAxisData },
        series: [{ data: windowPeople, itemStyle }]
    });
};

/**
 * 前端内部渲染函数2：更新桌子占用饼状图
 * 严格遵循文档：已使用红色#f53f3f，剩余蓝色#1890ff，显示占比
 * @param {number} usedTable - 已使用桌子数
 * @param {number} remainingTable - 剩余桌子数
 */
window.updateTablePieChart = (usedTable, remainingTable) => {
    if (!tablePieChartIns) return;
    // 构造饼图数据
    const pieData = [
        { name: "已使用桌子", value: usedTable, itemStyle: { color: "#f53f3f" } },
        { name: "剩余桌子", value: remainingTable, itemStyle: { color: "#1890ff" } }
    ];
    // 更新图表
    tablePieChartIns.setOption({ series: [{ data: pieData }] });
};

/**
 * 前端内部渲染函数3：更新窗口排队人数折线图
 * 严格遵循文档：横轴为仿真时间，纵轴为等待人数，每条折线对应一个窗口
 * @param {array} windowTrend - 窗口排队趋势数据，格式：[{time:1, people:[x1,x2...]}, ...]
 */
window.updateWindowLineChart = (windowTrend) => {
    if (!windowLineChartIns || windowTrend.length === 0) return;
    // 构造横轴数据：仿真时间1,2,3...n
    const xAxisData = windowTrend.map(item => item.time);
    // 构造系列数据：每个窗口对应一条折线
    const seriesData = [];
    const windowNum = windowTrend[0].people.length;
    for (let i = 0; i < windowNum; i++) {
        seriesData.push({
            name: `窗口${i + 1}`,
            type: "line",
            data: windowTrend.map(item => item.people[i])
        });
    }
    // 更新图表
    windowLineChartIns.setOption({
        xAxis: { data: xAxisData },
        series: seriesData
    });
};

/**
 * 前端内部渲染函数4：更新桌子占用折线图
 * 严格遵循文档：横轴为仿真时间，纵轴为桌子数，两条折线对应已使用/剩余
 * @param {array} tableTrend - 桌子占用趋势数据，格式：[{time:1, used:z1, remaining:y1}, ...]
 */
window.updateTableLineChart = (tableTrend) => {
    if (!tableLineChartIns || tableTrend.length === 0) return;
    // 构造横轴数据：仿真时间1,2,3...n
    const xAxisData = tableTrend.map(item => item.time);
    // 构造已使用/剩余桌子数据
    const usedData = tableTrend.map(item => item.used);
    const remainingData = tableTrend.map(item => item.remaining);
    // 更新图表
    tableLineChartIns.setOption({
        xAxis: { data: xAxisData },
        series: [
            { name: "已使用桌子", data: usedData },
            { name: "剩余桌子", data: remainingData }
        ]
    });
};

/**
 * 前端内部渲染函数5：展示仿真体验评价
 * 严格遵循文档：良好标绿，较差标红，渲染到指定DOM
 * @param {string} windowEval - 窗口排队体验：体验良好/体验较差
 * @param {string} tableEval - 桌子占用体验：体验良好/体验较差
 */
window.showEvaluation = (windowEval, tableEval) => {
    // 设置窗口评价样式和内容
    $windowEval.className = windowEval === "体验良好" ? "eval--good" : "eval--bad";
    $windowEval.innerText = windowEval;
    // 设置桌子评价样式和内容
    $tableEval.className = tableEval === "体验良好" ? "eval--good" : "eval--bad";
    $tableEval.innerText = tableEval;
    // 显示结果区
    $resultArea.style.display = "block";
};

/**
 * 启动仿真按钮点击事件处理
 */
const handleStartSimulation = async () => {
    // 若正在仿真或Socket未连接，直接返回
    if (isSimulating) return;
    if (!isSocketConnected) {
        showTip("error", "SocketIO未连接，请检查后端服务");
        return;
    }
    // 获取并校验表单参数
    const params = getAndCheckFormParams();
    if (!params) return;
    // 状态更新：禁止启动按钮，允许结束按钮，标记正在仿真
    isSimulating = true;
    $startBtn.disabled = true;
    $endBtn.disabled = false;
    hideTip();
    showTip("loading", "仿真启动中，请稍候...");
    try {
        // 调用启动仿真接口
        const res = await startSimulation(params);
        if (res.success) {
            showTip("success", res.msg || "仿真启动成功");
            // 清空结果区，重置实时图表
            $resultArea.style.display = "none";
            windowBarChartIns.clear();
            tablePieChartIns.clear();
        } else {
            throw new Error(res.msg || "仿真启动失败");
        }
    } catch (error) {
        // 异常处理：恢复状态，显示错误提示
        isSimulating = false;
        $startBtn.disabled = false;
        $endBtn.disabled = true;
        showTip("error", error.message);
    }
};

/**
 * 结束仿真按钮点击事件处理：对应文档receiveSimulationResult回调
 */
const handleEndSimulation = async () => {
    // 若未在仿真，直接返回
    if (!isSimulating) return;
    hideTip();
    showTip("loading", "仿真结束中，正在生成结果...");
    try {
        // 调用结束仿真接口
        const res = await endSimulation();
        if (res.success && res.data) {
            showTip("success", "仿真结束成功，已生成结果分析");
            // 调用渲染函数展示结果
            window.updateWindowLineChart(res.data.window_trend);
            window.updateTableLineChart(res.data.table_trend);
            window.showEvaluation(res.data.window_evaluation, res.data.table_evaluation);
            // 状态更新：恢复按钮状态，标记仿真结束
            isSimulating = false;
            $startBtn.disabled = false;
            $endBtn.disabled = true;
        } else {
            throw new Error(res.msg || "仿真结束失败");
        }
    } catch (error) {
        showTip("error", error.message);
    }
};

/**
 * 页面初始化：绑定事件，初始化图表
 */
const initPage = () => {
    // 初始化ECharts图表
    initECharts();
    // 绑定按钮点击事件
    $startBtn.addEventListener("click", handleStartSimulation);
    $endBtn.addEventListener("click", handleEndSimulation);
    // 表单回车提交：触发启动仿真
    $simulationForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleStartSimulation();
    });
    // 页面卸载时，断开Socket连接，销毁ECharts实例
    window.addEventListener("unload", () => {
        socket.disconnect();
        windowBarChartIns?.dispose();
        tablePieChartIns?.dispose();
        windowLineChartIns?.dispose();
        tableLineChartIns?.dispose();
    });
};

// 页面加载完成后，执行初始化
window.addEventListener("DOMContentLoaded", initPage);