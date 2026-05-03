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
# 跨域允许的源：适配前端本地运行的跨域请求（*表示允许所有，生产环境可指定具体地址）
CORS_ALLOWED_ORIGINS = "*"
# SocketIO消息队列：确保仿真线程与SocketIO通信正常
SOCKETIO_MESSAGE_QUEUE = "redis://" if os.environ.get("REDIS_URL") else None

# ===================== 仿真程序配置 =====================
# 仿真时间步长：每秒生成一次实时数据（与前端图表更新频率一致）
SIMULATION_TIME_STEP = 1  # 单位：秒
# 评价阈值：窗口排队人数≥20为"体验较差"，否则"体验良好"
WINDOW_EVAL_THRESHOLD = 20
# 桌子占用率≥80%为"体验较差"，否则"体验良好"
TABLE_EVAL_THRESHOLD = 0.8

# ===================== 日志配置 =====================
# 日志级别：DEBUG/INFO/WARNING/ERROR
LOG_LEVEL = logging.INFO
# 日志格式：时间 - 模块 - 级别 - 消息
LOG_FORMAT = "%(asctime)s - %(module)s - %(levelname)s - %(message)s"
# 新增：设置日志时间格式
logging.basicConfig(level=LOG_LEVEL, format=LOG_FORMAT, datefmt="%Y-%m-%d %H:%M:%S")