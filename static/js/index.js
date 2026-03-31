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
  chartColors: {}
};

/**
 * 从 CSS 变量获取图表颜色（样式与逻辑分离）
 */
const getChartColors = () => {
  const styles = getComputedStyle(document.documentElement);
  const colors = {
    primary: styles.getPropertyValue('--chart-series-1').trim() || '#e1edff',    // 极浅蓝
    success: styles.getPropertyValue('--chart-series-2').trim() || '#d6e5ff',    // 浅蓝
    error: styles.getPropertyValue('--chart-series-3').trim() || '#c5d9ff',      // 中浅蓝
    info: styles.getPropertyValue('--chart-series-4').trim() || '#b8d0ff',       // 中蓝
    warning: styles.getPropertyValue('--chart-series-5').trim() || '#a9c6ff',    // 主蓝
    purple: styles.getPropertyValue('--chart-series-6').trim() || '#8fb3e6'      // 深蓝
  };
  console.log('[Chart] getChartColors:', colors);
  return colors;
};

/**
 * 更新所有图表的颜色配置（响应主题变化）
 */
const updateChartColors = () => {
  const newColors = getChartColors();

  // 更新状态中的颜色引用
  state.chartColors = newColors;

  // 更新柱状图颜色
  const windowBarOption = state.chartInstances.windowBar?.getOption();
  if (windowBarOption) {
    const newData = windowBarOption.series[0].data;
    state.chartInstances.windowBar.setOption({
      series: [{
        data: newData,
        itemStyle: {
          color: (params) => newData[params.dataIndex] >= 20 ? newColors.error : newColors.success
        }
      }]
    });
  }

  // 更新饼图颜色
  const tablePieOption = state.chartInstances.tablePie?.getOption();
  if (tablePieOption && tablePieOption.series[0]?.data) {
    state.chartInstances.tablePie.setOption({
      series: [{
        data: tablePieOption.series[0].data.map(item => ({
          name: item.name,
          value: item.value,
          itemStyle: {
            color: item.name === '已使用桌子' ? newColors.error : newColors.info
          }
        }))
      }]
    });
  }

  // 更新窗口折线图颜色 - 使用 lineStyle 而非 color
  const windowLineOption = state.chartInstances.windowLine?.getOption();
  if (windowLineOption && windowLineOption.series && windowLineOption.series.length > 0) {
    const chartColorsArray = [
      newColors.primary, newColors.success, newColors.error,
      newColors.info, newColors.warning, newColors.purple
    ];
    state.chartInstances.windowLine.setOption({
      series: windowLineOption.series.map((s, i) => ({
        ...s,
        lineStyle: {
          color: chartColorsArray[i % chartColorsArray.length]
        }
      }))
    });
  }

  // 更新桌子折线图颜色
  const tableLineOption = state.chartInstances.tableLine?.getOption();
  if (tableLineOption && tableLineOption.series && tableLineOption.series.length >= 2) {
    state.chartInstances.tableLine.setOption({
      series: [
        {
          ...tableLineOption.series[0],
          lineStyle: { color: newColors.error }
        },
        {
          ...tableLineOption.series[1],
          lineStyle: { color: newColors.info }
        }
      ]
    });
  }

  console.log(`[Chart] 颜色已更新为：`, newColors);
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
      console.error(`页面元素未找到：#${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
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
      tipBox.style.display = "none";
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
    dining_time: parseInt(formData.get("dining_time") || 0),
    meal_time: parseInt(formData.get("meal_time") || 0),
    max_people: parseInt(formData.get("max_people") || 0),
    window_num: parseInt(formData.get("window_num") || 1),
    table_num: parseInt(formData.get("table_num") || 1)
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

  state.chartInstances.windowBar = echarts.init(document.getElementById("windowBarChart"));
  state.chartInstances.windowBar.setOption(getBaseOption({
    title: { text: "各窗口当前等待人数", left: "center" },
    xAxis: { type: "category", data: [], name: "窗口编号" },
    yAxis: { type: "value", name: "等待人数", min: 0 },
    series: [{ type: "bar", data: [], itemStyle: { color: state.chartColors.success } }],
    tooltip: { trigger: "axis" }
  }));

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

  state.chartInstances.windowLine = echarts.init(document.getElementById("windowLineChart"));
  state.chartInstances.windowLine.setOption(getBaseOption({
    title: { text: "各窗口排队人数变化趋势", left: "center" },
    xAxis: { type: "category", data: [], name: "仿真时间 (秒)" },
    yAxis: { type: "value", name: "等待人数", min: 0 },
    series: [],
    tooltip: { trigger: "axis" },
    legend: { top: "bottom" }
  }));

  state.chartInstances.tableLine = echarts.init(document.getElementById("tableLineChart"));
  state.chartInstances.tableLine.setOption(getBaseOption({
    title: { text: "桌子占用数变化趋势", left: "center" },
    xAxis: { type: "category", data: [], name: "仿真时间 (秒)" },
    yAxis: { type: "value", name: "桌子数", min: 0 },
    series: [
      { name: "已使用桌子", type: "line", data: [], color: state.chartColors.error },
      { name: "剩余桌子", type: "line", data: [], color: state.chartColors.info }
    ],
    tooltip: { trigger: "axis" },
    legend: { top: "bottom" }
  }));

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
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
      Object.values(state.chartInstances).forEach(ins => ins?.resize());
    }, 100);
  });
};

const updateWindowBarChart = (windowPeople) => {
  const chart = state.chartInstances.windowBar;
  if (!chart || !Array.isArray(windowPeople)) return;

  const xAxisData = windowPeople.map((_, index) => `窗口${index + 1}`);
  const itemStyle = {
    color: (params) => windowPeople[params.dataIndex] >= 20 ? state.chartColors.error : state.chartColors.success
  };

  chart.setOption({
    xAxis: { data: xAxisData },
    series: [{ data: windowPeople, itemStyle }]
  });
};

const updateTablePieChart = (usedTable, remainingTable) => {
  const chart = state.chartInstances.tablePie;
  if (!chart || typeof usedTable !== "number" || typeof remainingTable !== "number") return;

  const pieData = [
    { name: "已使用桌子", value: usedTable, itemStyle: { color: state.chartColors.error } },
    { name: "剩余桌子", value: remainingTable, itemStyle: { color: state.chartColors.info } }
  ];

  chart.setOption({ series: [{ data: pieData }] });
};

const updateWindowLineChart = (windowTrend) => {
  const chart = state.chartInstances.windowLine;
  if (!chart || !Array.isArray(windowTrend) || windowTrend.length === 0) return;

  const xAxisData = windowTrend.map(item => item.time);
  const windowNum = windowTrend[0]?.people?.length || 0;
  const seriesData = [];

  // 为每个窗口分配不同颜色（由浅到深渐变）
  const chartColors = [
    state.chartColors.primary,    // 极浅蓝
    state.chartColors.success,    // 浅蓝
    state.chartColors.error,      // 中浅蓝
    state.chartColors.info,       // 中蓝
    state.chartColors.warning,    // 主蓝
    state.chartColors.purple      // 深蓝
  ];

  for (let i = 0; i < windowNum; i++) {
    seriesData.push({
      name: `窗口${i + 1}`,
      type: "line",
      data: windowTrend.map(item => item.people[i] || 0),
      color: chartColors[i % chartColors.length]  // 循环使用颜色
    });
  }

  chart.setOption({
    xAxis: { data: xAxisData },
    series: seriesData
  });
};

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
        socket.emit('bind_session', res.data.session_id);
        console.log("🔗 Socket 绑定 session_id：", res.data.session_id);
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

const bindEvents = () => {
  const { simulationForm, startBtn, endBtn } = state.elements;

  startBtn?.addEventListener("click", handleStartSimulation);
  endBtn?.addEventListener("click", handleEndSimulation);
  simulationForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    handleStartSimulation();
  });

  // 监听主题变更事件，更新图表颜色
  // 使用 once: false 确保可以多次触发
  document.addEventListener('themeChange', () => {
    console.log('[Index] 收到 themeChange 事件');
    updateChartColors();
  }, { passive: true });
};

const destroyResources = () => {
  socket.disconnect();
  Object.values(state.chartInstances).forEach(ins => ins?.dispose());
  state.isSimulating = false;
  const { startBtn, endBtn, simulationForm } = state.elements;
  startBtn?.removeEventListener("click", handleStartSimulation);
  endBtn?.removeEventListener("click", handleEndSimulation);
  simulationForm?.removeEventListener("submit", (e) => e.preventDefault());
};

const initPage = () => {
  try {
    initElements();
    initECharts();
    bindEvents();
    window.addEventListener("unload", destroyResources);
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
