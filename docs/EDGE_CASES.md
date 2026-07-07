# 边缘情况测试清单 (EDGE_CASES.md)

本文件列出了 Arduino / 传感器 / 串口 / 全屏 / 离线 / 多面采集等边缘情况下的预期行为与替代策略,
便于回归测试与现场调试时按图索骥。

---

## A. 硬件不连接 / 未授权

### A1. Arduino 从未插入
| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | 进入任一检测页 (Live / OCR / PPE) | 页面正常加载,无 toast 报错;控制台无 `Auto-connect serial device failed` 弹错 |
| 2 | 按 `Space` 抓拍 | 抓拍成功,瀑布流出现一张图 |
| 3 | 按 `PageDown` | Toast `键盘后备:触发 STOP_CAPTURE`,AI 评估启动 |
| 4 | 等待结果返回 | 工作流浮层 phase 从 `detecting` 转为 `pass` / `fail` |

### A2. Arduino 插入但用户拒绝授权 (Web Serial 权限)
| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | 进入检测页面,Arduino 未授权 | 控制台 `Auto-connect serial device failed`,页面无 toast |
| 2 | 配方设置页点击"连接设备" | Chrome 弹出授权框,用户取消 |
| 3 | 按 `Space` 抓拍 | 抓拍成功 |
| 4 | 按 `PageDown` | 后备 STOP_CAPTURE 仍能启动评估 |

---

## B. 硬件中途失灵 / 信号丢失

### B1. 旋转台在采集中途断电 (典型失灵)
| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | Arduino 连接成功,工件到位触发 TRIGGER | 抓拍一张,反向写入 `START_ROTATE\n`,看门狗布防 |
| 2 | 拔掉 Arduino 供电 | 串口 reader 收到 done/break,`isConnected:false` |
| 3 | 等待 30 秒 (默认 timeoutMs) | 控制台 `[watchdog] 采集超时,触发降级评估/复位` |
| 4 | 观察 toast | `采集超时:30 秒未收到旋转台就位信号,自动启动 AI 评估` |
| 5 | 观察 MiniWorkflowOverlay | phase 自动转为 `detecting`,流程不卡死 |

### B2. 串口交互期间用户主动断开
| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | 设备运行中,用户在 Chrome 串口管理界面手动断开 | `onConnectionChange(false)`,但 `portRef` 仍存活;后续 `sendData` 返回 false |
| 2 | 抓拍后 Arduino 不复存在 | 无 `STOP_CAPTURE` 到达;看门狗 30 秒后降级 |

### B3. Arduino 发出乱码指令 (信号失真/接线松动)
| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | 模拟发送 `TREGGER`(错误拼写) 或 `TRIGER\n\n` | `cleanData` 不匹配任何白名单,key 不响应 |
| 2 | 之后正确发送 `TRIGGER` | 仍能抓拍 |
| 3 | 若连续乱码 30s | 看门狗触发降级 |

---

## C. 键盘 ⇄ 硬件无缝替换

| 硬件信号 | 替代按键 | 行为 |
|---|---|---|
| TRIGGER (工件到位) | `Home` | 与硬件 TRIGGER 等价:抓拍 + 第一次时写 `START_ROTATE\n` + 重置看门狗 |
| CLEAR (工件离开) | `Delete` | 清空抓拍队列 |
| RESET (故障复位) | `PageUp` | 复位工作流状态 |
| MANUAL_PASS (手动放行) | `End` | 启动评估 / 跳过存疑 |
| STOP_CAPTURE / CAPTURE_END (采集结束) | `PageDown` | 跳过等旋转台,立即启动 AI 评估 |

### C1. 完全键盘流程 (零硬件)
1. 启动 Live/OCR/PPE 任意页 → 不连接任何设备
2. `Home` → 抓拍一张(若需要旋转台匀速采集多面,继续按 `Space` 多次)
3. 多面采集完后 `PageDown` → 启动 AI 评估
4. 评估后看判决 → `Delete` 复位 / `End` 放行存疑

### C2. 混合模式 (硬件在线 + 后备冗余)
1. Arduino 正常发 `TRIGGER`/`CAPTURE_END`,键盘后备键不主动按
2. 若某次 Arduino 卡顿,用户可立即按 `PageDown` 不必等 30 秒看门狗

---

## D. 检验卡死 → 自动复位

### D1. 看门狗自动降级 (硬件失联)
- 触发条件:`armed=true 且 30s 内无 markActivity`
-armedLive: `capturedImages.length > 0 且 !isInspecting`
- armedOCR: `workflowState ∉ {idle, completed} 且 !isAnalyzing`
- armedPPE: `camera.isCameraOn && 图片>0 且 !isDetecting`
- 结果: 自动调 onTimeout → handleHardwareStopCapture → `handleStartAIDetection / batchManager.triggerBatchProcessing / handleSafetyInspection`

### D2. 强制手动复位 (任何状态都可点)
| 页面 | 按钮 / 快捷键 | 行为 |
|---|---|---|
| Live | `PageUp` | `handleClearCapturedImages` (清空+复位) |
| OCR | `R 键` 或 `PageUp` | `handleForceReset` (复位工作流+清空 cookie+清缓存) |
| PPE | `PageUp` | `capture.handleClearCapturedImages` |

### D3. 工作流 phase 卡在 'detecting' (大模型长时间不返回)
| 步骤 | 预期 |
|---|---|
| 1 | 大模型/后端宕机,`isInspecting` 一直为 true | phase 持续显示 `detecting`,看门狗**不**降级(因为 `!isInspecting` 是 armed 条件) |
| 2 | 用户按 `PageUp` | 复位本地状态,phase 回到 `idle` |
| 3 | 用户点"取消 AI 检测"按钮 (如果有) | isInspecting=false,phase 回 `idle` 或 `capturing` |

> 后端超时不应由看门狗兜底,因为本地状态无法取消远端请求。
> 设计上由各自的 `handleCancelAIDetection` / HTTP 超时负责。

---

## E. 全屏场景

### E1. BPM 全屏 (CSS 全屏 fixed inset-0) - Live 页
| 步骤 | 预期 |
|---|---|
| 1 | Live 页点全屏按钮 / 按 `F` | `div` 变 `fixed inset-0 z-50 bg-black`,视频占满屏 |
| 2 | MiniWorkflowOverlay | 因为 Live 用 CSS 全屏,浮层挂在外层 React 树,无需 portal,仍显示在右下角 |
| 3 | 按 `F` 或 ESC | 退出全屏 |

### E2. Fullscreen API 全屏 - OCR / PPE 页
| 步骤 | 预期 |
|---|---|
| 1 | OCR 页点全屏按钮 | `requestFullscreen()` 进入原生全屏 |
| 2 | MiniWorkflowOverlay 用 createPortal 注入 `#video-container` | 浮层显示在视频右下角,受全屏元素子树保护 |
| 3 | 按 `F` / ESC 退出 | 浮层自动归位到普通 DOM |
| 4 | 若 `#video-container` 尚未挂载 (portal target null) | 浮层临时不渲染,等到挂载后 setState 触发重绘 |

### E3. 切换检测页面后 portal target 失效
| 步骤 | 预期 |
|---|---|
| 1 | 从 OCR 切到 Live | OCR 组件卸载,useEffect cleanup 清理 setTimeout |
| 2 | 回到 OCR | 重新挂载,setTimeout 100ms 找到 `#video-container`,Portal 生效 |

---

## F. 配方与设备映射

### F1. 配方设备映射包含自定义指令
| 步骤 | 预期 |
|---|---|
| 1 | 配方编辑器设置 alarm 设备 `unqualified: 'ALARM_RED'` | `useHardwareTrigger.triggerCmd` = `'ALARM_RED'` |
| 2 | 收到 `ALARM_RED` | 触发 onTrigger(等价工件到位) |
| 3 | 白名单兜底仍有效 (`'TRIGGER'/'START'/'CLEAR'/'RESET'`) | 即便配置写错也有保底 |

### F2. 配方未配置 (空 actionMap)
| 步骤 | 预期 |
|---|---|
| 1 | `actionMap=undefined` | `recipeActions=undefined`,triggerCmd='TRIGGER' (默认) |
| 2 | 收到 Arduino `TRIGGER\n` | 正常触发 |

### F3. processStageCode 与配方不匹配
| 步骤 | 预期 |
|---|---|
| 1 | URL `?stage_code=FOO` 但所有配方 processStageCode 都是 `BAR` | `recipeActionMap` 保持 undefined |
| 2 | 控制台 `[warning] 获取配方设备配置失败` 或 `matched=undefined` | 不影响检测主流程,硬件仍正常响应默认指令 |

---

## G. 模拟模式 simulationMode

| 步骤 | 预期 |
|---|---|
| 1 | deviceStore.simulationMode=true | useHardwareTrigger `autoConnect=false`,不主动连串口 |
| 2 | `isConnected` 由 `!!activeDevice` 决定 | 显示"模拟在线" |
| 3 | 控制台 `[模拟模式] 硬件触发就绪` | 串口 reader 不启动 |
| 4 | 键盘后备键 | 仍工作,符合"模拟硬件"语义 |

---

## H. 压力 / 并发

### H1. 高频 TRIGGER (抖动 / 信号弹跳)
| 步骤 | 预期 |
|---|---|
| 1 | Arduino 1 秒内连发 5 个 `TRIGGER` | 每次 cleanData 匹配,触发 5 次 `handleHardwareTrigger` → 5 张抓拍 |
| 2 | `capturedImages.slice(-10)` 限长 | 数组不会无限增长 |
| 3 | 看门狗 `markActivity` 每次重置计时,不会超时 | OK |

### H2. 反向写 `START_ROTATE` 时 Arduino 已断开
| 步骤 | 预期 |
|---|---|
| 1 | `sendData('START_ROTATE\n')` | port.writable=null,sendData 返回 false |
| 2 | 控制台 `[serial] sendData failed: 端口不可写` | 不影响主流程 |
| 3 | 不再继续触发后续抓拍 | 用户手动按 `Space` 补抓 |

### H3. 多窗口同时开检测页
| 步骤 | 预期 |
|---|---|
| 1 | 一个浏览器开两个 Live 页 windowId=A/B | 各自独立 capturedImages/localResults/phase |
| 2 | 共享 deviceStore | 两个页面的 hardwareTrigger 实例都连同一个串口 |
| 3 | 任一页面收到 TRIGGER 都会抓拍 | OK |
| 4 | 反向写 START_ROTATE 可能重复 | 可接受,Arduino 只识别空闲时 `START_ROTATE` |

---

## I. 浏览器层边缘

### I1. 用户在设备测试 Tab 切走再回来
| 步骤 | 预期 |
|---|---|
| 1 | 切到别的 Tab 30s | setInterval 被 Chrome 限流,看门狗可能延迟触发 |
| 2 | 回到检测页 | 等待计时完成,触发降级 |
| 3 | 不影响结果 | OK,设计上能容忍轻微延迟 |

### I2. 焦点在 input 时按键
| 步骤 | 预期 |
|---|---|
| 1 | 焦点在配方名称 input | `useHardwareFallbackKeys` 的 isEditable 判定 true,所有后备键不响应 |
| 2 | 焦点在 OCR 关键词 textarea | 同上,PageDown/Space 等不冲突 |

### I3. 用户浏览器不支持 Web Serial (Firefox / Safari)
| 步骤 | 预期 |
|---|---|
| 1 | `navigator.serial` 不存在 | `isSupported=false` |
| 2 | useHardwareTrigger 不报错 | autoConnect 不执行 |
| 3 | 键盘后备键 | 仍工作 |

---

## J. 失联自愈 (新加入机制)

### J1. Arduino 拔出再插回 (新机制毕业)
| 步骤 | 预期 |
|---|---|
| 1 | 已连接,拔出 | `isConnected=false` |
| 2 | 1 秒内插回 | useSerialDevice 的 autoConnect useEffect deps 含 `state.isConnected`,触发重连 (inFlightRef 防止 0.5s 内重复 open) |
| 3 | 控制台 `[serial] Auto-connect 已生效` | 用户无需 reload 页面 |

### J2. 测试看门狗 markActivity
| 步骤 | 预期 |
|---|---|
| 1 | 采集开始,phase=capturing | watchdog.isRunning=true |
| 2 | 5 秒后再收到一个 TRIGGER (markActivity) | `remainingMs` 重置到 30s |
| 3 | 30 秒无信号 → onTimeout 触发一次 (firedRef 防重) | 不会重复多次 |

---

## 验收选题快速回归 (10 分钟覆盖核心)

1. **零硬件**: 进 Live 页, 按 `Space` 抓拍, `PageDown` 触发评估 → phase 流转完整
2. **失联降级**: 配合 Arduino 模拟发出 TRIGGER 后立刻拔线 → 30s 看门狗自动降级
3. **键盘后备**: 全程不接 Arduino, `Home`→`PageDown` 完整流程通过
4. **全屏可见**: OCR 页进全屏, MiniWorkflowOverlay 仍显示右下角, 可呼出展开
5. **复位`: 任何 phase 异常, 按 `PageUp` 复位回 idle