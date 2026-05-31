/**
 * @fileoverview 增强工具模块：Toast · 音效 · 涟漪 · 数字跳动 · 右键菜单 · 迷你图
 */

// ==================== Toast 通知系统 ====================
let _toastId = 0;

/**
 * 显示 Toast 通知。
 * @param {'success'|'error'|'info'|'loading'} type
 * @param {string} msg
 * @param {number} [duration=3500] 自动消失时间(ms)，0 表示不自动消失
 */
export function showToast(type, msg, duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ', loading: '⏳' };
  const id = `toast-${++_toastId}`;
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.id = id;
  toast.innerHTML = `<span class="toast__icon">${icons[type] || ''}</span><span class="toast__msg">${msg}</span>`;
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }

  return id;
}

/**
 * 移除指定 Toast。
 * @param {string} id
 */
export function removeToast(id) {
  const toast = document.getElementById(id);
  if (!toast) return;
  toast.classList.add('toast--removing');
  setTimeout(() => toast.remove(), 260);
}

// ==================== 音效系统 ====================
let _soundEnabled = true;

// 使用 Web Audio API 生成简单音效（无需外部文件）
const _audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function _playTone(freq, duration, type = 'sine', vol = 0.15) {
  if (!_soundEnabled) return;
  try {
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, _audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.start();
    osc.stop(_audioCtx.currentTime + duration);
  } catch (e) { /* 静默失败 */ }
}

/** 仿真启动音效 */
export function playStartSound() { _playTone(880, 0.15, 'sine', 0.1); }

/** 仿真结束音效 */
export function playEndSound() {
  _playTone(660, 0.12, 'sine', 0.1);
  setTimeout(() => _playTone(880, 0.18, 'sine', 0.1), 120);
}

/** 错误音效 */
export function playErrorSound() { _playTone(220, 0.3, 'square', 0.08); }

/** 切换音效开关 */
export function toggleSound() {
  _soundEnabled = !_soundEnabled;
  return _soundEnabled;
}

/** 获取当前音效状态 */
export function isSoundEnabled() { return _soundEnabled; }

// ==================== 按钮涟漪 ====================
/**
 * 初始化按钮涟漪效果。
 */
export function initRipple() {
  document.querySelectorAll('.sidebar__btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });
}

// ==================== 数字跳动 ====================
/**
 * 对元素执行数字跳动动画。
 * @param {HTMLElement} el
 * @param {string|number} newValue
 */
export function animateCountUp(el, newValue) {
  if (!el) return;
  el.classList.remove('count-up');
  void el.offsetWidth; // 强制回流
  el.textContent = String(newValue);
  el.classList.add('count-up');
}

// ==================== 右键菜单 ====================
let _contextMenu = null;

/**
 * 显示右键菜单。
 * @param {number} x
 * @param {number} y
 * @param {!Array<{label:string, action:!Function, separator?:boolean}>} items
 */
export function showContextMenu(x, y, items) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  items.forEach((item) => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu__separator';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className = 'context-menu__item';
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      item.action();
      removeContextMenu();
    });
    menu.appendChild(btn);
  });

  // 确保菜单不出屏幕
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
  if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;

  _contextMenu = menu;
}

function removeContextMenu() {
  if (_contextMenu) { _contextMenu.remove(); _contextMenu = null; }
}

document.addEventListener('click', removeContextMenu);
document.addEventListener('contextmenu', (e) => {
  if (_contextMenu && !_contextMenu.contains(e.target)) removeContextMenu();
});

// ==================== 迷你图（Sparkline） ====================
/**
 * 在 canvas 上绘制迷你折线图。
 * @param {HTMLCanvasElement} canvas
 * @param {!Array<number>} data
 * @param {string} [color='#68d391']
 */
export function drawSparkline(canvas, data, color = '#68d391') {
  if (!canvas || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = w / (data.length - 1);

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  data.forEach((val, i) => {
    const x = i * stepX;
    const y = h - ((val - min) / range) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 渐变填充
  ctx.lineTo((data.length - 1) * stepX, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

// ==================== 表单即时校验 ====================
/**
 * 初始化表单即时校验 + 按钮联动。
 * @param {!HTMLFormElement} form
 * @param {!HTMLButtonElement} submitBtn
 * @returns {!Function} 返回检查函数
 */
export function initFormValidation(form, submitBtn) {
  const inputs = form.querySelectorAll('input[type="number"]');
  const fieldMap = {};

  inputs.forEach((input) => {
    const feedback = document.createElement('span');
    feedback.className = 'form-feedback';
    feedback.style.cssText = 'font-size:11px;color:var(--theme-error);display:none;margin-top:2px;';
    input.parentNode.appendChild(feedback);
    fieldMap[input.name] = { input, feedback };
  });

  function validateField(input, feedback) {
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) {
      input.style.borderColor = 'var(--theme-error)';
      feedback.textContent = '请输入有效数值';
      feedback.style.display = 'block';
      return false;
    }
    if ((input.name === 'window_num' || input.name === 'table_num') && val < 1) {
      input.style.borderColor = 'var(--theme-error)';
      feedback.textContent = '至少为 1';
      feedback.style.display = 'block';
      return false;
    }
    input.style.borderColor = '';
    feedback.style.display = 'none';
    return true;
  }

  function checkAll() {
    let allValid = true;
    Object.values(fieldMap).forEach(({ input, feedback }) => {
      if (!validateField(input, feedback)) allValid = false;
    });
    if (submitBtn) {
      if (allValid) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      } else {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.55';
      }
    }
    return allValid;
  }

  inputs.forEach((input) => {
    input.addEventListener('blur', () => {
      const entry = fieldMap[input.name];
      if (entry) validateField(entry.input, entry.feedback);
      checkAll();
    });
    input.addEventListener('input', checkAll);
  });

  // 初始检查
  checkAll();
  return checkAll;
}
