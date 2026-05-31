# 前端问题分析与解决方案文档

## 文档信息

| 项目 | 值 |
|------|------|
| **文档版本** | 1.0 |
| **创建日期** | 2026-05-31 |
| **适用范围** | 前端开发团队 |
| **关联系统** | 后端 Flask API、Socket.IO 服务、SQLite 数据库 |

---

## 目录

1. [问题 1：时序竞争 - Socket.IO 房间绑定与仿真启动](#问题 1 时序竞争 -socketio-房间绑定与仿真启动)
2. [问题 2：CORS 跨域策略不一致](#问题 2cors-跨域策略不一致)
3. [问题 3：Socket.IO 传输层选择](#问题 3socketio-传输层选择)
4. [问题 4：端口配置不一致](#问题 4 端口配置不一致)
5. [问题 5：AI API 直连 CORS 限制](#问题 5ai-api-直连 cors-限制)
6. [问题 8：前端请求超时与后端处理时间不匹配](#问题 8 前端请求超时与后端处理时间不匹配)
7. [问题 10：全局函数耦合与模块解耦](#问题 10 全局函数耦合与模块解耦)

---

## 问题 1：时序竞争 - Socket.IO 房间绑定与仿真启动

### 问题描述

**具体表现**：
- 启动仿真后，图表显示的第一帧数据丢失
- 偶尔出现前几秒的数据未显示在图表上
- 后端日志显示数据已推送，但前端未收到

**复现步骤**：
1. 打开浏览器开发者工具（F12）→ Console 标签
2. 填写仿真参数，点击"启动仿真"按钮
3. 观察控制台日志和图表更新
4. 发现图表从第 2 秒或第 3 秒开始显示数据，第 1 秒数据缺失

**影响范围**：
- **影响模块**：`static/js/index.js`、`static/js/socket.js`
- **影响功能**：实时数据展示完整性
- **影响程度**：中等（数据完整性受损，但仿真仍可正常运行）
- **用户感知**：轻微（用户可能注意到图表起始点不完整）

### 根因分析

```
时间轴：
t0: 前端调用 /api/start-simulation
t1: 后端启动仿真线程，开始 emit 数据
t2: 前端发送 bind_session 事件
t3: 服务端 join_room 完成
t4: 数据推送到客户端

问题：t1 < t3，即仿真启动早于房间绑定完成
```

**技术原因**：
1. `/api/start-simulation` 和 `socket.emit('bind_session')` 是两个独立的异步操作
2. 仿真线程启动后立即开始推送数据（每秒 1 次）
3. Socket.IO 房间绑定需要网络往返和服务端处理时间
4. 如果先启动仿真再绑定房间，存在 50-100ms 的时间窗口导致数据丢失

### 解决方案

**代码修改**：`static/js/index.js` → `handleStartSimulation` 函数

```javascript
async function handleStartSimulation() {
  // ... 前置检查 ...

  try {
    // 🔧 修复时序竞争：先生成 session_id 并绑定 Socket.IO 房间，
    // 再启动仿真，确保客户端第一时间收到推送数据
    const sessionId = crypto.randomUUID ? crypto.randomUUID() :
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    state.sessionId = sessionId;

    // ✅ 步骤 1：先绑定房间（此时仿真尚未启动，但房间已就绪）
    socket.emit('bind_session', sessionId);
    console.log('[StartSim] 已绑定 Socket.IO 房间：', sessionId);

    // ✅ 步骤 2：等待一小段时间确保 bind_session 已被服务端处理
    // 为什么是 150ms？
    // - 本地网络往返通常 <10ms
    // - Socket.IO 事件处理（Python 线程调度）通常 <50ms
    // - 150ms 提供了足够的安全余量，同时对用户体验无感知
    await new Promise((resolve) => setTimeout(resolve, 150));

    console.log('正在发送启动仿真请求：', params);
    
    // ✅ 步骤 3：再调用 /api/start-simulation，此时房间已就绪
    const res = await startSimulation({...params, session_id: sessionId});
    console.log('后端响应：', res);

    // ... 后续处理 ...
  } catch (error) {
    // ... 错误处理 ...
  }
}
```

**实施步骤**：
1. 打开 `static/js/index.js` 文件
2. 定位到 `handleStartSimulation` 函数（约第 780 行）
3. 在调用 `startSimulation` 之前添加 `socket.emit('bind_session', sessionId)`
4. 添加 150ms 延迟等待房间绑定完成
5. 将 `sessionId` 传递给后端 API

**验证方法**：
1. 启动仿真后立即观察图表
2. 检查第一秒的数据是否正确显示
3. 在控制台查看日志顺序：
   ```
   [StartSim] 已绑定 Socket.IO 房间：xxx
   [SocketIO] ✅ 收到实时数据 #1 | ...
   ```

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认 `bind_session` 事件处理逻辑（`app.py` 第 275-278 行）
- ✅ 确认房间绑定完成后才启动仿真线程
- ✅ 验证服务端 `join_room` 的耗时（通常 <50ms）

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 2：CORS 跨域策略不一致

### 问题描述

**具体表现**：
- 浏览器控制台报错：
  ```
  Access to fetch at 'http://127.0.0.1:5001/api/start-simulation' 
  from origin 'http://localhost:5001' has been blocked by CORS policy
  ```
- API 请求失败，返回 `Network Error`
- 仿真无法启动

**复现步骤**：
1. 前端使用 `http://localhost:5001` 访问
2. 后端 CORS 配置仅包含 `http://127.0.0.1:5001`
3. 调用 `/api/start-simulation` 接口
4. 浏览器拦截响应，报 CORS 错误

**影响范围**：
- **影响模块**：`static/js/api.js`、`static/js/config.js`
- **影响功能**：所有 HTTP API 请求（启动/结束仿真、AI 分析）
- **影响程度**：严重（系统完全不可用）
- **用户感知**：明显（页面加载后所有操作失败）

### 根因分析

**技术原因**：
1. `127.0.0.1` 和 `localhost` 在 CORS 策略中被视为**不同的 origin**
2. 端口号必须精确匹配（`5001` ≠ `5000`）
3. 后端 `_is_allowed_origin()` 函数进行精确字符串匹配
4. 浏览器严格遵循同源策略（Same-Origin Policy）

### 解决方案

**方案 A：后端配置扩展（推荐）**

**后端修改**：`config.py`

```python
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://127.0.0.1:5001,http://localhost:5001",  # ✅ 同时列出两种写法
).split(",")
```

**前端修改**：`static/js/config.js`

```javascript
export const ENV = {
  mode: 'development',
  
  // ✅ 与后端 CORS 列表保持一致（选择其中一种）
  baseURL: 'http://127.0.0.1:5001',
  socketURL: 'http://127.0.0.1:5001',
  
  // 或
  // baseURL: 'http://localhost:5001',
  // socketURL: 'http://localhost:5001',
};
```

**方案 B：前端统一地址（简化）**

**前端修改**：`static/js/config.js`

```javascript
// ✅ 统一使用 127.0.0.1（避免 localhost 和 127.0.0.1 混用）
export const ENV = {
  baseURL: 'http://127.0.0.1:5001',
  socketURL: 'http://127.0.0.1:5001',
};
```

**后端修改**：`config.py`

```python
# ✅ 仅配置 127.0.0.1
CORS_ALLOWED_ORIGINS = "http://127.0.0.1:5001"
```

**实施步骤**：
1. 与后端团队确认 CORS 配置策略
2. 修改 `config.js` 中的 `baseURL` 和 `socketURL`
3. 确保所有 API 调用使用统一的地址格式
4. 测试两种地址格式（`localhost` 和 `127.0.0.1`）

**验证方法**：
1. 打开浏览器开发者工具 → Network 标签
2. 调用任意 API（如启动仿真）
3. 检查响应头是否包含：
   ```
   Access-Control-Allow-Origin: http://127.0.0.1:5001
   Access-Control-Allow-Credentials: true
   ```

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认 `CORS_ALLOWED_ORIGINS` 配置项
- ✅ 确认 `_is_allowed_origin()` 函数逻辑
- ✅ 确认是否支持动态添加 origin

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 3：Socket.IO 传输层选择

### 问题描述

**具体表现**：
- 某些网络环境下（企业代理、防火墙）WebSocket 连接失败
- 控制台显示 `[SocketIO] 已断开连接：transport close`
- 仿真启动后图表不更新（实时数据无法推送）

**复现步骤**：
1. 在企业网络环境下（有代理或防火墙）
2. 访问仿真页面
3. 观察 Socket.IO 连接状态
4. 发现 WebSocket 连接被阻止

**影响范围**：
- **影响模块**：`static/js/socket.js`
- **影响功能**：实时数据推送
- **影响程度**：严重（实时通信完全失效）
- **用户感知**：明显（图表始终为空）

### 根因分析

**技术原因**：
1. Socket.IO 默认优先使用 WebSocket 传输
2. 某些网络环境（代理、防火墙）会阻止 WebSocket 协议
3. 如果未配置回退机制，连接会直接失败
4. WebSocket 和 HTTP long-polling 需要显式配置

### 解决方案

**代码修改**：`static/js/socket.js`

```javascript
export const socket = io(ENV.socketURL, {
  // ✅ 同时支持 WebSocket 和 HTTP long-polling
  transports: ['websocket', 'polling'],  // 优先 WebSocket，回退 polling
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

**实施步骤**：
1. 打开 `static/js/socket.js`
2. 在 `io()` 配置中添加 `transports` 选项
3. 确保顺序为 `['websocket', 'polling']`（优先 WebSocket）
4. 添加重连配置以应对网络波动

**连接状态监控**：

```javascript
// ✅ 在启动仿真前检查连接状态
if (!isSocketConnected) {
  showTip('error', '实时通信未连接。请确认后端服务已启动...');
  return;
}
```

**验证方法**：
1. 打开浏览器开发者工具 → Network → WS
2. 观察连接类型：
   - WebSocket：`ws://127.0.0.1:5001/socket.io/?EIO=4&transport=websocket`
   - Polling：`http://127.0.0.1:5001/socket.io/?EIO=4&transport=polling`
3. 在控制台查看连接日志：
   ```
   [SocketIO] 已连接（ID：xxx）
   ```

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认后端 `SocketIO` 配置包含相同的 `transports` 选项
- ✅ 确认服务端是否支持 HTTP long-polling 回退
- ✅ 验证重连参数（`ping_timeout`、`transports`）

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 4：端口配置不一致

### 问题描述

**具体表现**：
- 浏览器控制台报错：`ERR_CONNECTION_REFUSED`
- API 请求和 Socket.IO 连接全部失败
- 页面无法加载任何数据

**复现步骤**：
1. 后端启动在端口 `5001`（`python app.py`）
2. 前端配置为 `http://127.0.0.1:5000`（旧默认值）
3. 访问 `http://localhost:5000`
4. 所有请求失败

**影响范围**：
- **影响模块**：`static/js/config.js`
- **影响功能**：所有网络请求
- **影响程度**：严重（系统完全不可用）
- **用户感知**：明显（页面无法访问）

### 根因分析

**技术原因**：
1. Windows 部分版本保留端口 5000（被系统占用）
2. 后端默认端口从 5000 改为 5001
3. 前端配置未同步更新
4. 端口不匹配导致连接被拒绝

### 解决方案

**方案 A：统一配置为 5001（推荐）**

**前端修改**：`static/js/config.js`

```javascript
export const ENV = {
  // ✅ 与后端默认端口保持一致
  baseURL: 'http://127.0.0.1:5001',
  socketURL: 'http://127.0.0.1:5001',
};
```

**方案 B：支持环境变量动态配置**

```javascript
// ✅ 通过环境变量注入（需构建工具支持）
const API_PORT = process.env.API_PORT || '5001';

export const ENV = {
  baseURL: `http://127.0.0.1:${API_PORT}`,
  socketURL: `http://127.0.0.1:${API_PORT}`,
};
```

**实施步骤**：
1. 确认后端启动端口（查看终端输出或 `FLASK_PORT` 环境变量）
2. 修改 `config.js` 中的 `baseURL` 和 `socketURL`
3. 更新文档中的默认端口说明
4. 如果后端使用自定义端口，同步更新前端配置

**验证方法**：
1. 访问 `http://127.0.0.1:5001`
2. 在 Network 标签检查所有请求的 URL
3. 确认端口号一致

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认后端启动端口（默认 5001 或环境变量 `FLASK_PORT`）
- ✅ 如果后端端口变更，及时通知前端团队更新配置

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 5：AI API 直连 CORS 限制

### 问题描述

**具体表现**：
- 点击"AI 分析"按钮后，浏览器控制台报错：
  ```
  Access to fetch at 'https://dashscope.aliyuncs.com/...' 
  from origin 'http://127.0.0.1:5001' has been blocked by CORS policy
  ```
- AI 分析请求失败，无法获取分析报告

**复现步骤**：
1. 配置 AI API 地址、Key 和模型名称
2. 仿真结束后点击"AI 分析"按钮
3. 观察浏览器控制台
4. 发现 CORS 错误

**影响范围**：
- **影响模块**：`static/js/ai.js`
- **影响功能**：AI 分析功能
- **影响程度**：中等（仅影响 AI 分析，不影响核心仿真）
- **用户感知**：中等（高级功能不可用）

### 根因分析

**技术原因**：
1. DashScope（阿里云百炼）API 未对浏览器端请求开放 CORS 头
2. 浏览器的同源策略阻止跨域请求
3. 前端直接调用第三方 API 会触发 CORS 限制
4. 服务端（Node.js/Python）通常不受 CORS 限制

### 解决方案

**方案 A：后端代理转发（推荐）**

**前端修改**：`static/js/ai.js`

```javascript
/**
 * 调用后端代理端点，避免直接请求 AI API 触发 CORS 限制。
 * @param {!Object} aiConfig - AI 配置对象。
 * @param {!Object} payload - 请求体。
 * @return {!Promise<!Object>} AI 分析结果。
 */
async function _callAIProxy_(aiConfig, payload) {
  const response = await fetch(`${ENV.baseURL}/api/ai-analyze`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      api_url: aiConfig.apiUrl,
      api_key: aiConfig.apiKey,
      payload: payload,
    }),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.msg || 'AI 分析失败');
  }
  return result.data;
}
```

**实施步骤**：
1. 修改 `ai.js` 中的 `_callAI_` 函数
2. 改为调用后端代理端点 `/api/ai-analyze`
3. 将 AI 配置和请求体传递给后端
4. 由后端转发请求到 DashScope API

**方案 B：浏览器插件绕过（不推荐）**

- 安装允许 CORS 的浏览器插件（如 "Allow CORS: Access-Control-Allow-Origin"）
- ⚠️ 仅适用于开发环境，生产环境不可用

**验证方法**：
1. 配置 AI API 信息
2. 点击"测试连通性"按钮
3. 仿真结束后点击"AI 分析"
4. 检查是否返回 Markdown 格式的分析报告

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认后端代理端点 `/api/ai-analyze` 已实现
- ✅ 确认代理超时时间（默认 60 秒）
- ✅ 确认错误处理逻辑（API Key 无效、网络超时等）

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 8：前端请求超时与后端处理时间不匹配

### 问题描述

**具体表现**：
- 结束仿真时，前端报错：`Timeout: Request timed out`
- 仿真数据量大时（运行时间长），超时概率增加
- AI 分析请求偶尔超时

**复现步骤**：
1. 启动仿真并运行较长时间（如 30 分钟）
2. 点击"结束仿真"按钮
3. 观察请求响应时间
4. 发现请求超过 10 秒后失败

**影响范围**：
- **影响模块**：`static/js/api.js`、`static/js/config.js`
- **影响功能**：结束仿真、AI 分析
- **影响程度**：中等（长时仿真受影响）
- **用户感知**：中等（偶尔遇到）

### 根因分析

**技术原因**：
1. 前端 `fetchPost` 默认超时 10 秒（`config.js` 中的 `requestTimeout`）
2. `/api/end-simulation` 在数据量大时查询时间可能超过 10 秒
3. 仿真运行时间越长，数据库中的数据越多，查询越慢
4. AI 分析请求包含大量仿真数据，处理时间可能超过 60 秒

### 解决方案

**方案 A：增加超时时间**

**前端修改**：`static/js/config.js`

```javascript
export const ENV = {
  // ✅ 根据实际仿真时长调整超时时间
  requestTimeout: 30000,  // 从 10 秒增加到 30 秒
};
```

**方案 B：动态超时配置**

```javascript
/**
 * 根据仿真时长动态计算超时时间。
 * @param {number} simulationDuration - 仿真运行时长（秒）。
 * @return {number} 超时时间（毫秒）。
 */
function calculateTimeout(simulationDuration) {
  // 基础超时 10 秒 + 每 100 秒仿真增加 1 秒超时
  const baseTimeout = 10000;
  const extraTimeout = Math.floor(simulationDuration / 100) * 1000;
  return Math.min(baseTimeout + extraTimeout, 60000);  // 最多 60 秒
}
```

**实施步骤**：
1. 评估典型仿真时长和数据量
2. 修改 `config.js` 中的 `requestTimeout`
3. 如果仿真时长差异大，考虑动态超时
4. 在用户界面上显示"处理中..."提示

**验证方法**：
1. 启动仿真并运行不同时长（5 分钟、15 分钟、30 分钟）
2. 结束仿真，观察是否超时
3. 在 Network 标签查看请求耗时

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认 `/api/end-simulation` 的平均处理时间
- ✅ 确认 AI 代理的超时时间（默认 60 秒）
- ✅ 讨论优化查询性能的可能性（如分页查询）

**需要与数据库团队沟通**：
- ✅ 确认数据库查询性能（数据量 vs 查询时间）
- ✅ 讨论索引优化或查询优化方案

---

## 问题 10：全局函数耦合与模块解耦

### 问题描述

**具体表现**：
- `socket.js` 直接调用 `window.updateWindowBarChart()` 等全局函数
- 模块之间强耦合，难以单元测试
- 代码难以维护和扩展

**复现步骤**：
1. 查看旧版 `socket.js` 代码
2. 发现直接调用 `window` 对象上的函数
3. 尝试单独测试某个模块时失败

**影响范围**：
- **影响模块**：`static/js/socket.js`、`static/js/index.js`
- **影响功能**：代码可维护性、可测试性
- **影响程度**：中等（不影响功能，但影响代码质量）
- **用户感知**：无（内部代码结构问题）

### 根因分析

**技术原因**：
1. 早期版本使用全局函数（`window.updateWindowBarChart`）进行模块通信
2. 发布者和订阅者直接耦合
3. 难以模拟依赖进行单元测试
4. 添加新功能时需要修改多个文件

### 解决方案

**代码修改**：使用 CustomEvent 事件系统

**socket.js（发布者）**：

```javascript
/**
 * 接收后端实时仿真数据。
 * 校验数据格式后通过 CustomEvent 通知图表模块更新。
 */
export function receiveSimulationData(data) {
  // ... 数据校验 ...

  // ✅ 通过 CustomEvent 通知核心模块，解除全局函数耦合
  window.dispatchEvent(new CustomEvent('simulation:data', {
    detail: {
      windowPeople: data.window_people,
      usedTable: data.used_table,
      remainingTable: data.remaining_table,
    },
  }));
}
```

**index.js（订阅者）**：

```javascript
// ✅ 监听 CustomEvent 事件
window.addEventListener('simulation:data', (e) => {
  const { windowPeople, usedTable, remainingTable } = e.detail || {};
  
  if (windowPeople !== undefined) {
    updateWindowBarChart(windowPeople);
  }
  
  if (usedTable !== undefined && remainingTable !== undefined) {
    updateTablePieChart(usedTable, remainingTable);
  }
});
```

**实施步骤**：
1. 在 `socket.js` 中将直接函数调用改为 `window.dispatchEvent`
2. 在 `index.js` 中使用 `window.addEventListener` 监听事件
3. 定义清晰的事件名称和数据格式（`detail` 对象）
4. 移除所有全局函数（`window.updateWindowBarChart` 等）

**验证方法**：
1. 启动仿真，观察图表是否正常更新
2. 单独测试 `socket.js` 模块（模拟 CustomEvent）
3. 单独测试 `index.js` 模块（监听事件）

### 交互影响

**需要与后端团队沟通**：
- ⚠️ 无直接交互影响

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 前端联调检查清单

在前后端联调时，前端团队应按以下清单逐项检查：

| # | 检查项 | 预期结果 | 负责人 |
|---|--------|----------|--------|
| 1 | Socket.IO 连接 | Console 显示 `[SocketIO] 已连接（ID：xxx）` | 前端 |
| 2 | CORS 头 | Network 面板中 API 响应包含 `Access-Control-Allow-Origin` 头 | 前端 + 后端 |
| 3 | 时序竞争修复 | 启动仿真后第一秒数据正确显示 | 前端 |
| 4 | 端口配置 | 所有请求的端口号与后端一致（默认 5001） | 前端 |
| 5 | 传输层回退 | WebSocket 不可用时自动切换到 HTTP polling | 前端 + 后端 |
| 6 | AI 代理 | AI 分析请求通过后端代理转发，无 CORS 错误 | 前端 + 后端 |
| 7 | 超时配置 | 长时仿真结束时不报超时错误 | 前端 |
| 8 | 模块解耦 | 无全局函数调用，使用 CustomEvent 通信 | 前端 |
| 9 | 错误处理 | 网络错误、超时错误有友好的用户提示 | 前端 |
| 10 | 日志输出 | Console 显示清晰的调试日志（连接、数据接收等） | 前端 |

---

## 附录：前端关键文件清单

| 文件路径 | 功能描述 | 关联问题 |
|----------|----------|----------|
| `static/js/config.js` | 环境配置（baseURL、socketURL、超时时间） | 问题 2、4、8 |
| `static/js/socket.js` | Socket.IO 连接管理、数据接收 | 问题 1、3、10 |
| `static/js/api.js` | HTTP API 请求封装（fetch + 超时） | 问题 2、5、8 |
| `static/js/index.js` | 核心业务逻辑（ECharts、仿真控制） | 问题 1、10 |
| `static/js/ai.js` | AI 分析模块（配置管理、API 调用） | 问题 5 |
| `static/js/theme.js` | 主题切换管理器 | - |
| `static/js/enhance.js` | 增强工具（Toast、音效、涟漪） | - |

---

## 文档修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|----------|--------|
| 1.0 | 2026-05-31 | 初始版本，基于 frontend-integration.md 整理 | - |
