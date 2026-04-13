# 餐厅排队及打饭仿真系统修改说明

## 1. 现有系统分析

### 1.1 系统架构概述

当前系统采用 **Flask + SocketIO** 架构，实现了一个餐厅排队打饭的实时仿真系统。系统由以下核心模块组成：

```
┌─────────────────────────────────────────────────────┐
│                    前端 (HTML/JS)                    │
│              接收实时数据，渲染图表和动画              │
└────────────────────┬────────────────────────────────┘
                     │ WebSocket (SocketIO)
┌────────────────────▼────────────────────────────────┐
│              Flask 后端 (app.py)                     │
│         HTTP API + SocketIO 实时通信                  │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌──────────────────┐    ┌──────────────────┐
│ simulation.py    │    │ database.py      │
│ 仿真逻辑核心      │    │ SQLite 数据存储   │
│ - 仿真线程管理    │    │ - 仿真信息表      │
│ - 排队模型       │    │ - 仿真数据表      │
│ - 桌子分配       │    │ - 数据持久化      │
└──────────────────┘    └──────────────────┘
        │
        ▼
┌──────────────────┐
│ config.py        │
│ 全局配置参数      │
└──────────────────┘
```

### 1.2 核心模块功能

#### **app.py** - Flask 应用主入口
- 初始化 Flask 应用和 SocketIO
- 配置 CORS 跨域策略（允许 `:5000` 端口的所有请求）
- 提供 HTTP API：
  - `/api/start-simulation`：启动仿真
  - `/api/end-simulation`：结束仿真
- SocketIO 事件处理：
  - `bind_session`：客户端绑定 session
- 当前实现：仿真逻辑直接在 `app.py` 中通过 `simulation_loop` 函数实现（需迁移至 `simulation.py`）

#### **config.py** - 配置文件
- **Flask 配置**：秘钥、端口（5000）、调试模式
- **数据库配置**：SQLite 路径（`database.db`）
- **SocketIO 配置**：CORS 策略、消息队列
- **仿真参数**：
  - `SIMULATION_TIME_STEP = 1` 秒（仿真步长）
  - `WINDOW_EVAL_THRESHOLD = 20`（窗口排队评价阈值）
  - `TABLE_EVAL_THRESHOLD = 0.8`（桌子占用评价阈值）
- **日志配置**：级别、格式

#### **database.py** - 数据库模块
- **表结构**：
  - `simulation_info`：仿真信息表（session_id、参数、状态、时间等）
  - `simulation_data`：仿真数据表（时间步长、窗口人数、桌子状态等）
- **核心方法**：
  - `add_simulation()`：新增仿真实例
  - `get_current_simulation()`：查询运行中的仿真
  - `end_simulation()`：结束仿真
  - `add_simulation_data()`：插入实时数据
  - `get_simulation_data()`：查询历史数据（用于图表）

#### **simulation.py** - 仿真核心模块
- **仿真管理器** `RestaurantSimulation`：
  - `start_simulation()`：启动仿真线程，初始化数据库
  - `_simulation_loop()`：仿真主循环（每秒执行一次）
  - `stop_simulation()`：停止仿真，清理资源
  - `calculate_evaluation()`：计算体验评价
- **当前仿真逻辑**：
  1. 初始化窗口排队人数、桌子状态
  2. 每秒模拟新进入人数（均匀分布随机）
  3. 分配新人数到窗口（负载均衡）
  4. 模拟窗口打饭处理
  5. 分配桌子给用餐者
  6. 推送实时数据到前端并存入数据库

### 1.3 仿真流程

```
启动仿真 (POST /api/start-simulation)
    │
    ▼
生成 session_id
    │
    ▼
启动仿真线程 (simulation.py)
    │
    ▼
数据库记录仿真信息 (simulation_info 表)
    │
    ▼
仿真循环 (_simulation_loop)
    ├── 每秒生成新进入人数
    ├── 分配到窗口排队
    ├── 模拟打饭处理
    ├── 分配桌子
    ├── 推送数据到前端 (SocketIO emit)
    └── 存储数据到数据库 (simulation_data 表)
    │
    ▼
结束仿真 (POST /api/end-simulation)
    │
    ▼
停止线程，更新数据库状态
    │
    ▼
计算评价，返回结果
```

---

## 2. 需求实现方案

### 2.1 餐厅窗口排队数正态分布实现方案

#### **2.1.1 数学模型**

当前系统使用 **均匀分布** 生成新进入人数：
```python
new_people = int(random.uniform(0, max_people_per_sec))
```

**改进目标**：使用 **正态分布（高斯分布）** 模拟更符合现实的顾客到达模式。

**正态分布参数**：
- **均值 (μ)**：平均每秒到达人数，设为 `max_people_per_sec * 0.6`（峰值为平均值的 1.5-2 倍）
- **标准差 (σ)**：波动程度，设为 `max_people_per_sec * 0.2`（20% 波动）
- **截断处理**：人数不能为负，需限制在 `[0, max_people_per_sec * 1.5]` 范围内

**概率密度函数**：
```
f(x) = (1 / (σ * √(2π))) * e^(-(x-μ)² / (2σ²))
```

#### **2.1.2 代码修改涉及模块**

**主要修改文件**：`simulation.py` 中的 `_simulation_loop` 方法

**修改位置**：步骤 3（模拟新进入餐厅的人数）

**具体实现**：
```python
# 当前代码（第 98-100 行）
new_people = int(random.uniform(0, max_people_per_sec))

# 修改为
import random
import math

# 使用 Box-Muller 变换生成正态分布随机数
u1 = random.random()
u2 = random.random()
z0 = math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

# 应用正态分布参数
mu = max_people_per_sec * 0.6  # 均值
sigma = max_people_per_sec * 0.2  # 标准差
new_people = int(mu + sigma * z0)

# 截断处理：确保非负且不超过峰值
new_people = max(0, min(new_people, int(max_people_per_sec * 1.5)))
```

**替代方案**（使用 `random.gauss`，更简洁）：
```python
mu = max_people_per_sec * 0.6
sigma = max_people_per_sec * 0.2
new_people = int(random.gauss(mu, sigma))
new_people = max(0, min(new_people, int(max_people_per_sec * 1.5)))
```

#### **2.1.3 窗口分配策略优化**

**当前策略**：简单负载均衡，分配到人数最少的窗口

**改进方案**：引入 **排队论模型（M/M/n 队列）**
- 考虑窗口服务速率差异
- 动态调整分配概率（非绝对最少）

```python
# 改进的窗口分配（步骤 3）
for _ in range(new_people):
    # 计算各窗口的排队时间估计（人数 * 打饭时间）
    wait_times = [p * meal_time for p in window_people]
    # 使用 Softmax 函数转换为选择概率
    import numpy as np
    probabilities = np.exp(-np.array(wait_times)) / np.sum(np.exp(-np.array(wait_times)))
    # 按概率选择窗口
    chosen_window = np.random.choice(window_num, p=probabilities)
    window_people[chosen_window] += 1
```

#### **2.1.4 参数配置建议**

在 `config.py` 中新增配置项：
```python
# ===================== 仿真模型配置 =====================
# 正态分布参数
PEOPLE_ARRIVAL_MEAN_RATIO = 0.6  # 均值占比（相对于 max_people）
PEOPLE_ARRIVAL_STD_RATIO = 0.2   # 标准差占比
PEOPLE_ARRIVAL_MAX_RATIO = 1.5   # 峰值占比

# 窗口分配策略
WINDOW_ALLOCATION_STRATEGY = "softmax"  # "min_load" 或 "softmax"
SOFTMAX_TEMPERATURE = 1.0  # Softmax 温度参数（越大越随机）
```

---

### 2.2 打饭仿真速度优化方案

#### **2.2.1 当前性能瓶颈分析**

1. **时间步长限制**：`SIMULATION_TIME_STEP = 1` 秒，仿真 1 小时需 3600 次循环
2. **数据库写入频率**：每次循环写入数据库（I/O 密集型）
3. **SocketIO 推送频率**：每次循环推送数据（网络 I/O）
4. **串行处理**：单线程仿真，无法利用多核 CPU

#### **2.2.2 优化方案一：批量数据处理**

**目标**：减少数据库写入和网络推送次数

**实现方法**：
- 每 N 秒（如 10 秒）批量写入一次数据库
- 每 M 秒（如 5 秒）推送一次数据到前端

**代码修改**：`simulation.py` 的 `_simulation_loop` 方法

```python
# 新增配置
BATCH_SIZE = 10  # 每 10 秒批量写入
PUSH_INTERVAL = 5  # 每 5 秒推送一次

# 在 _simulation_loop 中
data_buffer = []  # 数据缓存
push_buffer = []  # 推送缓存

for step in range(total_steps):
    # ... 仿真逻辑 ...
    
    # 缓存数据
    data_buffer.append({
        "time_step": time_step,
        "window_people": window_people,
        "used_table": used_table,
        "remaining_table": remaining_table
    })
    
    # 每 BATCH_SIZE 秒批量写入数据库
    if time_step % BATCH_SIZE == 0:
        db.batch_add_simulation_data(simulation_id, data_buffer)
        data_buffer = []
    
    # 每 PUSH_INTERVAL 秒推送一次
    if time_step % PUSH_INTERVAL == 0:
        self.socketio.emit("simulation_data", {...}, room=session_id)
```

**预期效果**：数据库写入次数减少 90%，网络推送次数减少 80%

#### **2.2.3 优化方案二：仿真加速模式**

**目标**：支持快速仿真（如 10 倍速、100 倍速）

**实现方法**：
- 新增 `speed_multiplier` 参数（默认 1 倍速）
- 调整 `time.sleep()` 时间：`sleep(1 / speed_multiplier)`
- 高速模式下跳过中间数据推送，仅保留关键节点数据

**代码修改**：
```python
# start_simulation 方法新增参数
def start_simulation(self, session_id, ..., speed_multiplier=1):
    # ...
    self.simulation_speed[session_id] = speed_multiplier

# _simulation_loop 中
time.sleep(SIMULATION_TIME_STEP / self.simulation_speed[session_id])

# 高速模式下（如>10 倍速），仅推送关键节点
if self.simulation_speed[session_id] > 10:
    if time_step % (self.simulation_speed[session_id] // 10) != 0:
        continue  # 跳过本次推送
```

**配置建议**（`config.py`）：
```python
# 仿真速度配置
DEFAULT_SPEED_MULTIPLIER = 1  # 默认 1 倍速
MAX_SPEED_MULTIPLIER = 100    # 最大 100 倍速
HIGH_SPEED_THRESHOLD = 10     # 高速模式阈值
```

#### **2.2.4 优化方案三：并行仿真处理**

**目标**：支持多 session 并行仿真，利用多核 CPU

**实现方法**：
- 使用 `concurrent.futures.ThreadPoolExecutor` 管理线程池
- 限制最大并发数（避免资源耗尽）

**代码修改**：`simulation.py`

```python
from concurrent.futures import ThreadPoolExecutor

class RestaurantSimulation:
    def __init__(self, socketio):
        self.socketio = socketio
        self.executor = ThreadPoolExecutor(max_workers=10)  # 最大 10 个并发仿真
        self.simulation_futures = {}  # {session_id: future}
    
    def start_simulation(self, session_id, ...):
        # 提交到线程池
        future = self.executor.submit(
            self._simulation_loop,
            session_id, simulation_id, ...
        )
        self.simulation_futures[session_id] = future
```

#### **2.2.5 优化方案四：数据库写入优化**

**目标**：减少数据库 I/O 延迟

**实现方法**：
1. **使用事务批量插入**：
```python
def batch_add_simulation_data(self, simulation_id, data_list):
    try:
        for data in data_list:
            window_people_str = ",".join(map(str, data["window_people"]))
            self.cursor.execute(
                "INSERT INTO simulation_data ... VALUES (?, ?, ?, ?, ?, ?)",
                (simulation_id, data["time_step"], window_people_str, ...)
            )
        self.conn.commit()  # 一次性提交
    except Exception as e:
        self.conn.rollback()
        raise e
```

2. **使用 WAL 模式**（Write-Ahead Logging）：
```python
# _connect 方法中
self.conn.execute("PRAGMA journal_mode=WAL")
```

3. **异步写入**：使用队列 + 后台线程写入
```python
import queue

def __init__(self):
    self.data_queue = queue.Queue()
    self.writer_thread = threading.Thread(target=self._background_writer, daemon=True)
    self.writer_thread.start()

def _background_writer(self):
    while True:
        data = self.data_queue.get()
        if data is None:
            break
        self._write_to_db(data)
        self.data_queue.task_done()
```

#### **2.2.6 优化方案五：算法优化**

**目标**：减少每步计算量

**当前瓶颈**：
- 桌子状态遍历（`O(n)` 复杂度）
- 窗口人数最小值查找（`O(n)` 复杂度）

**优化方法**：
1. **桌子状态优化**：使用最小堆维护空闲桌子
```python
import heapq

# 初始化
free_tables = list(range(table_num))  # 空闲桌子索引
heapq.heapify(free_tables)

# 分配桌子（O(1) 获取）
if free_tables:
    table_index = heapq.heappop(free_tables)
    # ... 占用桌子 ...

# 释放桌子
heapq.heappush(free_tables, table_index)
```

2. **窗口分配优化**：使用优先队列
```python
import heapq

# 维护窗口排队数堆
window_heap = [(0, i) for i in range(window_num)]  # (人数，索引)
heapq.heapify(window_heap)

# 分配时
people, min_index = heapq.heappop(window_heap)
window_people[min_index] += 1
heapq.heappush(window_heap, (window_people[min_index], min_index))
```

---

## 3. 建议改进项

### 3.1 仿真模型增强

#### **3.1.1 引入时间变化因子**
- **问题**：当前仿真参数固定，不符合实际用餐高峰/低谷
- **方案**：引入时间函数，动态调整 `max_people`
```python
# 高峰时段（12:00-13:00）系数为 1.5，低谷时段为 0.5
def get_time_factor(current_step, total_steps):
    progress = current_step / total_steps
    if 0.3 <= progress <= 0.5:  # 模拟高峰时段
        return 1.5
    return 0.8
```

#### **3.1.2 多类型顾客模型**
- **问题**：所有顾客行为一致
- **方案**：区分顾客类型（打包/堂食、单人/团体）
```python
customer_types = {
    "takeaway": {"ratio": 0.3, "meal_time_factor": 0.5, "need_table": False},
    "single": {"ratio": 0.5, "meal_time_factor": 1.0, "need_table": True},
    "group": {"ratio": 0.2, "meal_time_factor": 1.5, "need_table": True, "table_size": 2}
}
```

#### **3.1.3 窗口服务差异化**
- **问题**：所有窗口服务速率相同
- **方案**：为每个窗口设置不同的服务效率
```python
window_efficiency = [random.uniform(0.8, 1.2) for _ in range(window_num)]
# 打饭处理时
processed_people = round((1 / meal_time) * window_efficiency[i])
```

### 3.2 系统性能优化

#### **3.2.1 前端数据渲染优化**
- **问题**：前端每秒接收并渲染所有数据，可能导致卡顿
- **方案**：
  - 前端实现数据节流（Throttling）
  - 使用 Canvas 替代 DOM 渲染大量数据点
  - 实现数据降采样（Downsampling）

#### **3.2.2 后端连接管理**
- **问题**：未处理客户端断开连接
- **方案**：
```python
@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    if session_id in simulation_tasks:
        stop_simulation(session_id)
```

#### **3.2.3 资源泄漏防护**
- **问题**：仿真线程未正确清理
- **方案**：
  - 使用 `weakref` 管理线程引用
  - 添加线程超时强制终止
  - 定期清理僵尸线程

### 3.3 功能增强

#### **3.3.1 仿真场景预设**
- 提供预设场景（高峰时段、平常时段、节假日）
- 一键加载预设参数

#### **3.3.2 数据导出功能**
- 支持导出仿真数据为 CSV/Excel
- 生成统计报告（平均值、峰值、标准差）

#### **3.3.3 多方案对比**
- 支持同时运行多个仿真方案
- 并排对比结果（图表叠加）

#### **3.3.4 实时监控面板**
- 显示系统资源占用（CPU、内存）
- 显示仿真进度和预计完成时间

---

## 4. 实施步骤

### 阶段一：正态分布模型实现（预计 2-3 小时）

#### **步骤 1.1**：修改 `config.py`
- 新增正态分布参数配置
- 新增窗口分配策略配置

#### **步骤 1.2**：修改 `simulation.py`
- 修改 `_simulation_loop` 中的新进入人数生成逻辑
- 使用 `random.gauss()` 替代 `random.uniform()`
- 添加截断处理（非负、峰值限制）

#### **步骤 1.3**：优化窗口分配策略
- 实现 Softmax 概率分配（可选）
- 添加配置切换开关

#### **步骤 1.4**：测试验证
- 运行仿真，收集 1000+ 个数据点
- 绘制人数分布直方图，验证正态性
- 调整参数（μ, σ）至符合预期

---

### 阶段二：仿真速度优化（预计 4-6 小时）

#### **步骤 2.1**：实现批量数据处理
- 修改 `database.py`，新增 `batch_add_simulation_data()` 方法
- 修改 `simulation.py`，添加数据缓存机制
- 配置批量大小（BATCH_SIZE）和推送间隔（PUSH_INTERVAL）

#### **步骤 2.2**：实现仿真加速模式
- 在 `start_simulation()` 中新增 `speed_multiplier` 参数
- 调整 `time.sleep()` 时间
- 实现高速模式下的数据跳过逻辑

#### **步骤 2.3**：数据库优化
- 启用 WAL 模式
- 优化索引（为 `simulation_id` 和 `time_step` 添加索引）
- 测试批量写入性能

#### **步骤 2.4**：算法优化
- 使用堆优化桌子分配
- 使用优先队列优化窗口分配
- 性能对比测试（优化前后耗时）

#### **步骤 2.5**：压力测试
- 测试 10 倍速、50 倍速、100 倍速仿真
- 测试 10 个并发 session
- 监控系统资源占用

---

### 阶段三：系统增强（预计 6-8 小时）

#### **步骤 3.1**：引入时间变化因子
- 设计时间函数（正弦波/分段函数）
- 修改仿真循环，动态调整参数

#### **步骤 3.2**：多类型顾客模型
- 定义顾客类型配置
- 修改仿真逻辑，区分处理不同类型顾客

#### **步骤 3.3**：窗口服务差异化
- 为每个窗口生成效率系数
- 修改打饭处理逻辑

#### **步骤 3.4**：前端优化
- 实现数据节流
- 优化图表渲染性能

#### **步骤 3.5**：功能增强
- 实现场景预设
- 实现数据导出
- 实现多方案对比

---

### 阶段四：测试与文档（预计 2-3 小时）

#### **步骤 4.1**：单元测试
- 为正态分布生成编写测试
- 为批量写入编写测试
- 为加速模式编写测试

#### **步骤 4.2**：集成测试
- 完整流程测试（启动 - 运行 - 结束）
- 边界条件测试（极大参数、极小参数）

#### **步骤 4.3**：性能基准测试
- 记录优化前后性能指标
- 生成性能对比报告

#### **步骤 4.4**：文档更新
- 更新 API 文档
- 更新配置说明
- 编写用户使用指南

---

## 5. 预期效果

### 5.1 功能表现

#### **正态分布模型**
- ✅ 顾客到达人数符合正态分布（可通过统计检验验证）
- ✅ 支持参数配置（均值、标准差、峰值）
- ✅ 窗口分配更智能（减少极端排队现象）

#### **仿真速度**
- ✅ 支持 1-100 倍速仿真
- ✅ 10 倍速下，1 小时仿真从 60 秒缩短至 6 秒
- ✅ 100 倍速下，1 小时仿真从 60 秒缩短至 1 秒内

#### **系统性能**
- ✅ 数据库写入次数减少 90%（批量处理）
- ✅ 网络推送次数减少 80%（节流推送）
- ✅ 支持 10+ 并发仿真（线程池管理）
- ✅ 内存占用稳定（无泄漏）

### 5.2 性能指标

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| 1 小时仿真耗时（1 倍速） | 60 秒 | 60 秒 | - |
| 1 小时仿真耗时（10 倍速） | 60 秒 | 6 秒 | **10x** |
| 1 小时仿真耗时（100 倍速） | 60 秒 | 0.6 秒 | **100x** |
| 数据库写入次数（1 小时） | 3600 次 | 360 次 | **90%↓** |
| 网络推送次数（1 小时） | 3600 次 | 720 次 | **80%↓** |
| 最大并发仿真数 | 受限于线程 | 10+ | **稳定** |
| 窗口排队分布 | 均匀分布 | 正态分布 | **更符合实际** |

### 5.3 用户体验提升

- **仿真启动时间**：从秒级降至毫秒级（批量处理）
- **图表流畅度**：从每秒 60 帧降至每秒 12 帧（节流），但视觉无明显差异
- **数据准确性**：正态分布更符合实际用餐场景
- **功能丰富度**：支持场景预设、数据导出、多方案对比

---

## 6. 潜在风险

### 6.1 技术风险

#### **风险 1：正态分布参数设置不当**
- **描述**：μ 和 σ 设置不合理，导致人数分布不符合预期
- **影响**：仿真结果失真
- **应对措施**：
  - 提供参数配置界面，支持动态调整
  - 添加数据可视化，实时显示分布直方图
  - 提供预设参数模板（高峰/平常/低谷）

#### **风险 2：批量处理导致数据丢失**
- **描述**：仿真异常终止时，缓存数据未写入数据库
- **影响**：数据不完整
- **应对措施**：
  - 实现异常处理，确保缓存数据回写
  - 添加数据完整性校验
  - 提供手动触发写入接口

#### **风险 3：高速模式下前端渲染跟不上**
- **描述**：100 倍速下，前端接收数据频率过高
- **影响**：浏览器卡顿、崩溃
- **应对措施**：
  - 前端实现数据节流（限制每秒渲染次数）
  - 高速模式下自动降采样
  - 添加性能警告提示

#### **风险 4：并发仿真资源竞争**
- **描述**：多 session 同时仿真，数据库锁竞争
- **影响**：写入延迟增加
- **应对措施**：
  - 使用 WAL 模式减少锁竞争
  - 限制最大并发数（线程池）
  - 为每个 session 使用独立数据库连接

### 6.2 性能风险

#### **风险 5：内存泄漏**
- **描述**：线程、连接未正确释放
- **影响**：长时间运行后内存耗尽
- **应对措施**：
  - 使用 `weakref` 管理资源
  - 添加资源监控和告警
  - 实现自动垃圾回收机制

#### **风险 6：数据库文件过大**
- **描述**：长时间运行后，`database.db` 文件过大
- **影响**：磁盘空间不足，查询性能下降
- **应对措施**：
  - 定期清理历史数据（保留最近 N 小时）
  - 实现数据归档机制
  - 添加磁盘空间监控

### 6.3 兼容性风险

#### **风险 7：前端兼容性问题**
- **描述**：新参数格式前端不支持
- **影响**：前端解析失败
- **应对措施**：
  - 保持 API 向后兼容
  - 添加版本号标识
  - 提供前端适配指南

#### **风险 8：Python 版本兼容性**
- **描述**：使用了 Python 3.8+ 特性
- **影响**：低版本 Python 无法运行
- **应对措施**：
  - 检查 Python 版本要求
  - 使用兼容性好的语法
  - 添加版本检测提示

### 6.4 实施风险

#### **风险 9：修改引入新 Bug**
- **描述**：修改核心逻辑导致原有功能异常
- **影响**：系统不可用
- **应对措施**：
  - 分支开发，不影响主分支
  - 充分测试后再合并
  - 保留回滚方案

#### **风险 10：测试覆盖不足**
- **描述**：边界条件未充分测试
- **影响**：生产环境出现问题
- **应对措施**：
  - 编写全面的测试用例
  - 进行压力测试和边界测试
  - 灰度发布，逐步推广

---

## 7. 总结

本修改说明文档详细分析了当前餐厅排队及打饭仿真系统的架构和实现，提出了两大核心需求的实现方案：

1. **正态分布模型**：通过修改 `simulation.py` 中的人数生成逻辑，使用 `random.gauss()` 替代 `random.uniform()`，并优化窗口分配策略，使仿真更符合实际用餐场景。

2. **仿真速度优化**：通过批量数据处理、仿真加速模式、并行处理、数据库优化和算法优化，可将仿真速度提升 10-100 倍，同时减少 80-90% 的数据库写入和网络推送。

此外，文档还提出了仿真模型增强、系统性能优化和功能增强等建议，并详细列出了实施步骤、预期效果和潜在风险及应对措施。

**实施建议**：
- 优先实施阶段一和阶段二（核心需求）
- 阶段三可根据实际需求选择性实施
- 阶段四（测试与文档）必不可少

**预期收益**：
- 仿真真实性显著提升
- 仿真速度提升 10-100 倍
- 系统性能提升 80-90%
- 用户体验大幅改善

---

**文档版本**：v1.0  
**编写日期**：2026-04-13  
**适用系统版本**：餐厅仿真系统 v1.0  
