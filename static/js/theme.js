/**
 * 餐厅打饭仿真系统 - 主题切换器
 */

const ThemeManager = {
    themes: [
        { id: 'morandi', name: '莫兰迪蓝', class: 'theme-morandi' },
        { id: 'mint', name: '清新薄荷绿', class: 'theme-mint' },
        { id: 'lavender', name: '薰衣草紫', class: 'theme-lavender' },
        { id: 'coral', name: '珊瑚橙', class: 'theme-coral' }
    ],

    STORAGE_KEY: 'simulation_theme',
    dropdownActive: false,

    init() {
        // 创建 DOM 元素
        this.createThemeSwitcherUI();

        // 立即渲染选项列表
        this.renderThemeOptions();

        // 加载保存的主题（或直接使用 HTML 默认的 morandi）
        this.loadSavedTheme();

        // 绑定事件（必须调用！）
        this.bindEvents();
    },

    createThemeSwitcherUI() {
        const container = document.createElement('div');
        container.className = 'theme-switcher';
        container.innerHTML = `
            <div class="theme-switcher__dropdown">
                <button class="theme-switcher__button" type="button">
                    <span class="theme-switcher__text">主题</span>
                    <span class="theme-switcher__arrow">▼</span>
                </button>
                <div class="theme-switcher__options"></div>
            </div>
        `;
        document.body.appendChild(container);

        this.elements = {
            dropdown: container.querySelector('.theme-switcher__dropdown'),
            button: container.querySelector('.theme-switcher__button'),
            text: container.querySelector('.theme-switcher__text'),
            options: container.querySelector('.theme-switcher__options')
        };
    },

    renderThemeOptions() {
        const currentTheme = this.getCurrentThemeClass();
        this.elements.options.innerHTML = this.themes.map(theme => {
            const isActive = theme.class === currentTheme;
            return `
                <div class="theme-switcher__option ${isActive ? 'active' : ''}" data-theme="${theme.class}">
                    <span style="background-color: var(--theme-primary)"></span>
                    <span>${theme.name}</span>
                </div>
            `;
        }).join('');

        const activeTheme = this.themes.find(t => t.class === currentTheme);
        if (activeTheme) {
            this.elements.text.textContent = activeTheme.name;
        }
    },

    bindEvents() {
        // 切换下拉菜单
        this.elements.button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // 点击外部关闭
        document.addEventListener('click', () => {
            this.closeDropdown();
        });

        // 主题选项点击
        this.elements.options.addEventListener('click', (e) => {
            const option = e.target.closest('.theme-switcher__option');
            if (option) {
                const themeClass = option.dataset.theme;
                this.applyTheme(themeClass);
            }
        });
    },

    toggleDropdown() {
        this.dropdownActive = !this.dropdownActive;
        this.elements.dropdown.classList.toggle('active', this.dropdownActive);
    },

    closeDropdown() {
        this.dropdownActive = false;
        this.elements.dropdown.classList.remove('active');
    },

    getCurrentThemeClass() {
        const html = document.documentElement;
        return Array.from(html.classList).find(cls => cls.startsWith('theme-')) || '';
    },

    applyTheme(themeClass) {
        if (!themeClass) return;

        const html = document.documentElement;
        const themeLink = document.getElementById('active-theme');

        // 移除所有主题类
        this.themes.forEach(theme => {
            html.classList.remove(theme.class);
        });

        // 添加新主题类到 HTML
        html.classList.add(themeClass);

        // 更新 link 标签的 href
        if (themeLink) {
            themeLink.setAttribute('href', `../css/${themeClass}.css`);
        }

        // 保存偏好
        this.saveTheme(themeClass);

        // 更新 UI
        this.renderThemeOptions();
        this.closeDropdown();

        // 等待 CSS 加载完成（简单延时）
        setTimeout(() => {
            const event = new CustomEvent('themeChange', { detail: { theme: themeClass } });
            document.dispatchEvent(event);
            console.log('[Theme] themeChange dispatched');
        }, 50);

        console.log(`[Theme] Applied: ${themeClass}`);
    },

    loadSavedTheme() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved && this.themes.some(t => t.class === saved)) {
                this.applyTheme(saved);
            } else {
                // 默认主题（与 HTML 一致）
                this.applyTheme('theme-morandi');
            }
        } catch (error) {
            console.warn('[Theme] Load error:', error);
            this.applyTheme('theme-morandi');
        }
    },

    saveTheme(themeClass) {
        try {
            localStorage.setItem(this.STORAGE_KEY, themeClass);
        } catch (error) {
            console.warn('[Theme] Save error:', error);
        }
    },

    getCurrentTheme() {
        const themeClass = this.getCurrentThemeClass();
        return this.themes.find(t => t.class === themeClass) || null;
    }
};

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
    ThemeManager.init();
}
