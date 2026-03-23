/**
 * 餐厅打饭仿真系统 - SocketIO实时通信
 * 适配点：1.引入环境配置 2.增强数据校验 3.添加重连逻辑 4.优化日志
 */
import { ENV } from "./config.js";

// 兼容性检查
if (!window.io) {
  throw new Error("未检测到SocketIO CDN，请先引入：<script src='https://cdn.socket.io/4.7.2/socket.io.min.js'></script>");
}

// 建立SocketIO连接：支持重连配置
export const socket = io("http://localhost:5000", {
  transports: ['polling'],  // 强制使用polling，避免websocket跨域
  withCredentials: true,    // 必须开启
  reconnection: true,       // 自动重连
  reconnectionAttempts: 5,  // 重连次数
  reconnectionDelay: 1000   // 重连间隔
});
// 全局标识：是否已建立Socket连接
export let isSocketConnected = false;

// 监听Socket连接成功事件
socket.on("connect", () => {
  console.log(`[SocketIO] 连接成功（ID：${socket.id}）`);
  isSocketConnected = true;
});

// 监听Socket断开连接事件
socket.on("disconnect", (reason) => {
  console.warn(`[SocketIO] 断开连接：${reason}`);
  isSocketConnected = false;
  // 重连失败提示
  if (reason === "reconnect_failed") {
    console.error("[SocketIO] 重连失败，请检查后端Socket服务");
  }
});

// 监听Socket连接错误事件
socket.on("connect_error", (error) => {
  console.error(`[SocketIO] 连接失败：${error.message}`);
  isSocketConnected = false;
});

/**
 * 实时仿真数据接收回调：对应后端simulation_data推送事件
 * 功能：接收后端实时数据，调用渲染函数更新图表
 * @param {object} data - 后端推送的实时数据
 * @param {array} data.window_people - 各窗口当前等待人数
 * @param {number} data.remaining_table - 剩余桌子数
 * @param {number} data.used_table - 已使用桌子数
 */
export const receiveSimulationData = (data) => {
  // 强化数据校验：避免非法数据导致图表崩溃
  if (!data) {
    console.error("[SocketIO] 实时数据为空");
    return;
  }
  if (!Array.isArray(data.window_people)) {
    console.error("[SocketIO] 窗口人数数据格式错误，需为数组：", data.window_people);
    return;
  }
  if (typeof data.used_table !== "number" || typeof data.remaining_table !== "number") {
    console.error("[SocketIO] 桌子数据格式错误，需为数字：", data);
    return;
  }

  // 确保渲染函数存在后再调用
  if (typeof window.updateWindowBarChart === "function") {
    window.updateWindowBarChart(data.window_people);
  }
  if (typeof window.updateTablePieChart === "function") {
    window.updateTablePieChart(data.used_table, data.remaining_table);
  }
};

// 监听后端simulation_data推送事件
socket.on("simulation_data", receiveSimulationData);