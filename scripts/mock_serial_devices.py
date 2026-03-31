#!/usr/bin/env python3
"""
虚拟串口设备模拟器

用途：在没有硬件的情况下测试 Web Serial API 设备通讯
原理：使用 pty 创建虚拟串口对，一端给浏览器连接，一端由本脚本模拟设备行为

使用方式:
  python scripts/mock_serial_devices.py --type alarm
  python scripts/mock_serial_devices.py --type scanner
  python scripts/mock_serial_devices.py --type sensor --interval 3
  python scripts/mock_serial_devices.py --type controller

然后在浏览器 Web Serial API 中选择对应的虚拟串口设备连接。

macOS/Linux 下会在 /tmp 创建虚拟端口文件。
"""

import argparse
import os
import pty
import select
import sys
import time
import random
import string

# ANSI 颜色
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
GRAY = '\033[90m'
BOLD = '\033[1m'
RESET = '\033[0m'


def create_virtual_serial():
    """创建虚拟串口对，返回 (master_fd, slave_path)"""
    master, slave = pty.openpty()
    slave_path = os.ttyname(slave)
    return master, slave_path


def run_alarm_device(master_fd, slave_path):
    """模拟报警灯设备 - 接收指令并显示彩色输出"""
    print(f"{BOLD}报警灯模拟器{RESET}")
    print(f"虚拟串口: {CYAN}{slave_path}{RESET}")
    print(f"等待浏览器连接...\n")
    print(f"{GRAY}支持指令: GREEN, YELLOW, RED, OFF, FLASH_RED{RESET}\n")

    current_state = 'OFF'
    buffer = b''

    while True:
        readable, _, _ = select.select([master_fd], [], [], 0.1)
        if readable:
            try:
                data = os.read(master_fd, 1024)
                buffer += data
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    cmd = line.decode('utf-8', errors='ignore').strip().upper()
                    if not cmd:
                        continue

                    if cmd == 'GREEN':
                        current_state = 'GREEN'
                        print(f"  {GREEN}\u2588\u2588 \u7eff\u706f\u4eae\u8d77 \u2588\u2588{RESET}  [{time.strftime('%H:%M:%S')}]")
                    elif cmd == 'YELLOW':
                        current_state = 'YELLOW'
                        print(f"  {YELLOW}\u2588\u2588 \u9ec4\u706f\u4eae\u8d77 \u2588\u2588{RESET}  [{time.strftime('%H:%M:%S')}]")
                    elif cmd == 'RED':
                        current_state = 'RED'
                        print(f"  {RED}\u2588\u2588 \u7ea2\u706f\u4eae\u8d77 \u2588\u2588{RESET}  [{time.strftime('%H:%M:%S')}]")
                    elif cmd == 'FLASH_RED':
                        current_state = 'FLASH_RED'
                        print(f"  {RED}\u2588\u2588 \u7ea2\u706f\u95ea\u70c1 \u2588\u2588{RESET} \u26a0\ufe0f  [{time.strftime('%H:%M:%S')}]")
                    elif cmd == 'OFF':
                        current_state = 'OFF'
                        print(f"  {GRAY}\u2588\u2588 \u706f\u5173\u95ed \u2588\u2588{RESET}  [{time.strftime('%H:%M:%S')}]")
                    else:
                        print(f"  {GRAY}\u672a\u77e5\u6307\u4ee4: {cmd}{RESET}")

                    # 回复确认
                    os.write(master_fd, f"OK:{cmd}\n".encode())
            except OSError:
                break


def run_scanner_device(master_fd, slave_path):
    """模拟扫码枪设备 - 按回车发送模拟条码"""
    print(f"{BOLD}\u626b\u7801\u67aa\u6a21\u62df\u5668{RESET}")
    print(f"\u865a\u62df\u4e32\u53e3: {CYAN}{slave_path}{RESET}")
    print(f"\u7b49\u5f85\u6d4f\u89c8\u5668\u8fde\u63a5...\n")
    print(f"{GRAY}\u6309\u56de\u8f66\u53d1\u9001\u6a21\u62df\u6761\u7801\uff0c\u6216\u8f93\u5165\u81ea\u5b9a\u4e49\u5185\u5bb9{RESET}\n")

    seq = 0
    while True:
        try:
            user_input = input(f"{CYAN}\u626b\u7801> {RESET}").strip()
            if not user_input:
                # 生成模拟条码
                seq += 1
                barcode = f"BARCODE-{time.strftime('%Y%m%d')}-{seq:04d}"
            else:
                barcode = user_input

            os.write(master_fd, f"{barcode}\n".encode())
            print(f"  {GREEN}\u2192 \u5df2\u53d1\u9001: {barcode}{RESET}")
        except (EOFError, KeyboardInterrupt):
            break


def run_sensor_device(master_fd, slave_path, interval=3):
    """模拟光电传感器 - 定时发送 TRIGGER 信号"""
    print(f"{BOLD}\u5149\u7535\u4f20\u611f\u5668\u6a21\u62df\u5668{RESET}")
    print(f"\u865a\u62df\u4e32\u53e3: {CYAN}{slave_path}{RESET}")
    print(f"\u89e6\u53d1\u95f4\u9694: {interval} \u79d2")
    print(f"\u7b49\u5f85\u6d4f\u89c8\u5668\u8fde\u63a5...\n")
    print(f"{GRAY}Ctrl+C \u505c\u6b62{RESET}\n")

    count = 0
    try:
        while True:
            time.sleep(interval)
            count += 1
            os.write(master_fd, b"TRIGGER\n")
            print(f"  {YELLOW}\u26a1 TRIGGER #{count}{RESET}  [{time.strftime('%H:%M:%S')}]")
    except KeyboardInterrupt:
        print(f"\n{GRAY}\u4f20\u611f\u5668\u5df2\u505c\u6b62{RESET}")


def run_controller_device(master_fd, slave_path):
    """模拟工控板/单片机 - 接收指令并模拟继电器状态"""
    print(f"{BOLD}\u5de5\u63a7\u677f\u6a21\u62df\u5668{RESET}")
    print(f"\u865a\u62df\u4e32\u53e3: {CYAN}{slave_path}{RESET}")
    print(f"\u7b49\u5f85\u6d4f\u89c8\u5668\u8fde\u63a5...\n")
    print(f"{GRAY}\u652f\u6301\u6307\u4ee4: START, STOP, PASS, FAIL, STATUS{RESET}\n")

    conveyor_running = False
    buffer = b''

    while True:
        readable, _, _ = select.select([master_fd], [], [], 0.1)
        if readable:
            try:
                data = os.read(master_fd, 1024)
                buffer += data
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    cmd = line.decode('utf-8', errors='ignore').strip().upper()
                    if not cmd:
                        continue

                    if cmd == 'START':
                        conveyor_running = True
                        print(f"  {GREEN}\u25b6 \u6d41\u6c34\u7ebf\u542f\u52a8{RESET}  [{time.strftime('%H:%M:%S')}]")
                        os.write(master_fd, b"OK:CONVEYOR_RUNNING\n")
                    elif cmd == 'STOP':
                        conveyor_running = False
                        print(f"  {RED}\u25a0 \u6d41\u6c34\u7ebf\u505c\u6b62{RESET}  [{time.strftime('%H:%M:%S')}]")
                        os.write(master_fd, b"OK:CONVEYOR_STOPPED\n")
                    elif cmd == 'PASS':
                        print(f"  {GREEN}\u2713 \u5408\u683c\u4fe1\u53f7 \u2192 \u7ee7\u7eed\u8fd0\u884c{RESET}  [{time.strftime('%H:%M:%S')}]")
                        os.write(master_fd, b"OK:PASS_ACK\n")
                    elif cmd == 'FAIL':
                        conveyor_running = False
                        print(f"  {RED}\u2717 \u4e0d\u5408\u683c\u4fe1\u53f7 \u2192 \u6d41\u6c34\u7ebf\u505c\u6b62{RESET}  [{time.strftime('%H:%M:%S')}]")
                        os.write(master_fd, b"OK:FAIL_STOPPED\n")
                    elif cmd == 'STATUS':
                        status = 'RUNNING' if conveyor_running else 'STOPPED'
                        print(f"  {CYAN}\u2139 \u72b6\u6001\u67e5\u8be2: {status}{RESET}")
                        os.write(master_fd, f"STATUS:{status}\n".encode())
                    else:
                        print(f"  {GRAY}\u672a\u77e5\u6307\u4ee4: {cmd}{RESET}")
                        os.write(master_fd, f"ERR:UNKNOWN_CMD:{cmd}\n".encode())
            except OSError:
                break


def main():
    parser = argparse.ArgumentParser(description='\u865a\u62df\u4e32\u53e3\u8bbe\u5907\u6a21\u62df\u5668')
    parser.add_argument('--type', choices=['alarm', 'scanner', 'sensor', 'controller'],
                        required=True, help='\u8bbe\u5907\u7c7b\u578b')
    parser.add_argument('--interval', type=int, default=3,
                        help='\u4f20\u611f\u5668\u89e6\u53d1\u95f4\u9694\uff08\u79d2\uff0c\u4ec5 sensor \u7c7b\u578b\uff09')
    args = parser.parse_args()

    master_fd, slave_path = create_virtual_serial()

    print(f"\n{'='*50}")
    print(f"  \u865a\u62df\u4e32\u53e3\u8bbe\u5907\u6a21\u62df\u5668")
    print(f"  \u8bbe\u5907\u7c7b\u578b: {args.type}")
    print(f"  \u865a\u62df\u7aef\u53e3: {slave_path}")
    print(f"{'='*50}\n")

    try:
        if args.type == 'alarm':
            run_alarm_device(master_fd, slave_path)
        elif args.type == 'scanner':
            run_scanner_device(master_fd, slave_path)
        elif args.type == 'sensor':
            run_sensor_device(master_fd, slave_path, args.interval)
        elif args.type == 'controller':
            run_controller_device(master_fd, slave_path)
    except KeyboardInterrupt:
        print(f"\n{GRAY}\u8bbe\u5907\u6a21\u62df\u5668\u5df2\u505c\u6b62{RESET}")
    finally:
        os.close(master_fd)


if __name__ == '__main__':
    main()
