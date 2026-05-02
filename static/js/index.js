/**
 * @fileoverview 餐厅仿真系统核心业务逻辑模块。
 * 处理 ECharts 初始化、仿真控制、数据流和事件绑定。
 */

import {startSimulation, endSimulation} from './api.js';
import {socket, isSocketConnected} from './socket.js';
import {ENV as importedENV} from './config.js';
import {initAI, setSimulationData, analyzeWithAI} from './ai.js';

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
 * 显示提示信息。
 *
 * @param {string} type - 提示类型：'success'、'error' 或 'loading'。
 * @param {string} msg - 要显示的消息。
 */
function showTip(type, msg) {
  const tipBox = state.elements.tipBox;
  if (!tipBox) {
    return;
  }

  tipBox.className = `simulation__tip simulation__tip--${type}`;
  tipBox.innerText = msg;
  tipBox.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      if (state.elements.tipBox) {
        state.elements.tipBox.style.display = 'none';
      }
    }, 3000);
  }
}

/**
 * 隐藏提示信息。
 */
function hideTip() {
  if (state.elements.tipBox) {
    state.elements.tipBox.style.display = 'none';
  }
}

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
    return;
  }

  if (!isSocketConnected) {
    showTip('error', 'SocketIO 未连接。请检查后端服务。');
    return;
  }

  const params = getAndCheckFormParams();
  if (!params) {
    return;
  }

  state.isSimulating = true;
  if (startBtn) {
    startBtn.setAttribute('disabled', true);
  }
  if (endBtn) {
    endBtn.removeAttribute('disabled');
  }

  hideTip();
  showTip('loading', '仿真启动中，请稍候...');

  try {
    console.log('正在发送启动仿真请求：', params);
    const res = await startSimulation(params);
    console.log('后端响应：', res);

    if (res && res.success) {
      showTip('success', res.msg || '仿真启动成功');

      if (res.data && res.data.session_id) {
        state.sessionId = res.data.session_id;
        socket.emit('bind_session', res.data.session_id);
        console.log('Socket 已绑定会话 ID：', res.data.session_id);
      }

      if (state.elements.resultArea) {
        state.elements.resultArea.style.display = 'none';
      }

      resetChartsForNewSimulation();
    } else {
      throw new Error(res ? res.msg : '仿真启动失败');
    }
  } catch (error) {
    state.isSimulating = false;
    if (startBtn) {
      startBtn.removeAttribute('disabled');
    }
    if (endBtn) {
      endBtn.setAttribute('disabled', true);
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
      showTip('success', '仿真结束成功，已生成结果分析');

      updateWindowLineChart(res.data.window_trend || []);
      updateTableLineChart(res.data.table_trend || []);
      showEvaluation(
          res.data.window_evaluation || '',
          res.data.table_evaluation || '',
      );

      const simulationData = {
        window_trend: res.data.window_trend || [],
        table_trend: res.data.table_trend || [],
        window_evaluation: res.data.window_evaluation || '',
        table_evaluation: res.data.table_evaluation || '',
      };
      setSimulationData(simulationData);

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

      state.isSimulating = false;
      if (startBtn) {
        startBtn.removeAttribute('disabled');
      }
      if (endBtn) {
        endBtn.removeAttribute('disabled');
        endBtn.style.display = '';
      }

      try {
        await analyzeWithAI(simulationParams);
      } catch (aiError) {
        console.error('[Index] AI 分析失败：', aiError);
      }
    } else {
      throw new Error(res ? res.msg : '仿真结束失败');
    }
  } catch (error) {
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
 * 初始化页面。
 */
function initPage() {
  console.log('正在初始化页面...');

  initElements();
  initECharts();
  bindEvents();
  initAI();

  // 暴露全局函数供 Socket.IO 回调使用
  window.updateWindowBarChart = updateWindowBarChart;
  window.updateTablePieChart = updateTablePieChart;
  window.updateWindowLineChart = updateWindowLineChart;
  window.updateTableLineChart = updateTableLineChart;
  window.showEvaluation = showEvaluation;
  window.showTip = showTip;
  window.hideTip = hideTip;

  console.log('页面初始化完成');
}

/**
 * 将 initPage 暴露为全局函数供外部调用。
 */
window.initPage = initPage;
