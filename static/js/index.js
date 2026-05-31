/**
 * @fileoverview 餐厅仿真系统核心业务逻辑模块。
 * 处理 ECharts 初始化、仿真控制、数据流和事件绑定。
 */

import {startSimulation, endSimulation} from './api.js';
import {socket, isSocketConnected} from './socket.js';
import {ENV as importedENV} from './config.js';
import {initAI, setSimulationData} from './ai.js';
import {
  showToast, removeToast,
  playStartSound, playEndSound, playErrorSound, toggleSound, isSoundEnabled,
  initRipple, animateCountUp, showContextMenu,
  initFormValidation,
} from './enhance.js';

/**
 * 备用环境配置。
 * @const {!Object}
 */
const ENV = importedENV || {
  mobileWidth: 768,
  baseURL: 'http://127.0.0.1:5000',
  socketURL: 'http://127.0.0.1:5000',
};

/**
 * 检查 ES6 兼容性。
 */
if (!window.Promise || !Array.prototype.map) {
  console.warn(
      '当前浏览器不支持 ES6 特性。' +
      '请引入 polyfill。',
  );
}

/**
 * 应用状态。
 * @const {!Object}
 */
const state = {
  /** @type {boolean} 仿真是否正在运行。 */
  isSimulating: false,

  /** @type {!Object} ECharts 图表实例。 */
  chartInstances: {
    windowBar: null,
    tablePie: null,
    windowLine: null,
    tableLine: null,
  },

  /** @type {!Object} DOM 元素引用。 */
  elements: {
    simulationForm: null,
    startBtn: null,
    endBtn: null,
    tipBox: null,
    resultArea: null,
    windowEval: null,
    tableEval: null,
    saveConfigBtn: null,
    analyzeBtn: null,
  },

  /** @type {?string} 当前会话 ID。 */
  sessionId: null,

  /** @type {!Object} 图表颜色缓存。 */
  chartColors: {},

  /** @type {!Object} 缓存的图表数据。 */
  chartData: {
    windowPeople: [],
    usedTable: 0,
    remainingTable: 0,
    windowTrend: [],
    tableTrend: [],
  },

  /** @type {!Object} 基于帧的渲染状态。 */
  renderState: {
    frameId: 0,
    pending: {
      windowBar: false,
      tablePie: false,
      windowLine: false,
      tableLine: false,
    },
  },

  /** @type {!Object} 事件处理函数引用，用于清理。 */
  handlers: {
    resize: null,
    themeChange: null,
    unload: null,
    formSubmit: null,
  },
};

/**
 * 从 CSS 变量获取图表颜色。
 *
 * @return {!Object} 图表颜色值。
 */
function getChartColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primary:
        styles.getPropertyValue('--chart-series-1').trim() || '#e1edff',
    success:
        styles.getPropertyValue('--chart-series-2').trim() || '#d6e5ff',
    error:
        styles.getPropertyValue('--chart-series-3').trim() || '#c5d9ff',
    info:
        styles.getPropertyValue('--chart-series-4').trim() || '#b8d0ff',
    warning:
        styles.getPropertyValue('--chart-series-5').trim() || '#a9c6ff',
    purple:
        styles.getPropertyValue('--chart-series-6').trim() || '#8fb3e6',
  };
}

/**
 * 获取 setOption 选项对象。
 *
 * @param {!Object=} extra - 要合并的额外选项。
 * @return {!Object} 选项对象。
 */
function getSetOptionOpts(extra = {}) {
  return {
    lazyUpdate: true,
    silent: true,
    ...extra,
  };
}

/**
 * 请求下一帧渲染图表。
 *
 * @param {string} chartKey - 要渲染的图表键名。
 */
function requestChartRender(chartKey) {
  state.renderState.pending[chartKey] = true;

  if (state.renderState.frameId) {
    return;
  }

  state.renderState.frameId = requestAnimationFrame(() => {
    state.renderState.frameId = 0;
    flushChartRender_();
  });
}

/**
 * 刷新待处理的图表渲染。
 */
function flushChartRender_() {
  const pending = state.renderState.pending;

  if (pending.windowBar) {
    renderWindowBarChart_();
    pending.windowBar = false;
  }

  if (pending.tablePie) {
    renderTablePieChart_();
    pending.tablePie = false;
  }

  if (pending.windowLine) {
    renderWindowLineChart_();
    pending.windowLine = false;
  }

  if (pending.tableLine) {
    renderTableLineChart_();
    pending.tableLine = false;
  }
}

/**
 * 响应主题变化更新图表颜色。
 */
function updateChartColors() {
  state.chartColors = getChartColors();

  requestChartRender('windowBar');
  requestChartRender('tablePie');
  requestChartRender('windowLine');
  requestChartRender('tableLine');

  console.log('[Chart] 颜色已更新：', state.chartColors);
}

/**
 * 初始化 DOM 元素引用。
 */
function initElements() {
  state.elements = {
    simulationForm: document.getElementById('simulationForm'),
    startBtn: document.getElementById('startBtn'),
    endBtn: document.getElementById('endBtn'),
    tipBox: document.getElementById('tipBox'),
    resultArea: document.getElementById('resultArea'),
    windowEval: document.getElementById('windowEval'),
    tableEval: document.getElementById('tableEval'),
    saveConfigBtn: document.getElementById('saveConfigBtn'),
    analyzeBtn: document.getElementById('analyzeBtn'),
  };

  Object.entries(state.elements).forEach(([key, el]) => {
    if (!el) {
      console.error(`未找到 DOM 元素：#${key}`);
    }
  });

  state.chartColors = getChartColors();
}

/**
 * 显示通知（通过 Toast 系统）。
 *
 * @param {string} type - 通知类型：'success'、'error' 或 'loading'。
 * @param {string} msg - 要显示的消息。
 * @return {string} toast ID，可用于手动关闭。
 */
function showTip(type, msg) {
  return showToast(type, msg);
}

/** @deprecated 使用 Toast 后无需手动隐藏。 */
function hideTip() {}

/**
 * 获取并验证表单参数。
 *
 * @return {(boolean|!Object)} 表单参数，如果无效则返回 false。
 */
function getAndCheckFormParams() {
  const simulationForm = state.elements.simulationForm;
  if (!simulationForm) {
    showTip('error', '未找到仿真表单元素');
    return false;
  }

  const formData = new FormData(simulationForm);
  const params = {
    dining_time: parseInt(formData.get('dining_time') || 0, 10),
    meal_time: parseInt(formData.get('meal_time') || 0, 10),
    max_people: parseInt(formData.get('max_people') || 0, 10),
    window_num: parseInt(formData.get('window_num') || 1, 10),
    table_num: parseInt(formData.get('table_num') || 1, 10),
  };

  for (const [key, value] of Object.entries(params)) {
    if (isNaN(value)) {
      showTip('error', `无效的数值：${key}`);
      return false;
    }
    if (value < 0) {
      showTip('error', `${key} 不能为负数`);
      return false;
    }
  }

  if (params.window_num < 1) {
    showTip('error', '窗口数量至少为 1');
    return false;
  }

  if (params.table_num < 1) {
    showTip('error', '桌子数量至少为 1');
    return false;
  }

  return params;
}

/**
 * 重置图表数据以开始新仿真。
 */
function resetChartsForNewSimulation() {
  state.chartData.windowPeople = [];
  state.chartData.usedTable = 0;
  state.chartData.remainingTable = 0;
  state.chartData.windowTrend = [];
  state.chartData.tableTrend = [];

  state.chartInstances.windowBar.setOption({
    xAxis: {data: []},
    series: [{id: 'window-bar-series', data: []}],
  }, getSetOptionOpts());

  state.chartInstances.tablePie.setOption({
    series: [{id: 'table-pie-series', data: []}],
  }, getSetOptionOpts());

  state.chartInstances.windowLine.setOption({
    xAxis: {data: []},
    series: [],
  }, getSetOptionOpts({replaceMerge: ['series']}));

  state.chartInstances.tableLine.setOption({
    xAxis: {data: []},
    series: [
      {id: 'table-line-used', data: []},
      {id: 'table-line-remaining', data: []},
    ],
  }, getSetOptionOpts({replaceMerge: ['series']}));
}

/**
 * 初始化 ECharts 实例。
 */
function initECharts() {
  if (!window.echarts) {
    throw new Error(
        '未检测到 ECharts CDN。' +
        '请引入：<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>',
    );
  }

  state.chartColors = getChartColors();

  /**
   * 创建带有响应式设置的基础图表选项。
   *
   * @param {!Object} baseOption - 基础选项对象。
   * @return {!Object} 完整的选项对象。
   */
  function getBaseOption(baseOption) {
    const isMobile = window.innerWidth < ENV.mobileWidth;
    const fontSize = isMobile ? 10 : 14;
    const titleFontSize = isMobile ? 12 : 18;

    return {
      animation: true,
      animationThreshold: 1500,
      animationDuration: 300,
      animationDurationUpdate: 220,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',

      ...baseOption,
      title: {
        ...(baseOption.title || {}),
        textStyle: {fontSize: titleFontSize},
      },
      legend: {
        ...(baseOption.legend || {}),
        textStyle: {fontSize},
      },
      tooltip: {
        ...(baseOption.tooltip || {}),
        textStyle: {fontSize},
      },

      ...(baseOption.xAxis && {
        xAxis: {
          ...baseOption.xAxis,
          type: baseOption.xAxis.type || 'category',
          nameTextStyle: {fontSize},
          axisLabel: {fontSize: fontSize - 1},
        },
      }),

      ...(baseOption.yAxis && {
        yAxis: {
          ...baseOption.yAxis,
          type: baseOption.yAxis.type || 'value',
          nameTextStyle: {fontSize},
          axisLabel: {fontSize: fontSize - 1},
        },
      }),

      ...(baseOption.series && {
        series: baseOption.series.map((s) => ({
          ...s,
          type: s.type || 'line',
        })),
      }),
    };
  }

  // 初始化窗口柱状图
  state.chartInstances.windowBar = echarts.init(
      document.getElementById('windowBarChart'),
  );
  state.chartInstances.windowBar.setOption(getBaseOption({
    title: {text: '各窗口当前等待人数', left: 'center'},
    xAxis: {type: 'category', data: [], name: '窗口编号'},
    yAxis: {type: 'value', name: '等待人数', min: 0},
    series: [{
      id: 'window-bar-series',
      type: 'bar',
      data: [],
      barMaxWidth: 28,
      itemStyle: {color: state.chartColors.success},
    }],
    tooltip: {trigger: 'axis'},
  }));

  // 初始化桌子饼图
  state.chartInstances.tablePie = echarts.init(
      document.getElementById('tablePieChart'),
  );
  state.chartInstances.tablePie.setOption(getBaseOption({
    title: {text: '桌子占用状态', left: 'center'},
    tooltip: {trigger: 'item'},
    legend: {orient: 'vertical', left: 'left', top: 'center'},
    series: [{
      id: 'table-pie-series',
      name: '桌子数',
      type: 'pie',
      radius: ['40%', '70%'],
      data: [],
      label: {show: true, formatter: '{b}: {c} ({d}%)'},
    }],
  }));

  // 初始化窗口折线图
  state.chartInstances.windowLine = echarts.init(
      document.getElementById('windowLineChart'),
  );
  state.chartInstances.windowLine.setOption(getBaseOption({
    title: {text: '各窗口排队人数变化趋势', left: 'center'},
    xAxis: {type: 'category', data: [], name: '仿真时间（秒）'},
    yAxis: {type: 'value', name: '等待人数', min: 0},
    series: [{
      id: 'window-line-1',
      name: '窗口1',
      type: 'line',
      data: [],
      smooth: 0.25,
      showSymbol: false,
      symbol: 'none',
      lineStyle: {
        color: state.chartColors.primary,
        width: 2,
      },
    }],
    tooltip: {trigger: 'axis'},
    legend: {top: 'bottom'},
  }));

  // 初始化桌子折线图
  state.chartInstances.tableLine = echarts.init(
      document.getElementById('tableLineChart'),
  );
  state.chartInstances.tableLine.setOption(getBaseOption({
    title: {text: '桌子占用数变化趋势', left: 'center'},
    xAxis: {type: 'category', data: [], name: '仿真时间（秒）'},
    yAxis: {type: 'value', name: '桌子数', min: 0},
    series: [
      {
        id: 'table-line-used',
        name: '已使用桌子',
        type: 'line',
        data: [],
        smooth: 0.2,
        showSymbol: false,
        symbol: 'none',
        lineStyle: {
          color: state.chartColors.error,
          width: 2,
        },
      },
      {
        id: 'table-line-remaining',
        name: '剩余桌子',
        type: 'line',
        data: [],
        smooth: 0.2,
        showSymbol: false,
        symbol: 'none',
        lineStyle: {
          color: state.chartColors.info,
          width: 2,
        },
      },
    ],
    tooltip: {trigger: 'axis'},
    legend: {top: 'bottom'},
  }));

  // 绑定窗口大小调整处理函数
  let resizeTimer = null;
  state.handlers.resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      try {
        Object.values(state.chartInstances).forEach((ins) => {
          if (ins) {
            ins.resize();
          }
        });
      } catch (error) {
        console.error('[Chart] 调整大小错误：', error);
      }
    }, 100);
  };

  window.addEventListener('resize', state.handlers.resize);
}

/**
 * 渲染窗口柱状图。
 */
function renderWindowBarChart_() {
  const chart = state.chartInstances.windowBar;
  const windowPeople = state.chartData.windowPeople;

  if (!chart || !Array.isArray(windowPeople)) {
    return;
  }

  const xAxisData = windowPeople.map((_, index) => `窗口${index + 1}`);

  chart.setOption({
    xAxis: {data: xAxisData},
    yAxis: {min: 0},
    series: [{
      id: 'window-bar-series',
      data: windowPeople,
      itemStyle: {
        color: (params) =>
            windowPeople[params.dataIndex] >= 20
                ? state.chartColors.error
                : state.chartColors.success,
      },
    }],
  }, getSetOptionOpts());
}

/**
 * 渲染桌子饼图。
 */
function renderTablePieChart_() {
  const chart = state.chartInstances.tablePie;
  if (!chart) {
    return;
  }

  const pieData = [
    {
      name: '已使用桌子',
      value: state.chartData.usedTable,
      itemStyle: {color: state.chartColors.error},
    },
    {
      name: '剩余桌子',
      value: state.chartData.remainingTable,
      itemStyle: {color: state.chartColors.info},
    },
  ];

  chart.setOption({
    series: [{id: 'table-pie-series', data: pieData}],
  }, getSetOptionOpts());
}

/**
 * 渲染窗口折线图。
 */
function renderWindowLineChart_() {
  const chart = state.chartInstances.windowLine;
  const windowTrend = state.chartData.windowTrend;

  if (!chart || !Array.isArray(windowTrend) || windowTrend.length === 0) {
    return;
  }

  const xAxisData = windowTrend.map((item) => item.time);
  const windowNum = windowTrend[0] ? windowTrend[0].people.length : 0;

  const chartColors = [
    state.chartColors.primary,
    state.chartColors.success,
    state.chartColors.error,
    state.chartColors.info,
    state.chartColors.warning,
    state.chartColors.purple,
  ];

  const seriesData = Array.from({length: windowNum}, (_, i) => ({
    id: `window-line-${i + 1}`,
    name: `窗口${i + 1}`,
    type: 'line',
    data: windowTrend.map((item) => (item.people ? item.people[i] : 0)),
    smooth: 0.25,
    showSymbol: false,
    symbol: 'none',
    sampling: 'lttb',
    lineStyle: {
      color: chartColors[i % chartColors.length],
      width: 2,
    },
  }));

  const needReplaceSeries = chart.__windowSeriesCount !== windowNum;
  chart.__windowSeriesCount = windowNum;

  chart.setOption({
    xAxis: {data: xAxisData},
    yAxis: {min: 0},
    animationDurationUpdate: 180,
    animationEasingUpdate: 'linear',
    series: seriesData,
  }, needReplaceSeries
      ? getSetOptionOpts({replaceMerge: ['series']})
      : getSetOptionOpts());
}

/**
 * 渲染桌子折线图。
 */
function renderTableLineChart_() {
  const chart = state.chartInstances.tableLine;
  const tableTrend = state.chartData.tableTrend;

  if (!chart || !Array.isArray(tableTrend) || tableTrend.length === 0) {
    return;
  }

  const xAxisData = tableTrend.map((item) => item.time);
  const usedData = tableTrend.map((item) => item.used || 0);
  const remainingData = tableTrend.map((item) => item.remaining || 0);

  chart.setOption({
    xAxis: {data: xAxisData},
    yAxis: {min: 0},
    animationDurationUpdate: 180,
    animationEasingUpdate: 'linear',
    series: [
      {
        id: 'table-line-used',
        name: '已使用桌子',
        data: usedData,
        lineStyle: {
          color: state.chartColors.error,
          width: 2,
        },
      },
      {
        id: 'table-line-remaining',
        name: '剩余桌子',
        data: remainingData,
        lineStyle: {
          color: state.chartColors.info,
          width: 2,
        },
      },
    ],
  }, getSetOptionOpts());
}

/**
 * 更新窗口柱状图数据。
 *
 * @param {!Array<number>} windowPeople - 窗口人数数据。
 */
function updateWindowBarChart(windowPeople) {
  if (!Array.isArray(windowPeople)) {
    return;
  }
  state.chartData.windowPeople = windowPeople.slice();
  requestChartRender('windowBar');
  updateKPICards_(windowPeople, state.chartData.usedTable, state.chartData.remainingTable);
}

/**
 * 更新桌子饼图数据。
 *
 * @param {number} usedTable - 已使用桌子数量。
 * @param {number} remainingTable - 剩余桌子数量。
 */
function updateTablePieChart(usedTable, remainingTable) {
  if (
    typeof usedTable !== 'number' ||
    typeof remainingTable !== 'number'
  ) {
    return;
  }
  state.chartData.usedTable = usedTable;
  state.chartData.remainingTable = remainingTable;
  requestChartRender('tablePie');
  updateKPICards_(state.chartData.windowPeople, usedTable, remainingTable);
}

/**
 * 更新窗口折线图数据。
 *
 * @param {!Array<!Object>} windowTrend - 窗口趋势数据。
 */
function updateWindowLineChart(windowTrend) {
  if (!Array.isArray(windowTrend)) {
    return;
  }
  state.chartData.windowTrend = windowTrend.slice();
  requestChartRender('windowLine');
}

/**
 * 更新桌子折线图数据。
 *
 * @param {!Array<!Object>} tableTrend - 桌子趋势数据。
 */
function updateTableLineChart(tableTrend) {
  if (!Array.isArray(tableTrend)) {
    return;
  }
  state.chartData.tableTrend = tableTrend.slice();
  requestChartRender('tableLine');
}

/**
 * 显示评估结果。
 *
 * @param {string} windowEval - 窗口评估文本。
 * @param {string} tableEval - 桌子评估文本。
 */
function showEvaluation(windowEval, tableEval) {
  const windowEvalEl = state.elements.windowEval;
  const tableEvalEl = state.elements.tableEval;
  const resultArea = state.elements.resultArea;

  if (!windowEvalEl || !tableEvalEl || !resultArea) {
    return;
  }

  windowEvalEl.className =
      windowEval === '体验良好' ? 'eval--good' : 'eval--bad';
  windowEvalEl.innerText = windowEval || '未知';

  tableEvalEl.className =
      tableEval === '体验良好' ? 'eval--good' : 'eval--bad';
  tableEvalEl.innerText = tableEval || '未知';

  resultArea.style.display = 'block';
}

/**
 * 处理启动仿真。
 */
async function handleStartSimulation() {
  console.log('已点击启动仿真按钮');

  const startBtn = state.elements.startBtn;
  const endBtn = state.elements.endBtn;

  if (state.isSimulating) {
    showTip('info', '仿真已在运行中');
    return;
  }

  if (!isSocketConnected) {
    showTip('error', '实时通信未连接。请确认后端服务已启动 (python app.py)，然后刷新页面。');
    console.error('[StartSim] Socket.IO 未连接，无法启动仿真');
    return;
  }

  const params = getAndCheckFormParams();
  if (!params) {
    return;
  }

  state.isSimulating = true;
  if (startBtn) {
    startBtn.disabled = true;
  }
  if (endBtn) {
    endBtn.disabled = false;
  }

  // 显示加载提示（仿真结束后由 handleEndSimulation 关闭）
  const loadingToastId = showTip('loading', '仿真启动中，请稍候...');

  try {
    // 🔧 修复时序竞争：先生成 session_id 并绑定 Socket.IO 房间，
    // 再启动仿真，确保客户端第一时间收到推送数据
    const sessionId = crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    state.sessionId = sessionId;

    // 先绑定房间（此时仿真尚未启动，但房间已就绪）
    socket.emit('bind_session', sessionId);
    console.log('[StartSim] 已绑定 Socket.IO 房间：', sessionId);

    // 等待一小段时间确保 bind_session 已被服务端处理
    await new Promise((resolve) => setTimeout(resolve, 150));

    console.log('正在发送启动仿真请求：', params);
    const res = await startSimulation({...params, session_id: sessionId});
    console.log('后端响应：', res);

    if (res && res.success) {
      // 关闭加载提示
      if (loadingToastId) removeToast(loadingToastId);

      playStartSound();
      showTip('success', res.msg || '仿真启动成功');

      // 脉冲指示灯 + 图表辉光
      const pulseDot = document.getElementById('pulseDot');
      if (pulseDot) pulseDot.classList.remove('simulation__pulse-dot--stopped');
      document.querySelectorAll('.simulation__chart').forEach((c) => c.classList.add('simulation__chart--live'));

      // 清除空状态
      document.querySelectorAll('.empty-state').forEach((e) => e.remove());

      if (state.elements.resultArea) {
        state.elements.resultArea.style.display = 'none';
        state.elements.resultArea.classList.remove('simulation__result-area-enter');
      }

      resetChartsForNewSimulation();
      resetKPICards_();
    } else {
      throw new Error(res ? res.msg : '仿真启动失败');
    }
  } catch (error) {
    // 关闭加载提示
    if (loadingToastId) removeToast(loadingToastId);

    playErrorSound();
    state.isSimulating = false;
    if (startBtn) {
      startBtn.disabled = false;
    }
    if (endBtn) {
      endBtn.disabled = true;
    }
    showTip('error', error.message || '启动仿真失败');
    console.error('启动仿真失败：', error);
  }
}

/**
 * 处理结束仿真。
 */
async function handleEndSimulation() {
  const startBtn = state.elements.startBtn;
  const endBtn = state.elements.endBtn;

  if (!state.isSimulating) {
    return;
  }

  hideTip();
  showTip('loading', '仿真结束中，正在生成结果...');

  try {
    const res = await endSimulation({session_id: state.sessionId});

    if (res && res.success && res.data) {
      playEndSound();

      // 脉冲灯熄灭
      const pulseDot = document.getElementById('pulseDot');
      if (pulseDot) pulseDot.classList.add('simulation__pulse-dot--stopped');

      // 图表辉光淡出
      document.querySelectorAll('.simulation__chart--live').forEach((c) => {
        c.classList.add('simulation__chart--fading');
        c.addEventListener('animationend', () => {
          c.classList.remove('simulation__chart--live', 'simulation__chart--fading');
        }, { once: true });
      });

      showTip('success', '仿真结束成功，已生成结果分析');

      updateWindowLineChart(res.data.window_trend || []);
      updateTableLineChart(res.data.table_trend || []);
      showEvaluation(
          res.data.window_evaluation || '',
          res.data.table_evaluation || '',
      );

      // 结果区弹入动画
      if (state.elements.resultArea) {
        state.elements.resultArea.classList.add('simulation__result-area-enter');
      }

      // 评价计数动画
      animateCountUp(document.getElementById('windowEval'), res.data.window_evaluation || '');
      animateCountUp(document.getElementById('tableEval'), res.data.table_evaluation || '');

      const simulationData = {
        window_trend: res.data.window_trend || [],
        table_trend: res.data.table_trend || [],
        window_evaluation: res.data.window_evaluation || '',
        table_evaluation: res.data.table_evaluation || '',
      };

      const simulationParams = {
        dining_time: document.getElementById('dining_time')
            ? document.getElementById('dining_time').value
            : '',
        meal_time: document.getElementById('meal_time')
            ? document.getElementById('meal_time').value
            : '',
        max_people: document.getElementById('max_people')
            ? document.getElementById('max_people').value
            : '',
        window_num: document.getElementById('window_num')
            ? document.getElementById('window_num').value
            : '',
        table_num: document.getElementById('table_num')
            ? document.getElementById('table_num').value
            : '',
      };

      setSimulationData(simulationData, simulationParams);

      state.isSimulating = false;
      if (startBtn) {
        startBtn.disabled = false;
      }
      if (endBtn) {
        endBtn.disabled = true;
        endBtn.style.display = '';
      }
    } else {
      throw new Error(res ? res.msg : '仿真结束失败');
    }
  } catch (error) {
    playErrorSound();
    state.isSimulating = false;
    if (startBtn) startBtn.disabled = false;
    if (endBtn) endBtn.disabled = true;
    showTip('error', error.message || '结束仿真失败');
    console.error('结束仿真失败：', error);
  }
}

/**
 * 绑定事件监听器。
 */
function bindEvents() {
  const startBtn = state.elements.startBtn;
  const endBtn = state.elements.endBtn;

  if (startBtn) {
    startBtn.addEventListener('click', handleStartSimulation);
  }

  if (endBtn) {
    endBtn.addEventListener('click', handleEndSimulation);
  }

  // 监听主题变化事件
  state.handlers.themeChange = () => {
    updateChartColors();
  };
  document.addEventListener('themeChange', state.handlers.themeChange);

  // 监听页面卸载
  state.handlers.unload = () => {
    if (state.isSimulating) {
      console.warn('页面卸载时仿真仍在运行');
    }
  };
  window.addEventListener('beforeunload', state.handlers.unload);
}

/**
 * 初始化侧边栏折叠切换。
 */
function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggleBtn');
  const mainContent = document.getElementById('mainContent');

  if (!sidebar || !toggleBtn || !mainContent) {
    return;
  }

  let isCollapsed = false;

  toggleBtn.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    sidebar.classList.toggle('sidebar--collapsed', isCollapsed);
    toggleBtn.innerHTML = isCollapsed ? '▶' : '◀';
    toggleBtn.setAttribute('aria-label', isCollapsed ? '展开侧边栏' : '折叠侧边栏');

    if (isCollapsed) {
      mainContent.style.marginLeft = '0';
    } else {
      mainContent.style.marginLeft = '';
    }
  });
}

/**
 * 初始化图表空状态。
 */
function initEmptyStates_() {
  const charts = document.querySelectorAll('.simulation__chart');
  charts.forEach((chart) => {
    if (chart.querySelector('.empty-state')) return;
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML =
        '<svg class="empty-state__icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<rect x="8" y="12" width="48" height="40" rx="4" stroke="currentColor" stroke-width="2" fill="none"/>' +
        '<line x1="8" y1="24" x2="56" y2="24" stroke="currentColor" stroke-width="2"/>' +
        '<line x1="24" y1="36" x2="40" y2="36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="20" y1="44" x2="44" y2="44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg>' +
        '<span class="empty-state__text">配置参数后点击「启动仿真」<br>即可查看实时数据</span>';
    chart.appendChild(empty);
  });
}

/**
 * 初始化右键菜单。
 */
function initContextMenus_() {
  document.querySelectorAll('.simulation__chart').forEach((chart) => {
    chart.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const chartInstance = echarts.getInstanceByDom(chart);
      showContextMenu(e.clientX, e.clientY, [
        { label: '导出为图片', action: () => {
          if (chartInstance) {
            const url = chartInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' });
            const a = document.createElement('a');
            a.href = url;
            a.download = 'chart.png';
            a.click();
            showToast('success', '图表已导出');
          }
        }},
        { separator: true },
        { label: '复制数据', action: () => {
          if (chartInstance) {
            const option = chartInstance.getOption();
            const text = JSON.stringify(option, null, 2);
            navigator.clipboard.writeText(text).then(() => showToast('success', '数据已复制'));
          }
        }},
        { label: '恢复缩放', action: () => {
          if (chartInstance) {
            chartInstance.dispatchAction({ type: 'restore' });
          }
        }},
      ]);
    });
  });
}

/**
 * 初始化音效开关。
 */
function initSoundToggle_() {
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const on = toggleSound();
    btn.classList.toggle('sound-toggle__switch--on', on);
    btn.setAttribute('aria-label', on ? '关闭音效' : '开启音效');
  });
}

/**
 * 重置 KPI 卡片。
 */
function resetKPICards_() {
  ['kpiQueueTotal', 'kpiAvgWait', 'kpiTableUsage', 'kpiThroughput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0';
  });
  ['kpiQueueTrend', 'kpiWaitTrend', 'kpiTableTrend', 'kpiThroughputTrend'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '收集中...';
      el.className = 'kpi-card__trend kpi-card__trend--stable';
    }
  });
}

/** @type {!Array<number>} KPI 历史值缓存。 */
const _kpiHistory = { queue: [], usage: [], throughput: [] };
const _KPI_HISTORY_MAX = 10;

/**
 * 更新 KPI 仪表盘。
 * @param {!Array<number>} windowPeople
 * @param {number} usedTable
 * @param {number} remainingTable
 */
function updateKPICards_(windowPeople, usedTable, remainingTable) {
  const totalPeople = windowPeople.reduce((a, b) => a + b, 0);
  const tableNum = usedTable + remainingTable;
  const usage = tableNum > 0 ? Math.round((usedTable / tableNum) * 100) : 0;

  const totalEl = document.getElementById('kpiQueueTotal');
  const usageEl = document.getElementById('kpiTableUsage');
  if (totalEl) totalEl.textContent = String(totalPeople);
  if (usageEl) usageEl.textContent = usage + '%';

  // 趋势判断
  _kpiHistory.queue.push(totalPeople);
  _kpiHistory.usage.push(usage);
  if (_kpiHistory.queue.length > _KPI_HISTORY_MAX) _kpiHistory.queue.shift();
  if (_kpiHistory.usage.length > _KPI_HISTORY_MAX) _kpiHistory.usage.shift();

  function updateTrend(id, arr) {
    const el = document.getElementById(id);
    if (!el || arr.length < 3) return;
    const recent = arr.slice(-3);
    const diff = recent[2] - recent[0];
    if (diff > 2) { el.textContent = '↑ 上升'; el.className = 'kpi-card__trend kpi-card__trend--up'; }
    else if (diff < -2) { el.textContent = '↓ 下降'; el.className = 'kpi-card__trend kpi-card__trend--down'; }
    else { el.textContent = '→ 稳定'; el.className = 'kpi-card__trend kpi-card__trend--stable'; }
  }
  updateTrend('kpiQueueTrend', _kpiHistory.queue);
  updateTrend('kpiTableTrend', _kpiHistory.usage);
}

/**
 * 初始化页面。
 */
function initPage() {
  console.log('正在初始化页面...');

  initElements();
  initECharts();
  initSidebarToggle();
  initRipple();
  initEmptyStates_();
  initContextMenus_();
  initSoundToggle_();
  initFormValidation(
    state.elements.simulationForm,
    state.elements.startBtn,
  );
  bindEvents();
  initAI();

  // 监听 socket 模块发出的 CustomEvent，替代全局函数桥接
  window.addEventListener('simulation:data', (e) => {
    const { windowPeople, usedTable, remainingTable } = e.detail || {};
    if (windowPeople !== undefined) updateWindowBarChart(windowPeople);
    if (usedTable !== undefined && remainingTable !== undefined) {
      updateTablePieChart(usedTable, remainingTable);
    }
  });

  console.log('页面初始化完成');
}

/**
 * 将 initPage 暴露为全局函数供外部调用。
 */
window.initPage = initPage;

// 页面加载完成后自动初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
