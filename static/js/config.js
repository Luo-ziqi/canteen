/**
 * @fileoverview 餐厅仿真系统环境配置模块。
 * 提取所有可配置项，支持开发/生产模式切换。
 */

/**
 * 环境配置对象。
 * @const {!Object}
 */
export const ENV = {
  /** @type {string} 环境标识：development 或 production。 */
  mode: 'development',

  /** @type {string} 后端 API 基础 URL。 */
  baseURL: 'http://127.0.0.1:5001',

  /** @type {string} Socket.IO 连接 URL。 */
  socketURL: 'http://127.0.0.1:5001',

  /** @type {number} 请求超时时间（毫秒）。 */
  requestTimeout: 10000,

  /** @type {number} 移动端响应式断点（宽度像素值）。 */
  mobileWidth: 768,
};

/**
 * 生产环境配置覆盖。
 */
if (ENV.mode === 'production') {
  ENV.baseURL = 'https://prod-api.example.com';
  ENV.socketURL = 'https://prod-socket.example.com';
}
