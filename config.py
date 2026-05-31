# -*- coding: utf-8 -*-
"""
餐厅打饭仿真系统 - 配置文件
功能：
1. 定义Flask/SocketIO核心配置（秘钥、跨域、端口等）
2. 定义SQLite数据库路径
3. 定义仿真程序常量（时间步长、评价阈值等）
4. 定义日志输出配置
"""
import os
import logging

# ===================== Flask 基础配置 =====================
# Flask秘钥：用于session加密，确保前端session识别仿真实例
SECRET_KEY = "restaurant_simulation_2026_0323"
# 运行端口：前端请求需匹配此端口（默认5000）
FLASK_PORT = 5000
# 调试模式：开发阶段开启，生产阶段关闭
DEBUG = True

# ===================== 数据库配置 =====================
# SQLite数据库文件路径（根目录下的database.db）
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

# ===================== SocketIO 配置 =====================
# 跨域允许的源列表：适配前端本地运行的跨域请求
# 可通过环境变量 CORS_ALLOWED_ORIGINS 覆盖（逗号分隔）
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://127.0.0.1:5001,http://localhost:5001",
).split(",")
# SocketIO消息队列：确保仿真线程与SocketIO通信正常
SOCKETIO_MESSAGE_QUEUE = "redis://" if os.environ.get("REDIS_URL") else None

# ===================== 仿真程序配置 =====================
# 仿真时间步长：每秒生成一次实时数据（与前端图表更新频率一致）
SIMULATION_TIME_STEP = 1  # 单位：秒

# 最大并发仿真数（防止无限创建线程）
MAX_CONCURRENT_SIMULATIONS = int(os.environ.get("MAX_CONCURRENT_SIMULATIONS", "5"))

# 评价阈值：窗口排队人数≥20为"体验较差"，否则"体验良好"
WINDOW_EVAL_THRESHOLD = 20
# 桌子占用率≥80%为"体验较差"，否则"体验良好"
TABLE_EVAL_THRESHOLD = 0.8

# ===================== 正态分布到达模型配置 =====================
# 顾客到达人数使用正态分布 X ~ N(μ, σ²)，截断到 [0, MAX]
# μ = max_people_per_sec * MEAN_RATIO（均值）
# σ = max_people_per_sec * STD_RATIO（标准差）
# 上限 = max_people_per_sec * MAX_RATIO（截断上限）
PEOPLE_ARRIVAL_MEAN_RATIO = 0.6   # 均值占比
PEOPLE_ARRIVAL_STD_RATIO = 0.2    # 标准差占比
PEOPLE_ARRIVAL_MAX_RATIO = 1.5    # 峰值截断比

# ===================== 窗口分配正态分布配置 =====================
# 各窗口排队人数呈正态分布：中间窗口人多，两侧窗口人少
# 选择窗口时使用正态分布 N(μ_w, σ_w²)，截断到 [0, window_num-1]
# μ_w = (window_num - 1) * WINDOW_DIST_MEAN_RATIO（默认居中）
# σ_w = window_num * WINDOW_DIST_STD_RATIO（默认跨度覆盖全部窗口）
WINDOW_DIST_MEAN_RATIO = 0.5    # 窗口均值位置（0.5=居中）
WINDOW_DIST_STD_RATIO = 0.3     # 窗口标准差占比（越大越分散）

# ===================== 日志配置 =====================
# 日志级别：DEBUG/INFO/WARNING/ERROR
LOG_LEVEL = logging.INFO
# 日志格式：时间 - 模块 - 级别 - 消息
LOG_FORMAT = "%(asctime)s - %(module)s - %(levelname)s - %(message)s"
# 新增：设置日志时间格式
logging.basicConfig(level=LOG_LEVEL, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")