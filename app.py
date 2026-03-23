from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
from flask_socketio import SocketIO, join_room
import random
import time
import threading
import uuid

app = Flask(__name__)
app.config['SECRET_KEY'] = 'simulation-secret-key'

# ========== 终极CORS修复：强制添加响应头 ==========
@app.after_request
def add_cors_headers(response):
    """强制为所有响应添加CORS头，覆盖SocketIO的polling请求"""
    # 允许前端origin（localhost:5000和127.0.0.1:5000）
    origin = request.headers.get('Origin')
    allowed_origins = ['http://localhost:5000', 'http://127.0.0.1:5000']
    if origin in allowed_origins:
        response.headers['Access-Control-Allow-Origin'] = origin
    else:
        response.headers['Access-Control-Allow-Origin'] = '*'  # 测试阶段兜底
    
    # 必须的CORS头
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'  # 允许携带Cookie
    return response

# 预处理OPTIONS请求（跨域预检）
@app.route('/socket.io/<path:path>', methods=['OPTIONS'])
def handle_socketio_options(path):
    response = make_response()
    response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    return response

# ========== 初始化SocketIO（兼容所有版本） ==========
# 关键：降低SocketIO版本兼容，强制使用polling传输
socketio = SocketIO(
    app,
    cors_allowed_origins="*",  # 允许所有来源
    async_mode='threading',    # 异步模式避免阻塞
    ping_timeout=60,           # 延长超时
    transports=['polling']     # 强制使用polling（避免websocket跨域问题）
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

        required = ['dining_time', 'meal_time', 'max_people', 'window_num', 'table_num']
        for p in required:
            if p not in params or not isinstance(params[p], int) or params[p] < 0:
                return jsonify({'success': False, 'msg': f'参数{p}错误', 'data': None})

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
        session_id = data.get('session_id')

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
if __name__ == '__main__':
    socketio.run(
        app,
        host='0.0.0.0',
        port=5000,
        debug=True,
        allow_unsafe_werkzeug=True  # 允许开发环境使用Werkzeug
    )