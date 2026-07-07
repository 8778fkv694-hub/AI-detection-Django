/**
 * AI检测项目 - Arduino Nano 光电触发固件
 * 
 * 功能：
 *   - 监听 D2 引脚的光电开关信号（低电平有效 / NPN型）
 *   - 工件到位时通过串口发送 TRIGGER 信号
 *   - 工件离开时通过串口发送 CLEAR 信号
 *   - 内置 50ms 硬件消抖 + 锁定期防重复触发
 * 
 * 接线：
 *   D2 ← 光电开关信号线（棕色）
 *   GND ← 光电开关 GND（蓝色）
 *   5V  → 光电开关 VCC（黑色）  [如果传感器是 5V 供电]
 *   
 *   D13 (板载LED) = 状态指示灯
 * 
 * 串口协议 (9600 bps, 换行符分隔):
 *   TRIGGER        - 光电开关被遮挡（工件到位），前端应执行"抓拍/开始检测"
 *   CLEAR          - 光电开关恢复（工件离开），前端应执行"复位/重置"
 *   HEARTBEAT      - 每5秒发送一次，前端用于检测连接状态
 *   READY          - 启动完成，前端可识别设备就绪
 */

// ============ 引脚定义 ============
const int SENSOR_PIN = 2;      // 光电开关信号引脚 (D2)
const int LED_PIN = 13;        // 板载LED状态指示

// ============ 消抖参数 ============
const unsigned long DEBOUNCE_MS = 50;       // 消抖时间 50ms
const unsigned long LOCKOUT_MS = 500;       // 触发锁定期 500ms，防止连续重复触发
const unsigned long HEARTBEAT_MS = 5000;    // 心跳间隔 5秒

// ============ 状态变量 ============
int lastStableState = HIGH;                 // 上一次稳定状态（HIGH = 未遮挡）
int lastReading = HIGH;                     // 上一次读数
unsigned long lastDebounceTime = 0;         // 上一次状态变化时间
unsigned long lastTriggerTime = 0;          // 上一次触发时间（锁定期用）
unsigned long lastHeartbeatTime = 0;        // 上一次心跳时间

void setup() {
  // 串口初始化
  Serial.begin(9600);
  
  // 引脚模式
  pinMode(SENSOR_PIN, INPUT_PULLUP);  // 内部上拉，光电开关 NPN 型低电平有效
  pinMode(LED_PIN, OUTPUT);
  
  // 读取初始状态
  lastStableState = digitalRead(SENSOR_PIN);
  lastReading = lastStableState;
  
  // 启动指示：LED 闪烁 3 次
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
  
  // 发送就绪信号
  Serial.println("READY");
}

void loop() {
  unsigned long now = millis();
  
  // ---- 串口指令输入模拟 (PC -> Arduino -> PC 环回模拟) ----
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd == 'T' || cmd == 't') {
      Serial.println("TRIGGER");
      digitalWrite(LED_PIN, HIGH);
      lastTriggerTime = now;
    } else if (cmd == 'C' || cmd == 'c') {
      Serial.println("CLEAR");
      digitalWrite(LED_PIN, LOW);
    } else if (cmd == 'R' || cmd == 'r') {
      Serial.println("RESET");
    } else if (cmd == 'P' || cmd == 'p') {
      Serial.println("MANUAL_PASS");
    }
  }

  int reading = digitalRead(SENSOR_PIN);
  
  // ---- 消抖逻辑 ----
  if (reading != lastReading) {
    lastDebounceTime = now;
  }
  lastReading = reading;
  
  if ((now - lastDebounceTime) > DEBOUNCE_MS) {
    // 状态确实发生了变化
    if (reading != lastStableState) {
      lastStableState = reading;
      
      if (reading == LOW) {
        // ---- 光电开关被遮挡：工件到位 ----
        if ((now - lastTriggerTime) > LOCKOUT_MS) {
          Serial.println("TRIGGER");
          digitalWrite(LED_PIN, HIGH);  // LED 亮 = 有工件
          lastTriggerTime = now;
        }
      } else {
        // ---- 光电开关恢复：工件离开 ----
        Serial.println("CLEAR");
        digitalWrite(LED_PIN, LOW);     // LED 灭 = 无工件
      }
    }
  }
  
  // ---- 心跳 ----
  if ((now - lastHeartbeatTime) > HEARTBEAT_MS) {
    Serial.println("HEARTBEAT");
    lastHeartbeatTime = now;
  }
  
  // 小延时，降低CPU占用
  delay(5);
}
