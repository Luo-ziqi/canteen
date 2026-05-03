# -*- coding: utf-8 -*-
"""
餐厅打饭仿真系统 - 仿真核心模块
功能：
1. 管理仿真线程（启动/停止），确保单session仅运行一个仿真
2. 模拟餐厅打饭场景：生成实时窗口等待人数、桌子占用数据
3. 计算仿真趋势数据和体验评价，与前端渲染逻辑匹配
4. 通过SocketIO向前端推送实时数据
依赖：config.py（仿真参数）、database.py（数据存储）、threading（线程管理）
"""
import threading
import time
import random
import logging
from config import SIMULATION_TIME_STEP, WINDOW_EVAL_THRESHOLD, TABLE_EVAL_THRESHOLD
from database import db

# 初始化日志
logger = logging.getLogger(__name__)

class RestaurantSimulation:
    def __init__(self, socketio):
        """
        初始化仿真管理器
        :param socketio: Flask-SocketIO实例，用于向前端推送数据
        """
        self.socketio = socketio
        self.simulation_threads = {}  # 存储运行中的仿真线程：{session_id: thread}
        self.simulation_stop_flags = {}  # 仿真停止标志：{session_id: bool}

    def start_simulation(self, session_id, dining_time, meal_time, max_people, window_num, table_num):
        """
        启动仿真线程
        :param session_id: 前端session ID
        :param dining_time: 平均用餐时间（分钟）→ 转换为秒：dining_time * 60
        :param meal_time: 平均打饭时间（秒/人）
        :param max_people: 每分钟最大进入人数 → 转换为每秒：max_people / 60
        :param window_num: 窗口数
        :param table_num: 桌子总数
        :return: 启动结果（True/False）
        """
        # 检查是否已有运行中的仿真
        if session_id in self.simulation_threads and self.simulation_threads[session_id].is_alive():
            logger.warning("SessionID=%s已有运行中的仿真，禁止重复启动", session_id)
            return False
        
        # 新增仿真到数据库
        simulation_id = db.add_simulation(
            session_id=session_id,
            dining_time=dining_time,
            meal_time=meal_time,
            max_people=max_people,
            window_num=window_num,
            table_num=table_num
        )
        if not simulation_id:
            return False
        
        # 设置停止标志为False
        self.simulation_stop_flags[session_id] = False
        
        # 启动仿真线程
        simulation_thread = threading.Thread(
            target=self._simulation_loop,
            args=(session_id, simulation_id, dining_time, meal_time, max_people, window_num, table_num),
            daemon=True  # 守护线程，主程序退出时自动结束
        )
        self.simulation_threads[session_id] = simulation_thread
        simulation_thread.start()
        logger.info("仿真线程启动成功，SessionID：%s，仿真ID：%s", session_id, simulation_id)
        return True

    def _simulation_loop(self, session_id, simulation_id, dining_time, meal_time, max_people, window_num, table_num):
        """
        仿真主循环：每秒生成一次实时数据，推送至前端，并存入数据库
        :param session_id: 前端session ID
        :param simulation_id: 仿真ID
        :param dining_time: 平均用餐时间（分钟）
        :param meal_time: 平均打饭时间（秒/人）
        :param max_people: 每分钟最大进入人数
        :param window_num: 窗口数
        :param table_num: 桌子总数
        """
        # 仿真初始化参数
        time_step = 0  # 仿真时间步长（第N秒）
        dining_time_sec = dining_time * 60  # 用餐时间转换为秒
        max_people_per_sec = max_people / 60  # 每秒最大进入人数
        
        # 窗口状态：各窗口当前等待人数
        window_people = [0] * window_num
        # 桌子状态：存储每张桌子的占用结束时间（0表示空闲）
        table_occupied_end_time = [0] * table_num
        # 等待入座的人数（桌子满时排队）
        waiting_for_table = 0

        try:
            while not self.simulation_stop_flags[session_id]:
                time_step += 1
                # 1. 模拟时间流逝：更新桌子状态（释放已到用餐时间的桌子）
                current_time = time_step
                for i in range(table_num):
                    if table_occupied_end_time[i] != 0 and current_time >= table_occupied_end_time[i]:
                        table_occupied_end_time[i] = 0  # 释放桌子
                
                # 2. 模拟新进入餐厅的人数（随机≤max_people_per_sec）
                new_people = int(random.uniform(0, max_people_per_sec))
                if new_people > 0:
                    logger.debug("第%s秒，新进入人数：%s", time_step, new_people)
                
                # 3. 分配新进入的人到窗口排队
                if new_people > 0:
                    # 简单负载均衡：分配到当前人数最少的窗口
                    for _ in range(new_people):
                        min_index = window_people.index(min(window_people))
                        window_people[min_index] += 1
                
                # 4. 模拟窗口打饭：每个窗口每秒处理1/meal_time人（四舍五入）
                for i in range(window_num):
                    if window_people[i] > 0:
                        processed_people = round(1 / meal_time) if meal_time > 0 else window_people[i]
                        processed_people = min(processed_people, window_people[i])
                        window_people[i] -= processed_people
                        # 打完饭的人去占桌子
                        waiting_for_table += processed_people
                
                # 5. 分配桌子：等待入座的人占用空闲桌子
                free_table_count = table_occupied_end_time.count(0)
                if waiting_for_table > 0 and free_table_count > 0:
                    occupied_count = min(waiting_for_table, free_table_count)
                    # 随机分配空闲桌子
                    free_indices = [i for i, val in enumerate(table_occupied_end_time) if val == 0]
                    for i in free_indices[:occupied_count]:
                        # 随机用餐时间（±20%波动）
                        actual_dining_time = int(dining_time_sec * random.uniform(0.8, 1.2))
                        table_occupied_end_time[i] = current_time + actual_dining_time
                    waiting_for_table -= occupied_count
                
                # 6. 计算当前桌子状态
                used_table = table_num - free_table_count
                remaining_table = free_table_count
                
                # 7. 存储实时数据到数据库
                db.add_simulation_data(
                    simulation_id=simulation_id,
                    time_step=time_step,
                    window_people=window_people,
                    used_table=used_table,
                    remaining_table=remaining_table
                )
                
                # 8. 向前端推送实时数据（SocketIO），与前端receiveSimulationData回调参数对齐
                self.socketio.emit(
                    "simulation_data",  # 事件名，必须与前端socket.js中的监听事件一致
                    {
                        "window_people": window_people,
                        "remaining_table": remaining_table,
                        "used_table": used_table
                    },
                    room=session_id  # 仅推送给当前session的前端
                )
                
                # 9. 仿真时间步长：每秒执行一次
                time.sleep(SIMULATION_TIME_STEP)
                
        except Exception as e:
            logger.error("仿真线程运行异常：%s", str(e))
        finally:
            logger.info("仿真线程已结束，SessionID：%s，仿真ID：%s", session_id, simulation_id)

    def stop_simulation(self, session_id):
        """
        停止仿真线程
        :param session_id: 前端session ID
        :return: 仿真ID（用于查询数据）
        """
        # 检查是否有运行中的仿真
        if session_id not in self.simulation_threads or not self.simulation_threads[session_id].is_alive():
            logger.warning("SessionID=%s无运行中的仿真，无需停止", session_id)
            return None
        
        # 设置停止标志，结束仿真循环
        self.simulation_stop_flags[session_id] = True
        
        # 等待线程结束
        self.simulation_threads[session_id].join(timeout=5)
        if self.simulation_threads[session_id].is_alive():
            logger.warning("仿真线程强制结束，SessionID：%s", session_id)
        
        # 结束数据库中的仿真状态
        simulation_id = db.end_simulation(session_id)
        
        # 清理线程和标志
        del self.simulation_threads[session_id]
        del self.simulation_stop_flags[session_id]
        
        return simulation_id

    def calculate_evaluation(self, simulation_id, window_num, table_num):
        """
        计算仿真体验评价（与前端showEvaluation渲染函数参数对齐）
        :param simulation_id: 仿真ID
        :param window_num: 窗口数
        :param table_num: 桌子总数
        :return: (window_evaluation, table_evaluation)
        """
        # 查询仿真数据
        simulation_data = db.get_simulation_data(simulation_id)
        if not simulation_data:
            return "无数据", "无数据"
        
        # 1. 窗口排队体验评价：计算平均排队人数，≥阈值则"体验较差"，否则"体验良好"
        total_people = 0
        total_count = 0
        for data in simulation_data:
            total_people += sum(data["people"])
            total_count += len(data["people"])
        avg_window_people = total_people / total_count if total_count > 0 else 0
        window_evaluation = "体验较差" if avg_window_people >= WINDOW_EVAL_THRESHOLD else "体验良好"
        
        # 2. 桌子占用体验评价：计算平均占用率，≥阈值则"体验较差"，否则"体验良好"
        total_used = 0
        total_steps = len(simulation_data)
        for data in simulation_data:
            total_used += data["used"]
        avg_used_table = total_used / total_steps if total_steps > 0 else 0
        table_usage_rate = avg_used_table / table_num if table_num > 0 else 0
        table_evaluation = "体验较差" if table_usage_rate >= TABLE_EVAL_THRESHOLD else "体验良好"
        
        logger.info(
            "仿真评价计算完成，仿真ID：%s，窗口平均人数：%.2f，桌子占用率：%.2f，窗口评价：%s，桌子评价：%s",
            simulation_id, avg_window_people, table_usage_rate, window_evaluation, table_evaluation
        )
        return window_evaluation, table_evaluation