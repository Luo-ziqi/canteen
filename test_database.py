# -*- coding: utf-8 -*-
"""
database.py 单元测试脚本

"""

import unittest
import os
import sys

# 临时修改数据库路径，避免覆盖正式数据
import config
config.DB_PATH = "test_database.db"

from database import db

class TestSimulationDatabase(unittest.TestCase):
    """测试 SimulationDatabase 类的所有核心方法"""

    @classmethod
    def setUpClass(cls):
        """测试前准备：确保使用测试数据库"""
        print("=== 开始数据库单元测试 ===")

    def setUp(self):
        """每个测试前清空数据（保留表结构）"""
        # 清空已有数据
        db.conn.execute("DELETE FROM simulation_data")
        db.conn.execute("DELETE FROM simulation_info")
        db.conn.commit()
        # 重置自增计数器（可选）
        db.conn.execute("DELETE FROM sqlite_sequence")
        db.conn.commit()

    @classmethod
    def tearDownClass(cls):
        """所有测试完成后关闭连接并删除测试数据库文件"""
        db.close()
        if os.path.exists("test_database.db"):
            os.remove("test_database.db")
        print("=== 测试完成，已清理测试数据库 ===")

    # ---------- 1. 测试表创建 ----------
    def test_01_tables_exist(self):
        """验证 simulation_info 和 simulation_data 表已创建"""
        cursor = db.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('simulation_info','simulation_data')"
        )
        tables = [row[0] for row in cursor.fetchall()]
        self.assertIn("simulation_info", tables)
        self.assertIn("simulation_data", tables)
        print("✓ 表创建测试通过")

    # ---------- 2. 测试 add_simulation ----------
    def test_02_add_simulation(self):
        """正常添加仿真，返回ID为正整数"""
        sim_id = db.add_simulation("sess_01", 30, 5, 60, 4, 50)
        self.assertIsInstance(sim_id, int)
        self.assertGreater(sim_id, 0)
        # 验证数据库内容
        row = db.conn.execute("SELECT * FROM simulation_info WHERE id=?", (sim_id,)).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row[1], "sess_01")   # session_id
        self.assertEqual(row[2], 30)          # dining_time
        print("✓ 添加仿真测试通过")

    def test_03_duplicate_session_override(self):
        """同一session_id重复启动仿真，旧记录应被删除，新记录生效"""
        first_id = db.add_simulation("sess_02", 30, 5, 60, 4, 50)
        second_id = db.add_simulation("sess_02", 40, 6, 70, 5, 60)
        # 查询运行中的仿真，应只有第二个
        rows = db.conn.execute(
            "SELECT id FROM simulation_info WHERE session_id='sess_02' AND status=0"
        ).fetchall()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][0], second_id)
        print("✓ 重复session覆盖测试通过")

    # ---------- 3. 测试 get_current_simulation ----------
    def test_04_get_current_simulation(self):
        """查询运行中的仿真，返回正确参数"""
        db.add_simulation("sess_03", 25, 4, 55, 3, 40)
        info = db.get_current_simulation("sess_03")
        self.assertIsNotNone(info)
        self.assertEqual(info["dining_time"], 25)
        self.assertEqual(info["meal_time"], 4)
        self.assertEqual(info["window_num"], 3)
        print("✓ 查询运行中仿真测试通过")

    def test_05_get_current_nonexistent(self):
        """查询不存在的session，返回None"""
        info = db.get_current_simulation("no_such")
        self.assertIsNone(info)
        print("✓ 查询不存在仿真测试通过")

    # ---------- 4. 测试 end_simulation ----------
    def test_06_end_simulation(self):
        """正常结束仿真，状态变为1，end_time不为空"""
        sim_id = db.add_simulation("sess_04", 30, 5, 60, 4, 50)
        ended_id = db.end_simulation("sess_04")
        self.assertEqual(sim_id, ended_id)
        row = db.conn.execute("SELECT status, end_time FROM simulation_info WHERE id=?", (sim_id,)).fetchone()
        self.assertEqual(row[0], 1)        # status=1
        self.assertIsNotNone(row[1])       # end_time有值
        print("✓ 结束仿真测试通过")

    def test_07_end_nonexistent(self):
        """结束不存在的仿真，返回None"""
        result = db.end_simulation("no_such")
        self.assertIsNone(result)
        print("✓ 结束不存在的仿真测试通过")

    # ---------- 5. 测试 add_simulation_data（实时数据插入）----------
    def test_08_add_simulation_data(self):
        """插入实时数据，window_people被正确存储为逗号分隔字符串"""
        sim_id = db.add_simulation("sess_05", 30, 5, 60, 4, 50)
        db.add_simulation_data(sim_id, 1, [3, 2, 5, 1], 20, 30)
        row = db.conn.execute(
            "SELECT window_people, used_table, remaining_table FROM simulation_data WHERE simulation_id=?",
            (sim_id,)
        ).fetchone()
        self.assertEqual(row[0], "3,2,5,1")
        self.assertEqual(row[1], 20)
        self.assertEqual(row[2], 30)
        print("✓ 插入实时数据测试通过")

    def test_09_multiple_data_points(self):
        """连续插入多条数据，全部成功存储"""
        sim_id = db.add_simulation("sess_06", 30, 5, 60, 4, 50)
        for t in range(1, 6):
            db.add_simulation_data(sim_id, t, [t, t+1, t+2, t+3], t*2, 50 - t*2)
        count = db.conn.execute(
            "SELECT COUNT(*) FROM simulation_data WHERE simulation_id=?", (sim_id,)
        ).fetchone()[0]
        self.assertEqual(count, 5)
        print("✓ 多条数据插入测试通过")

    # ---------- 6. 测试 get_simulation_data ----------
    def test_10_get_simulation_data(self):
        """查询仿真数据，能正确还原window_people为整数列表"""
        sim_id = db.add_simulation("sess_07", 30, 5, 60, 4, 50)
        db.add_simulation_data(sim_id, 1, [3, 2, 5, 1], 20, 30)
        db.add_simulation_data(sim_id, 2, [4, 3, 6, 2], 25, 25)
        data = db.get_simulation_data(sim_id)
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["time"], 1)
        self.assertEqual(data[0]["people"], [3, 2, 5, 1])
        self.assertEqual(data[0]["used"], 20)
        self.assertEqual(data[1]["people"], [4, 3, 6, 2])
        print("✓ 查询仿真数据（反序列化）测试通过")

    def test_11_get_data_nonexistent_simulation(self):
        """查询不存在的仿真ID，返回空列表"""
        data = db.get_simulation_data(9999)
        self.assertEqual(data, [])
        print("✓ 查询不存在仿真数据测试通过")

    # ---------- 7. 综合流程一致性 ----------
    def test_12_full_simulation_flow(self):
        """完整仿真流程：添加 -> 写入多秒数据 -> 结束 -> 查询历史数据"""
        sid = db.add_simulation("sess_08", 30, 5, 60, 4, 50)
        for t in range(1, 11):
            db.add_simulation_data(sid, t, [t, t+1, t+2, t+3], t*2, 100 - t*2)
        db.end_simulation("sess_08")
        history = db.get_simulation_data(sid)
        self.assertEqual(len(history), 10)
        self.assertEqual(history[0]["used"], 2)    # t=1 → 1*2=2
        self.assertEqual(history[9]["remaining"], 100 - 10*2)
        # 确认仿真状态已结束
        info = db.get_current_simulation("sess_08")
        self.assertIsNone(info)
        print("✓ 完整仿真流程测试通过")


if __name__ == "__main__":
    # 设置更详细的输出
    unittest.main(verbosity=2)