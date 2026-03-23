# -*- coding: utf-8 -*-
"""
餐厅打饭仿真系统 - 后端主程序
功能：
1. 初始化Flask应用、SocketIO、跨域配置
2. 实现前端调用的核心接口：/api/start-simulation、/api/end-simulation
3. 处理SocketIO连接，管理前端session，确保数据推送精准
4. 统一异常处理，返回与前端预期一致的JSON响应
依赖：config.py（配置）、database.py（数据库）、simulation.py（仿真逻辑）
"""
import logging
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room
from config import SECRET_KEY, FLASK_PORT, DEBUG, CORS_ALLOWED_ORIGINS
from database import db
from simulation import RestaurantSimulation

# ===================== 初始化Flask应用 =====================
app = Flask(__name__)
# 配置Flask（与前端session匹配）
app.secret_key = SECRET_KEY
app.config["SESSION_TYPE"] = "filesystem"  # 本地文件存储session
app.config["PERMANENT_SESSION_LIFETIME"] = 3600  # session有效期1小时

# ===================== 跨域配置 =====================
# 允许前端本地请求的跨域，支持Cookie（session）
CORS(
    app,
    resources={r"/api/*": {"origins": CORS_ALLOWED_ORIGINS}},
    supports_credentials=True  # 必须开启，否则前端session无法传递
)

# ===================== 初始化SocketIO =====================
socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ALLOWED_ORIGINS,
    async_mode="threading"
)

# ===================== 初始化仿真管理器 =====================
simulation_manager = RestaurantSimulation(socketio)

# ===================== 日志配置 =====================
logger = logging.getLogger(__name__)

# ===================== 接口路由 =====================
@app.route("/api/start-simulation", methods=["POST"])
def start_simulation_api():
    """
    启动仿真接口（与前端api.js中的startSimulation调用对齐）
    请求方法：POST
    请求体：{"dining_time": 20, "meal_time": 30, "max_people": 50, "window_num": 5, "table_num": 30}
    响应格式：{"success": true/false, "msg": "提示信息", "data": null}
    """
    try:
        # 1. 获取并校验请求参数（与前端表单参数、后端数据库字段对齐）
        request_data = request.get_json()
        if not request_data:
            return jsonify({"success": False, "msg": "请求参数不能为空"}), 400
        
        # 必传参数校验
        required_params = ["dining_time", "meal_time", "max_people", "window_num", "table_num"]
        for param in required_params:
            if param not in request_data:
                return jsonify({"success": False, "msg": f"缺少必传参数：{param}"}), 400
        
        # 类型和范围校验（与前端表单校验逻辑一致）
        dining_time = int(request_data["dining_time"])
        meal_time = int(request_data["meal_time"])
        max_people = int(request_data["max_people"])
        window_num = int(request_data["window_num"])
        table_num = int(request_data["table_num"])
        
        if dining_time < 0 or meal_time < 0 or max_people < 0:
            return jsonify({"success": False, "msg": "用餐时间/打饭时间/最大进入人数不能为负数"}), 400
        if window_num < 1 or table_num < 1:
            return jsonify({"success": False, "msg": "窗口数/桌子数不能小于1"}), 400
        
        # 2. 获取前端session ID（用于识别当前用户）
        if not session.get("session_id"):
            # 生成唯一session ID（简化版，生产环境可使用uuid）
            session["session_id"] = f"session_{id(session)}"
        session_id = session["session_id"]
        
        # 3. 启动仿真
        start_result = simulation_manager.start_simulation(
            session_id=session_id,
            dining_time=dining_time,
            meal_time=meal_time,
            max_people=max_people,
            window_num=window_num,
            table_num=table_num
        )
        
        if not start_result:
            return jsonify({"success": False, "msg": "仿真启动失败，已有运行中的仿真"}), 400
        
        # 4. 返回成功响应（与前端预期格式一致）
        logger.info("启动仿真接口调用成功，SessionID：%s", session_id)
        return jsonify({"success": True, "msg": "仿真启动成功", "data": None}), 200
    
    except Exception as e:
        # 统一异常处理，返回友好提示
        logger.error("启动仿真接口异常：%s", str(e))
        return jsonify({"success": False, "msg": f"仿真启动失败：{str(e)}"}), 500

@app.route("/api/end-simulation", methods=["POST"])
def end_simulation_api():
    """
    结束仿真接口（与前端api.js中的endSimulation调用对齐）
    请求方法：POST
    请求体：无
    响应格式：{"success": true/false, "msg": "提示信息", "data": {...}}
    data字段格式：
    {
        "window_trend": [{"time": 1, "people": [x1,x2...]}, ...],  # 窗口排队趋势
        "table_trend": [{"time": 1, "used": z1, "remaining": y1}, ...],  # 桌子占用趋势
        "window_evaluation": "体验良好/体验较差",  # 窗口排队评价
        "table_evaluation": "体验良好/体验较差"   # 桌子占用评价
    }
    """
    try:
        # 1. 获取前端session ID
        session_id = session.get("session_id")
        if not session_id:
            return jsonify({"success": False, "msg": "未检测到仿真session，请先启动仿真"}), 400
        
        # 2. 停止仿真
        simulation_id = simulation_manager.stop_simulation(session_id)
        if not simulation_id:
            return jsonify({"success": False, "msg": "无运行中的仿真，无需结束"}), 400
        
        # 3. 查询仿真数据，构造趋势数据（与前端折线图渲染函数参数对齐）
        simulation_data = db.get_simulation_data(simulation_id)
        if not simulation_data:
            return jsonify({"success": False, "msg": "仿真数据为空"}), 400
        
        # 拆分窗口趋势和桌子趋势
        window_trend = [{"time": d["time"], "people": d["people"]} for d in simulation_data]
        table_trend = [{"time": d["time"], "used": d["used"], "remaining": d["remaining"]} for d in simulation_data]
        
        # 4. 查询仿真基础信息，计算体验评价
        current_simulation = db.get_current_simulation(session_id)  # 此时status已为1，但可查询基础信息
        if not current_simulation:
            return jsonify({"success": False, "msg": "仿真信息查询失败"}), 400
        
        window_evaluation, table_evaluation = simulation_manager.calculate_evaluation(
            simulation_id=simulation_id,
            window_num=current_simulation["window_num"],
            table_num=current_simulation["table_num"]
        )
        
        # 5. 构造响应数据（与前端endSimulation回调预期一致）
        response_data = {
            "window_trend": window_trend,
            "table_trend": table_trend,
            "window_evaluation": window_evaluation,
            "table_evaluation": table_evaluation
        }
        
        logger.info("结束仿真接口调用成功，SessionID：%s，仿真ID：%s", session_id, simulation_id)
        return jsonify({"success": True, "msg": "仿真结束成功", "data": response_data}), 200
    
    except Exception as e:
        logger.error("结束仿真接口异常：%s", str(e))
        return jsonify({"success": False, "msg": f"仿真结束失败：{str(e)}"}), 500

# ===================== SocketIO事件处理 =====================
@socketio.on("connect")
def handle_connect():
    """处理前端SocketIO连接，将用户加入专属房间（按session ID）"""
    session_id = session.get("session_id")
    if session_id:
        join_room(session_id)
        logger.info("SocketIO连接成功，SessionID：%s，Room：%s", request.sid, session_id)
    else:
        logger.warning("SocketIO连接失败：无session ID")

@socketio.on("disconnect")
def handle_disconnect():
    """处理前端SocketIO断开连接，离开房间"""
    session_id = session.get("session_id")
    if session_id:
        leave_room(session_id)
        # 断开连接时自动停止仿真
        simulation_manager.stop_simulation(session_id)
        logger.info("SocketIO断开连接，SessionID：%s，已自动停止仿真", session_id)

# ===================== 程序入口 =====================
if __name__ == "__main__":
    try:
        logger.info("餐厅打饭仿真系统后端启动中，端口：%s，调试模式：%s", FLASK_PORT, DEBUG)
        # 启动SocketIO服务（替代app.run）
        socketio.run(
            app,
            host="0.0.0.0",  # 允许外部访问（本地测试用127.0.0.1）
            port=FLASK_PORT,
            debug=DEBUG
        )
    except Exception as e:
        logger.error("后端启动失败：%s", str(e))
    finally:
        # 程序退出时关闭数据库连接
        db.close()