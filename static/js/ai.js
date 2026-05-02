/**
 * @fileoverview 餐厅仿真系统 AI 分析模块。
 * 处理 AI 配置管理、连通性测试、API 调用和 Markdown 结果渲染。
 */

/** @type {string} AI 配置的 localStorage 键名。 */
const AI_CONFIG_STORAGE_KEY = 'simulation_ai_config';

/** @type {string} 默认 API 端点 URL。 */
const DEFAULT_API_URL =
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/**
 * AI 分析默认提示词。
 * @const {string}
 */
const DEFAULT_AI_PROMPT =
    '# 角色\n\n' +
    '你是一位资深的餐厅运营优化专家和排队理论分析师，' +
    '拥有超过 10 年的餐厅系统仿真建模经验。\n\n' +
    '---\n\n' +
    '# 任务\n\n' +
    '请对餐厅仿真系统数据进行全面分析，识别瓶颈，' +
    '评估资源分配情况，并提供数据驱动的优化建议。\n\n' +
    '---\n\n' +
    '# 输入数据\n\n' +
    '## 1. 仿真参数（simulation_params）\n' +
    '- dining_time：平均就餐时间（分钟）\n' +
    '- meal_time：平均出餐时间（秒/人）\n' +
    '- max_people：每分钟最大进入人数\n' +
    '- window_num：服务窗口数量\n' +
    '- table_num：桌子总数\n\n' +
    '## 2. 窗口排队趋势（simulation_results.window_trend）\n' +
    '- 包含 {time, people} 对象的数组\n\n' +
    '## 3. 桌子占用趋势（simulation_results.table_trend）\n' +
    '- 包含 {time, used, remaining} 对象的数组\n\n' +
    '## 4. 评估数据（可选）\n' +
    '- window_evaluation：窗口排队体验评估\n' +
    '- table_evaluation：桌子占用体验评估\n\n' +
    '---\n\n' +
    '# 分析步骤\n\n' +
    '1. 数据概览和基本统计\n' +
    '2. 窗口排队深度分析\n' +
    '3. 桌子占用深度分析\n' +
    '4. 系统关联性分析\n' +
    '5. 优化建议\n\n' +
    '---\n\n' +
    '# 输出格式\n\n' +
    '请输出结构化的 Markdown 报告，包含：\n' +
    '- 参数配置表\n' +
    '- 数据概览指标\n' +
    '- 窗口排队分析及统计数据\n' +
    '- 桌子占用分析\n' +
    '- 系统关联性分析\n' +
    '- 至少 3 条具体优化建议\n' +
    '- 总结\n\n' +
    '---\n\n' +
    '# 约束条件\n\n' +
    '1. 所有结论必须基于数据\n' +
    '2. 使用定量指标（数字、百分比、比率）\n' +
    '3. 使用 Markdown 表格展示统计数据\n' +
    '4. 建议必须具体且可执行\n' +
    '5. 结论与建议之间逻辑清晰';

/**
 * AI 模块状态。
 * @const {!Object}
 */
const AIState = {
  /** @type {!Object} DOM 元素引用。 */
  elements: {
    apiUrl: null,
    apiKey: null,
    modelUrl: null,
    aiPrompt: null,
    promptModeBtns: null,
    saveConfigBtn: null,
    testConnectionBtn: null,
    analyzeBtn: null,
    aiResultSection: null,
    aiLoading: null,
    aiResultContent: null,
  },

  /** @type {?Object} 待分析的仿真数据。 */
  simulationData: null,

  /** @type {boolean} AI 分析是否正在进行中。 */
  isAnalyzing: false,

  /** @type {boolean} 连通性测试是否正在进行中。 */
  isTesting: false,

  /** @type {string} 当前提示词模式：'default' 或 'custom'。 */
  promptMode: 'default',
};

/**
 * 初始化 DOM 元素引用。
 */
function initAIElements_() {
  AIState.elements.apiUrl = document.getElementById('apiUrl');
  AIState.elements.apiKey = document.getElementById('apiKey');
  AIState.elements.modelUrl = document.getElementById('modelUrl');
  AIState.elements.aiPrompt = document.getElementById('aiPrompt');
  AIState.elements.promptModeBtns =
      document.querySelectorAll('.sidebar__prompt-mode-btn');
  AIState.elements.saveConfigBtn = document.getElementById('saveConfigBtn');
  AIState.elements.testConnectionBtn =
      document.getElementById('testConnectionBtn');
  AIState.elements.analyzeBtn = document.getElementById('analyzeBtn');
  AIState.elements.aiResultSection =
      document.getElementById('aiResultSection');
  AIState.elements.aiLoading = document.getElementById('aiLoading');
  AIState.elements.aiResultContent =
      document.getElementById('aiResultContent');
}

/**
 * 设置提示词模式（默认或自定义）。
 *
 * @param {string} mode - 要设置的提示词模式。
 */
function setPromptMode_(mode) {
  AIState.promptMode = mode;

  if (AIState.elements.aiPrompt) {
    if (mode === 'default') {
      AIState.elements.aiPrompt.value = DEFAULT_AI_PROMPT;
      AIState.elements.aiPrompt.readOnly = true;
      AIState.elements.aiPrompt.classList.add(
          'sidebar__textarea--readonly',
      );
      AIState.elements.aiPrompt.placeholder =
          '当前为默认模式，提示词已自动加载...';
    } else {
      AIState.elements.aiPrompt.readOnly = false;
      AIState.elements.aiPrompt.classList.remove(
          'sidebar__textarea--readonly',
      );
      AIState.elements.aiPrompt.placeholder = '请输入自定义 AI 提示词...';
    }
  }

  if (AIState.elements.promptModeBtns) {
    AIState.elements.promptModeBtns.forEach((btn) => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  console.log(`[AI] 提示词模式已切换为：${mode}`);
}

/**
 * 从 localStorage 加载 AI 配置。
 */
function loadAIConfig_() {
  try {
    const savedConfig = localStorage.getItem(AI_CONFIG_STORAGE_KEY);
    if (savedConfig) {
      const config = JSON.parse(savedConfig);

      if (AIState.elements.apiUrl) {
        AIState.elements.apiUrl.value = config.apiUrl || DEFAULT_API_URL;
      }
      if (AIState.elements.apiKey && config.apiKey) {
        AIState.elements.apiKey.value = config.apiKey;
      }
      if (AIState.elements.modelUrl && config.modelUrl) {
        AIState.elements.modelUrl.value = config.modelUrl;
      }

      if (config.promptMode) {
        setPromptMode_(config.promptMode);
        if (
          config.promptMode === 'custom' &&
          AIState.elements.aiPrompt &&
          config.aiPrompt
        ) {
          AIState.elements.aiPrompt.value = config.aiPrompt;
        }
      } else {
        setPromptMode_('default');
      }
      console.log('[AI] 已从 localStorage 加载配置');
    } else {
      if (AIState.elements.apiUrl) {
        AIState.elements.apiUrl.value = DEFAULT_API_URL;
      }
      setPromptMode_('default');
      console.log('[AI] 已加载默认配置');
    }
  } catch (error) {
    console.error('[AI] 加载配置失败：', error);
    if (AIState.elements.apiUrl) {
      AIState.elements.apiUrl.value = DEFAULT_API_URL;
    }
    setPromptMode_('default');
  }
}

/**
 * 将 AI 配置保存到 localStorage。
 *
 * @return {boolean} 是否保存成功。
 */
function saveAIConfig_() {
  try {
    const config = {
      apiUrl: AIState.elements.apiUrl ? AIState.elements.apiUrl.value : '',
      apiKey: AIState.elements.apiKey ? AIState.elements.apiKey.value : '',
      modelUrl: AIState.elements.modelUrl
          ? AIState.elements.modelUrl.value
          : '',
      promptMode: AIState.promptMode,
      aiPrompt:
          AIState.promptMode === 'custom' && AIState.elements.aiPrompt
              ? AIState.elements.aiPrompt.value
              : DEFAULT_AI_PROMPT,
    };
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(config));
    console.log('[AI] 配置已保存到 localStorage');
    return true;
  } catch (error) {
    console.error('[AI] 保存配置失败：', error);
    return false;
  }
}

/**
 * 在调用 API 前验证 AI 配置。
 *
 * @return {boolean} 配置是否有效。
 */
function validateAIConfig_() {
  const apiUrl = AIState.elements.apiUrl
      ? AIState.elements.apiUrl.value.trim()
      : '';
  const apiKey = AIState.elements.apiKey
      ? AIState.elements.apiKey.value.trim()
      : '';
  const modelUrl = AIState.elements.modelUrl
      ? AIState.elements.modelUrl.value.trim()
      : '';

  if (!apiUrl) {
    showTip('error', '请先配置 API 接口地址');
    return false;
  }

  if (!apiKey) {
    showTip('error', '请先配置 API Key');
    return false;
  }

  if (!modelUrl) {
    showTip('error', '请先配置模型名称');
    return false;
  }

  return true;
}

/**
 * 显示或隐藏 AI 加载状态。
 *
 * @param {boolean} show - 是否显示加载状态。
 */
function showAILoading_(show) {
  if (AIState.elements.aiLoading) {
    AIState.elements.aiLoading.style.display = show ? 'flex' : 'none';
  }
  if (AIState.elements.analyzeBtn) {
    AIState.elements.analyzeBtn.disabled =
        show || !AIState.simulationData;
  }
  AIState.isAnalyzing = show;
}

/**
 * 显示或隐藏 AI 结果区域。
 *
 * @param {boolean} show - 是否显示结果区域。
 */
function showAIResultSection_(show) {
  if (AIState.elements.aiResultSection) {
    AIState.elements.aiResultSection.style.display = show ? 'block' : 'none';
  }
}

/**
 * 将 AI 分析结果以 Markdown 格式渲染。
 *
 * @param {string} markdownText - 要渲染的 Markdown 文本。
 */
function renderAIResult_(markdownText) {
  if (AIState.elements.aiResultContent && window.marked) {
    AIState.elements.aiResultContent.innerHTML =
        marked.parse(markdownText);
    console.log('[AI] Markdown 渲染完成');
  } else if (!window.marked) {
    console.error('[AI] marked.js 未加载');
    if (AIState.elements.aiResultContent) {
      AIState.elements.aiResultContent.innerHTML =
          '<p style="color: var(--theme-error-dark); padding: 20px; ' +
          'background: var(--bg-primary); border-radius: 8px; ' +
          'border: 1px solid var(--theme-error-light);">' +
          '错误：Markdown 渲染库未加载</p>';
    }
  }
}

/**
 * 显示 AI 分析错误信息。
 *
 * @param {string} message - 要显示的错误信息。
 */
function showAIError_(message) {
  if (AIState.elements.aiResultContent) {
    AIState.elements.aiResultContent.innerHTML =
        '<div style="color: var(--theme-error-dark); padding: 20px; ' +
        'background: var(--bg-primary); border-radius: 8px; ' +
        'border: 1px solid var(--theme-error-light);">' +
        '<strong>AI 分析失败</strong>' +
        '<p style="margin-top: 10px;">' +
        message +
        '</p></div>';
  }
}

/**
 * 测试 AI API 的连通性。
 */
async function testConnection() {
  if (AIState.isTesting) {
    return;
  }

  if (!validateAIConfig_()) {
    return;
  }

  let apiUrl = AIState.elements.apiUrl.value.trim();
  const apiKey = AIState.elements.apiKey.value.trim();
  const modelUrl = AIState.elements.modelUrl.value.trim();

  if (
    !apiUrl.startsWith('http://') &&
    !apiUrl.startsWith('https://')
  ) {
    apiUrl = 'https://' + apiUrl;
    AIState.elements.apiUrl.value = apiUrl;
  }

  AIState.isTesting = true;
  if (AIState.elements.testConnectionBtn) {
    AIState.elements.testConnectionBtn.disabled = true;
    AIState.elements.testConnectionBtn.textContent = '测试中...';
  }

  const testRequestBody = {
    model: modelUrl,
    messages: [
      {
        role: 'user',
        content:
            '你好，这是一条连通性测试消息。' +
            '请回复"OK"。',
      },
    ],
    max_tokens: 10,
  };

  try {
    console.log('[AI] 正在测试连通性...');
    console.log('[AI] URL：', apiUrl);
    showTip('loading', '正在测试与大模型的连通性...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(testRequestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      switch (response.status) {
        case 401:
          throw new Error('API Key 无效或已过期');
        case 403:
          throw new Error('API Key 权限不足');
        case 404:
          throw new Error('API 接口地址不存在');
        case 429:
          throw new Error('请求频率超限');
        default:
          throw new Error(
              `请求失败，状态码：${response.status}`,
          );
      }
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      console.log('[AI] 连通性测试成功');
      showTip('success', '连通性测试成功！大模型连接正常');
    } else if (data.error) {
      throw new Error(
          'API 返回错误：' +
              (data.error.message || JSON.stringify(data.error)),
      );
    } else {
      throw new Error('响应格式异常');
    }
  } catch (error) {
    console.error('[AI] 连通性测试失败：', error);

    let errorMessage = '连通性测试失败';
    let suggestions = '';

    if (error.name === 'AbortError') {
      errorMessage = '请求超时（15 秒）';
      suggestions =
          '可能原因：\n' +
          '1. API 地址错误或服务器响应慢\n' +
          '2. 网络连接不稳定\n' +
          '3. 防火墙或代理阻止了请求';
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = '无法连接到 API 服务器';
      suggestions =
          '可能原因：\n' +
          '1. CORS 跨域限制\n' +
          '2. API 地址格式错误\n' +
          '3. 网络连接问题\n' +
          '4. 防火墙或安全软件阻止';
    } else if (
      error.message.includes('CORS') ||
      error.message.includes('cors')
    ) {
      errorMessage = 'CORS 跨域限制';
      suggestions =
          '该 API 服务不支持浏览器直接调用，需要：\n' +
          '1. 使用后端代理转发请求\n' +
          '2. 或联系 API 提供商开启 CORS 支持';
    } else {
      errorMessage = error.message;
    }

    showTip('error', '❌ ' + errorMessage);
    console.log('[AI] 故障排除建议：', suggestions);
    if (suggestions) {
      alert('❌ ' + errorMessage + '\n\n' + suggestions);
    }
  } finally {
    AIState.isTesting = false;
    if (AIState.elements.testConnectionBtn) {
      AIState.elements.testConnectionBtn.disabled = false;
      AIState.elements.testConnectionBtn.textContent =
          '🔌 测试连通性';
    }
  }
}

/**
 * 使用 AI 分析仿真数据。
 *
 * @param {?Object} simulationParams - 可选的仿真参数。
 */
async function analyzeWithAI(simulationParams = null) {
  if (AIState.isAnalyzing) {
    return;
  }

  if (!validateAIConfig_()) {
    return;
  }

  if (!AIState.simulationData) {
    showTip('error', '请先完成仿真并生成结果数据');
    return;
  }

  const apiUrl = AIState.elements.apiUrl.value.trim();
  const apiKey = AIState.elements.apiKey.value.trim();
  const modelUrl = AIState.elements.modelUrl.value.trim();
  const aiPrompt = AIState.elements.aiPrompt
      ? AIState.elements.aiPrompt.value.trim()
      : DEFAULT_AI_PROMPT;

  showAIResultSection_(true);
  showAILoading_(true);

  const requestData = {
    simulation_params: simulationParams || {},
    simulation_results: AIState.simulationData,
  };

  const requestBody = {
    model: modelUrl,
    messages: [
      {role: 'system', content: aiPrompt},
      {
        role: 'user',
        content: JSON.stringify(requestData, null, 2),
      },
    ],
  };

  try {
    console.log('[AI] 正在请求 AI 分析...');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`请求失败，状态码：${response.status}`);
    }

    const data = await response.json();

    let resultText = '';
    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message
    ) {
      resultText = data.choices[0].message.content;
    } else if (data.content) {
      resultText = data.content;
    } else {
      resultText = JSON.stringify(data, null, 2);
    }

    renderAIResult_(resultText);
    showTip('success', 'AI 分析完成');
    console.log('[AI] 分析成功');
  } catch (error) {
    console.error('[AI] 分析失败：', error);
    showAIError_(error.message || '网络错误，请检查配置和连接');
    showTip('error', 'AI 分析失败：' + (error.message || '网络错误'));
  } finally {
    showAILoading_(false);
  }
}

/**
 * 为 AI 模块 UI 元素绑定事件监听器。
 */
function bindAIEvents_() {
  if (AIState.elements.promptModeBtns) {
    AIState.elements.promptModeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode !== AIState.promptMode) {
          setPromptMode_(mode);
        }
      });
    });
  }

  if (AIState.elements.saveConfigBtn) {
    AIState.elements.saveConfigBtn.addEventListener('click', () => {
      if (saveAIConfig_()) {
        showTip('success', '配置已保存');
      } else {
        showTip('error', '配置保存失败');
      }
    });
  }

  if (AIState.elements.testConnectionBtn) {
    AIState.elements.testConnectionBtn.addEventListener(
        'click',
        testConnection,
    );
  }

  if (AIState.elements.analyzeBtn) {
    AIState.elements.analyzeBtn.addEventListener(
        'click',
        analyzeWithAI,
    );
  }
}

/**
 * 设置用于 AI 分析的仿真数据。
 *
 * @param {!Object} data - 仿真数据。
 */
export function setSimulationData(data) {
  AIState.simulationData = data;
  if (AIState.elements.analyzeBtn) {
    AIState.elements.analyzeBtn.disabled = !data;
  }
  console.log('[AI] 仿真数据已更新');
}

/**
 * 初始化 AI 模块。
 */
export function initAI() {
  initAIElements_();
  loadAIConfig_();
  bindAIEvents_();
  console.log('[AI] AI 模块初始化完成');
}

export {analyzeWithAI};
