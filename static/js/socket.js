/**
 * 餐厅打饭仿真系统 - SocketIO实时通信
 * 功能：建立Socket连接，监听后端simulation_data事件，接收实时仿真数据
 * 依赖：SocketIO CDN，全局暴露socket实例和receiveSimulationData回调
 * 通信规范：严格遵循后端SocketIO推送格式，事件名固定为simulation_data
 */

// 建立SocketIO连接：联调时修改为后端实际地址（如io("http://127.0.0.1:5000")）
export const socket = io("http://127.0.0.1:5000");
// 全局标识：是否已建立Socket连接
export let isSocketConnected = false;

// 监听Socket连接成功事件
socket.on("connect", () => {
    console.log("SocketIO连接成功，连接ID：", socket.id);
    isSocketConnected = true;
});

// 监听Socket断开连接事件
socket.on("disconnect", (reason) => {
    console.log("SocketIO断开连接，原因：", reason);
    isSocketConnected = false;
});

// 监听Socket连接错误事件
socket.on("connect_error", (error) => {
    console.error("SocketIO连接失败：", error);
    isSocketConnected = false;
});

/**
 * 实时仿真数据接收回调：对应后端simulation_data推送事件
 * 功能：接收后端实时数据，调用index.js中的渲染函数更新图表
 * @param {object} data - 后端推送的实时数据，格式与文档完全一致
 * @param {array} data.window_people - 各窗口当前等待人数
 * @param {number} data.remaining_table - 剩余桌子数
 * @param {number} data.used_table - 已使用桌子数
 */
export const receiveSimulationData = (data) => {
    if (!data || !Array.isArray(data.window_people)) {
        console.error("实时仿真数据格式异常：", data);
        return;
    }
    // 调用index.js中的渲染函数（全局挂载，确保跨文件调用）
    window.updateWindowBarChart(data.window_people);
    window.updateTablePieChart(data.used_table, data.remaining_table);
};

// 监听后端simulation_data推送事件，触发回调
socket.on("simulation_data", receiveSimulationData);