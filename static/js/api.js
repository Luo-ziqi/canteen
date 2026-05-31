/**
 * @fileoverview 餐厅仿真系统 API 接口封装模块。
 * 提供基于 fetch 的请求处理，包含超时控制、JSON 校验和错误处理。
 */

import {ENV} from './config.js';

/**
 * 检查 Fetch API 兼容性。
 */
if (!window.fetch) {
  console.warn(
      '当前浏览器不支持 Fetch API。' +
      '请引入 polyfill（例如 whatwg-fetch）。',
  );
}

/**
 * 封装 POST 请求，包含超时、JSON 格式和错误处理。
 *
 * @param {string} url - API 接口路径。
 * @param {!Object} data - POST 请求体数据。
 * @return {!Promise<!Object>} 响应数据。
 */
function fetchPost(url, data = {}) {
  const timeoutPromise = new Promise((resolve, reject) => {
    setTimeout(() => {
      reject(
          new Error(
              `请求超时（${ENV.requestTimeout / 1000}秒）。` +
              '请检查后端服务是否正常运行。',
          ),
      );
    }, ENV.requestTimeout);
  });

  const postData =
      typeof data === 'object' && !Array.isArray(data) ? data : {};

  const fetchPromise =
      fetch(`${ENV.baseURL}${url}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json;charset=utf-8'},
        body: JSON.stringify(postData),
        credentials: 'include',
      })
          .then((response) => {
            if (!response.ok) {
              return Promise.reject(
                  new Error(`请求失败，状态码：${response.status}`),
              );
            }
            return response.text().then((text) => {
              try {
                return JSON.parse(text);
              } catch (e) {
                return Promise.reject(
                    new Error(`非 JSON 格式响应：${text}`),
                );
              }
            });
          });

  return Promise.race([timeoutPromise, fetchPromise]);
}

/**
 * 启动仿真，调用后端 /api/start-simulation 接口。
 *
 * @param {!Object} params - 仿真参数。
 * @param {number} params.dining_time - 平均就餐时间（分钟）。
 * @param {number} params.meal_time - 平均出餐时间（秒/人）。
 * @param {number} params.max_people - 每分钟最大进入人数。
 * @param {number} params.window_num - 窗口数量（>=1）。
 * @param {number} params.table_num - 桌子数量（>=1）。
 * @return {!Promise<!Object>} 后端响应。
 */
export function startSimulation(params) {
  return fetchPost('/api/start-simulation', params).catch((error) => {
    console.error('启动仿真失败：', error);
    return Promise.reject(error);
  });
}

/**
 * 结束仿真，调用后端 /api/end-simulation 接口。
 * 后端通过 session 标识仿真实例。
 *
 * @param {!Object} data - 请求数据，包含 session_id。
 * @return {!Promise<!Object>} 后端响应，包含趋势数据和评估结果。
 */
export function endSimulation(data) {
  return fetchPost('/api/end-simulation', data).catch((error) => {
    console.error('结束仿真失败：', error);
    return Promise.reject(error);
  });
}
