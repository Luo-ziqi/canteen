/**
 * 餐厅打饭仿真系统 - 核心逻辑
 * 修复点：
 * 1. 简化 ECharts 响应式配置，删除 media query 避免解析错误
 * 2. 增加 ENV 导入兜底，防止 undefined
 * 3. 确保 initECharts 执行不中断
 * 4. 移除所有硬编码颜色值，从 CSS 变量读取（样式与逻辑分离）
 */
import { startSimulation, endSimulation } from "./api.js";
import { socket, isSocketConnected } from "./socket.js";
import { ENV as importedENV } from "./config.js";

const ENV = importedENV || {
  mobileWidth: 768,
  baseURL: "http://127.0.0.1:5000",
  socketURL: "http://127.0.0.1:5000"
};

if (!window.Promise || !Array.prototype.map) {
  console.warn("当前浏览器不支持 ES6 特性，请引入 Polyfill 以保证功能正常");
}

const state = {
  isSimulating: false,
  chartInstances: {
    windowBar: null,
    tablePie: null,
    windowLine: null,
    tableLine: null
  },
  elements: {
    simulationForm: null,
    startBtn: null,
    endBtn: null,
    tipBox: null,
    resultArea: null,
    windowEval: null,
    tableEval: null
  },
  sessionId: null,
  chartColors: {},

  // 图表数据缓存
  chartData: {
    windowPeople: [],
    usedTable: 0,
    remainingTable: 0,
    windowTrend: [],
    tableTrend: []
  },

  // 合帧更新状态
  renderState: {
    frameId: 0,
    pending: {
      windowBar: false,
      tablePie: false,
      windowLine: false,
      tableLine: false
    }
  },

  // 事件引用，便于销毁
  handlers: {
    resize: null,
    themeChange: null,
    unload: null,
    formSubmit: null
  }
};

/**
 * 从 CSS 变量获取图表颜色
 */
const getChartColors = () => {
  const styles = getComputedStyle(document.documentElement);
  const colors = {
    primary: styles.getPropertyValue("--chart-series-1").trim() || "#e1edff",
    success: styles.getPropertyValue("--chart-series-2").trim() || "#d6e5ff",
    error: styles.getPropertyValue("--chart-series-3").trim() || "#c5d9ff",
    info: styles.getPropertyValue("--chart-series-4").trim() || "#b8d0ff",
    warning: styles.getPropertyValue("--chart-series-5").trim() || "#a9c6ff",
    purple: styles.getPropertyValue("--chart-series-6").trim() || "#8fb3e6"
  };
  console.log("[Chart] getChartColors:", colors);
  return colors;
};

/**
 * 合并更新参数
 */
const getSetOptionOpts = (extra = {}) => ({
  lazyUpdate: true,
  silent: true,
  ...extra
});

/**
 * 请求下一帧渲染
 */
const requestChartRender = (chartKey) => {
  state.renderState.pending[chartKey] = true;

  if (state.renderState.frameId) return;

  state.renderState.frameId = requestAnimationFrame(() => {
    state.renderState.frameId = 0;
    flushChartRender();
  });
};

/**
 * 执行图表渲染
 */
const flushChartRender = () => {
  const { pending } = state.renderState;

  if (pending.windowBar) {
    renderWindowBarChart();
    pending.windowBar = false;
  }

  if (pending.tablePie) {
    renderTablePieChart();
    pending.tablePie = false;
  }

  if (pending.windowLine) {
    renderWindowLineChart();
    pending.windowLine = false;
  }

  if (pending.tableLine) {
    renderTableLineChart();
    pending.tableLine = false;
  }
};

/**
 * 更新所有图表颜色（响应主题变化）
 */
const updateChartColors = () => {
  state.chartColors = getChartColors();

  requestChartRender("windowBar");
  requestChartRender("tablePie");
  requestChartRender("windowLine");
  requestChartRender("tableLine");

  console.log("[Chart] 颜色已更新为：", state.chartColors);
};

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

  Object.entries(state.elements).forEach(([key, el]) => {
    if (!el) {
      console.error(`页面元素未找到：#${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`);
    }
  });

  state.chartColors = getChartColors();
};

const showTip = (type, msg) => {
  const { tipBox } = state.elements;
  if (!tipBox) return;

  tipBox.className = `simulation__tip simulation__tip--${type}`;
  tipBox.innerText = msg;
  tipBox.style.display = "block";

  if (type === "success") {
    setTimeout(() => {
      if (state.elements.tipBox) {
        state.elements.tipBox.style.display = "none";
      }
    }, 3000);
  }
};

const hideTip = () => {
  if (state.elements.tipBox) {
    state.elements.tipBox.style.display = "none";
  }
};

const getAndCheckFormParams = () => {
  const { simulationForm } = state.elements;
  if (!simulationForm) {
    showTip("error", "仿真表单元素未找到");
    return false;
  }

  const formData = new FormData(simulationForm);
  const params = {
    dining_time: parseInt(formData.get("dining_time") || 0, 10),
    meal_time: parseInt(formData.get("meal_time") || 0, 10),
    max_people: parseInt(formData.get("max_people") || 0, 10),
    window_num: parseInt(formData.get("window_num") || 1, 10),
    table_num: parseInt(formData.get("table_num") || 1, 10)
  };

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
    showTip("error", "窗口数不能小于 1");
    return false;
  }

  if (params.table_num < 1) {
    showTip("error", "桌子数不能小于 1");
    return false;
  }

  return params;
};

/**
 * 重置图表数据（不 clear，不销毁配置）
 */
const resetChartsForNewSimulation = () => {
  state.chartData.windowPeople = [];
  state.chartData.usedTable = 0;
  state.chartData.remainingTable = 0;
  state.chartData.windowTrend = [];
  state.chartData.tableTrend = [];

  state.chartInstances.windowBar?.setOption({
    xAxis: { data: [] },
    series: [{
      id: "window-bar-series",
      data: []
    }]
  }, getSetOptionOpts());

  state.chartInstances.tablePie?.setOption({
    series: [{
      id: "table-pie-series",
      data: []
    }]
  }, getSetOptionOpts());

  state.chartInstances.windowLine?.setOption({
    xAxis: { data: [] },
    series: []
  }, getSetOptionOpts({ replaceMerge: ["series"] }));

  state.chartInstances.tableLine?.setOption({
    xAxis: { data: [] },
    series: [
      {
        id: "table-line-used",
        data: []
      },
      {
        id: "table-line-remaining",
        data: []
      }
    ]
  }, getSetOptionOpts({ replaceMerge: ["series"] }));
};

const initECharts = () => {
  if (!window.echarts) {
    throw new Error("未检测到 ECharts CDN，请先引入：<script src='https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js'></script>");
  }

  state.chartColors = getChartColors();

  const getBaseOption = (baseOption) => {
    const isMobile = window.innerWidth < ENV.mobileWidth;
    const fontSize = isMobile ? 10 : 14;
    const titleFontSize = isMobile ? 12 : 18;

    return {
      animation: true,
      animationThreshold: 1500,
      animationDuration: 300,
      animationDurationUpdate: 220,
      animationEasing: "cubicOut",
      animationEasingUpdate: "cubicOut",

      ...baseOption,
      title: {
        ...(baseOption.title || {}),
        textStyle: { fontSize: titleFontSize }
      },
      legend: {
        ...(baseOption.legend || {}),
        textStyle: { fontSize }
      },
      tooltip: {
        ...(baseOption.tooltip || {}),
        textStyle: { fontSize }
      },

      ...(baseOption.xAxis && {
        xAxis: {
          ...baseOption.xAxis,
          type: baseOption.xAxis.type || "category",
          nameTextStyle: { fontSize },
          axisLabel: { fontSize: fontSize - 1 }
        }
      }),

      ...(baseOption.yAxis && {
        yAxis: {
          ...baseOption.yAxis,
          type: baseOption.yAxis.type || "value",
          nameTextStyle: { fontSize },
          axisLabel: { fontSize: fontSize - 1 }
        }
      }),

      ...(baseOption.series && {
        series: baseOption.series.map((s) => ({
          ...s,
          type: s.type || "line"
        }))
      })
    };
  };

  state.chartInstances.windowBar = echarts.init(document.getElementById("windowBarChart"));
  state.chartInstances.windowBar.setOption(getBaseOption({
    title: { text: "各窗口当前等待人数", left: "center" },
    xAxis: { type: "category", data: [], name: "窗口编号" },
    yAxis: { type: "value", name: "等待人数", min: 0 },
    series: [{
      id: "window-bar-series",
      type: "bar",
      data: [],
      barMaxWidth: 28,
      itemStyle: { color: state.chartColors.success }
    }],
    tooltip: { trigger: "axis" }
  }));

  state.chartInstances.tablePie = echarts.init(document.getElementById("tablePieChart"));
  state.chartInstances.tablePie.setOption(getBaseOption({
    title: { text: "桌子占用状态", left: "center" },
    tooltip: { trigger: "item" },
    legend: { orient: "vertical", left: "left", top: "center" },
    series: [{
      id: "table-pie-series",
      name: "桌子数",
      type: "pie",
      radius: ["40%", "70%"],
      data: [],
      label: { show: true, formatter: "{b}: {c} ({d}%)" }
    }]
  }));

  state.chartInstances.windowLine = echarts.init(document.getElementById("windowLineChart"));
  state.chartInstances.windowLine.setOption(getBaseOption({
    title: { text: "各窗口排队人数变化趋势", left: "center" },
    xAxis: { type: "category", data: [], name: "仿真时间 (秒)" },
    yAxis: { type: "value", name: "等待人数", min: 0 },
    series: [{
      id: "window-line-1",
      name: "窗口1",
      type: "line",
      data: [],
      smooth: 0.25,
      showSymbol: false,
      symbol: "none",
      lineStyle: {
        color: state.chartColors.primary,
        width: 2
      }
    }],
    tooltip: { trigger: "axis" },
    legend: { top: "bottom" }
  }));

  state.chartInstances.tableLine = echarts.init(document.getElementById("tableLineChart"));
  state.chartInstances.tableLine.setOption(getBaseOption({
    title: { text: "桌子占用数变化趋势", left: "center" },
    xAxis: { type: "category", data: [], name: "仿真时间 (秒)" },
    yAxis: { type: "value", name: "桌子数", min: 0 },
    series: [
      {
        id: "table-line-used",
        name: "已使用桌子",
        type: "line",
        data: [],
        smooth: 0.2,
        showSymbol: false,
        symbol: "none",
        lineStyle: {
          color: state.chartColors.error,
          width: 2
        }
      },
      {
        id: "table-line-remaining",
        name: "剩余桌子",
        type: "line",
        data: [],
        smooth: 0.2,
        showSymbol: false,
        symbol: "none",
        lineStyle: {
          color: state.chartColors.info,
          width: 2
        }
      }
    ],
    tooltip: { trigger: "axis" },
    legend: { top: "bottom" }
  }));

  let resizeTimer = null;
  state.handlers.resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try {
        Object.values(state.chartInstances).forEach((ins) => ins?.resize());
      } catch (error) {
        console.error("[Chart] Resize error:", error);
      }
    }, 100);
  };

  window.addEventListener("resize", state.handlers.resize);
};

/**
 * 实际渲染：窗口柱状图
 */
const renderWindowBarChart = () => {
  const chart = state.chartInstances.windowBar;
  const windowPeople = state.chartData.windowPeople;
  if (!chart || !Array.isArray(windowPeople)) return;

  const xAxisData = windowPeople.map((_, index) => `窗口${index + 1}`);

  chart.setOption({
    xAxis: { data: xAxisData },
    yAxis: { min: 0 },
    series: [{
      id: "window-bar-series",
      data: windowPeople,
      itemStyle: {
        color: (params) =>
          windowPeople[params.dataIndex] >= 20
            ? state.chartColors.error
            : state.chartColors.success
      }
    }]
  }, getSetOptionOpts());
};

/**
 * 实际渲染：桌子饼图
 */
const renderTablePieChart = () => {
  const chart = state.chartInstances.tablePie;
  if (!chart) return;

  const pieData = [
    {
      name: "已使用桌子",
      value: state.chartData.usedTable,
      itemStyle: { color: state.chartColors.error }
    },
    {
      name: "剩余桌子",
      value: state.chartData.remainingTable,
      itemStyle: { color: state.chartColors.info }
    }
  ];

  chart.setOption({
    series: [{
      id: "table-pie-series",
      data: pieData
    }]
  }, getSetOptionOpts());
};

/**
 * 实际渲染：窗口折线图
 */
const renderWindowLineChart = () => {
  const chart = state.chartInstances.windowLine;
  const windowTrend = state.chartData.windowTrend;
  if (!chart || !Array.isArray(windowTrend) || windowTrend.length === 0) return;

  const xAxisData = windowTrend.map((item) => item.time);
  const windowNum = windowTrend[0]?.people?.length || 0;

  const chartColors = [
    state.chartColors.primary,
    state.chartColors.success,
    state.chartColors.error,
    state.chartColors.info,
    state.chartColors.warning,
    state.chartColors.purple
  ];

  const seriesData = Array.from({ length: windowNum }, (_, i) => ({
    id: `window-line-${i + 1}`,
    name: `窗口${i + 1}`,
    type: "line",
    data: windowTrend.map((item) => item.people?.[i] || 0),
    smooth: 0.25,
    showSymbol: false,
    symbol: "none",
    sampling: "lttb",
    lineStyle: {
      color: chartColors[i % chartColors.length],
      width: 2
    }
  }));

  const needReplaceSeries = chart.__windowSeriesCount !== windowNum;
  chart.__windowSeriesCount = windowNum;

  chart.setOption({
    xAxis: { data: xAxisData },
    yAxis: { min: 0 },
    animationDurationUpdate: 180,
    animationEasingUpdate: "linear",
    series: seriesData
  }, needReplaceSeries
    ? getSetOptionOpts({ replaceMerge: ["series"] })
    : getSetOptionOpts()
  );
};

/**
 * 实际渲染：桌子折线图
 */
const renderTableLineChart = () => {
  const chart = state.chartInstances.tableLine;
  const tableTrend = state.chartData.tableTrend;
  if (!chart || !Array.isArray(tableTrend) || tableTrend.length === 0) return;

  const xAxisData = tableTrend.map((item) => item.time);
  const usedData = tableTrend.map((item) => item.used || 0);
  const remainingData = tableTrend.map((item) => item.remaining || 0);

  chart.setOption({
    xAxis: { data: xAxisData },
    yAxis: { min: 0 },
    animationDurationUpdate: 180,
    animationEasingUpdate: "linear",
    series: [
      {
        id: "table-line-used",
        name: "已使用桌子",
        data: usedData,
        lineStyle: {
          color: state.chartColors.error,
          width: 2
        }
      },
      {
        id: "table-line-remaining",
        name: "剩余桌子",
        data: remainingData,
        lineStyle: {
          color: state.chartColors.info,
          width: 2
        }
      }
    ]
  }, getSetOptionOpts());
};

/**
 * 对外暴露：只负责缓存 + 请求渲染
 */
const updateWindowBarChart = (windowPeople) => {
  if (!Array.isArray(windowPeople)) return;
  state.chartData.windowPeople = windowPeople.slice();
  requestChartRender("windowBar");
};

const updateTablePieChart = (usedTable, remainingTable) => {
  if (typeof usedTable !== "number" || typeof remainingTable !== "number") return;
  state.chartData.usedTable = usedTable;
  state.chartData.remainingTable = remainingTable;
  requestChartRender("tablePie");
};

const updateWindowLineChart = (windowTrend) => {
  if (!Array.isArray(windowTrend)) return;
  state.chartData.windowTrend = windowTrend.slice();
  requestChartRender("windowLine");
};

const updateTableLineChart = (tableTrend) => {
  if (!Array.isArray(tableTrend)) return;
  state.chartData.tableTrend = tableTrend.slice();
  requestChartRender("tableLine");
};

const showEvaluation = (windowEval, tableEval) => {
  const { windowEval: windowEvalEl, tableEval: tableEvalEl, resultArea } = state.elements;
  if (!windowEvalEl || !tableEvalEl || !resultArea) return;

  windowEvalEl.className = windowEval === "体验良好" ? "eval--good" : "eval--bad";
  windowEvalEl.innerText = windowEval || "未知";

  tableEvalEl.className = tableEval === "体验良好" ? "eval--good" : "eval--bad";
  tableEvalEl.innerText = tableEval || "未知";

  resultArea.style.display = "block";
};

window.updateWindowBarChart = updateWindowBarChart;
window.updateTablePieChart = updateTablePieChart;
window.updateWindowLineChart = updateWindowLineChart;
window.updateTableLineChart = updateTableLineChart;
window.showEvaluation = showEvaluation;

const handleStartSimulation = async () => {
  console.log("✅ 点击了启动仿真按钮（事件已触发）");

  const { startBtn, endBtn } = state.elements;

  if (state.isSimulating) return;

  if (!isSocketConnected) {
    showTip("error", "SocketIO 未连接，请检查后端服务");
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

      if (res?.data?.session_id) {
        state.sessionId = res.data.session_id;
        socket.emit("bind_session", res.data.session_id);
        console.log("🔗 Socket 绑定 session_id：", res.data.session_id);
      }

      if (state.elements.resultArea) {
        state.elements.resultArea.style.display = "none";
      }

      resetChartsForNewSimulation();
    } else {
      throw new Error(res?.msg || "仿真启动失败");
    }
  } catch (error) {
    state.isSimulating = false;
    startBtn?.removeAttribute("disabled");
    endBtn?.setAttribute("disabled", true);
    showTip("error", error.message || "启动仿真失败");
    console.error("❌ 启动仿真失败：", error);
  }
};

const handleEndSimulation = async () => {
  const { startBtn, endBtn } = state.elements;

  if (!state.isSimulating) return;

  hideTip();
  showTip("loading", "仿真结束中，正在生成结果...");

  try {
    const res = await endSimulation({ session_id: state.sessionId });

    if (res?.success && res?.data) {
      showTip("success", "仿真结束成功，已生成结果分析");

      updateWindowLineChart(res.data.window_trend || []);
      updateTableLineChart(res.data.table_trend || []);
      showEvaluation(
        res.data.window_evaluation || "",
        res.data.table_evaluation || ""
      );

      state.isSimulating = false;
      startBtn?.removeAttribute("disabled");
      endBtn?.setAttribute("disabled", true);
    } else {
      throw new Error(res?.msg || "仿真结束失败");
    }
  } catch (error) {
    showTip("error", error.message || "结束仿真失败");
    console.error("❌ 结束仿真失败：", error);
  }
};

const handleFormSubmit = (e) => {
  e.preventDefault();
  handleStartSimulation();
};

const bindEvents = () => {
  const { simulationForm, startBtn, endBtn } = state.elements;

  startBtn?.addEventListener("click", handleStartSimulation);
  endBtn?.addEventListener("click", handleEndSimulation);

  state.handlers.formSubmit = handleFormSubmit;
  simulationForm?.addEventListener("submit", state.handlers.formSubmit);

  state.handlers.themeChange = () => {
    console.log("[Index] 收到 themeChange 事件");
    updateChartColors();
  };

  document.addEventListener("themeChange", state.handlers.themeChange, { passive: true });

  state.handlers.unload = destroyResources;
  window.addEventListener("unload", state.handlers.unload);
};

const destroyResources = () => {
  try {
    if (state.renderState.frameId) {
      cancelAnimationFrame(state.renderState.frameId);
      state.renderState.frameId = 0;
    }

    if (state.handlers.resize) {
      window.removeEventListener("resize", state.handlers.resize);
    }

    if (state.handlers.themeChange) {
      document.removeEventListener("themeChange", state.handlers.themeChange);
    }

    if (state.handlers.unload) {
      window.removeEventListener("unload", state.handlers.unload);
    }

    const { startBtn, endBtn, simulationForm } = state.elements;
    startBtn?.removeEventListener("click", handleStartSimulation);
    endBtn?.removeEventListener("click", handleEndSimulation);

    if (state.handlers.formSubmit) {
      simulationForm?.removeEventListener("submit", state.handlers.formSubmit);
    }

    socket.disconnect();
    Object.values(state.chartInstances).forEach((ins) => ins?.dispose());

    state.isSimulating = false;
  } catch (error) {
    console.error("[Destroy] 资源销毁失败：", error);
  }
};

const initPage = () => {
  try {
    initElements();
    initECharts();
    bindEvents();
    console.log("✅ 页面初始化完成，事件绑定成功");
  } catch (error) {
    console.error("❌ 页面初始化失败：", error);
    showTip("error", "页面初始化失败，请刷新重试");
  }
};

if (document.readyState === "complete" || document.readyState === "interactive") {
  initPage();
} else {
  window.addEventListener("DOMContentLoaded", initPage);
}

window.simulationState = state;
window.initPage = initPage;