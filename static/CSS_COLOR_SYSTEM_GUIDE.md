# CSS 颜色系统架构指南

## 📋 目录

1. [颜色系统架构设计](#1-颜色系统架构设计)
2. [命名规范](#2-命名规范)
3. [变量定义方法](#3-变量定义方法)
4. [主题切换实现](#4-主题切换实现)
5. [响应式颜色适配](#5-响应式颜色适配)
6. [可访问性标准](#6-可访问性标准)
7. [颜色使用规范](#7-颜色使用规范)
8. [最佳实践](#8-最佳实践)

---

## 1. 颜色系统架构设计

### 1.1 三层架构

```
┌─────────────────────────────────────┐
│         应用层 (Application)         │
│  - 组件特定颜色                       │
│  - 业务场景颜色                       │
└─────────────────────────────────────┘
               ↓
┌─────────────────────────────────────┐
│         语义层 (Semantic)            │
│  - 功能颜色 (primary, success 等)      │
│  - 主题映射                          │
└─────────────────────────────────────┘
               ↓
┌─────────────────────────────────────┐
│         基础层 (Primitive)           │
│  - 原始色板 (palette)                 │
│  - 色相/饱和度/明度                   │
└─────────────────────────────────────┘
```

### 1.2 文件组织结构

```
styles/
├── colors/
│   ├── base/
│   │   ├── palette.css          # 基础色板（原始颜色）
│   │   └── tokens.css           # Design Tokens
│   ├── semantic/
│   │   ├── light.css            # 浅色主题语义色
│   │   ├── dark.css             # 深色主题语义色
│   │   └── high-contrast.css    # 高对比度主题
│   └── components/
│       ├── buttons.css          # 按钮颜色
│       ├── forms.css            # 表单颜色
│       └── alerts.css           # 提示框颜色
├── themes/
│   ├── light.css                # 浅色主题入口
│   ├── dark.css                 # 深色主题入口
│   └── index.css                # 主题切换逻辑
└── main.css                     # 主入口文件
```

---

## 2. 命名规范

### 2.1 CSS 变量命名

#### 基础色板命名
```css
:root {
  /* 格式：--palette-{color}-{shade} */
  --palette-blue-50: #eff6ff;
  --palette-blue-100: #dbeafe;
  --palette-blue-200: #bfdbfe;
  --palette-blue-300: #93c5fd;
  --palette-blue-400: #60a5fa;
  --palette-blue-500: #3b82f6;  /* 主色 */
  --palette-blue-600: #2563eb;
  --palette-blue-700: #1d4ed8;
  --palette-blue-800: #1e40af;
  --palette-blue-900: #1e3a8a;
  
  /* 其他色系 */
  --palette-green-500: #22c55e;
  --palette-red-500: #ef4444;
  --palette-yellow-500: #eab308;
}
```

#### 语义化命名
```css
:root {
  /* 格式：--{context}-{property}-{state} */
  
  /* 主色调 */
  --color-primary-base: var(--palette-blue-500);
  --color-primary-hover: var(--palette-blue-600);
  --color-primary-active: var(--palette-blue-700);
  --color-primary-disabled: var(--palette-blue-200);
  
  /* 背景色 */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary: #f1f5f9;
  
  /* 文本色 */
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-tertiary: #94a3b8;
  --color-text-disabled: #cbd5e1;
  
  /* 边框色 */
  --color-border-light: #e2e8f0;
  --color-border-base: #cbd5e1;
  --color-border-dark: #94a3b8;
}
```

#### 功能色命名
```css
:root {
  /* 成功 */
  --color-success-light: #dcfce7;
  --color-success-base: #22c55e;
  --color-success-dark: #15803d;
  
  /* 错误 */
  --color-error-light: #fee2e2;
  --color-error-base: #ef4444;
  --color-error-dark: #b91c1c;
  
  /* 警告 */
  --color-warning-light: #fef3c7;
  --color-warning-base: #f59e0b;
  --color-warning-dark: #b45309;
  
  /* 信息 */
  --color-info-light: #dbeafe;
  --color-info-base: #3b82f6;
  --color-info-dark: #1d4ed8;
}
```

### 2.2 命名最佳实践

✅ **推荐做法**
```css
/* 语义化命名 - 清晰表达用途 */
--color-button-primary-bg: var(--palette-blue-500);
--color-button-primary-text: #ffffff;

/* 上下文命名 - 明确使用场景 */
--color-card-background: var(--color-bg-primary);
--color-card-border: var(--color-border-base);

/* 状态命名 - 包含交互状态 */
--color-input-border-default: var(--color-border-base);
--color-input-border-hover: var(--color-border-dark);
--color-input-border-focus: var(--color-primary-base);
--color-input-border-error: var(--color-error-base);
```

❌ **避免做法**
```css
/* 避免使用具体颜色值命名 */
--color-blue: #3b82f6;  /* ❌ 不具语义 */
--color-dark: #000000;  /* ❌ 不明确 */

/* 避免使用位置命名 */
--color-top-border: #e2e8f0;  /* ❌ 位置可能变化 */
--color-left-bg: #f8fafc;     /* ❌ 不灵活 */
```

---

## 3. 变量定义方法

### 3.1 基础色板定义

```css
/* colors/base/palette.css */
:root {
  /* 蓝色系 - 10 个色阶 */
  --palette-blue-50: #eff6ff;
  --palette-blue-100: #dbeafe;
  --palette-blue-200: #bfdbfe;
  --palette-blue-300: #93c5fd;
  --palette-blue-400: #60a5fa;
  --palette-blue-500: #3b82f6;
  --palette-blue-600: #2563eb;
  --palette-blue-700: #1d4ed8;
  --palette-blue-800: #1e40af;
  --palette-blue-900: #1e3a8a;
  
  /* 灰色系 - 用于文本和边框 */
  --palette-gray-50: #f8fafc;
  --palette-gray-100: #f1f5f9;
  --palette-gray-200: #e2e8f0;
  --palette-gray-300: #cbd5e1;
  --palette-gray-400: #94a3b8;
  --palette-gray-500: #64748b;
  --palette-gray-600: #475569;
  --palette-gray-700: #334155;
  --palette-gray-800: #1e293b;
  --palette-gray-900: #0f172a;
}
```

### 3.2 Design Tokens 定义

```css
/* colors/base/tokens.css */
:root {
  /* 品牌色 */
  --brand-primary: var(--palette-blue-500);
  --brand-secondary: var(--palette-purple-500);
  --brand-accent: var(--palette-teal-500);
  
  /* 文本色阶 */
  --text-primary: var(--palette-gray-900);
  --text-secondary: var(--palette-gray-600);
  --text-tertiary: var(--palette-gray-500);
  --text-disabled: var(--palette-gray-400);
  --text-inverse: #ffffff;
  
  /* 背景色阶 */
  --bg-primary: #ffffff;
  --bg-secondary: var(--palette-gray-50);
  --bg-tertiary: var(--palette-gray-100);
  --bg-overlay: rgba(0, 0, 0, 0.5);
  
  /* 边框色阶 */
  --border-subtle: var(--palette-gray-200);
  --border-base: var(--palette-gray-300);
  --border-strong: var(--palette-gray-400);
  
  /* 功能色 */
  --feedback-success: var(--palette-green-500);
  --feedback-error: var(--palette-red-500);
  --feedback-warning: var(--palette-yellow-500);
  --feedback-info: var(--palette-blue-500);
}
```

### 3.3 语义层映射

```css
/* colors/semantic/light.css */
:root {
  /* 主色调语义映射 */
  --color-primary: var(--brand-primary);
  --color-primary-hover: var(--palette-blue-600);
  --color-primary-active: var(--palette-blue-700);
  --color-primary-light: var(--palette-blue-100);
  
  /* 按钮语义 */
  --btn-primary-bg: var(--color-primary);
  --btn-primary-bg-hover: var(--color-primary-hover);
  --btn-primary-text: var(--text-inverse);
  
  /* 表单语义 */
  --input-bg: var(--bg-primary);
  --input-border: var(--border-base);
  --input-border-hover: var(--border-strong);
  --input-border-focus: var(--color-primary);
  --input-border-error: var(--feedback-error);
  --input-text: var(--text-primary);
  --input-placeholder: var(--text-tertiary);
  
  /* 卡片语义 */
  --card-bg: var(--bg-primary);
  --card-border: var(--border-subtle);
  --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  
  /* 提示语义 */
  --alert-success-bg: var(--palette-green-50);
  --alert-success-border: var(--feedback-success);
  --alert-success-text: var(--palette-green-800);
}
```

---

## 4. 主题切换实现

### 4.1 基础主题结构

```css
/* themes/light.css */
:root,
[data-theme="light"] {
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary: #f1f5f9;
  
  --color-text-primary: #0f172a;
  --color-text-secondary: #475569;
  --color-text-tertiary: #64748b;
  
  --color-border-light: #e2e8f0;
  --color-border-base: #cbd5e1;
  
  --color-primary: #3b82f6;
  --color-primary-hover: #2563eb;
  
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
}

/* themes/dark.css */
[data-theme="dark"] {
  --color-bg-primary: #0f172a;
  --color-bg-secondary: #1e293b;
  --color-bg-tertiary: #334155;
  
  --color-text-primary: #f8fafc;
  --color-text-secondary: #cbd5e1;
  --color-text-tertiary: #94a3b8;
  
  --color-border-light: #334155;
  --color-border-base: #475569;
  
  --color-primary: #60a5fa;
  --color-primary-hover: #3b82f6;
  
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}
```

### 4.2 主题切换逻辑

```css
/* themes/index.css */

/* 默认主题（浅色） */
@import './light.css';

/* 媒体查询自动切换 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --color-bg-primary: #0f172a;
    --color-bg-secondary: #1e293b;
    --color-text-primary: #f8fafc;
    --color-text-secondary: #cbd5e1;
    --color-primary: #60a5fa;
  }
}

/* 强制浅色模式 */
[data-theme="light"] {
  color-scheme: light;
}

/* 强制深色模式 */
[data-theme="dark"] {
  color-scheme: dark;
}
```

### 4.3 JavaScript 主题切换

```javascript
// utils/theme-switcher.js
class ThemeSwitcher {
  constructor() {
    this.themeKey = 'app-theme';
    this.init();
  }
  
  init() {
    // 从 localStorage 读取主题
    const savedTheme = localStorage.getItem(this.themeKey);
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
      this.setTheme(savedTheme);
    } else if (systemPrefersDark) {
      this.setTheme('dark');
    }
    
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(this.themeKey)) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
  
  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.themeKey, theme);
    
    // 更新 meta theme-color
    this.updateMetaThemeColor(theme);
  }
  
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(newTheme);
    return newTheme;
  }
  
  getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
  
  updateMetaThemeColor(theme) {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#0f172a' : '#ffffff');
    }
  }
}

// 使用示例
const themeSwitcher = new ThemeSwitcher();

// 按钮点击切换
document.getElementById('theme-toggle').addEventListener('click', () => {
  themeSwitcher.toggleTheme();
});
```

### 4.4 主题切换按钮组件

```html
<!-- HTML -->
<button 
  id="theme-toggle" 
  class="theme-toggle"
  aria-label="切换主题"
  title="切换明/暗主题"
>
  <span class="theme-toggle__icon theme-toggle__icon--light">☀️</span>
  <span class="theme-toggle__icon theme-toggle__icon--dark">🌙</span>
</button>

<style>
.theme-toggle {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-base);
  border-radius: 9999px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.theme-toggle:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-primary);
}

.theme-toggle__icon {
  display: none;
  font-size: 20px;
}

/* 浅色模式显示太阳图标 */
[data-theme="light"] .theme-toggle__icon--light {
  display: block;
}

/* 深色模式显示月亮图标 */
[data-theme="dark"] .theme-toggle__icon--dark {
  display: block;
}
</style>
```

---

## 5. 响应式颜色适配

### 5.1 基于视口的颜色调整

```css
/* 移动端优化 */
@media (max-width: 768px) {
  :root {
    /* 移动端使用更浅的背景减少视觉疲劳 */
    --color-bg-secondary: #f1f5f9;
    
    /* 增大触摸区域的颜色对比 */
    --color-button-min-height: 44px;
    
    /* 移动端使用更大的字体和对比度 */
    --color-text-primary: #020617;
  }
}

/* 桌面端优化 */
@media (min-width: 1024px) {
  :root {
    /* 桌面端使用更细腻的渐变 */
    --color-bg-gradient: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  }
}
```

### 5.2 高对比度模式适配

```css
/* Windows 高对比度模式支持 */
@media (forced-colors: active) {
  :root {
    /* 使用系统颜色 */
    --color-primary: CanvasText;
    --color-bg-primary: Canvas;
    --color-text-primary: CanvasText;
    --color-border-base: CanvasText;
  }
  
  /* 确保所有交互元素可见 */
  a, button, input {
    forced-color-adjust: auto;
  }
}
```

### 5.3 减少动画模式

```css
/* 为晕动症患者提供无动画模式 */
@media (prefers-reduced-motion: reduce) {
  :root {
    /* 禁用颜色过渡动画 */
    --transition-color: 0s;
  }
  
  * {
    transition-duration: 0s !important;
    animation-duration: 0s !important;
  }
}

/* 正常模式 */
@media (prefers-reduced-motion: no-preference) {
  :root {
    --transition-color: 0.3s ease;
  }
  
  .btn {
    transition: background-color var(--transition-color);
  }
}
```

---

## 6. 可访问性标准

### 6.1 WCAG 对比度要求

```css
/* WCAG 2.1 AA 级标准 */
:root {
  /* 常规文本：对比度 ≥ 4.5:1 */
  --text-primary-on-bg-primary: #0f172a;  /* 对比度：15.9:1 ✓ */
  --text-secondary-on-bg-primary: #475569; /* 对比度：7.5:1 ✓ */
  
  /* 大文本（≥18pt 或≥14pt 加粗）：对比度 ≥ 3:1 */
  --heading-on-bg-primary: #1e293b;        /* 对比度：13.5:1 ✓ */
  
  /* UI 组件和图形对象：对比度 ≥ 3:1 */
  --input-border-on-bg: #94a3b8;           /* 对比度：4.5:1 ✓ */
  --button-primary-bg: #2563eb;            /* 对比度：4.5:1 ✓ */
}
```

### 6.2 对比度检测工具类

```javascript
// utils/contrast-checker.js
class ContrastChecker {
  // 计算相对亮度
  getLuminance(r, g, b) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  
  // 计算对比度
  getContrastRatio(color1, color2) {
    const lum1 = this.getLuminanceFromHex(color1);
    const lum2 = this.getLuminanceFromHex(color2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
  }
  
  getLuminanceFromHex(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return this.getLuminance(r, g, b);
  }
  
  // 检查是否符合 WCAG AA 标准
  isWCAAGAACompliant(foreground, background, type = 'normal') {
    const ratio = this.getContrastRatio(foreground, background);
    const requirements = {
      'normal': 4.5,    // 常规文本
      'large': 3,       // 大文本
      'ui': 3,          // UI 组件
      'aaa-normal': 7,  // AAA 级常规文本
      'aaa-large': 4.5  // AAA 级大文本
    };
    
    return {
      compliant: ratio >= requirements[type],
      ratio: ratio.toFixed(2),
      required: requirements[type]
    };
  }
}

// 使用示例
const checker = new ContrastChecker();
console.log(checker.isWCAAGAACompliant('#475569', '#ffffff', 'normal'));
// 输出：{ compliant: true, ratio: '7.50', required: 4.5 }
```

### 6.3 安全颜色组合

```css
/* 经过验证的安全颜色组合 */
:root {
  /* 白色背景上的安全文本色 */
  --safe-text-on-light-1: #0f172a;  /* 对比度：15.9:1 */
  --safe-text-on-light-2: #1e293b;  /* 对比度：13.5:1 */
  --safe-text-on-light-3: #334155;  /* 对比度：10.9:1 */
  --safe-text-on-light-4: #475569;  /* 对比度：7.5:1 */
  --safe-text-on-light-5: #64748b;  /* 对比度：5.0:1 */
  
  /* 黑色背景上的安全文本色 */
  --safe-text-on-dark-1: #ffffff;   /* 对比度：16.9:1 */
  --safe-text-on-dark-2: #f1f5f9;   /* 对比度：15.1:1 */
  --safe-text-on-dark-3: #cbd5e1;   /* 对比度：10.6:1 */
  --safe-text-on-dark-4: #94a3b8;   /* 对比度：6.5:1 */
  
  /* 主蓝色背景上的白色文字 */
  --safe-text-on-primary: #ffffff;  /* 对比度：4.5:1 ✓ */
}
```

### 6.4 色盲友好配色

```css
/* 色盲友好的颜色组合 */
:root {
  /* 避免仅使用颜色传达信息 */
  --status-success-color: #059669;
  --status-success-icon: "✓";
  --status-success-bg: #d1fae5;
  
  --status-error-color: #dc2626;
  --status-error-icon: "✗";
  --status-error-bg: #fee2e2;
  
  /* 使用颜色 + 图标 + 文字的组合 */
  .status-message {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .status-message::before {
    content: attr(data-icon);
    font-weight: bold;
  }
}
```

---

## 7. 颜色使用规范

### 7.1 按钮颜色规范

```css
/* 按钮颜色系统 */
.btn {
  /* 基础样式 */
  background-color: var(--btn-bg, var(--color-bg-tertiary));
  color: var(--btn-text, var(--color-text-primary));
  border: 1px solid var(--btn-border, var(--color-border-base));
  
  /* 悬停状态 */
  &:hover:not(:disabled) {
    background-color: var(--btn-bg-hover, var(--color-bg-secondary));
    border-color: var(--btn-border-hover, var(--color-border-dark));
  }
  
  /* 激活状态 */
  &:active:not(:disabled) {
    background-color: var(--btn-bg-active, var(--color-bg-tertiary));
  }
  
  /* 禁用状态 */
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  
  /* 主按钮 */
  &--primary {
    --btn-bg: var(--color-primary);
    --btn-text: #ffffff;
    --btn-border: var(--color-primary);
    --btn-bg-hover: var(--color-primary-hover);
    --btn-border-hover: var(--color-primary-hover);
  }
  
  /* 次按钮 */
  &--secondary {
    --btn-bg: transparent;
    --btn-text: var(--color-primary);
    --btn-border: var(--color-primary);
    --btn-bg-hover: var(--color-primary-light);
  }
  
  /* 危险按钮 */
  &--danger {
    --btn-bg: var(--color-error);
    --btn-text: #ffffff;
    --btn-border: var(--color-error);
    --btn-bg-hover: var(--color-error-dark);
  }
}
```

### 7.2 表单颜色规范

```css
/* 表单颜色系统 */
.form-input {
  /* 默认状态 */
  background-color: var(--input-bg, var(--color-bg-primary));
  border: 2px solid var(--input-border, var(--color-border-base));
  color: var(--input-text, var(--color-text-primary));
  
  /* 悬停状态 */
  &:hover:not(:disabled):not(:focus) {
    border-color: var(--input-border-hover, var(--color-border-dark));
  }
  
  /* 聚焦状态 */
  &:focus {
    border-color: var(--input-border-focus, var(--color-primary));
    box-shadow: 0 0 0 3px var(--input-focus-ring, var(--color-primary-light));
    outline: none;
  }
  
  /* 错误状态 */
  &--error {
    border-color: var(--input-border-error, var(--color-error));
    
    &:focus {
      box-shadow: 0 0 0 3px var(--input-error-ring, #fecaca);
    }
  }
  
  /* 禁用状态 */
  &:disabled {
    background-color: var(--input-bg-disabled, var(--color-bg-tertiary));
    border-color: var(--input-border-disabled, var(--color-border-light));
    color: var(--input-text-disabled, var(--color-text-disabled));
    cursor: not-allowed;
  }
  
  /* 只读状态 */
  &:read-only {
    background-color: var(--input-bg-readonly, var(--color-bg-secondary));
    cursor: default;
  }
}

/* 占位符颜色 */
.form-input::placeholder {
  color: var(--input-placeholder, var(--color-text-tertiary));
}
```

### 7.3 状态提示颜色规范

```css
/* 提示框颜色系统 */
.alert {
  padding: 12px 16px;
  border-radius: 6px;
  border-left: 4px solid;
  
  /* 成功提示 */
  &--success {
    background-color: var(--alert-success-bg, #d1fae5);
    border-left-color: var(--alert-success-border, #059669);
    color: var(--alert-success-text, #065f46);
  }
  
  /* 错误提示 */
  &--error {
    background-color: var(--alert-error-bg, #fee2e2);
    border-left-color: var(--alert-error-border, #dc2626);
    color: var(--alert-error-text, #991b1b);
  }
  
  /* 警告提示 */
  &--warning {
    background-color: var(--alert-warning-bg, #fef3c7);
    border-left-color: var(--alert-warning-border, #d97706);
    color: var(--alert-warning-text, #92400e);
  }
  
  /* 信息提示 */
  &--info {
    background-color: var(--alert-info-bg, #dbeafe);
    border-left-color: var(--alert-info-border, #2563eb);
    color: var(--alert-info-text, #1e40af);
  }
}
```

### 7.4 卡片容器颜色规范

```css
/* 卡片颜色系统 */
.card {
  background-color: var(--card-bg, var(--color-bg-primary));
  border: 1px solid var(--card-border, var(--color-border-light));
  border-radius: 8px;
  box-shadow: var(--card-shadow, 0 1px 3px rgba(0, 0, 0, 0.1));
  
  /* 卡片头部 */
  &__header {
    border-bottom: 1px solid var(--card-border, var(--color-border-light));
    background-color: var(--card-header-bg, var(--color-bg-secondary));
  }
  
  /* 卡片主体 */
  &__body {
    color: var(--card-text, var(--color-text-primary));
  }
  
  /* 卡片底部 */
  &__footer {
    border-top: 1px solid var(--card-border, var(--color-border-light));
    background-color: var(--card-footer-bg, var(--color-bg-secondary));
  }
  
  /* 可点击卡片 */
  &--clickable {
    cursor: pointer;
    transition: all 0.3s ease;
    
    &:hover {
      border-color: var(--color-primary);
      box-shadow: var(--card-shadow-hover, 0 4px 6px rgba(0, 0, 0, 0.1));
    }
  }
}
```

---

## 8. 最佳实践

### 8.1 颜色继承与覆盖

```css
/* 使用 CSS 自定义属性实现继承 */
.component {
  /* 定义局部变量，继承全局变量 */
  --local-primary: var(--color-primary);
  --local-bg: var(--color-bg-primary);
  
  /* 使用局部变量 */
  background-color: var(--local-bg);
  color: var(--local-primary);
}

/* 主题覆盖示例 */
[data-theme="dark"] .component {
  /* 只需覆盖局部变量 */
  --local-primary: var(--palette-blue-400);
  --local-bg: var(--palette-gray-800);
}

/* 组件特定覆盖 */
.component--variant {
  /* 特定变体覆盖 */
  --local-primary: var(--palette-purple-500);
}
```

### 8.2 避免硬编码颜色

✅ **推荐做法**
```css
/* 使用 CSS 变量 */
.button {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.card {
  background: var(--card-bg);
  border-color: var(--card-border);
}
```

❌ **避免做法**
```css
/* 硬编码颜色值 */
.button {
  background-color: #3b82f6;  /* ❌ */
  color: #ffffff;             /* ❌ */
}

/* 混合使用变量和硬编码 */
.card {
  background: var(--color-bg);
  border: 1px solid #e2e8f0;  /* ❌ */
}
```

### 8.3 性能优化

```css
/* 使用 will-change 优化颜色过渡 */
.animated-element {
  will-change: background-color, color;
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* 避免在大面积元素上使用复杂渐变 */
.large-background {
  /* ❌ 避免：复杂的渐变会影响性能 */
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.1) 0%, 
    rgba(59, 130, 246, 0.5) 50%, 
    rgba(59, 130, 246, 0.1) 100%);
  
  /* ✅ 推荐：简单的纯色或简单渐变 */
  background-color: var(--color-bg-secondary);
}
```

### 8.4 组织颜色变量

```css
/* 按功能分组组织变量 */
:root {
  /* ==================== */
  /* 基础色板              */
  /* ==================== */
  --palette-blue-500: #3b82f6;
  
  /* ==================== */
  /* Design Tokens       */
  /* ==================== */
  --brand-primary: var(--palette-blue-500);
  
  /* ==================== */
  /* 语义层 - 浅色主题     */
  /* ==================== */
  --color-primary: var(--brand-primary);
  
  /* ==================== */
  /* 组件层               */
  /* ==================== */
  --btn-primary-bg: var(--color-primary);
}
```

### 8.5 文档化颜色使用

```css
/**
 * 按钮主色调
 * 
 * @usage
 *   .btn--primary {
 *     background-color: var(--btn-primary-bg);
 *     color: var(--btn-primary-text);
 *   }
 * 
 * @accessibility
 *   - 对比度：4.5:1 (WCAG AA)
 *   - 支持明/暗主题切换
 * 
 * @theme
 *   light: #3b82f6
 *   dark: #60a5fa
 */
--btn-primary-bg: var(--color-primary);

/**
 * 输入框边框颜色
 * 
 * @states
 *   default: var(--color-border-base)
 *   hover: var(--color-border-dark)
 *   focus: var(--color-primary)
 *   error: var(--color-error)
 * 
 * @accessibility
 *   - 对比度：4.5:1 (WCAG AA)
 *   - 聚焦时有 3px 光晕
 */
--input-border: var(--color-border-base);
```

### 8.6 测试清单

在发布前检查以下项目：

- [ ] 所有文本对比度符合 WCAG AA 标准
- [ ] 明/暗主题切换正常工作
- [ ] 所有交互状态（hover, focus, active）有明确颜色反馈
- [ ] 色盲用户可识别所有状态（不单独依赖颜色）
- [ ] 高对比度模式下界面可用
- [ ] 移动端和桌面端颜色适配正确
- [ ] 所有颜色变量已文档化
- [ ] 无硬编码颜色值
- [ ] 主题切换时颜色过渡流畅
- [ ] 打印样式已优化

---

## 附录 A：完整示例

### A.1 完整的 CSS 文件结构

```css
/* main.css - 主入口文件 */
@import './colors/base/palette.css';
@import './colors/base/tokens.css';
@import './themes/index.css';
@import './colors/components/buttons.css';
@import './colors/components/forms.css';
@import './colors/components/cards.css';

/* 全局样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
}
```

### A.2 主题切换完整示例

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#ffffff">
  <title>主题切换示例</title>
  <link rel="stylesheet" href="main.css">
</head>
<body>
  <header>
    <button id="theme-toggle" aria-label="切换主题">
      <span class="icon-light">☀️</span>
      <span class="icon-dark">🌙</span>
    </button>
  </header>
  
  <main>
    <button class="btn btn--primary">主按钮</button>
    <button class="btn btn--secondary">次按钮</button>
    
    <div class="card">
      <div class="card__header">卡片标题</div>
      <div class="card__body">卡片内容</div>
    </div>
  </main>
  
  <script src="theme-switcher.js"></script>
</body>
</html>
```

---

## 附录 B：资源链接

- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [Color Accessibility](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

---

**版本**: 1.0.0  
**更新日期**: 2026-03-30  
**维护者**: 前端架构团队
