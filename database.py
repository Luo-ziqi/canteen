# -*- coding: utf-8 -*-
import sqlite3
import logging
from datetime import datetime
from config import DB_PATH

# 初始化日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SimulationDatabase:
    def __init__(self):
        self.conn = None
        self.cursor = None
        self._connect()
        self._create_tables()

    def _connect(self):
        try:
            self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            self.cursor = self.conn.cursor()
            logger.info("数据库连接成功，路径：%s", DB_PATH)
        except sqlite3.Error as e:
            logger.error("数据库连接失败：%s", str(e))
            raise e

    def _create_tables(self):
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
        """新增仿真实例"""
        try:
            self.cursor.execute("DELETE FROM simulation_info WHERE session_id = ? AND status = 0", (session_id,))
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
            return self.cursor.lastrowid
        except sqlite3.Error as e:
            logger.error("新增仿真失败：%s", str(e))
            self.conn.rollback()
            raise e

    def add_simulation_data(self, simulation_id, time_step, window_people, used_table, remaining_table):
        """插入实时快照数据"""
        try:
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
        except sqlite3.Error as e:
            logger.error("数据插入失败：%s", str(e))
            self.conn.rollback()

    def delete_simulation(self, simulation_id):
            """
            级联删除：删除仿真基本信息及其产生的所有详细数据
            用于清理无效的测试记录
            """
            try:
                # 1. 先删除明细数据（遵循外键约束逻辑）
                self.cursor.execute("DELETE FROM simulation_data WHERE simulation_id = ?", (simulation_id,))
                # 2. 再删除仿真信息主记录
                self.cursor.execute("DELETE FROM simulation_info WHERE id = ?", (simulation_id,))
                self.conn.commit()
                logger.info("已成功清理仿真记录 ID: %s", simulation_id)
                return True
            except sqlite3.Error as e:
                logger.error("删除失败：%s", str(e))
                self.conn.rollback()
                return False

    def export_to_csv(self, simulation_id, file_path):
        """
        导出数据：将单次仿真的所有时序数据导出为 CSV 文件
        方便廖益博在 Excel 中直接分析仿真算法的准确性
        """
        import csv
        try:
            data = self.get_simulation_detail(simulation_id)
            if not data:
                return False
            
            with open(file_path, 'w', newline='', encoding='utf-8-sig') as f:
                writer = csv.DictWriter(f, fieldnames=["time_step", "window_people", "used_table", "remaining_table"])
                writer.writeheader()
                for row in data:
                    # 导出时将列表转回字符串，方便在 Excel 中直接阅读
                    row['window_people'] = str(row['window_people'])
                    writer.writerow(row)
            logger.info("数据已成功导出至: %s", file_path)
            return True
        except Exception as e:
            logger.error("导出异常：%s", str(e))
            return False

    def get_all_simulations(self):
            """查询所有仿真的历史记录列表（用于前端展示历史列表）"""
            try:
                # 按开始时间倒序排列，最新的排在前面
                self.cursor.execute(
                    """
                    SELECT id, session_id, start_time, status, window_num, max_people 
                    FROM simulation_info 
                    ORDER BY start_time DESC
                    """
                )
                results = self.cursor.fetchall()
                history_list = []
                for r in results:
                    history_list.append({
                        "id": r[0],
                        "session_id": r[1],
                        "start_time": r[2],
                        "status": "已结束" if r[3] == 1 else "进行中",
                        "window_num": r[4],
                        "max_people": r[5]
                    })
                logger.info("成功获取历史记录列表，共 %d 条", len(history_list))
                return history_list
            except sqlite3.Error as e:
                logger.error("查询历史列表失败：%s", str(e))
                return []


    def get_simulation_detail(self, simulation_id):
            """
            根据仿真ID查询详细时序数据
            用于回放历史记录或在仿真结束后导出数据
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
                
                detail_data = []
                for r in results:
                    # 关键自学点：反序列化
                    # 将数据库里的字符串 "2,5,3" 还原回 Python 列表 [2, 5, 3]
                    window_people_list = list(map(int, r[1].split(","))) if r[1] else []
                    
                    detail_data.append({
                        "time_step": r[0],
                        "window_people": window_people_list,
                        "used_table": r[2],
                        "remaining_table": r[3]
                    })
                
                logger.info("成功获取仿真ID为 %s 的详情，共 %d 条秒级数据", simulation_id, len(detail_data))
                return detail_data
            except sqlite3.Error as e:
                logger.error("查询仿真详情失败：%s", str(e))
                return []

    def get_simulation_summary(self, simulation_id):
            """
            汇总统计：计算本次仿真的关键指标
            包括：平均拥挤度、峰值人数、总运行时间等
            """
            try:
                # 1. 从 simulation_data 表中提取统计值
                # AVG(used_table) 计算平均桌子占用量
                # MAX(used_table) 计算峰值占用
                self.cursor.execute(
                    """
                    SELECT 
                        AVG(used_table), 
                        MAX(used_table),
                        COUNT(time_step)  -- 总秒数
                    FROM simulation_data 
                    WHERE simulation_id = ?
                    """,
                    (simulation_id,)
                )
                res = self.cursor.fetchone()
                
                # 2. 这里的平均排队人数需要对 window_people 字符串进行处理（稍微复杂一点）
                # 我们取所有记录，手动算一下平均值
                self.cursor.execute("SELECT window_people FROM simulation_data WHERE simulation_id = ?", (simulation_id,))
                rows = self.cursor.fetchall()
                
                total_people_count = 0
                snapshot_count = len(rows)
                max_queue = 0
                
                for row in rows:
                    # 还原列表 [2, 5, 3]
                    people_list = list(map(int, row[0].split(",")))
                    current_sum = sum(people_list)
                    total_people_count += current_sum
                    if current_sum > max_queue:
                        max_queue = current_sum
                
                avg_queue = round(total_people_count / snapshot_count, 2) if snapshot_count > 0 else 0
                
                summary = {
                    "avg_table_usage": round(res[0], 2) if res[0] else 0,
                    "max_table_usage": res[1] if res[1] else 0,
                    "total_seconds": res[2] if res[2] else 0,
                    "avg_queue_people": avg_queue,  # 平均每秒排队总人数
                    "peak_queue_people": max_queue  # 全程最高峰排队人数
                }
                
                logger.info("仿真ID %s 汇总计算完成", simulation_id)
                return summary
                
            except Exception as e:
                logger.error("汇总统计失败：%s", str(e))
                return None


    def close(self):
        if self.conn:
            self.conn.close()

# --- 测试代码 (全流程验证) ---
if __name__ == "__main__":
    # 1. 初始化数据库对象
    db = SimulationDatabase()
    
    print("=== 开始全流程功能测试 ===")

    # 2. 测试：新增仿真并存入数据
    # 模拟一个 session_id 为 'dev_test_999' 的新仿真
    new_id = db.add_simulation("dev_test_999", 120, 15, 300, 5, 40)
    print(f"[新增] 成功启动仿真，数据库分配 ID: {new_id}")
    
    # 模拟存入第 1 秒和第 2 秒的数据
    db.add_simulation_data(new_id, 1, [3, 5, 2, 0, 1], 10, 30)
    db.add_simulation_data(new_id, 2, [4, 4, 3, 1, 2], 12, 28)
    print("[写入] 实时测试数据（2秒快照）插入成功")

    # 3. 测试：查询详情 (验证数据是否能被还原成列表)
    print(f"\n--- 正在读取仿真ID: {new_id} 的详细时序数据 ---")
    details = db.get_simulation_detail(new_id)
    for step in details:
        print(f"  秒数: {step['time_step']} | 窗口排队列表: {step['window_people']} | 已用桌子: {step['used_table']}")

    # 4. 测试：清理旧数据 (删掉之前的 ID 1, 2, 3)
    # 注意：你可以根据你实际想清理的 ID 修改这个列表
    print("\n--- 正在执行数据库清理 (清理早期垃圾数据) ---")
    for trash_id in [1, 2, 3]:
        if db.delete_simulation(trash_id):
            print(f"  已成功删除旧记录 ID: {trash_id}")

    # 5. 测试：最终查询历史列表
    print("\n--- 最终历史记录列表状态 ---")
    all_history = db.get_all_simulations()
    if not all_history:
        print("  当前数据库为空")
    for item in all_history:
        print(f"  仿真ID: {item['id']} | 开始时间: {item['start_time']} | 状态: {item['status']}")

   # 6. 测试：汇总统计 (必须放在 close 之前！)
    print(f"\n--- 正在生成仿真ID: {new_id} 的数据简报 ---")
    report = db.get_simulation_summary(new_id)
    if report:
        print(f"  [统计] 全程平均排队人数: {report['avg_queue_people']} 人")
        print(f"  [统计] 全程最高峰排队: {report['peak_queue_people']} 人")
        print(f"  [统计] 平均桌子占用: {report['avg_table_usage']} 张")
        print(f"  [时效] 仿真持续时间: {report['total_seconds']} 秒")

    # 7. 终极安全关闭 (永远放在最后)
    db.close()
    print("\n=== 测试结束，数据库连接已关闭 ===")