# -*- coding: utf-8 -*-
from flask import Flask, request, jsonify, make_response, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, join_room
import os
import json
import urllib.request
import urllib.error

from simulation import RestaurantSimulation
from database import db
from config import CORS_ALLOWED_ORIGINS

# 获取当前脚本所在目录（app.py所在目录）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_FOLDER = os.path.join(BASE_DIR, 'static')

app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path='/static')
app.config['SECRET_KEY'] = os.environ.get('SIMULATION_SECRET_KEY', 'simulation-secret-key')

# ========== Favicon 处理 ==========
@app.route('/favicon.ico')
def favicon():
    return '', 204

# ========== CORS 策略 ==========
def _is_allowed_origin(origin):
    """检查 origin 是否在允许列表中（去掉末尾斜杠后匹配）。"""
    if not origin:
        return False
    for allowed in CORS_ALLOWED_ORIGINS:
        if origin.rstrip('/') == allowed.rstrip('/'):
            return True
    return False

def _get_allow_origin(request_origin):
    """获取允许的 origin，若请求 origin 不在列表则返回 None。
    修复：不再返回默认 origin，避免浏览器因 origin 不匹配而阻止响应。"""
    if request_origin and _is_allowed_origin(request_origin):
        return request_origin
    return None

@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin')
    if not origin:
        return response  # 非浏览器请求，不添加 CORS 头
    allowed = _get_allow_origin(origin)
    if not allowed:
        return response  # 未授权 origin，不添加 CORS 头
    response.headers['Access-Control-Allow-Origin'] = allowed
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-API-Token'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

@app.route('/socket.io/<path:path>', methods=['OPTIONS'])
def handle_socketio_options(path):
    response = make_response()
    origin = request.headers.get('Origin')
    if origin:
        allowed = _get_allow_origin(origin)
        if allowed:
            response.headers['Access-Control-Allow-Origin'] = allowed
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# ========== SocketIO 初始化 ==========
def cors_allowed_origins_func(origin):
    return _is_allowed_origin(origin) if origin else False

socketio = SocketIO(
    app,
    cors_allowed_origins=cors_allowed_origins_func,
    async_mode='threading',
    ping_timeout=60,
    transports=['websocket', 'polling'],
)

# ========== 仿真管理器 ==========
simulation = RestaurantSimulation(socketio)

# ========== 鉴权（可选） ==========
API_TOKEN = os.environ.get('SIMULATION_API_TOKEN', '')

def _check_auth():
    """如果设置了 API_TOKEN 环境变量，则验证请求头中的 X-API-Token。"""
    if not API_TOKEN:
        return True  # 未配置 token 时跳过鉴权
    token = request.headers.get('X-API-Token', '')
    return token == API_TOKEN

def _auth_error():
    return jsonify({'success': False, 'msg': '未授权：缺少或无效的 X-API-Token', 'data': None}), 401

# ========== API 路由 ==========

@app.route('/api/start-simulation', methods=['POST'])
def start_simulation():
    if not _check_auth():
        return _auth_error()
    try:
        params = request.get_json()
        print("收到启动请求：", params)

        if not params:
            return jsonify({'success': False, 'msg': '请求体为空或不是JSON格式', 'data': None})

        required = ['dining_time', 'meal_time', 'max_people', 'window_num', 'table_num']
        for p in required:
            if p not in params:
                return jsonify({'success': False, 'msg': f'参数{p}缺失', 'data': None})
            if not isinstance(params[p], int):
                return jsonify({'success': False, 'msg': f'参数{p}必须是整数', 'data': None})
            if params[p] < 0:
                return jsonify({'success': False, 'msg': f'参数{p}不能为负数', 'data': None})

        # 优先使用客户端传入的 session_id（用于修复时序竞争），否则新建
        session_id = params.get('session_id')
        if not session_id:
            import uuid
            session_id = str(uuid.uuid4())

        simulation_id = simulation.start_simulation(
            session_id=session_id,
            dining_time=params['dining_time'],
            meal_time=params['meal_time'],
            max_people=params['max_people'],
            window_num=params['window_num'],
            table_num=params['table_num'],
        )

        if not simulation_id:
            return jsonify({'success': False, 'msg': '仿真启动失败', 'data': None})

        return jsonify({
            'success': True,
            'msg': '仿真启动成功',
            'data': {'session_id': session_id},
        })
    except Exception as e:
        print(f"启动接口错误：{e}")
        return jsonify({'success': False, 'msg': str(e), 'data': None})


@app.route('/api/end-simulation', methods=['POST'])
def end_simulation():
    if not _check_auth():
        return _auth_error()
    try:
        data = request.get_json()
        print("收到结束仿真请求：", data)

        if not data:
            return jsonify({'success': False, 'msg': '请求体为空', 'data': None})

        session_id = data.get('session_id')
        if not session_id:
            return jsonify({'success': False, 'msg': '缺少session_id', 'data': None})

        # 停止前先获取仿真信息（停止后 status 变为 1，查询会返回 None）
        sim_info = simulation.get_current_simulation(session_id)
        if not sim_info:
            sim_info = db.get_simulation_info_by_session(session_id)

        window_num = sim_info.get('window_num', 4) if sim_info else 4
        table_num = sim_info.get('table_num', 100) if sim_info else 100

        # 停止仿真线程
        simulation_id = simulation.stop_simulation(session_id)

        # 🟢 兜底：如果 stop_simulation 返回 None（线程已意外退出），
        # 仍从 DB 获取已产生的数据，确保前端能拿到趋势和评价
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

        # 从数据库查询真实仿真数据
        sim_data = simulation.get_simulation_data(simulation_id)

        # 构建基于真实数据的趋势
        if sim_data and len(sim_data) > 0:
            window_trend = [{'time': d['time'], 'people': d['people']} for d in sim_data]
            table_trend = [{'time': d['time'], 'used': d['used'], 'remaining': d['remaining']} for d in sim_data]
        else:
            window_trend = []
            table_trend = []

        # 真实评价（基于数据库中的历史数据）
        window_eval, table_eval = simulation.calculate_evaluation(
            simulation_id, window_num, table_num
        )

        return jsonify({
            'success': True,
            'msg': '仿真结束成功',
            'data': {
                'window_evaluation': window_eval,
                'table_evaluation': table_eval,
                'window_trend': window_trend,
                'table_trend': table_trend,
            },
        })
    except Exception as e:
        print(f"结束接口错误：{e}")
        return jsonify({'success': False, 'msg': str(e), 'data': None})


# ========== AI 代理端点 ==========

@app.route('/api/ai-analyze', methods=['POST'])
def ai_analyze():
    """后端代理转发 AI 分析请求，避免浏览器端 CORS 限制。"""
    if not _check_auth():
        return _auth_error()

    try:
        body = request.get_json()
        if not body:
            return jsonify({'success': False, 'msg': '请求体为空', 'data': None})

        api_url = body.get('api_url', '').strip()
        api_key = body.get('api_key', '').strip()
        payload = body.get('payload', {})

        if not api_url:
            return jsonify({'success': False, 'msg': '缺少 api_url', 'data': None})
        if not api_key:
            return jsonify({'success': False, 'msg': '缺少 api_key', 'data': None})

        req_body = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            api_url,
            data=req_body,
            headers={
                'Content-Type': 'application/json;charset=utf-8',
                'Authorization': f'Bearer {api_key}',
            },
            method='POST',
        )

        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        return jsonify({
            'success': True,
            'msg': 'AI 分析完成',
            'data': result,
        })
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        print(f"AI代理 HTTP 错误 {e.code}: {error_body}")
        return jsonify({
            'success': False,
            'msg': f'AI API 返回错误 {e.code}',
            'data': None,
        })
    except Exception as e:
        print(f"AI代理错误：{e}")
        return jsonify({'success': False, 'msg': str(e), 'data': None})


# ========== SocketIO 事件 ==========

@socketio.on('bind_session')
def bind_session(session_id):
    join_room(session_id)
    print(f"客户端{request.sid}绑定session: {session_id}")


# ========== 根路由 ==========

@app.route('/')
def index():
    return send_from_directory('static/html', 'simulation.html')


# ========== 启动 ==========

if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5001))
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=True,
        allow_unsafe_werkzeug=True,
    )
