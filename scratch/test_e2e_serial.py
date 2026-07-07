import serial
import time
import sys

PORT = '/dev/cu.wchusbserial1110'
BAUD = 9600

print(f"=== 正在初始化串口: {PORT} @ {BAUD} bps ===")

try:
    s = serial.Serial(PORT, BAUD, timeout=1)
except Exception as e:
    print(f"❌ 无法打开串口: {e}")
    sys.exit(1)

# Arduino 在连接时会复位，给它 3 秒时间启动就绪
print("⏳ 等待 Arduino 启动复位...")
time.sleep(3)

# 清空缓冲区
s.read_all()
print("✅ Arduino 已就绪\n")

def test_signal(char_to_send, expected_output):
    print(f"➡️ 发送指令字符: '{char_to_send}'")
    s.write(char_to_send.encode('utf-8'))
    s.flush()
    
    # 等待并读取返回的数据
    time.sleep(0.5)
    response = s.read_all().decode('utf-8').strip()
    print(f"⬅️ 串口返回数据: {repr(response)}")
    
    if expected_output in response:
        print(f"🎉 验证成功: 成功触发 {expected_output} 信号！")
        return True
    else:
        print(f"❌ 验证失败: 未收到期望的 {expected_output}")
        return False

# 开始端到端验证
tests = [
    ('t', 'TRIGGER'),
    ('c', 'CLEAR'),
    ('r', 'RESET'),
    ('p', 'MANUAL_PASS')
]

success_count = 0
for char, expected in tests:
    print("-" * 50)
    if test_signal(char, expected):
        success_count += 1
    time.sleep(0.5)

print("=" * 50)
s.close()

if success_count == len(tests):
    print("🏆 【端到端验证通过】: 串口发送和接收全链路完美畅通！")
    sys.exit(0)
else:
    print(f"⚠️ 验证完成，成功数: {success_count}/{len(tests)}")
    sys.exit(1)
