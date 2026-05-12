# OCR Detection Screen 全功能组合审计报告

> **审计时间**: 2026-05-12  
> **审计范围**: OCRDetectionScreen + 所有关联 Hooks + 流媒体管理 + LiveInspectionScreen 交叉交互  
> **审计方法**: 白军+蓝军双重审查，覆盖所有功能组合、状态转换、竞态条件

---

## 一、功能矩阵总览

### 1.1 工作流状态机 (workflowState)

```
idle ─────debounce触发──► searching_best_frame ──延时结束──► capturing ──快照成功──► processing
  ▲                            │                              │                        │
  │                            │ 批次模式                      │ 批次模式               │
  │                            └──► (跳过capturing直接触发)     └──► (跳过processing)    │
  │                                                                                     │
  ├─── 合格+自动继续 ─── completed ◄─── 1秒延迟 ─────────────────────────────────────────┤
  │                                                                                     │
  ├─── 存疑/不合格 ─── waiting_for_approval ◄── Enter键 ─── completed ◄── 1秒延迟 ───────┤
  │                                                                                     │
  └─── handleForceReset / error ────────────────────────────────────────────────────────┘
```

**状态值**: `idle | searching_best_frame | capturing | processing | waiting_for_approval | completed`

### 1.2 核心功能开关矩阵

| 功能 | 状态值 | 互斥关系 | 影响范围 |
|------|--------|---------|---------|
| YOLO检测模式 | `or` / `and` | 互斥 | 触发判断逻辑 |
| 批次处理模式 | `batch` / `false` | 互斥 | 图像处理流程 |
| 图像保存模式 | `full` / `roi` | 互斥 | 拼接/压缩逻辑 |
| 融合AI | `true` / `false` | 与isLocalMode互斥 | OCR后处理 |
| 条码检测 | `true` / `false` | 独立 | 结果判定 |
| 关键词分析 | `true` / `false` | 独立 | 结果判定 |
| 压缩 | `true` / `false` | 独立 | 图像尺寸 |
| 自动抓拍 | `true` / `false` | 独立 | 触发方式 |
| 需确认模式 | `true` / `false` | 独立 | 结果流转 |
| 智能预处理 | `true` / `false` | 独立 | 图像质量 |
| 暂停 | `true` / `false` | 与workflow并行 | 检测中断 |

### 1.3 摄像头/流模式矩阵

| 设备类型 | deviceId格式 | backendStreamId | YOLO帧来源 | 抓拍来源 |
|---------|-------------|-----------------|-----------|---------|
| 物理USB | 浏览器UUID | `null` | 前端canvas截图→base64上传 | 前端canvas截图 |
| 虚拟流(ffmpeg) | `stream-<DB_ID>` | `<DB_ID>` | 后端detection-loop→GET JSON | 后端snapshot→fallback前端 |
| 虚拟流(jpg) | `stream-<DB_ID>` | `<DB_ID>` | 后端detection-loop→GET JSON | 后端snapshot→fallback前端 |

---

## 二、🔴 严重问题 (CRITICAL - Must Fix)

### C1. 路径穿越漏洞 — HLS文件任意读取

**位置**: `backend/inspection/stream_api.py:443-447`

```python
file_path = Path('media/hls') / stream_id / filename
return FileResponse(open(file_path, 'rb'), ...)
```

`filename` 来自URL参数，未做任何路径消毒。访问 `/api/streams/abc/hls/../../../etc/passwd` 可读取任意文件。

**修复**: 在构造Path后检查 `file_path.resolve()` 是否在 `Path('media/hls').resolve()` 子树中。

### C2. 多Worker单例隔离 — gunicorn多进程下状态分裂

**位置**: `backend/inspection/stream_service.py:359-370`

`StreamManager` 和 `DetectionLoopManager` 是进程级单例。使用 `gunicorn --workers N` 时，每个worker有自己的实例。Worker A启动的流对Worker B不可见，后者收到`/frame`请求后会重复创建reader，导致RTSP双连接、双带宽、潜在RTSP会话冲突。

**修复**: 使用Redis/共享内存做跨进程状态同步，或强制单Worker运行（当前Jetson实际是单Worker）。

### C3. StreamManager的streams字典无锁

**位置**: `backend/inspection/stream_service.py:378-406`

`add_stream`、`remove_stream`、`get_stream`、`stop_all_streams` 等多处直接读写 `self.streams` 字典，无任何锁保护。`remove_stream` 调用 `thread.join(timeout=2.0)` 期间其他线程的 `get_stream` 可能拿到正在被删除的reader。

**修复**: 所有对 `self.streams` 的读写操作统一用 `threading.Lock` 包裹。

### C4. RTSP凭证明文日志

**位置**: `backend/inspection/stream_hls.py:170`、`stream_service.py:134-139`

```python
logger.info(f"Executing FFmpeg command: {' '.join(cmd)}")
logger.info(f"Opening RTSP stream: {rtsp_url}")
```

完整的URL（含 `rtsp://user:pass@host`）被记录到日志。任何有日志读取权限的人可获取RTSP凭据。

**修复**: 在日志输出前对URL做密码脱敏。

---

## 三、🟡 高危问题 (HIGH - Should Fix)

### H1. DetectionLoop永不终止 — 流移除后线程泄漏

**位置**: `backend/inspection/detection_loop.py:86-93` + `stream_api.py:491`

`_stop_stream()` 不通知 `detection_loop_manager`。流移除后，DetectionLoop持续轮询`stream_manager.get_stream()`获取`None`，每0.5秒空转一次永不退出。

**修复**: `_stop_stream` 中增加 `detection_loop_manager.stop_loop(stream_id)` 调用。

### H2. HLS分段文件永不清理 — 磁盘无界增长

**位置**: `backend/inspection/stream_hls.py:246-247`

```python
def stop(self):
    self.is_running = False
    # self._cleanup_files()  # 被注释掉了!
```

长期运行的HLS流转码会在`media/hls/`下无限累积`.ts`和`.m3u8`文件。

**修复**: 取消注释并在stop时增加TTL清理（保留最近N个分段）。

### H3. 前端 AND模式空目标BUG — 无条件触发抓拍

**位置**: `src/hooks/ocr/useDetectionMode.ts:166`

```typescript
// validSelectedTargets为空时，Array.every()返回true
const allTargetsDetected = validSelectedTargets.every(...)
// → shouldTriggerCapture = true  // 没选目标也在AND模式下触发!
```

**修复**: 在`every()`调用前加 `if (validSelectedTargets.length === 0) return { shouldTriggerCapture: false, ... }`

### H4. 批次处理后关键Refs未重置 — 残留状态导致下一轮误触

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:761-783, 1036-1041`

批次模式路径在成功调用`batchManager.triggerBatchProcessing(true)`后直接`return`，跳过了`historyDetectionsRef.current.clear()`和`elementDetectionStartTimeRef.current = null`的重置。

**修复**: 在批次路径的return前增加清理逻辑。

### H5. `isInPostDetectionDelay` 泄露

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:642-655`

延时循环被提前中断时（workflowState变化），`setIsInPostDetectionDelay(true)` 已在642行设置，但652-655行的early return不重置它为false。

**修复**: early return前增加 `setIsInPostDetectionDelay(false)`。

---

## 四、🟠 中危问题 (MEDIUM - Consider Fixing)

### M1. 暂停后已排队的检测仍执行 — 绕过isPaused守卫

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:304-580`

外部`performRealtimeDetection`检查了`isPausedRef.current`（304行），但已入队的`executeDetection`（通过队列）不检查isPaused状态。

**修复**: 在`executeDetection`内部增加`if (isPausedRef.current) return;`

### M2. 延时循环内workflowState过期闭包

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:649-656, 752-756`

延时循环中的while条件使用的`workflowState`是闭包捕获值。如果外部改变workflowState（如用户按空格取消），循环看不到新值，可能继续运行数秒。

**修复**: 使用ref保存workflowState，循环中读取ref而非闭包值。

### M3. 检测队列无界增长

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:583-588`

如果检测速度慢而间隔短，`detectionQueueRef`会无限增长。队列无容量上限、无任务合并机制。

**修复**: 限制队列最大长度（如5），新任务直接替换队列中等待的同类型任务。

### M4. HLS monitor线程readline阻塞

**位置**: `backend/inspection/stream_hls.py:259-260`

`process.stderr.readline()` 是阻塞调用。如果ffmpeg不输出stderr，monitor线程永久挂起，无法检测进程退出。

**修复**: 使用 `select` 或设置超时或使用 `communicate` 的非阻塞模式。

### M5. 帧API阻塞Django Worker 500ms

**位置**: `backend/inspection/stream_api.py:284-285`

```python
# 自动启动流时的同步sleep
time.sleep(0.5)
```

在单Worker配置下，这会阻塞所有其他API调用。

**修复**: 将自动启动改为异步任务或至少缩短sleep时间。

### M6. status端点每次GET写DB

**位置**: `backend/inspection/stream_api.py:242`

每次轮询都调用`stream.save()`更新状态。高频轮询（每1-2秒）造成不必要的DB写。

**修复**: 仅在状态变化时写DB，或使用节流机制。

### M7. MJPEG切换后low_latency参数丢失

**位置**: `backend/inspection/mjpeg_passthrough.py:287-296`

MJPEG passthrough驱逐cv2 reader后，`_restart_cv2_reader` 创建新reader时强制 `low_latency=False`，无论原始配置是什么。

**修复**: 保存原始low_latency配置并在重启时恢复。

### M8. useLiveYoloDetection的start未传model_id

**位置**: `src/hooks/liveInspection/useLiveYoloDetection.ts:377-383`

```typescript
fetch(`/detection-loop/start/`, {
    body: JSON.stringify({ conf_threshold: detectionConfidence }),
    // 缺少 model_id!
})
```

前端模型切换后不会传播到后端，除非重启检测循环。

**修复**: 添加`model_id: currentModel || currentModelId`。

### M9. Snapshot与Detection帧不对齐

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:523`

防抖触发后先获取 `/detections/`（帧N），再获取 `/snapshot/`（可能已是帧N+1）。如果两帧之间目标移动，检测框与快照图像错位。

**修复**: 先取snapshot（带frame_id），再取detections，验证frame_id一致性。

### M10. batchManager的cacheROI失败静默

**位置**: `src/hooks/ocr/useBatchProcessingManager.ts`

如果 `cacheROI` HTTP请求失败，该标签永远不被标记为就绪，`checkAllTargetsReady`永远返回false，批处理永不触发——且没有任何UI反馈。

**修复**: 增加超时机制和用户可感知的错误提示。

### M11. labelMaxAreaRef永不重置 — 面积评分偏差累积

**位置**: `src/hooks/ocr/useROIProcessor.ts:143`

`labelMaxAreaRef`记录每个标签的历史最大面积，用于归一化。但它在组件整个生命周期中从不重置，导致后期ROI的面积评分永远偏低。

**修复**: 在`resetROIs`中或每个检测周期后重置。

### M12. 自动保存重试冷却期无限 — 失败后数据可能丢失

**位置**: `src/hooks/ocr/useBatchResultHandler.ts:375`

3次失败后等待30秒冷却，冷却期间如果ocrResult不变，effect不会重新触发，保存永久搁置。

**修复**: 使用指数退避并最终给出手动重试的UI提示。

### M13. 前端顶层异常重置过于激进

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:561-567`

`executeDetection`的顶层catch将所有状态重置为idle，包括可能由之前成功的工作流设置的结果。

**修复**: 仅在当前没有活跃工作流时重置，或使用更细粒度的错误分类。

### M14. capture模式期间isPaused未阻止帧收集

**位置**: `src/hooks/ocr/useRealtimeDetectionLoop.ts:649-736`

searching_best_frame延时模式下的帧收集循环不检查`isPaused`状态，暂停后延时循环仍会继续运行。

**修复**: 帧收集循环中增加isPaused检查。

---

## 五、🟢 低危问题 (LOW - Nice to Have)

### L1. DB error_count不自动清零 — 恢复后显示旧错误数

### L2. 虚拟流的play_mode'ffmpeg'无跨窗口协调

### L3. 前端压缩禁用时仍弹出toast警告

### L4. useRealtimeDetection.ts中的executeWithQueue重复实现

### L5. canvas.toBlob承诺无超时

### L6. HLS路径的playlist没有X-Accel-Buffering头

### L7. DetectionLoop对不存在的streamId成功创建

### L8. MJPEGPlayer无跨窗口协调

### L9. 视频文件auto_reconnect对本地文件无必要

### L10. useLiveYoloDetection中setTimeout无清理

---

## 六、跨组件交互风险矩阵

| 场景 | 影响组件 | 风险等级 | 现象 |
|------|---------|---------|------|
| 两个窗口用同一stream | OCR + LiveInspection | 🟡 | start/stop争夺（已通过引用计数修复） |
| 两个窗口用同一USB相机 | OCR + LiveInspection | 🔴 | 浏览器API拒绝第二个getUserMedia |
| 快速切换设备 | OCR或Live | 🟡 | toggleCamera竞态，可能残留播放器实例 |
| OCR启用批次+融合AI | OCRScreen | 🟡 | LLM调用10-60秒阻塞onBatchComplete |
| 虚拟流HLS+暂停 | OCRScreen | 🟡 | 暂停不停止HLS转码，浪费CPU |
| MJPEG切换回cv2 | 流管理 | 🟡 | low_latency参数丢失 |
| 流删除后DetectionLoop存活 | 流管理 ↔ 检测 | 🟡 | 线程泄漏，0.5秒空转 |

---

## 七、已修复项（本次提交 `1b49f68` + `a4e31af`）

| 修复项 | 方案 |
|--------|------|
| DetectionLoopManager引用计数 | start_loop +1，stop_loop归零才真停 |
| processCapture空值守卫 | videoRef.current空检查 + try/catch包裹 + .catch()兜底 |
| VITE_BACKEND_DETECTION误报 | 二审确认streamId守卫已足够，不修 |

---

## 八、修复优先级建议

### 第一优先级 (安全+稳定性)

1. **C1** 路径穿越 — 安全漏洞
2. **C3** streams字典无锁 — 多线程崩溃风险
3. **C4** RTSP凭证明文日志 — 凭据泄露
4. **H1** DetectionLoop线程泄漏 — 资源泄漏
5. **H2** HLS文件累积 — 磁盘耗尽

### 第二优先级 (功能正确性)

6. **H3** AND模式空目标BUG — 误触发
7. **H4** 批次模式refs未重置 — 状态污染
8. **H5** isInPostDetectionDelay泄露 — 状态卡死
9. **M1** 暂停后已排队检测 — 逻辑绕过

### 第三优先级 (体验+性能)

10. **M5** 帧API阻塞Worker
11. **M6** status端点频繁DB写
12. **M8** start未传model_id
13. **M10** batchManager.cacheROI静默失败
14. 其余Medium/Low项

---

*审计完成。C2（多Worker单例）在当前Jetson单Worker部署下不触发，但升级gunicorn配置时需注意。*
