# 主题系统使用指南

本系统支持多主题切换，用户可以轻松添加或自定义主题。

## 主题结构

```
static/
├── css/
│   ├── base.css          # 基础样式（所有主题共享）
│   ├── theme-morandi.css # 莫兰迪蓝色主题
│   ├── theme-mint.css    # 薄荷绿主题
│   ├── theme-lavender.css# 薰衣草紫主题
│   └── theme-coral.css   # 珊瑚橙主题
└── js/
    └── theme.js          # 主题切换管理器
```

## 预设主题列表

| 主题名 | CSS 文件名 | ID 类名 | 风格描述 |
|--------|-----------|---------|----------|
| 莫兰迪蓝 | `theme-morandi.css` | `theme-morandi` | 柔和专业蓝调 |
| 清新薄荷绿 | `theme-mint.css` | `theme-mint` | 清爽自然绿调 |
| 薰衣草紫 | `theme-lavender.css` | `theme-lavender` | 优雅浪漫紫调 |
| 珊瑚橙 | `theme-coral.css` | `theme-coral` | 活力温暖橙调 |

## 如何添加新主题

### 步骤 1：创建主题 CSS 文件

在 `static/css/` 目录下创建新文件 `theme-{name}.css`，内容格式如下：

```css
/* {主题名称} 主题 */
:root[class~="theme-{id}"] {
    /* ========== 品牌色系（必须自定义） ========== */
    --theme-primary: #xxxxxx;       /* 主色调 */
    --theme-primary-light: #xxxxxx; /* 浅色变体 */
    --theme-primary-dark: #xxxxxx;  /* 深色变体 */
    --theme-primary-pale: #xxxxxx;  /* 极浅变体 */

    /* ========== 功能色（必须自定义） ========== */
    --theme-success: #xxxxxx;       /* 成功色 */
    --theme-success-dark: #xxxxxx;
    --theme-success-light: #xxxxxx;

    --theme-error: #xxxxxx;         /* 错误色 */
    --theme-error-dark: #xxxxxx;
    --theme-error-light: #xxxxxx;

    --theme-warning: #xxxxxx;       /* 警告色 */
    --theme-warning-dark: #xxxxxx;
    --theme-warning-light: #xxxxxx;

    --theme-info: #xxxxxx;          /* 信息色 */
    --theme-info-dark: #xxxxxx;
    --theme-info-light: #xxxxxx;

    /* ========== ECharts 图表色系（必须自定义，至少 6 个渐变色） ========== */
    --chart-series-1: #xxxxxx;      /* 最浅色 */
    --chart-series-2: #xxxxxx;
    --chart-series-3: #xxxxxx;
    --chart-series-4: #xxxxxx;
    --chart-series-5: #xxxxxx;
    --chart-series-6: #xxxxxx;      /* 最深色 */

    /* ========== 中性色（建议自定义） ========== */
    --text-primary: #xxxxxx;
    --text-regular: #xxxxxx;
    --text-secondary: #xxxxxx;
    --text-disabled: #xxxxxx;

    --bg-primary: #xxxxxx;          /* 主背景 */
    --bg-secondary: #xxxxxx;        /* 次背景 */
    --bg-tertiary: #xxxxxx;         /* 第三背景 */

    --border-light: #xxxxxx;
    --border-regular: #xxxxxx;
    --border-dark: #xxxxxx;

    /* ========== 阴影（建议使用中性灰，跟随 base.css 默认值即可） ========== */
}
```

### 步骤 2：在 HTML 中引入主题

编辑 `static/html/simulation.html`，修改 `<link>` 标签的 `href`：

```html
<!-- 当前默认主题 -->
<link rel="stylesheet" href="../css/theme-{name}.css" id="active-theme">
```

**注意**: 这里只需要修改这一个地方，JavaScript 会自动加载该主题并通过 `localStorage` 记住用户选择。

### 步骤 3：注册主题到切换器（可选但推荐）

编辑 `static/js/theme.js`，在 `themes` 数组中添加新主题：

```javascript
themes: [
    { id: 'morandi', name: '莫兰迪蓝', class: 'theme-morandi' },
    { id: 'mint', name: '清新薄荷绿', class: 'theme-mint' },
    { id: 'lavender', name: '薰衣草紫', class: 'theme-lavender' },
    { id: 'coral', name: '珊瑚橙', class: 'theme-coral' },
    { id: 'yourtheme', name: '你的主题名', class: 'theme-yourtheme' }  // ← 添加这里
]
```

## 颜色变量详解

### 必需变量（必须自定义）

| 变量 | 用途 | 示例值 |
|------|------|--------|
| `--theme-primary` | 主要强调色（按钮、链接） | `#a9c6ff` |
| `--theme-primary-light` | 悬停/高亮状态 | `#b8d0ff` |
| `--theme-primary-dark` | 激活/按下状态 | `#94b3e6` |
| `--theme-primary-pale` | 极浅背景装饰 | `#eef5ff` |
| `--theme-success` | 成功/完成状态 | `#68d391` |
| `--theme-error` | 错误/危险状态 | `#fc8181` |
| `--theme-warning` | 警告/注意状态 | `#f6ad55` |
| `--theme-info` | 信息提示状态 | `#63b3ed` |
| `--chart-series-N` (N=1~6) | ECharts 图表渐变色 | `#e1edff` ~ `#8fb3e6` |

### 可选变量（建议自定义）

| 变量组 | 用途 |
|--------|------|
| `--text-*` (primary/regular/secondary/disabled) | 文本颜色层次 |
| `--bg-*` (primary/secondary/tertiary) | 背景色层次 |
| `--border-*` (light/regular/dark) | 边框颜色层次 |
| `--shadow-*` (light/regular/medium/strong/hover/active) | 阴影透明度（中性灰，无需跟随主题色） |

## 配色建议

1. **保持色调统一**：所有颜色应来自同一色系（如同为冷色或暖色）
2. **对比度充足**：确保文字与背景有足够的对比度（WCAG AA 标准）
3. **功能色区分明显**：成功（绿）、错误（红）、警告（黄）应保持识别性
4. **图表色渐变有序**：6 个图表色应从浅到深排列，便于区分数据系列

## 快速配色参考

以下提供一些常用的配色组合供参考：

### 蓝色系
```css
--theme-primary: #2196f3;
--theme-primary-light: #42a5f5;
--theme-primary-dark: #1976d2;
```

### 绿色系
```css
--theme-primary: #4caf50;
--theme-primary-light: #66bb6a;
--theme-primary-dark: #388e3c;
```

### 红色系
```css
--theme-primary: #f44336;
--theme-primary-light: #ef5350;
--theme-primary-dark: #d32f2f;
```

### 紫色系
```css
--theme-primary: #9c27b0;
--theme-primary-light: #ba68c8;
--theme-primary-dark: #7b1fa2;
```

## 测试主题

1. 启动服务：`python app.py`
2. 打开浏览器：`http://localhost:5000`
3. 点击右上角「主题」下拉菜单查看可用主题
4. 点击新主题应用并验证显示效果

## API 参考

### ThemeManager 方法

```javascript
// 初始化主题切换器
ThemeManager.init()

// 应用指定主题
ThemeManager.applyTheme('theme-yourtheme')

// 获取当前主题信息
ThemeManager.getCurrentTheme()  // 返回主题对象

// 手动保存主题偏好
ThemeManager.saveTheme('theme-yourtheme')
```

### 主题变更事件

```javascript
document.addEventListener('themeChange', (e) => {
    console.log('主题已变更为:', e.detail.theme);
});
```
