# -*- coding: utf-8 -*-
"""
餐厅打饭仿真系统 - 仿真核心模块
功能：
1. 管理仿真线程（启动/停止），确保单session仅运行一个仿真
2. 模拟餐厅打饭场景：正态分布到达 → 窗口排队 → 打饭处理 → 桌子占用
3. 计算仿真趋势数据和体验评价，与前端渲染逻辑匹配
4. 通过SocketIO向前端推送实时数据
依赖：config.py（仿真参数）、database.py（数据存储）、threading（线程管理）
"""
import threading
import time
import random
import logging
from config import (
    SIMULATION_TIME_STEP,
    WINDOW_EVAL_THRESHOLD,
    TABLE_EVAL_THRESHOLD,
    PEOPLE_ARRIVAL_MEAN_RATIO,
    PEOPLE_ARRIVAL_STD_RATIO,
    PEOPLE_ARRIVAL_MAX_RATIO,
    WINDOW_DIST_MEAN_RATIO,
    WINDOW_DIST_STD_RATIO,
    MAX_CONCURRENT_SIMULATIONS,
)
from database import db

logger = logging.getLogger(__name__)


class RestaurantSimulation:
    def __init__(self, socketio):
        """
        初始化仿真管理器
        :param socketio: Flask-SocketIO实例，用于向前端推送数据
        """
        self.socketio = socketio
        self.simulation_threads = {}      # {session_id: thread}
        self.simulation_stop_flags = {}   # {session_id: bool}
        self.simulation_ids = {}          # {session_id: simulation_id}

    def start_simulation(self, session_id, dining_time, meal_time, max_people, window_num, table_num):
        """
        启动仿真线程，返回 simulation_id（失败返回 None）。
        """
        if session_id in self.simulation_threads and self.simulation_threads[session_id].is_alive():
            logger.warning("SessionID=%s已有运行中的仿真，禁止重复启动", session_id)
            return None

        # 检查并发上限
        active_count = sum(1 for t in self.simulation_threads.values() if t.is_alive())
        if active_count >= MAX_CONCURRENT_SIMULATIONS:
            logger.warning("已达仿真并发上限 %d，拒绝启动新仿真", MAX_CONCURRENT_SIMULATIONS)
            return None

        simulation_id = db.add_simulation(
            session_id=session_id,
            dining_time=dining_time,
            meal_time=meal_time,
            max_people=max_people,
            window_num=window_num,
            table_num=table_num,
        )
        if not simulation_id:
            return None

        self.simulation_stop_flags[session_id] = False
        self.simulation_ids[session_id] = simulation_id

        thread = threading.Thread(
            target=self._simulation_loop,
            args=(session_id, simulation_id, dining_time, meal_time, max_people, window_num, table_num),
            daemon=True,
        )
        self.simulation_threads[session_id] = thread
        thread.start()
        logger.info("仿真线程启动成功，SessionID：%s，仿真ID：%s", session_id, simulation_id)
        return simulation_id

    def _simulation_loop(self, session_id, simulation_id, dining_time, meal_time, max_people, window_num, table_num):
        """
        仿真主循环
        """
        time_step = 0
        dining_time_sec = dining_time * 60          # 分钟 → 秒
        max_people_per_sec = max_people / 60.0      # 每分钟 → 每秒

        # 正态分布参数
        mu = max_people_per_sec * PEOPLE_ARRIVAL_MEAN_RATIO
        sigma = max_people_per_sec * PEOPLE_ARRIVAL_STD_RATIO
        max_arrival = max_people_per_sec * PEOPLE_ARRIVAL_MAX_RATIO

        window_people = [0] * window_num
        table_occupied_end_time = [0] * table_num   # 每张桌子的释放时间（0=空闲）
        waiting_for_table = 0

        # 🔧 修复：打饭速率使用浮点累计器，不再用 round(1/meal_time)
        window_accumulator = [0.0] * window_num

        try:
            while not self.simulation_stop_flags.get(session_id, True):
                time_step += 1
                current_time = time_step

                # 1. 释放到期桌子
                for i in range(table_num):
                    if table_occupied_end_time[i] != 0 and current_time >= table_occupied_end_time[i]:
                        table_occupied_end_time[i] = 0

                # 2. 🔧 正态分布生成新到达人数（截断到 [0, max_arrival]）
                new_people = int(random.gauss(mu, sigma))
                new_people = max(0, min(new_people, int(max_arrival)))

                # 3. 正态分布分配到窗口：中间窗口概率高，两侧概率低
                window_mu = (window_num - 1) * WINDOW_DIST_MEAN_RATIO
                window_sigma = window_num * WINDOW_DIST_STD_RATIO
                for _ in range(new_people):
                    win_idx = int(random.gauss(window_mu, window_sigma))
                    win_idx = max(0, min(win_idx, window_num - 1))
                    window_people[win_idx] += 1

                # 4. 🔧 修复：浮点累计器处理窗口打饭
                for i in range(window_num):
                    if window_people[i] > 0 and meal_time > 0:
                        window_accumulator[i] += 1.0 / meal_time
                        processed = int(window_accumulator[i])
                        if processed > 0:
                            processed = min(processed, window_people[i])
                            window_people[i] -= processed
                            waiting_for_table += processed
                            window_accumulator[i] -= processed

                # 5. 分配桌子
                free_table_count_before = table_occupied_end_time.count(0)
                if waiting_for_table > 0 and free_table_count_before > 0:
                    occupied_count = min(waiting_for_table, free_table_count_before)
                    free_indices = [i for i, v in enumerate(table_occupied_end_time) if v == 0]
                    for idx in free_indices[:occupied_count]:
                        actual_dining = int(dining_time_sec * random.uniform(0.8, 1.2))
                        table_occupied_end_time[idx] = current_time + actual_dining
                    waiting_for_table -= occupied_count

                # 6. 🔧 修复：分配后重新计算桌子状态
                used_table = table_num - table_occupied_end_time.count(0)
                remaining_table = table_num - used_table

                # 7. 存入数据库
                db.add_simulation_data(
                    simulation_id=simulation_id,
                    time_step=time_step,
                    window_people=window_people,
                    used_table=used_table,
                    remaining_table=remaining_table,
                )

                # 8. 推送到前端
                self.socketio.emit(
                    "simulation_data",
                    {
                        "window_people": list(window_people),
                        "remaining_table": remaining_table,
                        "used_table": used_table,
                    },
                    room=session_id,
                )

                time.sleep(SIMULATION_TIME_STEP)

        except Exception as e:
            logger.error("仿真线程运行异常：%s", str(e))
        finally:
            logger.info("仿真线程已结束，SessionID：%s，仿真ID：%s", session_id, simulation_id)

    def stop_simulation(self, session_id):
        """停止仿真线程，返回 simulation_id（失败返回 None）。

        修复：即使线程已意外退出，仍从 DB 获取 simulation_id，
        确保已产生的仿真数据可以被查询到。
        """
        # 尝试正常停止线程
        if session_id in self.simulation_threads and self.simulation_threads[session_id].is_alive():
            self.simulation_stop_flags[session_id] = True
            self.simulation_threads[session_id].join(timeout=5)
            if self.simulation_threads[session_id].is_alive():
                logger.warning("仿真线程强制结束，SessionID：%s", session_id)
        elif session_id not in self.simulation_threads:
            logger.warning("SessionID=%s不在线程列表中（可能未启动或已清理）", session_id)
        else:
            logger.warning("SessionID=%s的仿真线程已意外退出", session_id)

        # 🟢 修复：即使线程已死，仍尝试从 DB 结束仿真并返回 simulation_id
        simulation_id = db.end_simulation(session_id)
        if not simulation_id:
            # 兜底：从 self.simulation_ids 或 DB 中查找
            simulation_id = self.simulation_ids.get(session_id)
            if not simulation_id:
                sim_info = db.get_simulation_info_by_session(session_id)
                if sim_info:
                    # 手动标记为结束
                    simulation_id = db.end_simulation(session_id)

        # 清理
        self.simulation_threads.pop(session_id, None)
        self.simulation_stop_flags.pop(session_id, None)
        self.simulation_ids.pop(session_id, None)

        return simulation_id

    def calculate_evaluation(self, simulation_id, window_num, table_num):
        """计算仿真体验评价，返回 (window_eval, table_eval)。"""
        data = db.get_simulation_data(simulation_id)
        if not data:
            return "无数据", "无数据"

        total_people = 0
        total_count = 0
        total_used = 0
        for d in data:
            total_people += sum(d["people"])
            total_count += len(d["people"])
            total_used += d["used"]

        avg_window = total_people / total_count if total_count > 0 else 0
        avg_used = total_used / len(data) if data else 0
        usage_rate = avg_used / table_num if table_num > 0 else 0

        win_eval = "体验较差" if avg_window >= WINDOW_EVAL_THRESHOLD else "体验良好"
        tbl_eval = "体验较差" if usage_rate >= TABLE_EVAL_THRESHOLD else "体验良好"

        logger.info("仿真ID=%s 窗口均值=%.2f 桌子占用率=%.2f → %s / %s",
                     simulation_id, avg_window, usage_rate, win_eval, tbl_eval)
        return win_eval, tbl_eval

    def get_simulation_data(self, simulation_id):
        """获取仿真数据用于前端趋势图。"""
        return db.get_simulation_data(simulation_id)

    def get_current_simulation(self, session_id):
        """查询当前运行中的仿真实例信息。"""
        return db.get_current_simulation(session_id)
