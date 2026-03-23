/**
 * 餐厅打饭仿真系统 - 环境配置文件
 * 功能：抽离所有可配置项，支持开发/生产环境切换
 */
export const ENV = {
  // 环境标识：development/production
  mode: "development",
  // 后端接口基地址
  baseURL: "http://127.0.0.1:5000",
  // SocketIO连接地址
  socketURL: "http://127.0.0.1:5000",
  // 请求超时时间(ms)
  requestTimeout: 10000,
  // 图表响应式阈值（移动端宽度）
  mobileWidth: 768
};

// 生产环境配置覆盖
if (ENV.mode === "production") {
  ENV.baseURL = "https://prod-api.example.com"; // 替换为生产环境接口地址
  ENV.socketURL = "https://prod-socket.example.com"; // 替换为生产环境Socket地址
}