# -*- coding: utf-8 -*-
"""
餐厅打饭仿真系统 - 数据库模块
功能：
1. 初始化SQLite数据库，创建仿真信息表、仿真数据表
2. 提供仿真信息的增删改查（新增仿真、查询当前仿真、结束仿真）
3. 提供仿真实时数据的插入、查询（用于生成趋势图表）
依赖：config.py（数据库路径）、sqlite3（Python内置）
"""
import sqlite3
import logging
from datetime import datetime
from config import DB_PATH

# 初始化日志
logger = logging.getLogger(__name__)

class SimulationDatabase:
    def __init__(self):
        """初始化数据库连接，创建所需表（不存在则创建）"""
        self.conn = None
        self.cursor = None
        self._connect()
        self._create_tables()

    def _connect(self):
        """建立数据库连接"""
        try:
            self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)  # 允许多线程访问
            self.cursor = self.conn.cursor()
            logger.info("数据库连接成功，路径：%s", DB_PATH)
        except sqlite3.Error as e:
            logger.error("数据库连接失败：%s", str(e))
            raise e

    def _create_tables(self):
        """创建表：simulation_info（仿真信息）、simulation_data（仿真实时数据）"""
        # 仿真信息表：存储仿真实例的基础信息（Python层面注释，不写入SQL）
        create_info_sql = """
        CREATE TABLE IF NOT EXISTS simulation_info (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL UNIQUE,
            dining_time INTEGER NOT NULL,
            meal_time INTEGER NOT NULL,
            max_people INTEGER NOT NULL,
            window_num INTEGER NOT NULL,
            table_num INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            status INTEGER NOT NULL DEFAULT 0
        );
        """
        # 仿真数据表：存储仿真过程中的实时数据（Python层面注释，不写入SQL）
        create_data_sql = """
        CREATE TABLE IF NOT EXISTS simulation_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            simulation_id INTEGER NOT NULL,
            time_step INTEGER NOT NULL,
            window_people TEXT NOT NULL,
            used_table INTEGER NOT NULL,
            remaining_table INTEGER NOT NULL,
            create_time TEXT NOT NULL,
            FOREIGN KEY (simulation_id) REFERENCES simulation_info (id)
        );
        """
        try:
            self.cursor.execute(create_info_sql)
            self.cursor.execute(create_data_sql)
            self.conn.commit()
            logger.info("数据库表创建/检查完成")
        except sqlite3.Error as e:
            logger.error("创建数据库表失败：%s", str(e))
            self.conn.rollback()
            raise e

    def add_simulation(self, session_id, dining_time, meal_time, max_people, window_num, table_num):
        """
        新增仿真实例（启动仿真时调用）
        :param session_id: 前端session ID
        :param dining_time: 平均用餐时间（分钟）
        :param meal_time: 平均打饭时间（秒/人）
        :param max_people: 每分钟最大进入人数
        :param window_num: 窗口数
        :param table_num: 桌子总数
        :return: 新增仿真的ID
        """
        try:
            # 先删除该session下已存在的未结束仿真（避免重复）
            self.cursor.execute(
                "DELETE FROM simulation_info WHERE session_id = ? AND status = 0",
                (session_id,)
            )
            # 插入新仿真
            start_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.cursor.execute(
                """
                INSERT INTO simulation_info 
                (session_id, dining_time, meal_time, max_people, window_num, table_num, start_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (session_id, dining_time, meal_time, max_people, window_num, table_num, start_time)
            )
            self.conn.commit()
            simulation_id = self.cursor.lastrowid
            logger.info("新增仿真实例成功，ID：%s，SessionID：%s", simulation_id, session_id)
            return simulation_id
        except sqlite3.Error as e:
            logger.error("新增仿真实例失败：%s", str(e))
            self.conn.rollback()
            raise e

    def get_current_simulation(self, session_id):
        """
        查询当前运行中的仿真实例（按session ID）
        :param session_id: 前端session ID
        :return: 仿真信息字典（None表示无运行中的仿真）
        """
        try:
            self.cursor.execute(
                """
                SELECT id, dining_time, meal_time, max_people, window_num, table_num 
                FROM simulation_info 
                WHERE session_id = ? AND status = 0
                """,
                (session_id,)
            )
            result = self.cursor.fetchone()
            if not result:
                logger.warning("未找到SessionID=%s的运行中仿真", session_id)
                return None
            # 构造返回字典，与前端参数名对齐
            simulation_info = {
                "id": result[0],
                "dining_time": result[1],
                "meal_time": result[2],
                "max_people": result[3],
                "window_num": result[4],
                "table_num": result[5]
            }
            logger.info("查询到SessionID=%s的运行中仿真，ID：%s", session_id, simulation_info["id"])
            return simulation_info
        except sqlite3.Error as e:
            logger.error("查询当前仿真失败：%s", str(e))
            raise e

    def end_simulation(self, session_id):
        """
        结束仿真（更新状态和结束时间）
        :param session_id: 前端session ID
        :return: 仿真ID（None表示无运行中的仿真）
        """
        try:
            # 查询运行中的仿真ID
            self.cursor.execute(
                "SELECT id FROM simulation_info WHERE session_id = ? AND status = 0",
                (session_id,)
            )
            result = self.cursor.fetchone()
            if not result:
                return None
            simulation_id = result[0]
            # 更新状态和结束时间
            end_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.cursor.execute(
                """
                UPDATE simulation_info 
                SET end_time = ?, status = 1 
                WHERE id = ?
                """,
                (end_time, simulation_id)
            )
            self.conn.commit()
            logger.info("结束仿真成功，ID：%s，SessionID：%s", simulation_id, session_id)
            return simulation_id
        except sqlite3.Error as e:
            logger.error("结束仿真失败：%s", str(e))
            self.conn.rollback()
            raise e

    def add_simulation_data(self, simulation_id, time_step, window_people, used_table, remaining_table):
        """
        插入仿真实时数据
        :param simulation_id: 仿真ID
        :param time_step: 仿真时间步长（第N秒）
        :param window_people: 各窗口等待人数列表
        :param used_table: 已使用桌子数
        :param remaining_table: 剩余桌子数
        """
        try:
            # 将窗口人数列表转为字符串存储
            window_people_str = ",".join(map(str, window_people))
            create_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.cursor.execute(
                """
                INSERT INTO simulation_data 
                (simulation_id, time_step, window_people, used_table, remaining_table, create_time)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (simulation_id, time_step, window_people_str, used_table, remaining_table, create_time)
            )
            self.conn.commit()
            logger.debug(
                "插入仿真实时数据成功，仿真ID：%s，时间步长：%s，窗口人数：%s，已用桌子：%s，剩余桌子：%s",
                simulation_id, time_step, window_people_str, used_table, remaining_table
            )
        except sqlite3.Error as e:
            logger.error("插入仿真实时数据失败：%s", str(e))
            self.conn.rollback()
            raise e

    def get_simulation_data(self, simulation_id):
        """
        查询仿真所有实时数据（用于生成趋势图表）
        :param simulation_id: 仿真ID
        :return: 数据列表，格式：[{"time": 1, "people": [x1,x2...], "used": z1, "remaining": y1}, ...]
        """
        try:
            self.cursor.execute(
                """
                SELECT time_step, window_people, used_table, remaining_table 
                FROM simulation_data 
                WHERE simulation_id = ? 
                ORDER BY time_step ASC
                """,
                (simulation_id,)
            )
            results = self.cursor.fetchall()
            # 构造返回数据，与前端折线图渲染函数参数对齐
            data_list = []
            for result in results:
                time_step = result[0]
                window_people = list(map(int, result[1].split(",")))  # 还原列表
                used_table = result[2]
                remaining_table = result[3]
                data_list.append({
                    "time": time_step,
                    "people": window_people,
                    "used": used_table,
                    "remaining": remaining_table
                })
            logger.info("查询仿真数据成功，仿真ID：%s，数据条数：%s", simulation_id, len(data_list))
            return data_list
        except sqlite3.Error as e:
            logger.error("查询仿真数据失败：%s", str(e))
            raise e

    def close(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()
            logger.info("数据库连接已关闭")

# 初始化数据库实例（全局单例）
db = SimulationDatabase()