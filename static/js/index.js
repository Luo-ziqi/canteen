/**
 * 餐厅打饭仿真系统 - 核心逻辑
 * 修复点：
 * 1. 简化ECharts响应式配置，删除media query避免解析错误
 * 2. 增加ENV导入兜底，防止undefined
 * 3. 确保initECharts执行不中断
 */
import { startSimulation, endSimulation } from "./api.js";
import { socket, isSocketConnected } from "./socket.js";
// 修复：增加导入兜底
import { ENV as importedENV } from "./config.js";
// 兜底：如果导入失败，用默认值
const ENV = importedENV || {
  mobileWidth: 768,
  baseURL: "http://127.0.0.1:5000",
  socketURL: "http://127.0.0.1:5000"
};

// 兼容性提示：低版本浏览器需引入ES6 Polyfill（如babel-polyfill）
if (!window.Promise || !Array.prototype.map) {
  console.warn("当前浏览器不支持ES6特性，请引入Polyfill以保证功能正常");
}

// 私有状态管理：避免全局污染
const state = {
  isSimulating: false, // 是否正在仿真
  chartInstances: { // ECharts实例
    windowBar: null,
    tablePie: null,
    windowLine: null,
    tableLine: null
  },
  elements: { // 页面元素缓存
    simulationForm: null,
    startBtn: null,
    endBtn: null,
    tipBox: null,
    resultArea: null,
    windowEval: null,
    tableEval: null
  }
};

/**
 * 初始化页面元素缓存：避免重复DOM查询
 */
const initElements = () => {
  state.elements = {
    simulationForm: document.getElementById("simulationForm"),
    startBtn: document.getElementById("startBtn"),
    endBtn: document.getElementById("endBtn"),
    tipBox: document.getElementById("tipBox"),
    resultArea: document.getElementById("resultArea"),
    windowEval: document.getElementById("windowEval"),
    tableEval: document.getElementById("tableEval")
  };

  // 元素存在性校验
  Object.entries(state.elements).forEach(([key, el]) => {
    if (!el) {
      console.error(`页面元素未找到：#${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
    }
  });
};

/**
 * 提示展示函数：统一处理页面提示
 * @param {string} type - 提示类型：loading/success/error
 * @param {string} msg - 提示内容
 */
const showTip = (type, msg) => {
  const { tipBox } = state.elements;
  if (!tipBox) return;

  tipBox.className = `simulation__tip simulation__tip--${type}`;
  tipBox.innerText = msg;
  tipBox.style.display = "block";

  // 成功提示3秒后自动隐藏
  if (type === "success") {
    setTimeout(() => {
      tipBox.style.display = "none";
    }, 3000);
  }
};

/**
 * 隐藏提示框
 */
const hideTip = () => {
  state.elements.tipBox.style.display = "none";
};

/**
 * 表单参数获取与校验
 * @returns {object|false} - 校验通过返回参数对象，失败返回false
 */
const getAndCheckFormParams = () => {
  const { simulationForm } = state.elements;
  if (!simulationForm) {
    showTip("error", "仿真表单元素未找到");
    return false;
  }

  const formData = new FormData(simulationForm);
  const params = {
    dining_time: parseInt(formData.get("dining_time") || 0),
    meal_time: parseInt(formData.get("meal_time") || 0),
    max_people: parseInt(formData.get("max_people") || 0),
    window_num: parseInt(formData.get("window_num") || 1),
    table_num: parseInt(formData.get("table_num") || 1)
  };

  // 校验逻辑
  for (const [key, value] of Object.entries(params)) {
    if (isNaN(value)) {
      showTip("error", `【${key}】必须为有效数字`);
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
 * 初始化ECharts图表：修复响应式配置，删除易出错的media query
 */
const initECharts = () => {
  // 校验ECharts是否加载
  if (!window.echarts) {
    throw new Error("未检测到ECharts CDN，请先引入：<script src='https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js'></script>");
  }

  // 修复：简化响应式配置，删除media query（核心修复点）
  const getBaseOption = (baseOption) => {
    // 根据屏幕宽度动态调整字体大小
    const isMobile = window.innerWidth < ENV.mobileWidth;
    const fontSize = isMobile ? 10 : 14;
    const titleFontSize = isMobile ? 12 : 18;

    return {
      ...baseOption,
      title: { ...baseOption.title, textStyle: { fontSize: titleFontSize } },
      legend: { ...baseOption.legend, textStyle: { fontSize } },
      tooltip: { ...baseOption.tooltip, textStyle: { fontSize } },
      xAxis: { 
        ...baseOption.xAxis, 
        nameTextStyle: { fontSize }, 
        axisLabel: { fontSize: fontSize - 1 } 
      },
      yAxis: { 
        ...baseOption.yAxis, 
        nameTextStyle: { fontSize }, 
        axisLabel: { fontSize: fontSize - 1 } 
      }
    };
  };

  // 1. 窗口等待人数柱状图
  state.chartInstances.windowBar = echarts.init(document.getElementById("windowBarChart"));
  state.chartInstances.windowBar.setOption(getBaseOption({
    title: { text: "各窗口当前等待人数", left: "center" },
    xAxis: { type: "category", data: [], name: "窗口编号" },
    yAxis: { type: "value", name: "等待人数", min: 0 },
    series: [{ type: "bar", data: [], itemStyle: { color: "#32c76b" } }],
    tooltip: { trigger: "axis" }
  }));

  // 2. 桌子占用饼状图
  state.chartInstances.tablePie = echarts.init(document.getElementById("tablePieChart"));
  state.chartInstances.tablePie.setOption(getBaseOption({
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
  }));

  // 3. 窗口排队人数折线图
  state.chartInstances.windowLine = echarts.init(document.getElementById("windowLineChart"));
  state.chartInstances.windowLine.setOption(getBaseOption({
    title: { text: "各窗口排队人数变化趋势", left: "center" },
    xAxis: { type: "category", data: [], name: "仿真时间(秒)" },
    yAxis: { type: "value", name: "等待人数", min: 0 },
    series: [],
    tooltip: { trigger: "axis" },
    legend: { top: "bottom" }
  }));

  // 4. 桌子占用折线图
  state.chartInstances.tableLine = echarts.init(document.getElementById("tableLineChart"));
  state.chartInstances.tableLine.setOption(getBaseOption({
    title: { text: "桌子占用数变化趋势", left: "center" },
    xAxis: { type: "category", data: [], name: "仿真时间(秒)" },
    yAxis: { type: "value", name: "桌子数", min: 0 },
    series: [
      { name: "已使用桌子", type: "line", data: [], color: "#f53f3f" },
      { name: "剩余桌子", type: "line", data: [], color: "#1890ff" }
    ],
    tooltip: { trigger: "axis" },
    legend: { top: "bottom" }
  }));

  // 修复：窗口大小变化时，重新计算字体+调整图表（防抖处理）
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // 重新设置图表样式（响应式）
      if (state.chartInstances.windowBar) {
        state.chartInstances.windowBar.setOption(getBaseOption(state.chartInstances.windowBar.getOption()));
      }
      if (state.chartInstances.tablePie) {
        state.chartInstances.tablePie.setOption(getBaseOption(state.chartInstances.tablePie.getOption()));
      }
      if (state.chartInstances.windowLine) {
        state.chartInstances.windowLine.setOption(getBaseOption(state.chartInstances.windowLine.getOption()));
      }
      if (state.chartInstances.tableLine) {
        state.chartInstances.tableLine.setOption(getBaseOption(state.chartInstances.tableLine.getOption()));
      }
      // 调整图表大小
      Object.values(state.chartInstances).forEach(ins => ins?.resize());
    }, 100);
  });
};

/**
 * 渲染函数1：更新窗口等待人数柱状图
 * @param {array} windowPeople - 各窗口当前等待人数数组
 */
const updateWindowBarChart = (windowPeople) => {
  const chart = state.chartInstances.windowBar;
  if (!chart || !Array.isArray(windowPeople)) return;

  const xAxisData = windowPeople.map((_, index) => `窗口${index + 1}`);
  const itemStyle = {
    color: (params) => windowPeople[params.dataIndex] >= 20 ? "#f53f3f" : "#32c76b"
  };

  chart.setOption({
    xAxis: { data: xAxisData },
    series: [{ data: windowPeople, itemStyle }]
  });
};

/**
 * 渲染函数2：更新桌子占用饼状图
 * @param {number} usedTable - 已使用桌子数
 * @param {number} remainingTable - 剩余桌子数
 */
const updateTablePieChart = (usedTable, remainingTable) => {
  const chart = state.chartInstances.tablePie;
  if (!chart || typeof usedTable !== "number" || typeof remainingTable !== "number") return;

  const pieData = [
    { name: "已使用桌子", value: usedTable, itemStyle: { color: "#f53f3f" } },
    { name: "剩余桌子", value: remainingTable, itemStyle: { color: "#1890ff" } }
  ];

  chart.setOption({ series: [{ data: pieData }] });
};

/**
 * 渲染函数3：更新窗口排队人数折线图
 * @param {array} windowTrend - 窗口排队趋势数据
 */
const updateWindowLineChart = (windowTrend) => {
  const chart = state.chartInstances.windowLine;
  if (!chart || !Array.isArray(windowTrend) || windowTrend.length === 0) return;

  const xAxisData = windowTrend.map(item => item.time);
  const windowNum = windowTrend[0]?.people?.length || 0;
  const seriesData = [];

  for (let i = 0; i < windowNum; i++) {
    seriesData.push({
      name: `窗口${i + 1}`,
      type: "line",
      data: windowTrend.map(item => item.people[i] || 0)
    });
  }

  chart.setOption({
    xAxis: { data: xAxisData },
    series: seriesData
  });
};

/**
 * 渲染函数4：更新桌子占用折线图
 * @param {array} tableTrend - 桌子占用趋势数据
 */
const updateTableLineChart = (tableTrend) => {
  const chart = state.chartInstances.tableLine;
  if (!chart || !Array.isArray(tableTrend) || tableTrend.length === 0) return;

  const xAxisData = tableTrend.map(item => item.time);
  const usedData = tableTrend.map(item => item.used || 0);
  const remainingData = tableTrend.map(item => item.remaining || 0);

  chart.setOption({
    xAxis: { data: xAxisData },
    series: [
      { name: "已使用桌子", data: usedData },
      { name: "剩余桌子", data: remainingData }
    ]
  });
};

/**
 * 渲染函数5：展示仿真体验评价
 * @param {string} windowEval - 窗口排队体验
 * @param {string} tableEval - 桌子占用体验
 */
const showEvaluation = (windowEval, tableEval) => {
  const { windowEval: windowEvalEl, tableEval: tableEvalEl, resultArea } = state.elements;
  if (!windowEvalEl || !tableEvalEl || !resultArea) return;

  // 设置样式和内容
  windowEvalEl.className = windowEval === "体验良好" ? "eval--good" : "eval--bad";
  windowEvalEl.innerText = windowEval || "未知";
  tableEvalEl.className = tableEval === "体验良好" ? "eval--good" : "eval--bad";
  tableEvalEl.innerText = tableEval || "未知";

  // 显示结果区
  resultArea.style.display = "block";
};

// 挂载渲染函数到window
window.updateWindowBarChart = updateWindowBarChart;
window.updateTablePieChart = updateTablePieChart;
window.updateWindowLineChart = updateWindowLineChart;
window.updateTableLineChart = updateTableLineChart;
window.showEvaluation = showEvaluation;

/**
 * 启动仿真事件处理（新增session_id绑定）
 */
const handleStartSimulation = async () => {
  console.log("✅ 点击了启动仿真按钮（事件已触发）"); 
  const { startBtn, endBtn } = state.elements;

  if (state.isSimulating) return;
  if (!isSocketConnected) {
    showTip("error", "SocketIO未连接，请检查后端服务");
    return;
  }

  const params = getAndCheckFormParams();
  if (!params) return;

  state.isSimulating = true;
  startBtn?.setAttribute("disabled", true);
  endBtn?.removeAttribute("disabled");

  hideTip();
  showTip("loading", "仿真启动中，请稍候...");

  try {
    console.log("📡 准备发送启动仿真请求，参数：", params);
    const res = await startSimulation(params);
    console.log("📡 后端响应：", res);
    
    if (res?.success) {
      showTip("success", res.msg || "仿真启动成功");
      
      // 新增：获取后端返回的session_id，并通过Socket绑定
      if (res?.data?.session_id) {
        state.sessionId = res.data.session_id;  // 存储session_id
        // 发送bind_session事件给后端，绑定Socket room
        socket.emit('bind_session', res.data.session_id);
        console.log("🔗 Socket绑定session_id：", res.data.session_id);
      }
      
      state.elements.resultArea.style.display = "none";
      state.chartInstances.windowBar?.clear();
      state.chartInstances.tablePie?.clear();
    } else {
      throw new Error(res?.msg || "仿真启动失败");
    }
  } catch (error) {
    state.isSimulating = false;
    startBtn?.removeAttribute("disabled");
    endBtn?.setAttribute("disabled", true);
    showTip("error", error.message);
    console.error("❌ 启动仿真失败：", error);
  }
};

// 结束仿真时，传递session_id给后端
const handleEndSimulation = async () => {
  const { startBtn, endBtn } = state.elements;

  if (!state.isSimulating) return;

  hideTip();
  showTip("loading", "仿真结束中，正在生成结果...");

  try {
    // 新增：传递session_id给后端
    const res = await endSimulation({ session_id: state.sessionId });
    if (res?.success && res?.data) {
      showTip("success", "仿真结束成功，已生成结果分析");
      updateWindowLineChart(res.data.window_trend || []);
      updateTableLineChart(res.data.table_trend || []);
      showEvaluation(res.data.window_evaluation || "", res.data.table_evaluation || "");
      state.isSimulating = false;
      startBtn?.removeAttribute("disabled");
      endBtn?.setAttribute("disabled", true);
    } else {
      throw new Error(res?.msg || "仿真结束失败");
    }
  } catch (error) {
    showTip("error", error.message);
    console.error("❌ 结束仿真失败：", error);
  }
};

/**
 * 绑定页面事件
 */
const bindEvents = () => {
  const { simulationForm, startBtn, endBtn } = state.elements;

  // 启动按钮点击
  startBtn?.addEventListener("click", handleStartSimulation);
  // 结束按钮点击
  endBtn?.addEventListener("click", handleEndSimulation);
  // 表单回车提交
  simulationForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleStartSimulation();
  });
};

/**
 * 资源销毁：页面卸载时清理
 */
const destroyResources = () => {
  // 断开Socket连接
  socket.disconnect();
  // 销毁ECharts实例
  Object.values(state.chartInstances).forEach(ins => ins?.dispose());
  // 清空状态
  state.isSimulating = false;
  // 解绑事件（简化版，复杂场景可使用事件委托）
  const { startBtn, endBtn, simulationForm } = state.elements;
  startBtn?.removeEventListener("click", handleStartSimulation);
  endBtn?.removeEventListener("click", handleEndSimulation);
  simulationForm?.removeEventListener("submit", (e) => e.preventDefault());
};

/**
 * 页面初始化入口：增加错误捕获，避免中断
 */
const initPage = () => {
  try {
    // 初始化元素缓存
    initElements();
    // 初始化图表（修复后不会报错）
    initECharts();
    // 绑定事件（关键：之前因为initECharts报错，这步没执行）
    bindEvents();
    // 注册资源销毁
    window.addEventListener("unload", destroyResources);
    console.log("✅ 页面初始化完成，事件绑定成功");
  } catch (error) {
    console.error("❌ 页面初始化失败：", error);
    showTip("error", "页面初始化失败，请刷新重试");
  }
};

// 页面加载完成后初始化
if (document.readyState === "complete" || document.readyState === "interactive") {
  initPage();
} else {
  window.addEventListener("DOMContentLoaded", initPage);
}

// 暴露状态和方法（供调试）
window.simulationState = state;