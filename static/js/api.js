/**
 * 餐厅打饭仿真系统 - API接口封装
 * 功能：封装启动仿真/结束仿真的POST请求，统一异常处理，返回Promise
 * 依赖：无，纯原生Fetch API，可独立运行
 * 接口规范：严格遵循后端/api/start-simulation、/api/end-simulation定义
 */

// 接口基地址：联调时修改为后端实际地址（如http://127.0.0.1:5000）
const BASE_URL = "http://127.0.0.1:5000";
// 请求超时时间：10秒
const REQUEST_TIMEOUT = 10000;

/**
 * 封装Fetch请求：添加超时、JSON格式、异常处理
 * @param {string} url - 接口路径
 * @param {object} data - POST请求体
 * @returns {Promise} - 请求结果Promise
 */
const fetchPost = (url, data = {}) => {
    // 超时处理：Promise.race实现
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("请求超时，请检查后端服务是否正常")), REQUEST_TIMEOUT);
    });
    // 实际Fetch请求
    const fetchPromise = fetch(`${BASE_URL}${url}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json;charset=utf-8"
        },
        body: JSON.stringify(data),
        credentials: "same-origin" // 携带Cookie，适配后端session识别仿真实例
    }).then(response => {
        // 处理4xx/5xx后端状态码
        if (!response.ok) {
            return Promise.reject(new Error(`接口请求失败，状态码：${response.status}`));
        }
        return response.json();
    });
    // 超时与请求竞争
    return Promise.race([timeoutPromise, fetchPromise]);
};

/**
 * 启动仿真接口：调用后端/api/start-simulation
 * @param {object} params - 仿真参数，与后端要求一致
 * @param {number} params.dining_time - 平均用餐时间(分钟)，非负整数
 * @param {number} params.meal_time - 平均打饭时间(秒/人)，非负整数
 * @param {number} params.max_people - 每分钟最大进入人数，非负整数
 * @param {number} params.window_num - 窗口数，≥1整数
 * @param {number} params.table_num - 桌子数，≥1整数
 * @returns {Promise} - 后端响应结果
 */
export const startSimulation = (params) => {
    return fetchPost("/api/start-simulation", params)
        .catch(error => {
            console.error("启动仿真接口异常：", error);
            return Promise.reject(error);
        });
};

/**
 * 结束仿真接口：调用后端/api/end-simulation
 * 无入参：后端通过session识别当前运行的仿真实例
 * @returns {Promise} - 后端响应结果（含仿真趋势数据和评价）
 */
export const endSimulation = () => {
    return fetchPost("/api/end-simulation")
        .catch(error => {
            console.error("结束仿真接口异常：", error);
            return Promise.reject(error);
        });
};