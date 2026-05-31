# 后端问题分析与解决方案文档

## 文档信息

| 项目 | 值 |
|------|------|
| **文档版本** | 1.0 |
| **创建日期** | 2026-05-31 |
| **适用范围** | 后端开发团队 |
| **关联系统** | 前端 HTML/JS、SQLite 数据库、DashScope AI API |

---

## 目录

1. [问题 1：时序竞争 - Socket.IO 房间绑定与仿真启动](#问题 1 时序竞争 -socketio-房间绑定与仿真启动)
2. [问题 2：CORS 跨域策略不一致](#问题 2cors-跨域策略不一致)
3. [问题 3：Socket.IO 传输层选择](#问题 3socketio-传输层选择)
4. [问题 4：端口配置不一致](#问题 4 端口配置不一致)
5. [问题 5：AI API 直连 CORS 限制](#问题 5ai-api-直连 cors-限制)
6. [问题 6：打饭速率精度丢失](#问题 6 打饭速率精度丢失)
7. [问题 7：仿真结束后的数据查询竞争](#问题 7 仿真结束后的数据查询竞争)
8. [问题 8：前端请求超时与后端处理时间不匹配](#问题 8 前端请求超时与后端处理时间不匹配)
9. [问题 9：数据库多线程并发访问](#问题 9 数据库多线程并发访问)

---

## 问题 1：时序竞争 - Socket.IO 房间绑定与仿真启动

### 问题描述

**具体表现**：
- 前端启动仿真后，第一秒的数据丢失
- 后端日志显示数据已 `emit`，但前端未收到
- 图表从第 2 秒或第 3 秒开始显示数据

**复现步骤**：
1. 启动后端服务：`python app.py`
2. 前端访问页面并启动仿真
3. 观察后端日志中的 `emit` 记录
4. 对比前端接收到的数据时间戳

**影响范围**：
- **影响模块**：`app.py`、`simulation.py`
- **影响功能**：实时数据推送完整性
- **影响程度**：中等（数据完整性受损）
- **用户感知**：轻微（图表起始点不完整）

### 根因分析

```
时间轴（问题场景）：
t0:  前端调用 /api/start-simulation
t1:  后端创建仿真记录（DB）
t2:  启动仿真线程（simulation.py）
t3:  仿真线程开始 emit 数据（每秒 1 次）
t4:  前端发送 bind_session 事件
t5:  服务端处理 bind_session，join_room 完成
t6:  数据推送到客户端

问题：t3 < t5，即 emit 开始早于房间绑定完成
```

**技术原因**：
1. `/api/start-simulation` API 直接调用 `simulation.start_simulation()`
2. 仿真线程启动后立即进入 `while` 循环，开始 `emit`
3. 前端的 `bind_session` 事件是异步的，可能晚于仿真启动
4. Socket.IO 的 `join_room` 需要时间处理（线程调度 + 网络往返）

### 解决方案

**方案 A：前端修复（已实施，推荐）**

前端在调用 API 之前先绑定房间，并等待 150ms。参见 `frontend-issues.md` 问题 1。

**方案 B：后端延迟启动（备选）**

**代码修改**：`app.py` → `start_simulation` 路由

```python
@app.route('/api/start-simulation', methods=['POST'])
def start_simulation():
    # ... 参数校验 ...
    
    session_id = params.get('session_id')
    if not session_id:
        import uuid
        session_id = str(uuid.uuid4())

    # ✅ 先创建仿真记录
    simulation_id = db.add_simulation(
        session_id=session_id,
        dining_time=params['dining_time'],
        meal_time=params['meal_time'],
        max_people=params['max_people'],
        window_num=params['window_num'],
        table_num=params['table_num'],
    )
    
    # ✅ 等待 200ms，确保前端已绑定房间
    # （仅当前端未实施"方案 A"时使用）
    time.sleep(0.2)
    
    # ✅ 再启动仿真线程
    simulation.start_simulation(
        session_id=session_id,
        # ... 参数 ...
    )
    
    return jsonify({'success': True, ...})
```

**实施步骤**：
1. 优先实施前端修复（方案 A）
2. 如果前端无法及时修复，临时使用后端延迟（方案 B）
3. 验证第一秒数据是否正确显示

**验证方法**：
1. 启动仿真
2. 观察后端日志：
   ```
   客户端 xxx 绑定 session: xxx
   仿真线程启动成功，SessionID：xxx，仿真 ID：xxx
   ```
3. 确认 `bind_session` 日志在 `仿真线程启动` 之前

### 交互影响

**需要与前端团队沟通**：
- ✅ 确认前端已实施"先绑定房间，再启动仿真"的逻辑
- ✅ 确认 150ms 延迟是否足够（可根据实际情况调整）
- ✅ 验证房间绑定完成的标志（日志或事件）

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 2：CORS 跨域策略不一致

### 问题描述

**具体表现**：
- 浏览器报 CORS 错误，API 请求失败
- 错误信息：`Access to fetch at '...' from origin '...' has been blocked by CORS policy`
- 前端无法调用任何 API

**复现步骤**：
1. 前端使用 `http://localhost:5001` 访问
2. 后端 CORS 配置仅包含 `http://127.0.0.1:5001`
3. 调用 `/api/start-simulation`
4. 浏览器拦截响应

**影响范围**：
- **影响模块**：`app.py`、`config.py`
- **影响功能**：所有 HTTP API、Socket.IO 连接
- **影响程度**：严重（系统完全不可用）
- **用户感知**：明显（所有操作失败）

### 根因分析

**技术原因**：
1. `127.0.0.1` 和 `localhost` 在 CORS 中被视为不同的 origin
2. `_is_allowed_origin()` 函数进行精确字符串匹配
3. `@app.after_request` 装饰器为未授权 origin 添加 CORS 头会导致浏览器拒绝
4. Socket.IO 的 CORS 验证独立于 Flask CORS

### 解决方案

**代码修改 1**：`config.py`

```python
# ✅ 同时支持 localhost 和 127.0.0.1，以及多种端口写法
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://127.0.0.1:5001,http://localhost:5001,http://localhost:5000,http://127.0.0.1:5000",
).split(",")
```

**代码修改 2**：`app.py` → `_get_allow_origin` 函数

```python
def _is_allowed_origin(origin):
    """检查 origin 是否在允许列表中（去掉末尾斜杠后匹配）。"""
    if not origin:
        return False
    for allowed in CORS_ALLOWED_ORIGINS:
        # ✅ 去掉末尾斜杠后匹配（兼容 http://example.com/ 和 http://example.com）
        if origin.rstrip('/') == allowed.rstrip('/'):
            return True
    return False

def _get_allow_origin(request_origin):
    """获取允许的 origin，若请求 origin 不在列表则返回 None。
    ✅ 修复：不再返回默认 origin，避免浏览器因 origin 不匹配而阻止响应。"""
    if request_origin and _is_allowed_origin(request_origin):
        return request_origin
    return None  # ✅ 未授权 origin 返回 None，不添加 CORS 头
```

**代码修改 3**：`app.py` → `add_cors_headers` 函数

```python
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if not origin:
        return response  # ✅ 非浏览器请求，不添加 CORS 头
    allowed = _get_allow_origin(origin)
    if not allowed:
        return response  # ✅ 未授权 origin，不添加 CORS 头
    response.headers['Access-Control-Allow-Origin'] = allowed
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-API-Token'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response
```

**代码修改 4**：`app.py` → Socket.IO CORS 配置

```python
def cors_allowed_origins_func(origin):
    return _is_allowed_origin(origin) if origin else False

socketio = SocketIO(
    app,
    cors_allowed_origins=cors_allowed_origins_func,  # ✅ 与 Flask CORS 保持一致
    async_mode='threading',
    ping_timeout=60,
    transports=['websocket', 'polling'],
)
```

**实施步骤**：
1. 修改 `config.py` 中的 `CORS_ALLOWED_ORIGINS`
2. 修改 `app.py` 中的 `_get_allow_origin` 函数
3. 修改 `add_cors_headers` 函数，未授权 origin 不添加 CORS 头
4. 配置 Socket.IO 的 `cors_allowed_origins`
5. 重启后端服务

**验证方法**：
1. 前端使用 `localhost` 和 `127.0.0.1` 分别测试
2. 在 Network 标签检查响应头：
   ```
   Access-Control-Allow-Origin: http://localhost:5001
   Access-Control-Allow-Credentials: true
   ```

### 交互影响

**需要与前端团队沟通**：
- ✅ 确认前端使用的 origin 地址（`localhost` 或 `127.0.0.1`）
- ✅ 确认前端 `baseURL` 和 `socketURL` 配置
- ✅ 如果前端地址变更，及时更新 `CORS_ALLOWED_ORIGINS`

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 3：Socket.IO 传输层选择

### 问题描述

**具体表现**：
- 某些网络环境下 WebSocket 连接失败
- 控制台显示 `transport close` 错误
- 实时数据无法推送

**复现步骤**：
1. 在企业网络环境（有代理或防火墙）下
2. 启动后端服务
3. 前端访问页面
4. 观察 Socket.IO 连接状态

**影响范围**：
- **影响模块**：`app.py`
- **影响功能**：实时数据推送
- **影响程度**：严重（实时通信失效）
- **用户感知**：明显（图表不更新）

### 根因分析

**技术原因**：
1. Socket.IO 默认优先使用 WebSocket
2. 企业代理/防火墙可能阻止 WebSocket 协议（`ws://` 或 `wss://`）
3. 如果未配置回退机制，连接会直接失败
4. HTTP long-polling 通常能穿透代理

### 解决方案

**代码修改**：`app.py` → SocketIO 初始化

```python
socketio = SocketIO(
    app,
    cors_allowed_origins=cors_allowed_origins_func,
    async_mode='threading',
    ping_timeout=60,
    # ✅ 同时支持 WebSocket 和 HTTP long-polling
    transports=['websocket', 'polling'],  # 优先 WebSocket，回退 polling
)
```

**实施步骤**：
1. 修改 `app.py` 中的 `SocketIO()` 初始化
2. 添加 `transports=['websocket', 'polling']` 配置
3. 重启后端服务
4. 测试 WebSocket 和 Polling 两种模式

**验证方法**：
1. 正常网络环境：观察是否使用 WebSocket
   - 后端日志：`transport: websocket`
2. 代理环境：强制禁用 WebSocket，观察是否回退到 Polling
   - 前端配置：`transports: ['polling']`
   - 后端日志：`transport: polling`

### 交互影响

**需要与前端团队沟通**：
- ✅ 确认前端 `socket.js` 配置了相同的 `transports` 选项
- ✅ 确认前端重连参数（`reconnectionAttempts`、`reconnectionDelay`）
- ✅ 验证连接状态监控逻辑

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 4：端口配置不一致

### 问题描述

**具体表现**：
- 前端请求全部失败：`ERR_CONNECTION_REFUSED`
- 后端日志显示服务运行在 `5001` 端口
- 前端尝试连接 `5000` 端口

**复现步骤**：
1. 后端启动：`python app.py`（默认端口 5001）
2. 前端配置为 `http://127.0.0.1:5000`
3. 访问页面，所有请求失败

**影响范围**：
- **影响模块**：`app.py`、`config.py`
- **影响功能**：所有网络请求
- **影响程度**：严重（系统完全不可用）
- **用户感知**：明显（页面无法访问）

### 根因分析

**技术原因**：
1. Windows 部分版本保留端口 5000（被系统占用）
2. 后端默认端口从 5000 改为 5001
3. 前端配置未同步更新
4. 端口不匹配导致连接被拒绝

### 解决方案

**代码修改**：`app.py` → 启动配置

```python
if __name__ == '__main__':
    # ✅ 通过环境变量支持自定义端口
    port = int(os.environ.get('FLASK_PORT', 5001))  # 默认 5001
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True,
    )
```

**实施步骤**：
1. 修改 `app.py` 中的端口配置，支持 `FLASK_PORT` 环境变量
2. 在文档中明确标注默认端口为 `5001`
3. 如果端口被占用，使用环境变量覆盖：
   ```bash
   set FLASK_PORT=8080 && python app.py
   ```
4. 通知前端团队更新配置

**验证方法**：
1. 启动后端，观察日志：
   ```
   Running on http://0.0.0.0:5001
   ```
2. 使用 `curl` 测试：
   ```bash
   curl http://127.0.0.1:5001/api/start-simulation -X POST ...
   ```

### 交互影响

**需要与前端团队沟通**：
- ✅ 通知前端团队后端默认端口为 `5001`
- ✅ 如果端口变更，及时通知前端更新配置
- ✅ 确认前端 `baseURL` 和 `socketURL` 与后端一致

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 5：AI API 直连 CORS 限制

### 问题描述

**具体表现**：
- 前端直接调用 DashScope API 时报 CORS 错误
- 错误信息：`Access to fetch at 'https://dashscope.aliyuncs.com/...' from origin '...' has been blocked by CORS policy`
- AI 分析功能不可用

**复现步骤**：
1. 前端配置 AI API 地址、Key 和模型名称
2. 仿真结束后点击"AI 分析"
3. 浏览器控制台显示 CORS 错误

**影响范围**：
- **影响模块**：`app.py`
- **影响功能**：AI 分析
- **影响程度**：中等（仅影响 AI 分析）
- **用户感知**：中等（高级功能不可用）

### 根因分析

**技术原因**：
1. DashScope（阿里云百炼）API 未对浏览器端请求开放 CORS 头
2. 浏览器的同源策略阻止跨域请求
3. 服务端（Python）发起请求不受 CORS 限制
4. 需要后端作为代理转发请求

### 解决方案

**代码修改**：`app.py` → 添加代理端点

```python
@app.route('/api/ai-analyze', methods=['POST'])
def ai_analyze():
    """后端代理转发 AI 分析请求，避免浏览器端 CORS 限制。"""
    if not _check_auth():
        return _auth_error()
    
    try:
        body = request.get_json()
        api_url = body.get('api_url')
        api_key = body.get('api_key')
        payload = body.get('payload')

        # ✅ 构建请求
        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            },
        )

        # ✅ 发送请求（超时 60 秒）
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        return jsonify({
            'success': True,
            'msg': 'AI 分析成功',
            'data': result,
        })
    except urllib.error.HTTPError as e:
        logger.error(f"AI API HTTP 错误：{e.code} - {e.reason}")
        return jsonify({
            'success': False,
            'msg': f'AI API 返回错误：{e.code}',
            'data': None,
        }), 502
    except urllib.error.URLError as e:
        logger.error(f"AI API 网络错误：{e.reason}")
        return jsonify({
            'success': False,
            'msg': '无法连接 AI API',
            'data': None,
        }), 503
    except Exception as e:
        logger.error(f"AI 分析错误：{e}")
        return jsonify({
            'success': False,
            'msg': str(e),
            'data': None,
        }), 500
```

**实施步骤**：
1. 在 `app.py` 中添加 `/api/ai-analyze` 路由
2. 使用 `urllib.request` 转发请求到 DashScope API
3. 设置超时时间为 60 秒（防止长时间等待）
4. 添加错误处理（HTTP 错误、网络错误、通用错误）
5. 通知前端团队调用新端点

**验证方法**：
1. 配置 AI API 信息
2. 调用 `/api/ai-analyze` 端点
3. 检查是否返回 AI 分析结果

### 交互影响

**需要与前端团队沟通**：
- ✅ 通知前端团队新增 `/api/ai-analyze` 代理端点
- ✅ 确认前端调用方式（传递 `api_url`、`api_key`、`payload`）
- ✅ 确认超时时间（60 秒）是否满足需求

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 6：打饭速率精度丢失

### 问题描述

**具体表现**：
- 当 `meal_time > 1` 时，窗口永远无法完成打饭
- 窗口队列人数只增不减
- 顾客无法分配到桌子

**复现步骤**：
1. 设置 `meal_time = 5`（秒/人）
2. 启动仿真
3. 观察窗口队列人数
4. 发现人数持续增加，无人完成打饭

**影响范围**：
- **影响模块**：`simulation.py`
- **影响功能**：仿真核心逻辑
- **影响程度**：严重（仿真逻辑错误）
- **用户感知**：明显（仿真结果不符合预期）

### 根因分析

**技术原因**：
1. 旧代码使用 `round(1/meal_time)` 计算每秒打饭人数
2. 当 `meal_time = 5` 时，`1/5 = 0.2`，`round(0.2) = 0`
3. 每秒处理 0 人，导致队列永远不减少
4. Python 的 `round()` 函数对小于 0.5 的值舍入为 0

**错误代码示例**：

```python
# ❌ 错误：round(1/5) = 0
processed = round(1 / meal_time)
window_people[i] -= processed
```

### 解决方案

**代码修改**：`simulation.py` → `_simulation_loop` 函数

```python
# ✅ 使用浮点累计器，不再用 round(1/meal_time)
window_accumulator = [0.0] * window_num

# 在仿真主循环中：
for i in range(window_num):
    if window_people[i] > 0 and meal_time > 0:
        # ✅ 每秒累加（浮点数）
        window_accumulator[i] += 1.0 / meal_time
        
        # ✅ 整数部分 = 可完成的人数
        processed = int(window_accumulator[i])
        
        if processed > 0:
            # ✅ 限制处理人数不超过队列人数
            processed = min(processed, window_people[i])
            
            # ✅ 更新队列和等待桌子的人数
            window_people[i] -= processed
            waiting_for_table += processed
            
            # ✅ 减去已处理的整数部分，保留小数部分
            window_accumulator[i] -= processed
```

**实施步骤**：
1. 在 `_simulation_loop` 函数中初始化 `window_accumulator`
2. 修改打饭处理逻辑，使用浮点累计器
3. 移除 `round(1/meal_time)` 计算
4. 添加测试用例验证 `meal_time > 1` 的场景

**验证方法**：
1. 设置 `meal_time = 5`
2. 启动仿真
3. 观察窗口队列人数是否减少
4. 检查日志中的 `processed` 值是否正确

**测试用例**：

```python
# tests/test_simulation.py
def test_meal_time_precision():
    """测试 meal_time > 1 时打饭逻辑正常。"""
    # 设置 meal_time = 5（秒/人）
    # 运行 10 秒
    # 预期：每个窗口应完成 2 人（10 / 5 = 2）
    pass
```

### 交互影响

**需要与前端团队沟通**：
- ✅ 通知前端团队仿真逻辑已修复
- ✅ 确认前端图表显示是否符合预期

**需要与数据库团队沟通**：
- ⚠️ 无直接交互影响

---

## 问题 7：仿真结束后的数据查询竞争

### 问题描述

**具体表现**：
- 结束仿真时，API 返回错误：`无运行中的仿真且未找到历史数据`
- 后端日志显示仿真已结束（`status = 1`）
- 但查询仿真信息时返回 `None`

**复现步骤**：
1. 启动仿真并运行一段时间
2. 点击"结束仿真"
3. 观察后端日志
4. 发现 `get_current_simulation` 返回 `None`

**影响范围**：
- **影响模块**：`app.py`、`simulation.py`、`database.py`
- **影响功能**：结束仿真、趋势数据、评价生成
- **影响程度**：严重（无法获取仿真结果）
- **用户感知**：明显（结果页面为空）

### 根因分析

**技术原因**：
1. `/api/end-simulation` 流程：
   - 调用 `stop_simulation()` → 设置 `status = 1`
   - 调用 `get_current_simulation()` → 查询 `status = 0` 的记录
   - 返回 `None`（因为状态已变为 1）
2. `get_current_simulation()` 的 SQL 查询包含 `AND status = 0` 条件
3. 仿真结束后状态变为 1，导致后续查询失败

**错误流程**：

```python
# ❌ 错误：先停止，再查询
simulation_id = simulation.stop_simulation(session_id)  # status 变为 1
sim_info = simulation.get_current_simulation(session_id)  # 返回 None（查 status=0）
```

### 解决方案

**代码修改**：`app.py` → `end_simulation` 路由

```python
@app.route('/api/end-simulation', methods=['POST'])
def end_simulation():
    # ... 参数校验 ...
    
    session_id = data.get('session_id')
    
    # ✅ 步骤 1：停止前先获取仿真信息
    sim_info = simulation.get_current_simulation(session_id)
    if not sim_info:
        # ✅ 回退：查询最新记录（不限制 status）
        sim_info = db.get_simulation_info_by_session(session_id)
    
    window_num = sim_info.get('window_num', 4) if sim_info else 4
    table_num = sim_info.get('table_num', 100) if sim_info else 100
    
    # ✅ 步骤 2：再停止仿真
    simulation_id = simulation.stop_simulation(session_id)
    
    # ✅ 步骤 3：兜底查询（如果 stop_simulation 返回 None）
    if not simulation_id:
        sim_info_full = db.get_simulation_info_by_session(session_id)
        if sim_info_full:
            simulation_id = sim_info_full.get('id')
    
    if not simulation_id:
        return jsonify({
            'success': False,
            'msg': '无运行中的仿真且未找到历史数据',
            'data': None,
        })
    
    # ✅ 步骤 4：查询仿真数据
    sim_data = simulation.get_simulation_data(simulation_id)
    
    # ... 后续处理 ...
```

**数据库修改**：`database.py` → `get_simulation_info_by_session` 函数

```python
def get_simulation_info_by_session(self, session_id):
    """根据 session_id 获取仿真信息（不限制 status）。
    ✅ 按 id DESC 获取最新记录。"""
    cursor = self.conn.cursor()
    cursor.execute(
        """SELECT id, session_id, dining_time, meal_time, max_people, 
                  window_num, table_num, start_time, end_time, status
           FROM simulation_info 
           WHERE session_id = ? 
           ORDER BY id DESC 
           LIMIT 1""",
        (session_id,),
    )
    row = cursor.fetchone()
    if row:
        return {
            'id': row[0],
            'session_id': row[1],
            # ... 其他字段 ...
        }
    return None
```

**实施步骤**：
1. 修改 `app.py` 中的 `end_simulation` 路由
2. 在停止前先查询仿真信息
3. 添加兜底查询逻辑（从 `db` 或 `self.simulation_ids` 获取）
4. 修改 `database.py` 中的查询函数，不限制 `status`
5. 添加测试用例验证结束流程

**验证方法**：
1. 启动仿真并运行一段时间
2. 结束仿真
3. 检查返回数据是否包含 `window_trend` 和 `table_trend`
4. 验证评价文本是否正确生成

### 交互影响

**需要与前端团队沟通**：
- ✅ 确认结束仿真 API 返回的数据结构
- ✅ 确认趋势数据（`window_trend`、`table_trend`）格式
- ✅ 验证评价文本（`window_eval`、`table_eval`）内容

**需要与数据库团队沟通**：
- ✅ 确认 `get_simulation_info_by_session` 查询逻辑
- ✅ 确认 `status` 字段的含义（0=运行中，1=已结束）
- ✅ 验证查询性能（按 `session_id` 和 `id DESC` 索引）

---

## 问题 8：前端请求超时与后端处理时间不匹配

### 问题描述

**具体表现**：
- 结束仿真时，前端报超时错误
- 仿真运行时间越长，超时概率越高
- AI 分析请求偶尔超时（超过 60 秒）

**复现步骤**：
1. 启动仿真并运行 30 分钟
2. 结束仿真
3. 观察后端处理时间
4. 发现超过 10 秒后前端断开连接

**影响范围**：
- **影响模块**：`app.py`
- **影响功能**：结束仿真、AI 分析
- **影响程度**：中等（长时仿真受影响）
- **用户感知**：中等（偶尔遇到）

### 根因分析

**技术原因**：
1. 前端默认超时 10 秒（`requestTimeout: 10000`）
2. `/api/end-simulation` 包含数据库查询，数据量大时耗时增加
3. 仿真运行时间越长，数据库中的数据越多（每秒 1 条记录）
4. AI 代理超时 60 秒，复杂分析可能超时

### 解决方案

**方案 A：优化后端查询性能（推荐）**

**代码修改**：`app.py` → `end_simulation` 路由

```python
# ✅ 限制查询的数据量（仅查询最近 1000 条）
sim_data = db.get_simulation_data(simulation_id, limit=1000)

# ✅ 或者分页查询
all_data = []
offset = 0
batch_size = 500
while True:
    batch = db.get_simulation_data(simulation_id, limit=batch_size, offset=offset)
    if not batch:
        break
    all_data.extend(batch)
    offset += batch_size
```

**方案 B：增加后端处理超时时间**

```python
# ✅ 在 urllib.request.urlopen 中增加超时
with urllib.request.urlopen(req, timeout=120) as resp:  # 从 60 秒增加到 120 秒
    result = json.loads(resp.read().decode('utf-8'))
```

**方案 C：异步处理（复杂，不推荐）**

- 使用 Celery 或 RQ 进行异步任务处理
- 前端轮询任务状态
- 任务完成后通知前端

**实施步骤**：
1. 评估典型仿真时长和数据量
2. 优化数据库查询（添加索引、限制查询量）
3. 如果查询仍然慢，增加超时时间
4. 通知前端团队调整超时配置

**验证方法**：
1. 启动仿真并运行不同时长（5 分钟、15 分钟、30 分钟）
2. 结束仿真，记录处理时间
3. 确认处理时间在可接受范围内

### 交互影响

**需要与前端团队沟通**：
- ✅ 确认前端超时配置（`requestTimeout`）
- ✅ 确认典型仿真时长和数据量
- ✅ 讨论是否需要异步处理

**需要与数据库团队沟通**：
- ✅ 确认数据库查询性能
- ✅ 添加索引优化查询（`simulation_id`、`time_step`）
- ✅ 验证大数据量下的查询耗时

---

## 问题 9：数据库多线程并发访问

### 问题描述

**具体表现**：
- 偶尔出现 `database is locked` 错误
- 仿真线程写入数据时，API 读取失败
- 高并发场景下（多个仿真同时运行）错误率增加

**复现步骤**：
1. 同时启动多个仿真（如 5 个）
2. 每个仿真每秒写入一次数据
3. 同时调用 API 查询数据
4. 观察后端日志中的 `database is locked` 错误

**影响范围**：
- **影响模块**：`database.py`、`simulation.py`
- **影响功能**：数据读写
- **影响程度**：中等（偶发错误）
- **用户感知**：轻微（偶尔失败）

### 根因分析

**技术原因**：
1. SQLite 默认不支持多线程并发写入
2. 仿真线程每秒写入一次数据
3. Flask 主线程在 API 调用时读取数据
4. 多个仿真同时运行时，写入冲突概率增加

### 解决方案

**代码修改**：`database.py` → 数据库连接配置

```python
import sqlite3

class SimulationDatabase:
    def __init__(self, db_path='database.db'):
        self.db_path = db_path
        # ✅ 允许 SQLite 多线程访问
        self.conn = sqlite3.connect(
            self.db_path,
            check_same_thread=False,  # ✅ 关键配置
            timeout=30,  # ✅ 等待锁超时时间（秒）
        )
        self.conn.execute('PRAGMA journal_mode=WAL')  # ✅ 启用 WAL 模式
        self._init_tables()
```

**解释**：
- `check_same_thread=False`：允许多个线程使用同一个连接
- `timeout=30`：等待锁的超时时间（默认 5 秒）
- `PRAGMA journal_mode=WAL`：启用 Write-Ahead Logging 模式，支持一写多读

**实施步骤**：
1. 修改 `database.py` 中的 `sqlite3.connect()` 配置
2. 添加 `check_same_thread=False` 和 `timeout=30`
3. 启用 WAL 模式
4. 测试高并发场景（多个仿真同时运行）

**验证方法**：
1. 同时启动 5 个仿真
2. 观察后端日志是否有 `database is locked` 错误
3. 验证数据完整性（无丢失、无重复）

### 交互影响

**需要与前端团队沟通**：
- ✅ 通知前端团队数据库并发问题已修复
- ✅ 确认高并发场景下的用户体验

**需要与数据库团队沟通**：
- ✅ 确认 SQLite 的 WAL 模式是否满足需求
- ✅ 评估生产环境迁移到 PostgreSQL 的必要性
- ✅ 讨论索引优化和查询优化方案

---

## 后端联调检查清单

在前后端联调时，后端团队应按以下清单逐项检查：

| # | 检查项 | 预期结果 | 负责人 |
|---|--------|----------|--------|
| 1 | 端口配置 | 服务启动在 5001 端口（或环境变量指定端口） | 后端 |
| 2 | CORS 配置 | `CORS_ALLOWED_ORIGINS` 包含 `localhost` 和 `127.0.0.1` | 后端 |
| 3 | Socket.IO 配置 | `transports=['websocket', 'polling']` | 后端 + 前端 |
| 4 | 时序竞争 | `bind_session` 日志在仿真启动之前 | 后端 + 前端 |
| 5 | 房间绑定 | 日志显示 `客户端 xxx 绑定 session: xxx` | 后端 |
| 6 | 仿真线程 | 日志显示 `仿真线程启动成功` | 后端 |
| 7 | 数据推送 | 每秒 `emit` 一次数据，无 `database is locked` 错误 | 后端 |
| 8 | 结束仿真 | API 返回趋势数据和评价，无查询竞争 | 后端 |
| 9 | AI 代理 | `/api/ai-analyze` 正常转发请求，无 CORS 错误 | 后端 + 前端 |
| 10 | 数据库并发 | 高并发场景下无 `database is locked` 错误 | 后端 |

---

## 附录：后端关键文件清单

| 文件路径 | 功能描述 | 关联问题 |
|----------|----------|----------|
| `app.py` | Flask 主入口、HTTP API、SocketIO 事件、CORS 策略 | 问题 1-5、7-9 |
| `config.py` | 全局配置（端口、阈值、正态分布参数、CORS_ORIGINS） | 问题 2、4 |
| `simulation.py` | 仿真核心引擎（线程管理、仿真循环、数据推送） | 问题 1、6、7 |
| `database.py` | SQLite 数据库模块（单例模式、数据读写） | 问题 7、9 |

---

## 文档修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|----------|--------|
| 1.0 | 2026-05-31 | 初始版本，基于 frontend-integration.md 整理 | - |
