# 莫兰迪蓝色系色彩规范

基于 `theme/color_morandi.txt` 中定义的颜色指南，本项目采用了完整的莫兰迪蓝色系色彩系统。

## 📋 主色系（来自 color_morandi.txt）

| 变量名 | 颜色值 | 说明 | 使用场景 |
|-------|--------|------|---------|
| `--morandi-1` | `#eef5ff` | 最浅蓝 | 背景装饰、聚焦阴影 |
| `--morandi-2` | `#e1edff` | 极浅蓝 | 浅色背景、悬停阴影 |
| `--morandi-3` | `#d6e5ff` | 浅蓝 | 边框、装饰元素 |
| `--morandi-4` | `#c5d9ff` | 中浅蓝 | 次要元素、边框深色 |
| `--morandi-5` | `#b8d0ff` | 中蓝 | 悬停状态、浅色强调 |
| `--morandi-6` | `#a9c6ff` | 主蓝色 | 主要强调色、按钮 |

## 🎨 派生功能色

### 主色调
- `--morandi-primary`: `#a9c6ff` - 主色调
- `--morandi-primary-light`: `#b8d0ff` - 浅色变体
- `--morandi-primary-dark`: `#8fb3e6` - 深色变体
- `--morandi-primary-pale`: `#eef5ff` - 极浅变体

### 成功色（柔和蓝绿色系）
- `--morandi-success`: `#9ec5d9`
- `--morandi-success-dark`: `#6fa3b8`
- `--morandi-success-light`: `#c5dfe6`
- `--morandi-success-pale`: `#eef5f7`

### 信息色（柔和蓝色系）
- `--morandi-info`: `#a9c6ff`
- `--morandi-info-dark`: `#7fa8e6`
- `--morandi-info-light`: `#c5d9ff`
- `--morandi-info-pale`: `#eef5ff`

### 警告色（柔和蓝紫色系）
- `--morandi-warning`: `#b8c5e6`
- `--morandi-warning-dark`: `#8f9ec9`
- `--morandi-warning-light`: `#d6d9e6`
- `--morandi-warning-pale`: `#f5f6ff`

### 错误色（柔和蓝红色系）
- `--morandi-error`: `#d9c5c5`
- `--morandi-error-dark`: `#b88f8f`
- `--morandi-error-light`: `#e6d6d6`
- `--morandi-error-pale`: `#fff5f5`

## 🎯 中性色

### 文本色（蓝灰色系）
- `--morandi-text-primary`: `#4a5568` - 主文本
- `--morandi-text-regular`: `#718096` - 常规文本
- `--morandi-text-secondary`: `#a0aec0` - 次要文本
- `--morandi-text-disabled`: `#cbd5e0` - 禁用文本

### 背景色
- `--morandi-bg-primary`: `#ffffff` - 主背景
- `--morandi-bg-secondary`: `#f8fafc` - 次要背景
- `--morandi-bg-tertiary`: `#eef5ff` - 第三背景（与 morandi-1 相同）
- `--morandi-bg-gradient`: `linear-gradient(135deg, #eef5ff 0%, #e1edff 100%)` - 渐变背景

### 边框色
- `--morandi-border-light`: `#e1edff` - 浅色边框
- `--morandi-border-regular`: `#d6e5ff` - 常规边框
- `--morandi-border-dark`: `#c5d9ff` - 深色边框

## 📊 ECharts 图表专用色

| 变量名 | 颜色值 | 说明 |
|-------|--------|------|
| `--chart-series-1` | `#a9c6ff` | 主蓝 - 主要数据系列 |
| `--chart-series-2` | `#9ec5d9` | 蓝绿 - 第二数据系列 |
| `--chart-series-3` | `#b8c5e6` | 蓝紫 - 第三数据系列 |
| `--chart-series-4` | `#c5d9ff` | 浅蓝 - 第四数据系列 |
| `--chart-series-5` | `#d6e5ff` | 极浅蓝 - 第五数据系列 |
| `--chart-series-6` | `#8fb3e6` | 深蓝 - 第六数据系列 |

## 🎨 色彩应用示例

### 按钮样式
```css
/* 启动仿真按钮 - 渐变蓝色 */
.simulation__btn--start {
  background: linear-gradient(135deg, #a9c6ff 0%, #8fb3e6 100%);
  color: #ffffff;
}

/* 结束仿真按钮 - 描边样式 */
.simulation__btn--end {
  background-color: #ffffff;
  color: #a9c6ff;
  border: 2px solid #a9c6ff;
}
```

### 表单输入
```css
/* 输入框 - 浅蓝边框 */
input {
  border: 2px solid #d6e5ff;
  background-color: #ffffff;
  color: #4a5568;
}

/* 聚焦状态 - 主蓝色边框 */
input:focus {
  border-color: #a9c6ff;
  box-shadow: 0 0 0 3px #eef5ff;
}
```

### 提示信息
```css
/* 成功提示 - 柔和蓝绿色渐变 */
.simulation__tip--success {
  background: linear-gradient(135deg, #eef5f7 0%, #c5dfe6 100%);
  color: #6fa3b8;
}

/* 错误提示 - 柔和蓝红色渐变 */
.simulation__tip--error {
  background: linear-gradient(135deg, #fff5f5 0%, #e6d6d6 100%);
  color: #b88f8f;
}
```

### 评价标签
```css
/* 良好评价 - 蓝绿色 */
.eval--good {
  background: linear-gradient(135deg, #eef5f7 0%, #c5dfe6 100%);
  color: #6fa3b8;
}

/* 较差评价 - 蓝红色 */
.eval--bad {
  background: linear-gradient(135deg, #fff5f5 0%, #e6d6d6 100%);
  color: #b88f8f;
}
```

## 🎯 设计特点

### 1. 色彩渐变
所有主要组件都使用了渐变色，从 `#eef5ff` 到 `#e1edff` 的渐变贯穿整个设计。

### 2. 柔和色调
基于莫兰迪色系的低饱和度特点，所有颜色都带有灰色调，视觉柔和舒适。

### 3. 统一性
所有颜色都来源于原始的 6 个莫兰迪蓝色，保持了整体视觉的统一性。

### 4. 功能性
- 成功色采用蓝绿色系，传达积极信号
- 错误色采用蓝红色系，传达警告但不刺眼
- 信息色保持纯蓝色系，传达中性信息

### 5. 可访问性
文本颜色使用蓝灰色系（`#4a5568`、`#718096`），确保在浅色背景上有足够的对比度。

## 📝 使用指南

### CSS 变量使用
```css
.element {
  background-color: var(--morandi-primary);
  border-color: var(--morandi-border-regular);
  color: var(--morandi-text-primary);
}
```

### JavaScript 读取
```javascript
const styles = getComputedStyle(document.documentElement);
const primaryColor = styles.getPropertyValue('--morandi-primary').trim();
```

## 🔄 更新历史

- **2026-03-30**: 基于 `color_morandi.txt` 创建完整的莫兰迪蓝色系色彩系统
- 更新了 `static/css/simulation.css`
- 所有组件样式已同步更新
- JavaScript 自动从 CSS 变量读取颜色

---

**版本**: v2.0.0  
**更新日期**: 2026-03-30  
**色系**: 莫兰迪蓝色系  
**来源**: `theme/color_morandi.txt`
