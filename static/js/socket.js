/**
 * @fileoverview 餐厅仿真系统 Socket.IO 实时通信模块。
 * 处理连接管理、数据接收和重连逻辑。
 */

import {ENV} from './config.js';

/**
 * 检查 Socket.IO 库是否可用。
 */
if (!window.io) {
  throw new Error(
      '未检测到 Socket.IO CDN。' +
      '请引入：<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>',
  );
}

/**
 * 建立 Socket.IO 连接，配置重连参数。
 * @const {!Object}
 */
export const socket = io(ENV.socketURL, {
  transports: ['websocket', 'polling'],
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

/**
 * 全局标志，表示 Socket 连接是否已建立。
 * @type {boolean}
 */
export let isSocketConnected = false;

/**
 * 接收到的仿真数据包计数器（用于调试）。
 * @type {number}
 */
let simulationDataCount = 0;

/**
 * 处理 Socket 连接成功事件。
 */
socket.on('connect', () => {
  console.log(`[SocketIO] 已连接（ID：${socket.id}）`);
  isSocketConnected = true;
});

/**
 * 处理 Socket 断开连接事件。
 *
 * @param {string} reason - 断开连接的原因。
 */
socket.on('disconnect', (reason) => {
  console.warn(`[SocketIO] 已断开连接：${reason}`);
  isSocketConnected = false;

  if (reason === 'reconnect_failed') {
    console.error('[SocketIO] 重连失败。请检查后端 Socket 服务。');
  }
});

/**
 * 处理 Socket 连接错误事件。
 *
 * @param {!Error} error - 连接错误。
 */
socket.on('connect_error', (error) => {
  console.error(`[SocketIO] 连接错误：${error.message}`);
  isSocketConnected = false;
});

/**
 * 接收后端实时仿真数据。
 * 校验数据格式后通过 CustomEvent 通知图表模块更新。
 *
 * @param {!Object} data - 后端发送的实时数据。
 * @param {!Array<number>} data.window_people - 各窗口等待人数。
 * @param {number} data.remaining_table - 剩余桌子数量。
 * @param {number} data.used_table - 已使用桌子数量。
 */
export function receiveSimulationData(data) {
  if (!data) {
    console.error('[SocketIO] 实时数据为空。');
    return;
  }

  if (!Array.isArray(data.window_people)) {
    console.error(
        '[SocketIO] 窗口人数数据格式无效。期望为数组：',
        data.window_people,
    );
    return;
  }

  if (
    typeof data.used_table !== 'number' ||
    typeof data.remaining_table !== 'number'
  ) {
    console.error(
        '[SocketIO] 桌子数据格式无效。期望为数字：',
        data,
    );
    return;
  }

  // 🔍 添加调试日志：在控制台显示收到的实时数据
  simulationDataCount++;
  console.log(
      `[SocketIO] ✅ 收到实时数据 #${simulationDataCount} |`,
      '时间戳:', new Date().toLocaleTimeString(),
      '| 窗口人数:', JSON.stringify(data.window_people),
      '| 已用桌子:', data.used_table,
      '| 剩余桌子:', data.remaining_table,
  );

  // 通过 CustomEvent 通知核心模块，解除全局函数耦合
  window.dispatchEvent(new CustomEvent('simulation:data', {
    detail: {
      windowPeople: data.window_people,
      usedTable: data.used_table,
      remainingTable: data.remaining_table,
    },
  }));
}

/**
 * 监听后端的 simulation_data 事件。
 */
socket.on('simulation_data', receiveSimulationData);
