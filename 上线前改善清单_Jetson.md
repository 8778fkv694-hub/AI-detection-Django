# 上线前改善清单 — Mac → Jetson Orin Nano

> 背景：本机 Mac 上一切正常，部署到 Jetson Orin Nano 后陆续暴露的问题。本清单按"阻塞上线"程度排序，每项给出**现象 / 根因 / Mac 与 Jetson 区别 / 修改建议**。

---

## 🔴 P0 阻塞上线（必须修）

### 1. OCR 第一次推理卡死整个后端
- **现象**：用户第一次点 OCR，画面卡 5–15 秒，期间所有 API 都不响应（流状态、设备列表都断）。
- **根因**：
  - `OCRService._load_rapidocr_model()` 是延迟加载，第一次调用才解析 3 个 ONNX 模型。
  - ONNX Runtime aarch64 CPU EP 第一次推理还要做 graph optimization，再耗几秒。
  - 后端跑的是 `serve_production.py`（wsgiref ThreadedWSGIServer），GIL + ORT 长时间持锁 = 整进程阻塞。
- **Mac vs Jetson**：Mac M 系列首次推理 < 2s 用户感知不到；Jetson aarch64 CPU 5–15s 必然被发现。
- **修复**：
  1. 在 `backend/inspection/apps.py` 的 `ready()` 里子线程预热 RapidOCR：加载 + 跑一次 dummy 推理。
  2. 把 RapidOCR 的 3 个 onnx 模型落到 `backend/inspection/models/rapidocr/`（当前目录是空的，第一次会触发联网下载）。
  3. 启动脚本里加 `READY_FILE=/tmp/ai_backend_ready` 写时间戳，systemd 健康检查读这个。

---

### 2. `/api/streams/manager/status/` UUID JSON 序列化 500
- **现象**：日志每分钟一次 `TypeError: keys must be str, int, float, bool or None, not UUID`，前端流状态轮询全失败 → UI 一直显示"摄像头异常"。
- **根因**：返回 dict 的 key 是 `UUID` 对象，`JsonResponse` 拒绝。
- **Mac vs Jetson**：本机 main 分支已经修过，jetson 跑的老代码（`init-clean` 分支）没修。
- **修复**：返回前 `{str(k): v for k, v in d.items()}`，或返回 list。

---

### 3. Jetson 跑的是错代码（仓库 + 分支都不一致）
- **现象**：你在本机 main 上修的所有 stream/MJPEG/OCR/Hik 改动，jetson 完全没有。
- **根因**：
  - 本机 origin = `8778fkv694-hub/AI-detection-Django.git`（main 分支）
  - Jetson origin = `8778fkv694-hub/jetson-ai-detection.git`（init-clean 分支）
  - **不是同一个仓库**，更新永远不会同步。
- **修复**：决定一个权威仓库（建议本机这套），把 jetson 的 origin 切过来，rebase 掉 jetson 上 `model_config.py` / `yolo.py` 的本地修改前先 patch 出来。**这是其他所有 fix 的前提**。

---

### 4. HTTPS 缺失 → 局域网摄像头权限被拒
- **现象**：工厂里用其他设备（手机/平板）访问 `http://192.168.1.195:3005`，浏览器拒绝 `getUserMedia` → 物理摄像头根本打不开。
- **根因**：`navigator.mediaDevices.getUserMedia` 仅在 `https://` 或 `http://localhost` 下可用。Jetson 上当前只暴露 8000 / 3005 明文 HTTP。
- **Mac vs Jetson**：Mac 开发用 localhost，没问题；Jetson 用 IP 访问，必现。
- **修复**：
  - 项目根有 `server.crt` / `server.key`，把前端 SPA 服务器和 Django 都启用 HTTPS（已有 `start_https_*.sh` 脚本，需要选定一个）。
  - 如只内网访问，可以配 mDNS 名 + 自签 CA 提前装好。

---

### 5. 后端 `serve_production.py`（wsgiref）不能扛生产
- **现象**：任何一次推理 / 大图保存 / DB 锁，整后端冻结。
- **根因**：`wsgiref.simple_server` 即使加了 ThreadingMixIn，Python GIL + ONNX/cv2 长时间持锁仍会让所有请求排队。
- **修复**：换 **gunicorn**（建议 `--workers 1 --threads 4 --worker-class gthread`）或 **waitress**。注意 worker > 1 会让模型重复加载占内存——用 threads 而不是 workers。

---

### 6. 海康摄像头当前走 RTSP/FFmpeg，延迟大、易断
- **现象**：海康摄像头连接慢、容易花屏、断流后要 5s+ 才重连。
- **根因**：用 `cv2.VideoCapture(rtsp_url)`，RTSP 握手就要 1–3s；UDP 丢包/电磁干扰 → 花屏。
- **Mac vs Jetson**：本机调试时摄像头网络环境干净；工厂电磁干扰强。
- **修复**：用户暂不实施（本期跳过），但后期建议：把 PyQt 项目里 `core/hikvision_sdk.py`（海康私有 SDK 直连）移植过来，子码流默认，延迟 30–80ms。

---

## 🟠 P1 影响稳定性（强烈建议本期修）

### 7. `DEBUG=True` 跑生产
- **现象**：报错把完整 traceback 返回浏览器；Django 慢；静态文件路径不一致。
- **修复**：systemd ExecStart 前加 `Environment=DEBUG=False`，并配好 `STATIC_ROOT` + `collectstatic`。

### 8. 流读取重连策略硬伤
- **现象**：摄像头断开后要 5s 才重试，并且没有指数退避，连续失败一直 5s 死循环。
- **修复**：`StreamReader._read_loop` 改指数退避（1s, 2s, 4s, ..., 封顶 30s），并在重连成功后重置计数。参考 PyQt `_CaptureThread` 的实现。

### 9. MJPEGPlayer 卡住没有自动重连
- **现象**：网络抖一下，前端 `<img>` 不再更新但 `onerror` 不触发，画面定格用户以为崩了。
- **修复**：`mjpegPlayer.ts` 加"3 秒收不到 onload 就自动 reload src"的看门狗。

### 10. SQLite 单写并发瓶颈
- **现象**：多窗口同时保存检测结果时 `database is locked`。
- **根因**：SQLite 默认 journal mode；高并发写时容易锁。
- **修复**：
  - settings 里加 `OPTIONS={'init_command': "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;"}`。
  - 或长期方案：换 PostgreSQL（多用户上线必做）。

### 11. 前端跑的是 4 月 16 日的 `dist/` 静态产物
- **现象**：你在本机改的前端代码，jetson 永远看不到。
- **修复**：上线流程里加 `npm run build` → 把 `dist/` 同步到 jetson → 重启 SPA 服务。最好做成 `deploy.sh` 一键化。

### 12. RapidOCR 模型未本地化 → 可能联网下载
- **现象**：第一次启动如果没缓存，会去 GitHub 拉模型，工厂网络一卡 = 启动失败。
- **修复**：把 `ch_PP-OCRv4_det_infer.onnx`、`ch_ppocr_mobile_v2.0_cls_infer.onnx`、`ch_PP-OCRv4_rec_infer.onnx` 一并放到 `backend/inspection/models/rapidocr/`，git LFS 或者部署包带过去。

### 13. paddleocr / paddlepaddle 装着没用，浪费内存
- **现象**：`import paddleocr` 在 try 块里被无条件触发，加载 paddle 全家桶占 ~500MB+ RSS。
- **修复**：改成 `if os.environ.get('USE_PADDLEOCR') == '1': import paddleocr` 等显式开关，默认不导入。

### 14. YOLO 推理首次也有冷启动
- **现象**：第一次目标检测会卡 2–5 秒（PyTorch 加载 + CUDA warmup）。
- **修复**：`apps.py` 里和 OCR 一起预热 YOLO，跑一次 dummy 推理。已有 `.engine` TensorRT 文件，确认 `model_config.py` 优先加载 engine 而不是 .pt。

### 15. Django 日志没有滚动
- **现象**：`django.log.1 / .2 / .3 / .4 / .5` 各 10MB 已堆满；本次 session `django.log` 已 4.5MB。
- **修复**：用 Python `RotatingFileHandler`（5MB × 10 个），或交给 logrotate。

---

## 🟡 P2 性能 / 体验

### 16. Jetson Orin Nano 没设满血功率档
- **现象**：默认可能跑在 7W 模式，YOLO/OCR 推理速度只有 25–50%。
- **修复**：开机执行 `sudo nvpmodel -m 0 && sudo jetson_clocks`，写到 `/etc/rc.local` 或 systemd 开机服务。

### 17. 前端流设备列表 10 秒一刷
- **现象**：用户切流的瞬间设备列表可能在更新，UI 闪。
- **修复**：`useOCRCamera.ts:338` 的 `setInterval(getAvailableDevices, 10000)` 改为 30s + 用户操作时主动刷新。

### 18. `low_latency=True` 下 read 50 次清缓冲会阻塞
- **现象**：开了低延迟模式后，stream_service 的 read 一次最多读 50 帧，期间任何并发 HTTP 请求被 GIL 卡住。
- **修复**：用专门的"丢帧线程"，主 read 循环不要一次跑 50 次。或者降到 5 次。

### 19. ONNX Runtime 没用 CUDAExecutionProvider
- **现象**：RapidOCR 跑 CPU EP，Orin Nano 的 GPU 完全闲置。
- **修复**：装 `onnxruntime-gpu` for aarch64（NVIDIA 官方 wheel），创建 RapidOCR 时传 `providers=['CUDAExecutionProvider', 'CPUExecutionProvider']`。预计推理速度 2–5x。

### 20. 大图 base64 通过 JSON 上传慢
- **现象**：一张 4K JPEG 转 base64 ~5MB，单线程 WSGI 写盘 + DB 都慢。
- **修复**：保存接口换 `multipart/form-data` 直接传二进制；或前端上传前压缩到 1080p。

### 21. Pillow 9.0.1 太老
- **现象**：新代码用 `Image.Resampling.LANCZOS` 等 PIL ≥ 9.1 才有的 API 时报 AttributeError。
- **修复**：升到 Pillow 10.x。注意 `ANTIALIAS` 在 10 里被移除，要全局替换为 `Resampling.LANCZOS`。

### 22. Chromium 浏览器版本可能偏老
- **现象**：MediaSource、WebRTC、HLS.js 行为差异。
- **修复**：确认 Chromium ≥ 110，否则用 snap 或 ppa 升级。

---

## 🔵 P3 安全 / 规范

### 23. `ALLOWED_HOSTS=['*']` + `CORS_ALLOW_ALL_ORIGINS=True`
- **现象**：上线后任何外网请求都能调用 API。
- **修复**：限制为内网网段或具体域名。

### 24. `CORS_ALLOW_ALL_ORIGINS=True` 与 `CORS_ALLOW_CREDENTIALS=True` 同时打开
- **现象**：浏览器对 `Access-Control-Allow-Origin: *` + `credentials: include` 会拒绝。当前能用是因为没有用 cookie。后续加登录会出问题。
- **修复**：要么明确列出 origin，要么关掉 credentials。

### 25. 海康/外部设备凭据散落在 .env / settings
- **修复**：统一进 `secrets.json`（PyQt 项目已有），Django 启动时读取，不要硬编码到 `stream_models.py` 默认值。

### 26. systemd 服务只在 `--user` 模式下注册
- **现象**：`ai-backend.service` 是 user-level，需要图形登录后才启动。无人值守重启会失败。
- **修复**：迁移到 `/etc/systemd/system/`（system-level），`User=wenyili`，加 `Restart=always`。

### 27. APPEND_SLASH 报错刷屏
- **现象**：`/api/ai-configs/test-connection`（无尾斜杠）每次 POST 都 500。
- **修复**：前端调用统一加尾斜杠；或后端 urls.py 加无斜杠的 alias。

### 28. 中间件 `inspection.middleware:53` 大量 WARNING 不带消息
- **现象**：日志里光秃秃一行 WARNING，看不出在告警什么。
- **修复**：把那行 logger 改成带 reason/path/duration 的结构化日志。

### 29. 启动脚本一堆变种（30+ 个 `start_*.sh`）
- **现象**：根目录有 `start_complete.sh / start_simple.sh / start_full_project.sh / start_https_production.sh ...` 30+ 个，没人知道该用哪个。
- **修复**：统一为 `deploy/jetson_start.sh`（Production）+ `deploy/dev_start.sh`（Dev），其他打包归档。

---

## 🧭 推荐执行顺序

1. **第 3 项**先做 → 仓库统一，否则后面修了也没用。
2. **第 5 项 + 第 7 项**：换掉 wsgiref，关 DEBUG。这是上线必备。
3. **第 1、2、12、14 项**：解决"卡死"和 500 报错。
4. **第 4 项**：HTTPS。验证局域网设备能开摄像头。
5. **第 8、9 项**：流重连加固。
6. **第 11 项**：建立前端部署流程。
7. **第 10、20 项**：DB / 上传性能。
8. **第 16、19 项**：性能解锁（nvpmodel + GPU EP）。
9. 其余 P2 / P3 按时间排。

---

## 📋 验收 checklist（上线前最后跑一遍）

- [ ] 后端启动 30s 内 `curl /api/health/` 返回 ready
- [ ] 第一次 OCR 调用 < 1s 返回（已预热）
- [ ] 第一次 YOLO 调用 < 1s 返回（已预热）
- [ ] 流状态接口 100 次轮询无 500
- [ ] 用其他设备通过 `https://<IP>:port` 能开摄像头（HTTPS 验证）
- [ ] 拔插海康/USB 摄像头，30s 内自动恢复显示
- [ ] 8 小时压测无内存泄漏（RSS 稳定）
- [ ] systemd 重启后所有服务自动起来，无需登录
- [ ] 日志单文件 < 10MB（rotation 工作正常）
- [ ] `nvpmodel -q` 显示 MAXN 模式
