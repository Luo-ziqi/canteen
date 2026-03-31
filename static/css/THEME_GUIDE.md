# 主题样式扩展指南

本文档说明如何为餐厅打饭仿真系统创建和扩展 CSS 主题。

---

## 目录结构

```
static/css/
├── base.css          # 基础样式 + 默认变量（所有主题共享）
├── theme-{name}.css  # 独立主题文件（通过选择器覆盖变量）
└── THEME_GUIDE.md    # 本指南
```

---

## 现有主题列表

| 主题名 | CSS 文件 | 类名 | 颜色风格 |
|--------|---------|------|----------|
| 莫兰迪蓝 | `theme-morandi.css` | `theme-morandi` | 柔和蓝色系 |
| 清新薄荷绿 | `theme-mint.css` | `theme-mint` | 青绿色系 |
| 薰衣草紫 | `theme-lavender.css` | `theme-lavender` | 紫色系 |
| 珊瑚橙 | `theme-coral.css` | `theme-coral` | 橙色系 |

---

## 核心机制

### 1. CSS 变量覆盖策略

每个主题文件使用**属性选择器**覆盖 `base.css` 中定义的 CSS 变量：

```css
/* 主题文件结构 */
:root[class~="theme-{name}"] {
    --theme-primary: #xxxxxx;
    /* ...其他变量*/
}
```

- `:root[class~="theme-{name}"]` 表示当 `<html>` 标签包含 `class="theme-{name}"` 时生效
- 该选择器优先级高于 `:root`，因此能成功覆盖变量

### 2. JavaScript 主题管理

主题切换由 `js/theme.js` 中的 `ThemeManager` 控制：

```javascript
themes: [
    { id: 'morandi', name: '莫兰迪蓝', class: 'theme-morandi' },
    // ...更多主题
]
```

添加新主题只需在数组中添加一项，UI 会自动生成选项。

---

## 新增主题步骤

### Step 1: 创建主题 CSS 文件

在 `static/css/` 目录下新建 `theme-{name}.css`，格式如下：

```css
/* 自定义主题名称 */
:root[class~="theme-{name}"] {
    /* ========== 品牌色系（必须）========== */
    --theme-primary: #xxxxxx;       /* 主色调 */
    --theme-primary-light: #xxxxxx; /* 浅色变体 */
    --theme-primary-dark: #xxxxxx;  /* 深色变体 */
    --theme-primary-pale: #xxxxxx;  /* 极浅变体 */

    /* ========== 功能色（必须）========== */
    
    /* 成功色 */
    --theme-success: #xxxxxx;
    --theme-success-dark: #xxxxxx;
    --theme-success-light: #xxxxxx;

    /* 错误色 */
    --theme-error: #xxxxxx;
    --theme-error-dark: #xxxxxx;
    --theme-error-light: #xxxxxx;

    /* 警告色 */
    --theme-warning: #xxxxxx;
    --theme-warning-dark: #xxxxxx;
    --theme-warning-light: #xxxxxx;

    /* 信息色 */
    --theme-info: #xxxxxx;
    --theme-info-dark: #xxxxxx;
    --theme-info-light: #xxxxxx;

    /* ========== ECharts 图表色系（必须，至少 6 个渐变色）========== */
    --chart-series-1: #xxxxxx;
    --chart-series-2: #xxxxxx;
    --chart-series-3: #xxxxxx;
    --chart-series-4: #xxxxxx;
    --chart-series-5: #xxxxxx;
    --chart-series-6: #xxxxxx;

    /* ========== 中性色（建议自定义）========== */
    --text-primary: #xxxxxx;
    --text-regular: #xxxxxx;
    --text-secondary: #xxxxxx;
    --text-disabled: #xxxxxx;

    --bg-primary: #xxxxxx;
    --bg-secondary: #xxxxxx;
    --bg-tertiary: #xxxxxx;

    --border-light: #xxxxxx;
    --border-regular: #xxxxxx;
    --border-dark: #xxxxxx;

    /* ========== 阴影（基于主题色）========== */
    --shadow-light: rgba(0,0,0,0.1);
    --shadow-regular: rgba(0,0,0,0.15);
    --shadow-medium: rgba(0,0,0,0.2);
    --shadow-strong: rgba(0,0,0,0.25);
    --shadow-hover: rgba(0,0,0,0.3);
    --shadow-active: rgba(0,0,0,0.4);
}
```

### Step 2: 注册主题到 JavaScript

编辑 `static/js/theme.js`，在 `themes` 数组中添加新主题：

```javascript
const ThemeManager = {
    themes: [
        { id: 'morandi', name: '莫兰迪蓝', class: 'theme-morandi' },
        { id: 'mint', name: '清新薄荷绿', class: 'theme-mint' },
        { id: 'lavender', name: '薰衣草紫', class: 'theme-lavender' },
        { id: 'coral', name: '珊瑚橙', class: 'theme-coral' },
        
        // 在这里添加你的新主题
        { id: 'your-theme', name: '你的主题名称', class: 'theme-your-theme' }
    ],
    // ...其他代码保持不变
};
```

### Step 3: 测试主题

1. 启动本地服务器：`cd static && python -m http.server 8080`
2. 打开浏览器访问 `http://localhost:8080/html/simulation.html`
3. 点击右上角"主题"下拉菜单，选择你的新主题

---

## CSS 变量详解

### 品牌色系（Theme Colors）

| 变量 | 用途 | 示例场景 |
|------|------|----------|
| `--theme-primary` | 主色调 | 按钮背景、激活状态 |
| `--theme-primary-light` | 浅色变体 | hover 状态、高亮 |
| `--theme-primary-dark` | 深色变体 | active 状态、边框 |
| `--theme-primary-pale` | 极浅变体 | 背景渐变 |

### 功能色（Functional Colors）

每种功能色包含 3 个变体（常规/深色/浅色），用于不同语境：

| 功能色 | 用途 | 示例 |
|--------|------|------|
| `--theme-success` | 成功状态 | 仿真成功提示 |
| `--theme-error` | 错误状态 | 请求失败提示 |
| `--theme-warning` | 警告状态 | 队列过长提醒 |
| `--theme-info` | 信息状态 | 加载进度提示 |

### ECharts 图表色系

用于多系列折线图/柱状图的渐变色，**至少需要 6 个**颜色形成渐变序列：

```css
--chart-series-1: #fff3e0;  /* 最浅色，用于图例背景 */
--chart-series-2: #fbe9e7;
--chart-series-3: #ffccbc;
--chart-series-4: #ffab91;
--chart-series-5: #ff8a65;  /* 最深色，用于前景数据 */
--chart-series-6: #f4511e;  /* 强调色 */
```

### 中性色（Neutral Colors）

| 变量 | 用途 |
|------|------|
| `--text-primary` | 标题文字 |
| `--text-regular` | 正文文字 |
| `--text-secondary` | 辅助文字 |
| `--text-disabled` | 禁用文字 |
| `--bg-primary` | 主背景 |
| `--bg-secondary` | 次级背景 |
| `--bg-tertiary` | 三级背景 |
| `--border-light/regular/dark` | 边框深浅 |

### 阴影（Shadows）

阴影使用 `rgba()` 格式，第二个参数为透明度（alpha channel）。建议根据主题主色动态计算：

```css
/* 例如蓝色主题 */
--shadow-light: rgba(169, 198, 255, 0.1);
--shadow-active: rgba(169, 198, 255, 0.4);
```

---

## 设计建议

### 1. 颜色搭配原则

- **对比度**: 确保文字与背景的对比度≥4.5:1（WCAG AA 标准）
- **一致性**: 所有功能色的明度应保持一致
- **渐进性**: `light → regular → dark` 应该是平滑的明度变化

### 2. 常用配色方案参考

#### 自然风
- 主色：`#6baf6e` (草绿)
- 成功色：`#88c996` (嫩芽绿)
- 错误色：`#e57373` (樱花红)

#### 商务风
- 主色：`#3f51b5` (靛蓝)
- 成功色：`#4caf50` (森林绿)
- 错误色：`#f44336` (警示红)

#### 科技感
- 主色：`#00bcd4` (青色)
- 成功色：`#26a69a` (孔雀绿)
- 错误色：`#ef5350` (珊瑚红)

---

## 常见问题

### Q: 主题切换后图表颜色没有更新？

A: 确保 `index.js` 中的 `updateChartColors()` 函数正确使用了 CSS 变量：

```javascript
// 获取当前主题变量
const computedStyle = getComputedStyle(document.documentElement);
const primaryColor = computedStyle.getPropertyValue('--theme-primary').trim();
```

### Q: 如何调试主题？

A: 使用浏览器开发者工具检查：
1. Elements → `<html>` 标签是否包含 `class="theme-{name}"`
2. Computed 面板查看变量值是否正确
3. Network 面板确认 `theme-{name}.css` 已加载

### Q: localStorage 存储失败怎么办？

A: `theme.js` 已包含 try-catch 处理，如果用户禁用 Cookie，主题会降级到默认值（`theme-morandi`）。

---

## 完整示例：创建一个紫色主题

### 1. 创建 `theme-purple-sky.css`

```css
/* 天空紫色主题 */
:root[class~="theme-purple-sky"] {
    /* 品牌色系 */
    --theme-primary: #9c27b0;
    --theme-primary-light: #ba68c8;
    --theme-primary-dark: #7b1fa2;
    --theme-primary-pale: #f3e5f5;

    /* 功能色 */
    --theme-success: #4caf50;
    --theme-success-dark: #388e3c;
    --theme-success-light: #c8e6c9;

    --theme-error: #f44336;
    --theme-error-dark: #d32f2f;
    --theme-error-light: #ffcdd2;

    --theme-warning: #ff9800;
    --theme-warning-dark: #f57c00;
    --theme-warning-light: #ffe0b2;

    --theme-info: #2196f3;
    --theme-info-dark: #1976d2;
    --theme-info-light: #bbdefb;

    /* ECharts 图表色系 */
    --chart-series-1: #f3e5f5;
    --chart-series-2: #e1bee7;
    --chart-series-3: #d1c4e9;
    --chart-series-4: #b39ddb;
    --chart-series-5: #9575cd;
    --chart-series-6: #7e57c2;

    /* 中性色 */
    --text-primary: #4a148c;
    --text-regular: #6a1b9a;
    --text-secondary: #8e24aa;
    --text-disabled: #b39ddb;

    --bg-primary: #f3e5f5;
    --bg-secondary: #e1bee7;
    --bg-tertiary: #d1c4e9;

    --border-light: #e1bee7;
    --border-regular: #ce93d8;
    --border-dark: #ab47bc;

    /* 阴影 */
    --shadow-light: rgba(156, 39, 176, 0.1);
    --shadow-regular: rgba(156, 39, 176, 0.15);
    --shadow-medium: rgba(156, 39, 176, 0.2);
    --shadow-strong: rgba(156, 39, 176, 0.25);
    --shadow-hover: rgba(156, 39, 176, 0.3);
    --shadow-active: rgba(156, 39, 176, 0.4);
}
```

### 2. 注册到 `theme.js`

```javascript
themes: [
    // 现有主题...
    { id: 'purple-sky', name: '天空紫', class: 'theme-purple-sky' }
]
```

### 3. 完成！刷新页面即可看到新主题

---

## 资源链接

- [CSS 选择器文档](https://developer.mozilla.org/zh-CN/docs/Web/CSS/Attribute_selectors)
- [WCAG 对比度检查工具](https://webaim.org/resources/contrastchecker/)
- [Coolors 配色生成器](https://coolors.co/)
