/**
 * @fileoverview 餐厅仿真系统主题切换管理器。
 * 管理主题切换界面、主题应用和 localStorage 持久化。
 */

/**
 * 主题管理器对象。
 * @const {!Object}
 */
const ThemeManager = {
  /**
   * 可用主题列表。
   * @const {!Array<!Object>}
   */
  themes: [
    {id: 'morandi', name: '莫兰迪蓝', cssClass: 'theme-morandi'},
    {id: 'mint', name: '清新薄荷绿', cssClass: 'theme-mint'},
    {id: 'lavender', name: '薰衣草紫', cssClass: 'theme-lavender'},
    {id: 'coral', name: '珊瑚橙', cssClass: 'theme-coral'},
    {id: 'dark', name: '深色模式', cssClass: 'theme-dark'},
  ],

  /** @type {string} 主题偏好的 localStorage 键名。 */
  STORAGE_KEY: 'simulation_theme',

  /** @type {boolean} 下拉菜单显示状态。 */
  dropdownActive: false,

  /** @type {?Object} DOM 元素引用。 */
  elements: null,

  /**
   * 初始化主题管理器。
   * 创建界面、渲染选项、加载已保存主题并绑定事件。
   */
  init() {
    this.createThemeSwitcherUI_();
    this.renderThemeOptions_();
    this.loadSavedTheme_();
    this.bindEvents_();
  },

  /**
   * 创建主题切换器的 DOM 元素。
   * @private
   */
  createThemeSwitcherUI_() {
    const container = document.createElement('div');
    container.className = 'theme-switcher';
    container.innerHTML =
        '<div class="theme-switcher__dropdown">' +
        '<button class="theme-switcher__button" type="button">' +
        '<span class="theme-switcher__text">主题</span>' +
        '<span class="theme-switcher__arrow">&#9660;</span>' +
        '</button>' +
        '<div class="theme-switcher__options"></div>' +
        '</div>';
    document.body.appendChild(container);

    this.elements = {
      dropdown: container.querySelector('.theme-switcher__dropdown'),
      button: container.querySelector('.theme-switcher__button'),
      text: container.querySelector('.theme-switcher__text'),
      options: container.querySelector('.theme-switcher__options'),
    };
  },

  /**
   * 渲染下拉菜单中的主题选项。
   * @private
   */
  renderThemeOptions_() {
    const currentTheme = this.getCurrentThemeClass_();

    this.elements.options.innerHTML = this.themes
        .map((theme) => {
          const isActive = theme.cssClass === currentTheme;
          return (
              '<div class="theme-switcher__option ' +
              (isActive ? 'active' : '') +
              '" data-theme="' +
              theme.cssClass +
              '">' +
              '<span class="theme-switcher__color-indicator"></span>' +
              '<span>' +
              theme.name +
              '</span>' +
              '</div>'
          );
        })
        .join('');

    // 渲染后通过 JS 设置颜色指示器，避免 innerHTML 中 CSS 变量解析不可靠
    const indicators = this.elements.options.querySelectorAll('.theme-switcher__color-indicator');
    const styles = getComputedStyle(document.documentElement);
    indicators.forEach((el) => {
      el.style.backgroundColor = styles.getPropertyValue('--theme-primary').trim();
    });

    const activeTheme = this.themes.find(
        (t) => t.cssClass === currentTheme,
    );
    if (activeTheme) {
      this.elements.text.textContent = activeTheme.name;
    }
  },

  /**
   * 绑定主题切换相关的事件监听器。
   * @private
   */
  bindEvents_() {
    this.elements.button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown_();
    });

    document.addEventListener('click', () => {
      this.closeDropdown_();
    });

    this.elements.options.addEventListener('click', (e) => {
      const option = e.target.closest('.theme-switcher__option');
      if (option) {
        const themeClass = option.dataset.theme;
        this.applyTheme(themeClass);
      }
    });
  },

  /**
   * 切换下拉菜单显示状态。
   * @private
   */
  toggleDropdown_() {
    this.dropdownActive = !this.dropdownActive;
    this.elements.dropdown.classList.toggle('active', this.dropdownActive);
  },

  /**
   * 关闭下拉菜单。
   * @private
   */
  closeDropdown_() {
    this.dropdownActive = false;
    this.elements.dropdown.classList.remove('active');
  },

  /**
   * 从 HTML 元素获取当前主题类名。
   *
   * @return {string} 当前主题类名。
   * @private
   */
  getCurrentThemeClass_() {
    const html = document.documentElement;
    return (
        Array.from(html.classList).find((cls) => cls.startsWith('theme-')) ||
        ''
    );
  },

  /**
   * 应用主题到页面。
   *
   * @param {string} themeClass - 要应用的主题类名。
   */
  applyTheme(themeClass) {
    if (!themeClass) {
      return;
    }

    const html = document.documentElement;
    const themeLink = document.getElementById('active-theme');

    this.themes.forEach((theme) => {
      html.classList.remove(theme.cssClass);
    });

    html.classList.add(themeClass);

    if (themeLink) {
      themeLink.setAttribute('href', `/static/css/${themeClass}.css`);
    }

    this.saveTheme_(themeClass);
    this.renderThemeOptions_();
    this.closeDropdown_();

    setTimeout(() => {
      const event = new CustomEvent('themeChange', {
        detail: {theme: themeClass},
      });
      document.dispatchEvent(event);
      console.log('[Theme] 已触发 themeChange 事件');
    }, 50);

    console.log(`[Theme] 已应用主题：${themeClass}`);
  },

  /**
   * 从 localStorage 加载已保存的主题。
   * @private
   */
  loadSavedTheme_() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved && this.themes.some((t) => t.cssClass === saved)) {
        this.applyTheme(saved);
      } else {
        this.applyTheme('theme-morandi');
      }
    } catch (error) {
      console.warn('[Theme] 加载主题失败：', error);
      this.applyTheme('theme-morandi');
    }
  },

  /**
   * 将主题偏好保存到 localStorage。
   *
   * @param {string} themeClass - 要保存的主题类名。
   * @private
   */
  saveTheme_(themeClass) {
    try {
      localStorage.setItem(this.STORAGE_KEY, themeClass);
    } catch (error) {
      console.warn('[Theme] 保存主题失败：', error);
    }
  },

  /**
   * 获取当前主题对象。
   *
   * @return {?Object} 当前主题对象，如果未找到则返回 null。
   */
  getCurrentTheme() {
    const themeClass = this.getCurrentThemeClass_();
    return this.themes.find((t) => t.cssClass === themeClass) || null;
  },
};

/**
 * 当 DOM 就绪时初始化主题管理器。
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
  ThemeManager.init();
}
