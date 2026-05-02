/**
 * 餐厅打饭仿真系统 - API接口封装
 * 适配点：1.引入环境配置 2.补充fetch Polyfill提示 3.增强数据校验 4.统一错误格式
 */
import { ENV } from "./config.js";

// 兼容性提示：低版本浏览器需引入fetch Polyfill
if (!window.fetch) {
  console.warn("当前浏览器不支持Fetch API，请引入polyfill（如whatwg-fetch）");
}

/**
 * 封装Fetch请求：添加超时、JSON格式、异常处理
 * @param {string} url - 接口路径
 * @param {object} data - POST请求体
 * @returns {Promise} - 请求结果Promise
 */
const fetchPost = (url, data = {}) => {
  // 超时处理：Promise.race实现
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`请求超时（${ENV.requestTimeout/1000}秒），请检查后端服务是否正常`));
    }, ENV.requestTimeout);
  });

  // 数据校验：确保data为纯对象
  const postData = typeof data === "object" && !Array.isArray(data) ? data : {};

  // 实际Fetch请求
  const fetchPromise = fetch(`${ENV.baseURL}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8"
    },
    body: JSON.stringify(postData),
    credentials: "include" // 携带Cookie，适配后端session识别仿真实例
  }).then(response => {
    // 处理4xx/5xx后端状态码
    if (!response.ok) {
      return Promise.reject(new Error(`接口请求失败，状态码：${response.status}`));
    }
    // 兼容后端返回非JSON格式的情况
    return response.text().then(text => {
      try {
        return JSON.parse(text);
      } catch (e) {
        return Promise.reject(new Error(`接口返回非JSON格式：${text}`));
      }
    });
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
export const endSimulation = (data) => {
  return fetchPost("/api/end-simulation", data)
    .catch(error => {
      console.error("结束仿真接口异常：", error);
      return Promise.reject(error);
    });
};