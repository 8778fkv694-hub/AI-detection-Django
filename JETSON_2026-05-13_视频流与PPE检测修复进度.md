# Jetson 2026-05-13 视频流与 PPE 检测修复进度

## 当前目标

1. 首页左下角「视频流设置」要真实影响当前 Web 预览，不是只改 UI 数值。
2. PPE 检测页 YOLO/ROI 检测框要稳定显示，不能启动后又被其他页面或 React cleanup 停掉。
3. Mac 本地项目和 Jetson 项目保持同一套源码；Jetson 只保留硬件/CUDA/服务配置差异。

## 已确认环境

- Mac 主项目：`/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django`
- Jetson 项目：`~/projects/AI-Detection`
- Jetson 访问：`ssh -i ~/.ssh/id_rsa -o IdentitiesOnly=yes -o ControlMaster=no -S none jetson`
- Jetson 前端：`https://localhost:3005/` 或 `http://192.168.55.1:3005/`
- Jetson 后端：`http://127.0.0.1:8000`
- 当前 USB 流 ID：`701efd6b-cf5c-4bea-b882-7914ffc65f79`
- Jetson 服务：`ai-backend`、`ai-frontend-spa`

## 本轮已完成并部署到 Jetson 的修复

### 1. 视频流设置不生效/看起来仍很卡

根因不是滑块本身，而是后端 `StreamReader` 的 low_latency 读帧逻辑：

- 旧逻辑每轮连续 `cap.read()` 最多 10 次，只发布最后一帧。
- USB 摄像头的 `cap.read()` 会阻塞等新帧。
- 结果是 `frame_version` 每 10 帧才增长一次，MJPEG 端又按 `frame_version` 去重，显示帧率被后端主动压低。

已修复：

- `backend/inspection/stream_service.py`
  - low_latency 模式改为每读到 1 帧就发布 1 帧。
  - 保留低延迟短 sleep，但不再批量丢帧。

Jetson 验证结果：

- 修复前：`/mjpeg-cv2/?quality=75&width=960&fps=25` 约 `8 frames / 5s`
- 修复后：`/mjpeg-cv2/?quality=75&width=960&fps=25` 约 `74 frames / 5s`
- 结论：显示帧率从约 1-2fps 提升到约 14-15fps，已经解决“设置到 25 但仍像 10 以下”的主要后端限速问题。

当前仍要注意：

- 摄像头当前以 `1920x1080 MJPG 30fps` 打开。
- Jetson 上 OpenCV + Django + JPEG/MJPEG 推送实际稳定约 14-15fps。
- 若要进一步接近 25fps，需要下次继续测试将后端采集默认从 1080p 切到 720p，或走真正 passthrough，但 passthrough 会影响后端检测共享摄像头。

### 2. 前端视频流设置热更新

已在本地代码中修复并部分同步：

- `src/lib/mjpegPlayer.ts`
  - 增加 `updateSettings({ fps, quality, targetWidth })`
  - 更新时重建 MJPEG URL 并加 cache bust 参数 `_`
  - 运行中改左下角设置，不需要关开摄像头
- `src/lib/streamPlayer.ts`
  - 增加 `updateSettings`
  - FPS/质量/宽度变化后重启轮询定时器
  - Canvas 尺寸会跟随新帧尺寸更新
- `src/hooks/safetyEquipment/useSafetyCamera.ts`
- `src/hooks/liveInspection/useLiveCamera.ts`
- `src/hooks/ocr/useOCRCamera.ts`
  - 当前流运行时监听全局视频设置并调用播放器 `updateSettings`

Jetson 日志已看到新前端请求类似：

```text
GET /api/streams/.../mjpeg/?quality=85&width=960&fps=22&_=...
```

说明前端参数确实已经传到后端。

### 3. PPE 显示框被阈值挡掉

已修复本地代码：

- `src/hooks/safetyEquipment/usePPEDetection.ts`
  - 实时显示框不再直接套用 `person=0.8` 这类业务阈值。
  - 显示层按实时检测阈值显示，质检/抓拍仍保留业务阈值。
  - 后端检测结果新增 `frame_width/frame_height` 后，前端按源分辨率缩放画框。

### 4. 检测循环返回源尺寸

已修复：

- `backend/inspection/detection_loop.py`
  - `/api/streams/<id>/detections/` 的 JSON 中新增：
    - `frame_width`
    - `frame_height`
  - 前端据此把 1920x1080 检测框缩放到页面显示尺寸。

### 5. MJPEG 生成器性能

已修复：

- `backend/inspection/mjpeg_view.py`
  - 使用 `reader.get_frame_ref()` 减少复制。
  - 只有有 overlay 框时才 `frame.copy()`。
  - sleep 改为扣除编码耗时：`sleep(max(0, frame_interval - elapsed))`。

### 6. DetectionLoop 重复推理同一帧

已修复本地代码，尚未同步到 Jetson 验证：

- `backend/inspection/detection_loop.py`
  - 之前虽然读取了 `reader.frame_version`，但没有真正跳过相同帧。
  - 当 YOLO 推理快于摄像头发布新帧时，检测线程会对同一帧重复推理，造成 Jetson GPU/CPU 空转。
  - 现在按 `(frame_version, config_version)` 去重；同一帧同一配置只推理一次。
  - `status` 中新增 `duplicate_frame_skips` 和 `last_processed_frame_version`，便于实机确认是否生效。
  - 已补上模型切换时的模型池容量检查，避免多个检测循环在 Jetson 上反复驱逐/重载 YOLO 模型。
  - `stop_loop(..., force=True)` 用于系统级流媒体停止，避免 stream 被停后检测线程继续空转。
- `backend/inspection/stream_api.py`
  - 停止/重启流媒体时会同步强制停止检测循环，释放 active loop 和模型池占位。
- `backend/inspection/yolo.py`
  - 模型池命中日志从 `info` 降为 `debug`，避免高频推理时刷爆 journald。

### 7. Mac 本地 Jetson 模拟烧机

已新增脚本：

```bash
venv/bin/python scripts/local_jetson_burnin.py --duration 60 --stream-fps 8 --inference-ms 45 --streams 2 --model-pool-size 2
```

覆盖内容：

- 无真实摄像头/YOLO 权重时，模拟 2 路 1280x720、8 FPS 视频流。
- 模拟 Jetson 较慢 YOLO 推理（45ms/次）。
- 周期性触发 owner 重复 start/stop、配置切换、第二路检测循环 force stop/restart。
- 验证模型池容量检查、失败启动不残留 owner、无 owner stop 不误停、force stop 释放 active loop。
- 验证 `duplicate_frame_skips` 增长，确认同一帧重复推理防护生效。

本地 60 秒烧机结果：

- `ok: true`
- `active_loops: 2`
- owners 稳定为 `burnin_stream_1: 1`、`burnin_stream_2: 1`
- `burnin_stream_1 duplicate_frame_skips: 5830`
- `burnin_stream_2 duplicate_frame_skips: 789`
- 失败启动返回 `owners: 0`，没有假 owner 残留。

### 8. 摄像头卡顿专项：MJPEG 多客户端与追帧

已修复本地代码，尚未同步到 Jetson 验证：

- `src/lib/mjpegPlayer.ts`
  - 补上与 `StreamPlayer` 一致的 `BroadcastChannel` 互斥机制。
  - OCR、PPE、实时检测打开同一个 stream 时，后打开的页面会通知旧页面释放 MJPEG 播放器。
  - 避免多个页面同时拉 `/mjpeg/`，导致 Jetson 对同一摄像头重复 JPEG 编码。
- `src/screens/StreamSettingsScreen.tsx`
  - 设置页实时预览也加入同一 stream 的互斥广播。
  - 当 PPE/实时检测/OCR 接管摄像头流时，设置页预览会自动停止。
- `backend/inspection/mjpeg_view.py`
  - 修复 cv2 MJPEG 生成器“编码慢于目标帧率时继续追帧”的问题。
  - 当 `cv2.imencode` 耗时超过目标帧间隔时，主动 sleep 让出 CPU，避免 Django worker 长期 100% 占用。
  - Jetson 上默认保护 cv2 MJPEG：非 `raw=1` 时限制为最高 `1280px / q85 / 20fps`，避免原始 1080p+高质量重编码造成摄像头和 YOLO 同时卡顿。

本地已验证：

- `npm run build` 通过。
- `venv/bin/python backend/manage.py check` 通过。
- 模拟 `imencode=25ms`、目标 `60fps` 时，MJPEG 生成器触发 overload sleep：
  - `overload_sleep_count: 4`
  - 日志出现 `MJPEG encoder overloaded ...`

## 本轮发现但尚未完成部署验证的问题

### PPE 检测循环会被误停

Jetson 日志显示：

```text
POST /detection-loop/start/ 200
约 1.5 秒后
POST /detection-loop/stop/ 200
```

同时还看到 OCR 页面也会发同一个 stream 的 stop。原因是 OCR、实时检测、PPE 共用一个 `stream_id`，后端旧的 `stop_loop(stream_id)` 没有 owner 概念，一个页面 cleanup 可能停掉另一个页面的检测循环。

本地已经完成修复并通过 build，但尚未同步到 Jetson 重启验证：

- `backend/inspection/detection_loop.py`
  - 增加 owner/ref owner 管理。
  - 带 `owner_id` 的 stop 只能停止自己启动的 loop。
  - 有 owner 持有时，无 owner 的旧 stop 不再误停 loop。
  - `start_loop()` 不再在模型池容量检查前提前登记 owner，避免启动失败后残留假引用。
- `backend/inspection/detection_api.py`
  - start/stop 支持 JSON 字段 `owner_id`。
- `src/hooks/safetyEquipment/usePPEDetection.ts`
  - PPE start/stop 已带 `owner_id`。
- `src/hooks/liveInspection/useLiveYoloDetection.ts`
  - Live YOLO start/stop 已带 `owner_id`。
- `src/hooks/ocr/useRealtimeDetectionLoop.ts`
  - OCR 实时检测 start/stop 已带 `owner_id`。

下次要继续：

1. Jetson 重新连上后，在 Mac 项目根目录运行一键部署验证脚本：

```bash
./scripts/deploy_verify_jetson.sh
```

这个脚本会自动执行：

- 本地 `npm run build`
- 同步 `stream_service.py`、`mjpeg_view.py`、`detection_loop.py`、`detection_api.py`、`stream_api.py`、`yolo.py`
- 同步 `src/` 和 `dist/`
- 重启 `ai-backend`、`ai-frontend-spa`
- 检查 stream manager、detection loop、最新 detections、MJPEG 5 秒帧数、后端日志
- 自动调用 `./scripts/jetson_yolo_direct_check.sh`，抓取同一 stream 的 snapshot/frame 并直接 POST `/api/results/yolo-detect/`

也可以单独运行 YOLO 直测脚本：

```bash
./scripts/jetson_yolo_direct_check.sh
```

可选参数：

```bash
JETSON_STREAM_ID=<stream_id> YOLO_CONF=0.25 ./scripts/jetson_yolo_direct_check.sh
```

预期：

- PPE 监控开启后 `active_loops` 保持 `1`，不会 1-2 秒后自动变成 `0`。
- `/detections/` 持续返回 `frame_width/frame_height`。
- 如果画面里确实有 PPE/person 目标，`boxes` 非空，前端 canvas 能看到框。

## 本轮构建/同步状态

已通过：

```bash
npm run build
```

已同步并重启验证过的后端关键修复：

- `backend/inspection/stream_service.py`
- `backend/inspection/mjpeg_view.py`
- `backend/inspection/detection_loop.py` 的尺寸字段版本

注意：

- `owner_id` 防误停补丁已在本地完成并通过 `npm run build`，尚未完成 Jetson 部署验证。
- 结束前不要假设 PPE 画框已经最终解决；下次从 owner 生命周期修复部署开始。

## 下次优先级

1. 运行 `./scripts/deploy_verify_jetson.sh` 部署并验证 `owner_id` 防误停。
2. 打开 PPE 页面，点击“开启摄像头”和“开始监控”，观察 `detection-loop/status` 是否稳定。
3. 若 loop 稳定但 `boxes=[]`，运行 `./scripts/jetson_yolo_direct_check.sh` 确认是否场景/模型未检出，而不是画框渲染问题。
4. 若还需要更高显示帧率，测试把本地 USB 摄像头采集默认改为 `1280x720 MJPG 30fps`，再测 `/mjpeg-cv2` 5 秒帧数。
