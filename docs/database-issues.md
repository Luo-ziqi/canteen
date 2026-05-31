# 数据库问题分析与解决方案文档

## 文档信息

| 项目 | 值 |
|------|------|
| **文档版本** | 1.0 |
| **创建日期** | 2026-05-31 |
| **适用范围** | 数据库开发团队、后端开发团队 |
| **关联系统** | 前端 HTML/JS、后端 Flask API、SQLite 数据库 |

---

## 目录

1. [问题 7：仿真结束后的数据查询竞争](#问题 7 仿真结束后的数据查询竞争)
2. [问题 9：数据库多线程并发访问](#问题 9 数据库多线程并发访问)
3. [数据库架构设计与优化建议](#数据库架构设计与优化建议)

---

## 问题 7：仿真结束后的数据查询竞争

### 问题描述

**具体表现**：
- 结束仿真时，API 返回错误：`无运行中的仿真且未找到历史数据`
- 后端日志显示仿真已结束（`status = 1`）
- 查询仿真信息时返回 `None`，导致趋势数据和评价无法生成

**复现步骤**：
1. 启动仿真并运行一段时间（如 5 分钟）
2. 点击"结束仿真"按钮
3. 观察后端日志
4. 发现 `get_current_simulation` 返回 `None`

**影响范围**：
- **影响表**：`simulation_info`
- **影响功能**：结束仿真、趋势数据查询、评价生成
- **影响程度**：严重（无法获取仿真结果）
- **用户感知**：明显（结果页面为空）

### 根因分析

**数据库设计问题**：

```sql
-- simulation_info 表结构
CREATE TABLE simulation_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    dining_time INTEGER NOT NULL,
    meal_time INTEGER NOT NULL,
    max_people INTEGER NOT NULL,
    window_num INTEGER NOT NULL,
    table_num INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status INTEGER DEFAULT 0,  -- 0=运行中，1=已结束
    create_time TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**技术原因**：
1. `get_current_simulation()` 函数的 SQL 查询包含 `AND status = 0` 条件
2. 结束仿真时，先调用 `stop_simulation()` 将 `status` 设置为 1
3. 然后调用 `get_current_simulation()` 查询 `status = 0` 的记录，返回 `None`
4. 导致后续的趋势数据查询和评价生成失败

**错误流程**：

```python
# ❌ 错误流程
@app.route('/api/end-simulation', methods=['POST'])
def end_simulation():
    # 1. 停止仿真（status 变为 1）
    simulation_id = simulation.stop_simulation(session_id)
    
    # 2. 查询仿真信息（查询 status=0，返回 None）
    sim_info = simulation.get_current_simulation(session_id)  # ❌ 返回 None
    
    # 3. 后续操作失败
    window_num = sim_info.get('window_num', 4)  # ❌ 使用默认值
```

### 解决方案

**方案 A：修改查询逻辑（推荐）**

**代码修改**：`database.py` → 添加新函数 `get_simulation_info_by_session`

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
            'dining_time': row[2],
            'meal_time': row[3],
            'max_people': row[4],
            'window_num': row[5],
            'table_num': row[6],
            'start_time': row[7],
            'end_time': row[8],
            'status': row[9],
        }
    return None
```

**代码修改**：`app.py` → `end_simulation` 路由

```python
@app.route('/api/end-simulation', methods=['POST'])
def end_simulation():
    # ... 参数校验 ...
    
    session_id = data.get('session_id')
    
    # ✅ 步骤 1：停止前先查询运行中的仿真
    sim_info = simulation.get_current_simulation(session_id)
    if not sim_info:
        # ✅ 回退：查询最新记录（不限制 status）
        sim_info = db.get_simulation_info_by_session(session_id)
    
    window_num = sim_info.get('window_num', 4) if sim_info else 4
    table_num = sim_info.get('table_num', 100) if sim_info else 100
    
    # ✅ 步骤 2：停止仿真
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

**方案 B：修改 status 更新时机（备选）**

```python
# ✅ 在查询完仿真信息后再更新 status
def end_simulation(session_id):
    # 1. 先查询仿真信息（status=0）
    sim_info = get_current_simulation(session_id)
    
    # 2. 提取需要的参数
    window_num = sim_info['window_num']
    table_num = sim_info['table_num']
    
    # 3. 查询仿真数据
    sim_data = get_simulation_data(sim_info['id'])
    
    # 4. 最后更新 status
    update_simulation_status(session_id, 1)
    
    return {
        'window_num': window_num,
        'table_num': table_num,
        'sim_data': sim_data,
    }
```

**实施步骤**：
1. 在 `database.py` 中添加 `get_simulation_info_by_session` 函数
2. 修改 `app.py` 中的 `end_simulation` 路由
3. 实施三重兜底查询：
   - 先查 `status=0` 的运行中仿真
   - 再查最新记录（不限制 `status`）
   - 最后从 `self.simulation_ids` 或 DB 兜底
4. 添加测试用例验证结束流程

**验证方法**：
1. 启动仿真并运行一段时间
2. 结束仿真
3. 检查返回数据是否包含：
   - `window_trend`: 窗口人数趋势
   - `table_trend`: 桌子使用趋势
   - `window_eval`: 窗口体验评价
   - `table_eval`: 桌子体验评价
4. 验证评价文本是否正确生成

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认 `get_current_simulation` 和 `get_simulation_info_by_session` 的使用场景
- ✅ 确认 `status` 字段的含义（0=运行中，1=已结束）
- ✅ 验证三重兜底查询逻辑

**需要与前端团队沟通**：
- ✅ 确认结束仿真 API 返回的数据结构
- ✅ 确认趋势数据格式（`window_trend`、`table_trend`）
- ✅ 验证评价文本内容

---

## 问题 9：数据库多线程并发访问

### 问题描述

**具体表现**：
- 偶尔出现 `database is locked` 错误
- 仿真线程写入数据时，API 读取失败
- 高并发场景下（多个仿真同时运行）错误率增加

**复现步骤**：
1. 同时启动多个仿真（如 5 个仿真线程）
2. 每个仿真每秒写入一次数据
3. 同时调用 API 查询数据（如结束仿真、查看状态）
4. 观察后端日志中的 `database is locked` 错误

**影响范围**：
- **影响表**：`simulation_info`、`simulation_data`
- **影响功能**：数据读写
- **影响程度**：中等（偶发错误）
- **用户感知**：轻微（偶尔失败）

### 根因分析

**数据库设计限制**：

SQLite 的并发控制机制：
1. **默认模式（DELETE）**：不支持多线程并发写入
2. **WAL 模式（Write-Ahead Logging）**：支持一写多读
3. **锁机制**：写操作需要独占锁，读操作需要共享锁

**技术原因**：
1. 仿真线程每秒写入一次数据（写操作）
2. Flask 主线程在 API 调用时读取数据（读操作）
3. 多个仿真同时运行时，写入冲突概率增加
4. 默认配置下，SQLite 不允许不同线程使用同一个连接

**并发场景分析**：

```
时间轴：
t1: 仿真线程 A 写入数据（获取写锁）
t2: 仿真线程 B 尝试写入（等待锁）
t3: API 线程读取数据（等待写锁释放）
t4: 线程 A 释放锁
t5: 线程 B 获取写锁
t6: API 线程获取读锁

问题：如果超时时间不足，t2 或 t3 可能失败
```

### 解决方案

**方案 A：修改 SQLite 连接配置（推荐）**

**代码修改**：`database.py` → 数据库连接初始化

```python
import sqlite3
import threading

class SimulationDatabase:
    def __init__(self, db_path='database.db'):
        self.db_path = db_path
        self._local = threading.local()  # ✅ 线程本地存储
        
    def _get_connection(self):
        """获取当前线程的数据库连接（线程安全）。"""
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,  # ✅ 允许多线程访问
                timeout=30,               # ✅ 等待锁超时时间（秒）
            )
            # ✅ 启用 WAL 模式（Write-Ahead Logging）
            self._local.conn.execute('PRAGMA journal_mode=WAL')
            # ✅ 设置锁超时重试次数
            self._local.conn.execute('PRAGMA busy_timeout=30000')  # 30 秒
        return self._local.conn
    
    @property
    def conn(self):
        """获取当前线程的连接对象。"""
        return self._get_connection()
```

**配置说明**：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `check_same_thread` | `False` | 允许多个线程使用同一个连接对象 |
| `timeout` | `30` | 等待锁的超时时间（秒），默认 5 秒 |
| `PRAGMA journal_mode` | `WAL` | 启用 Write-Ahead Logging 模式，支持一写多读 |
| `PRAGMA busy_timeout` | `30000` | 锁超时时重试等待时间（毫秒） |

**方案 B：使用连接池（进阶）**

```python
from queue import Queue
import sqlite3

class DatabasePool:
    def __init__(self, db_path, pool_size=10):
        self.db_path = db_path
        self.pool = Queue(maxsize=pool_size)
        
        # ✅ 初始化连接池
        for _ in range(pool_size):
            conn = sqlite3.connect(
                db_path,
                check_same_thread=False,
                timeout=30,
            )
            conn.execute('PRAGMA journal_mode=WAL')
            self.pool.put(conn)
    
    def get_connection(self):
        """从连接池获取连接（阻塞直到有空闲连接）。"""
        return self.pool.get()
    
    def release_connection(self, conn):
        """释放连接回连接池。"""
        self.pool.put(conn)
```

**方案 C：定期清理旧数据（优化）**

```python
def cleanup_old_simulations(self, max_age_days=7):
    """清理超过指定天数的旧仿真数据，减少数据库大小。"""
    cursor = self.conn.cursor()
    cursor.execute(
        """DELETE FROM simulation_data 
           WHERE simulation_id IN (
               SELECT id FROM simulation_info 
               WHERE create_time < datetime('now', ?)
           )""",
        (f'-{max_age_days} days',),
    )
    cursor.execute(
        """DELETE FROM simulation_info 
           WHERE create_time < datetime('now', ?)""",
        (f'-{max_age_days} days',),
    )
    self.conn.commit()
    return cursor.rowcount
```

**实施步骤**：
1. 修改 `database.py` 中的连接配置
2. 添加 `check_same_thread=False` 和 `timeout=30`
3. 启用 WAL 模式和 busy_timeout
4. 测试高并发场景（多个仿真同时运行）
5. （可选）添加定期清理旧数据的功能

**验证方法**：
1. 同时启动 5-10 个仿真
2. 观察后端日志是否有 `database is locked` 错误
3. 验证数据完整性（无丢失、无重复）
4. 检查数据库文件大小（WAL 模式会生成 `.wal` 和 `.shm` 文件）

### 交互影响

**需要与后端团队沟通**：
- ✅ 确认仿真线程的写入频率（每秒 1 次）
- ✅ 确认 API 读取频率（结束仿真、查询状态）
- ✅ 评估是否需要连接池或定期清理

**需要与前端团队沟通**：
- ✅ 通知前端团队数据库并发问题已修复
- ✅ 确认高并发场景下的用户体验
- ✅ 如果实施定期清理，确认数据保留策略（如保留 7 天）

---

## 数据库架构设计与优化建议

### 当前数据库表结构

```sql
-- 仿真信息表
CREATE TABLE simulation_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,          -- 会话 ID（前端生成）
    dining_time INTEGER NOT NULL,      -- 用餐时间（分钟）
    meal_time INTEGER NOT NULL,        -- 打饭时间（秒/人）
    max_people INTEGER NOT NULL,       -- 每分钟最大进入人数
    window_num INTEGER NOT NULL,       -- 窗口数量
    table_num INTEGER NOT NULL,        -- 桌子数量
    start_time TEXT NOT NULL,          -- 开始时间（ISO 8601）
    end_time TEXT,                     -- 结束时间（ISO 8601）
    status INTEGER DEFAULT 0,          -- 状态：0=运行中，1=已结束
    create_time TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 仿真数据表
CREATE TABLE simulation_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_id INTEGER NOT NULL,    -- 外键：simulation_info.id
    time_step INTEGER NOT NULL,        -- 时间步（秒）
    window_people TEXT NOT NULL,       -- 各窗口等待人数（JSON 数组）
    used_table INTEGER NOT NULL,       -- 已使用桌子数
    remaining_table INTEGER NOT NULL,  -- 剩余桌子数
    create_time TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (simulation_id) REFERENCES simulation_info(id)
);
```

### 索引优化建议

**当前问题**：
1. `simulation_info` 表缺少 `session_id` 索引
2. `simulation_data` 表缺少 `simulation_id` 和 `time_step` 索引
3. 查询 `status=0` 的记录时全表扫描

**优化方案**：

```sql
-- ✅ 为 session_id 添加索引（加速按会话查询）
CREATE INDEX idx_simulation_info_session_id ON simulation_info(session_id);

-- ✅ 为 status 添加索引（加速查询运行中仿真）
CREATE INDEX idx_simulation_info_status ON simulation_info(status);

-- ✅ 为 simulation_id 添加索引（加速仿真数据查询）
CREATE INDEX idx_simulation_data_simulation_id ON simulation_data(simulation_id);

-- ✅ 复合索引：加速按仿真 ID 和时间步查询
CREATE INDEX idx_simulation_data_sim_time ON simulation_data(simulation_id, time_step);

-- ✅ 复合索引：加速查询会话的运行中仿真
CREATE INDEX idx_simulation_info_session_status ON simulation_info(session_id, status);
```

**实施步骤**：
1. 在 `database.py` 的 `_init_tables` 函数中添加索引创建语句
2. 为现有数据库添加迁移脚本
3. 使用 `EXPLAIN QUERY PLAN` 验证查询性能

**验证方法**：

```sql
-- ✅ 验证索引是否生效
EXPLAIN QUERY PLAN 
SELECT * FROM simulation_info 
WHERE session_id = 'xxx' AND status = 0;

-- 预期输出：SEARCH TABLE simulation_info USING INDEX idx_simulation_info_session_status
```

### 数据量估算

**仿真数据增长**：

| 仿真时长 | 数据条数 | 存储空间（估算） |
|----------|----------|------------------|
| 1 分钟 | 60 条 | ~6 KB |
| 5 分钟 | 300 条 | ~30 KB |
| 15 分钟 | 900 条 | ~90 KB |
| 30 分钟 | 1800 条 | ~180 KB |
| 1 小时 | 3600 条 | ~360 KB |

**计算公式**：
- 每条记录约 100 字节（`window_people` JSON 数组 + 其他字段）
- 10 个并发仿真 × 30 分钟 = 18,000 条 ≈ 1.8 MB
- 保留 7 天数据 ≈ 12.6 MB（假设每天 100 个仿真）

**建议**：
1. 定期清理超过 7 天的旧数据
2. 如果数据量超过 100 MB，考虑迁移到 PostgreSQL
3. 使用 WAL 模式减少锁竞争

### 生产环境迁移建议

**SQLite 的局限性**：
1. 不支持高并发写入（>100 个并发仿真）
2. 单文件数据库，备份和恢复不便
3. 缺少高级功能（如存储过程、触发器）
4. 性能随数据量增长下降明显

**迁移到 PostgreSQL 的方案**：

```python
# ✅ 使用 SQLAlchemy 作为 ORM，支持多种数据库后端
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class SimulationInfo(Base):
    __tablename__ = 'simulation_info'
    
    id = Column(Integer, primary_key=True)
    session_id = Column(String, nullable=False, index=True)  # ✅ 索引
    # ... 其他字段 ...

# ✅ 开发环境：SQLite
engine = create_engine('sqlite:///database.db')

# ✅ 生产环境：PostgreSQL
engine = create_engine('postgresql://user:pass@localhost:5432/simulation_db')
```

**迁移步骤**：
1. 使用 SQLAlchemy 或 Peewee 作为 ORM
2. 定义模型类（与当前表结构对应）
3. 开发环境继续使用 SQLite
4. 生产环境配置 PostgreSQL 连接字符串
5. 使用 Alembic 或 Peewee Migrate 管理数据库迁移

### 数据库备份与恢复

**备份脚本**：

```bash
#!/bin/bash
# backup.sh

# ✅ 备份 SQLite 数据库
cp database.db "backup/database_$(date +%Y%m%d_%H%M%S).db"

# ✅ 清理 7 天前的备份
find backup/ -name "*.db" -mtime +7 -delete

# ✅ 压缩备份
tar -czf "backup/database_$(date +%Y%m%d_%H%M%S).tar.gz" database.db
```

**恢复脚本**：

```bash
#!/bin/bash
# restore.sh

# ✅ 从备份恢复
cp "backup/database_20260531_120000.db" database.db

# ✅ 验证数据库完整性
sqlite3 database.db "PRAGMA integrity_check;"
```

---

## 数据库联调检查清单

在前后端联调时，数据库团队应按以下清单逐项检查：

| # | 检查项 | 预期结果 | 负责人 |
|---|--------|----------|--------|
| 1 | 表结构 | `simulation_info` 和 `simulation_data` 表创建成功 | 数据库 |
| 2 | 索引 | `session_id`、`status`、`simulation_id` 索引已创建 | 数据库 |
| 3 | 并发配置 | `check_same_thread=False`、`timeout=30`、WAL 模式 | 数据库 + 后端 |
| 4 | 数据写入 | 仿真线程每秒写入一条记录，无 `database is locked` 错误 | 后端 |
| 5 | 数据查询 | API 查询返回正确的仿真信息和数据 | 后端 |
| 6 | 结束流程 | 结束仿真时三重兜底查询成功 | 后端 + 数据库 |
| 7 | 高并发测试 | 同时运行 10 个仿真，无数据库错误 | 后端 + 数据库 |
| 8 | 数据完整性 | 仿真数据无丢失、无重复 | 数据库 |
| 9 | 备份恢复 | 备份脚本正常运行，恢复后数据完整 | 数据库 |
| 10 | 性能测试 | 查询响应时间 <100ms（1000 条数据） | 数据库 + 后端 |

---

## 附录：数据库关键文件清单

| 文件路径 | 功能描述 | 关联问题 |
|----------|----------|----------|
| `database.py` | SQLite 数据库模块（单例模式、数据读写、并发配置） | 问题 7、9 |
| `database.db` | SQLite 数据库文件（运行时自动生成） | - |
| `tests/test_database.py` | 数据库模块测试（5 个测试用例） | 问题 7、9 |

---

## 文档修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|----------|--------|
| 1.0 | 2026-05-31 | 初始版本，基于 frontend-integration.md 整理 | - |
