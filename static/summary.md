# CLAUDE.md

本文档为 Claude Code (claude.ai/code) 在使用本代码库时提供指引。

## 项目概述

**餐厅打饭仿真系统** - 一个基于浏览器的食堂排队仿真前端，使用 ECharts 实时可视化等待时间、队列状态和用户体验指标。纯前端应用，通过 HTTP 和 Socket.IO 与 Python Flask 后端通信。

## 架构

```
static/
├── html/simulation.html    # 主入口文件
├── css/
│   ├── base.css           # 基础样式 + CSS 变量（所有主题共享）
│   └── theme-*.css        # 独立主题文件（morandi, mint, lavender, coral）
└── js/
    ├── config.js          # 环境配置（开发/生产设置）
    ├── api.js             # REST API 封装，用于启动/结束仿真的接口
    ├── socket.js          # Socket.IO 客户端，含重连逻辑
    ├── index.js           # 核心 UI 逻辑：图表初始化、事件绑定、数据渲染
    └── theme.js           # 主题切换器：下拉菜单、localStorage 持久化、themeChange 事件
```

### 核心组件

#### 前端 → 后端通信

| 组件 | 用途 | 端点/事件 |
|------|------|-----------|
| **REST API** (`api.js`) | 基于 Fetch 的封装 | `/api/start-simulation` (POST), `/api/end-simulation` (POST) |
| **Socket.IO** (`socket.js`) | 实时更新 | `simulation_data` 事件，开始后 `bind_session` |

#### 图表渲染流程

| 图表 | 类型 | 数据来源 | 用途 |
|------|------|----------|------|
| 窗口柱状图 | 柱状图 | Socket.IO `window_people` | 各窗口当前等待人数 |
| 桌子饼状图 | 环形图 | Socket.IO `used_table/remaining_table` | 占用情况快照 |
| 窗口折线图 | 多系列折线 | REST `/api/end-simulation` 趋势 | 历史排队变化 |
| 桌子折线图 | 双系列折线 | REST `/api/end-simulation` 趋势 | 历史占用变化 |

### 颜色系统

**多主题系统**:
- `css/base.css` - 基础样式 + CSS 变量（所有主题共享）
- `css/theme-{name}.css` - 独立主题文件，通过 `:root[class~="theme-*"]` 选择器覆盖变量
- `js/theme.js` - 主题切换器：下拉菜单、localStorage 持久化、`themeChange` 事件派发

**预设主题**: `theme-morandi.css` (蓝)、`theme-mint.css` (薄荷绿)、`theme-lavender.css` (紫)、`theme-coral.css` (珊瑚橙)

**CSS 变量命名约定**:
- `--theme-primary`, `--theme-success`, `--theme-error`, `--theme-warning`, `--theme-info`
- `--chart-series-1` 至 `--chart-series-6`（ECharts 渐变色）
- `--text-*`, `--bg-*`, `--border-*`, `--shadow-*`（中性色）

## 开发

### 前置要求
- 静态文件服务器
- Python Flask 后端运行在 5000 端口（默认）

### 本地运行

1. 在 `static/js/config.js` 中配置环境：
   ```js
   ENV.baseURL = "http://127.0.0.1:5000";
   ENV.socketURL = "http://127.0.0.1:5000";
   ```

2. 服务 `static/` 目录：
   ```bash
   cd static
   python -m http.server 8080
   ```

3. 在浏览器打开 `http://localhost:8080/html/simulation.html`

### 浏览器要求

- ES6 modules 支持
- `fetch()` API + Promise polyfill（旧浏览器）
- ECharts v5.4.3 CDN（已捆绑为 `echarts.min.js`）
- Socket.IO v4.7.2 CDN（已捆绑为 `socket_io.js`）

### 调试

- 控制台日志显示连接状态、消息负载和错误
- 全局状态暴露在 `window.simulationState`
- 辅助函数可全局访问：`initPage()`、`updateWindowBarChart()` 等

## 重要模式

1. **容错处理**: 所有图表渲染器调用前检查 `if (typeof window.updateX === "function")`
2. **响应式图表**: `initECharts()` 在窗口缩放时重新计算字体大小；柱状图/饼状图也会刷新选项值
3. **会话跟踪**: `sessionId` 存储在 state 中，仿真开始后绑定到 Socket.IO
4. **重连机制**: Socket.IO 配置为 `reconnectionAttempts: 5`，`reconnectionDelay: 1000`
5. **主题切换**: 同时更新 HTML class 和 `<link id="active-theme">` 的 href，50ms 延时后派发 `themeChange` 事件
6. **图表颜色更新**: 监听 `themeChange` 事件并调用 `updateChartColors()`，使用 `getComputedStyle()` 获取当前 CSS 变量

## 添加新主题

1. 创建 `static/css/theme-{name}.css`，使用 `:root[class~="theme-{name}"]` 选择器
2. 定义所有必需的 CSS 变量（完整列表见 `THEME_GUIDE.md`）
3. 在 `static/js/theme.js` 的 `themes` 数组中添加：`{ id: 'name', name: '显示名称', class: 'theme-name' }`
4. 主题会自动出现在下拉切换器中
