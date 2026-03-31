from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, join_room
import random
import time
import threading
import uuid
import os

# 获取当前脚本所在目录（app.py所在目录）
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_FOLDER = os.path.join(BASE_DIR, 'static')

app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path='/static')
app.config['SECRET_KEY'] = 'simulation-secret-key'

# ========== Favicon 处理 ==========
@app.route('/favicon.ico')
def favicon():
    return '', 204  # 返回 204 No Content，避免 404 错误

# ========== 终极CORS修复：强制添加响应头 ==========
@app.after_request
def add_cors_headers(response):
    """强制为所有响应添加CORS头，覆盖SocketIO的polling请求"""
    # 允许前端origin（支持localhost、127.0.0.1、局域网IP等所有5000端口访问）
    origin = request.headers.get('Origin')
    allowed_origins = [
        'http://localhost:5000', 
        'http://127.0.0.1:5000',
        'http://10.61.90.246:5000'  # 添加局域网IP支持
    ]
    
    # 灵活检查：支持所有本地和局域网 IP 访问（端口5000）
    if origin and origin.endswith(':5000'):
        response.headers['Access-Control-Allow-Origin'] = origin
    elif origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = 'http://127.0.0.1:5000'  # 默认允许本地
    
    # 必须的CORS头
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'  # 允许携带Cookie
    return response

# 预处理OPTIONS请求（跨域预检）
@app.route('/socket.io/<path:path>', methods=['OPTIONS'])
def handle_socketio_options(path):
    response = make_response()
    origin = request.headers.get('Origin')
    # 只有当origin以:5000结尾，才返回具体的origin（不能返回*，因为使用了credentials）
    if origin and origin.endswith(':5000'):
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = 'http://127.0.0.1:5000'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# ========== 初始化SocketIO（兼容所有版本） ==========
# 关键：降低SocketIO版本兼容，强制使用polling传输
# CORS修复：不能使用"*"，改用列表 + 验证函数
def cors_allowed_origins_func(origin):
    """CORS origin 验证函数：允许所有以:5000结尾的origin（本地/局域网IP）"""
    return origin.endswith(':5000') if origin else False

socketio = SocketIO(
    app,
    cors_allowed_origins=cors_allowed_origins_func,  # 使用验证函数而非通配符
    async_mode='threading',    # 异步模式避免阻塞
    ping_timeout=60,           # 延长超时
    transports=['websocket', 'polling']  # WebSocket优先（更高效），polling备选（兼容性）
)

# ========== 原有仿真逻辑（不变） ==========
simulation_tasks = {}

def simulation_loop(session_id, params):
    window_num = params['window_num']
    table_num = params['table_num']
    window_people = [0] * window_num
    used_table = 0
    remaining_table = table_num

    while session_id in simulation_tasks and simulation_tasks[session_id]['running']:
        try:
            # 模拟数据变化
            for i in range(window_num):
                window_people[i] += random.randint(0, params['max_people'] // 5)
                if window_people[i] > 0:
                    window_people[i] -= 1

            if remaining_table > 0 and random.random() < 0.3:
                used_table += 1
                remaining_table -= 1
            if used_table > 0 and random.random() < 0.1:
                used_table -= 1
                remaining_table += 1

            # 推送实时数据
            socketio.emit(
                'simulation_data',
                {
                    'window_people': window_people,
                    'used_table': used_table,
                    'remaining_table': remaining_table,
                    'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
                },
                room=session_id
            )

            time.sleep(1)
        except Exception as e:
            print(f"仿真循环错误：{e}")
            break

@app.route('/api/start-simulation', methods=['POST'])
def start_simulation():
    try:
        params = request.get_json()
        print("收到启动请求：", params)
        print("请求Content-Type:", request.content_type)

        if not params:
            print("ERROR: params为None或空")
            return jsonify({'success': False, 'msg': '请求体为空或不是JSON格式', 'data': None})

        required = ['dining_time', 'meal_time', 'max_people', 'window_num', 'table_num']
        for p in required:
            if p not in params:
                print(f"ERROR: 缺少参数 {p}")
                return jsonify({'success': False, 'msg': f'参数{p}缺失', 'data': None})
            if not isinstance(params[p], int):
                print(f"ERROR: 参数 {p} 类型错误，期望int，得到{type(params[p])}")
                return jsonify({'success': False, 'msg': f'参数{p}必须是整数', 'data': None})
            if params[p] < 0:
                print(f"ERROR: 参数 {p} 为负数")
                return jsonify({'success': False, 'msg': f'参数{p}不能为负数', 'data': None})

        session_id = str(uuid.uuid4())
        simulation_tasks[session_id] = {
            'running': True,
            'params': params,
            'thread': None
        }

        thread = threading.Thread(target=simulation_loop, args=(session_id, params))
        thread.daemon = True
        thread.start()
        simulation_tasks[session_id]['thread'] = thread

        return jsonify({
            'success': True,
            'msg': '仿真启动成功',
            'data': {'session_id': session_id}
        })
    except Exception as e:
        print(f"启动接口错误：{e}")
        return jsonify({'success': False, 'msg': str(e), 'data': None})

@app.route('/api/end-simulation', methods=['POST'])
def end_simulation():
    try:
        data = request.get_json()
        print("收到结束仿真请求：", data)
        
        if not data:
            print("ERROR: data为None或空")
            return jsonify({'success': False, 'msg': '请求体为空', 'data': None})
        
        session_id = data.get('session_id')
        print(f"提取的session_id: {session_id}")

        if not session_id or session_id not in simulation_tasks:
            return jsonify({'success': False, 'msg': '无运行中的仿真', 'data': None})

        simulation_tasks[session_id]['running'] = False
        simulation_tasks[session_id]['thread'].join(timeout=2)
        del simulation_tasks[session_id]

        window_trend = [{'time': i, 'people': [random.randint(0, 10) for _ in range(4)]} for i in range(10)]
        table_trend = [{'time': i, 'used': random.randint(0, 100), 'remaining': 444 - random.randint(0, 100)} for i in range(10)]

        return jsonify({
            'success': True,
            'msg': '仿真结束成功',
            'data': {
                'window_evaluation': '体验良好' if random.random() > 0.5 else '体验较差',
                'table_evaluation': '体验良好' if random.random() > 0.5 else '体验较差',
                'window_trend': window_trend,
                'table_trend': table_trend
            }
        })
    except Exception as e:
        print(f"结束接口错误：{e}")
        return jsonify({'success': False, 'msg': str(e), 'data': None})

@socketio.on('bind_session')
def bind_session(session_id):
    join_room(session_id)
    # 修复：用 request.sid 获取当前客户端的连接 ID
    print(f"客户端{request.sid}绑定session: {session_id}")
# ========== 启动服务（关键：指定端口5000） ==========

# ========== 添加根路由，返回 simulation.html ========== 
from flask import send_from_directory

@app.route('/')
def index():
    return send_from_directory('static/html', 'simulation.html')

if __name__ == '__main__':
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True  # 允许开发环境使用Werkzeug
    )