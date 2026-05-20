# APK 端待完成事项清单

> **更新时间**: 2026-05-20 12:25  
> **状态图例**: `[ ]` 未开始 · `[/]` 进行中 · `[x]` 已完成

> [!IMPORTANT]
> 2026-05-20 实机审计结论：APK 可构建、安装、启动；模型文件已在手机应用私有目录中；但模型检测没有工作。当前 P0 阻塞项是端侧推理运行时/模型格式转换，而不是继续复制 `.pt` 文件。

---

## 🔴 P0 — 核心功能验证（阻塞发布）

### 摄像头完整流程
- [x] 前置摄像头视频流获取与显示
- [x] 摄像头开启/关闭按钮联动
- [/] 前置/后置摄像头设备枚举 — 原先 Android WebView 暴露 4 个 `camera2` 逻辑设备；已折叠为前置/后置 2 个业务设备，仍需完整回归
- [/] 后置摄像头实际切换并确认画面正常 — 已切到 `mobile-facing-environment` 合成 ID，仍需确认画面是否来自后置摄像头
- [ ] 抓拍功能验证 — 点击"抓拍"生成截图并出现在已抓拍列表
- [ ] 抓拍图片质量确认 — 分辨率、清晰度、色彩是否正常
- [/] 页面切换后返回实时检测页 — 已补充卸载时停止 MediaStream/MJPEG/HLS，需真机回归确认不残留旧流

### AI 检测端到端
- [ ] 配置 `API_SERVER_URL` 指向可用后端（Jetson 或本地 Django）作为临时远端检测方案
- [ ] 抓拍 → YOLO检测 → AI 分析 → 返回检测结果 — 全链路验证
- [ ] AI 分析进度弹窗正常显示与取消
- [ ] 检测结果在"实时检测结果"页面正确展示
- [ ] 移动端本地检测失败时给出明确提示，不要只显示泛化失败

### YOLO 实时检测
- [ ] 开启 YOLO 检测后，Canvas 画框是否正常叠加在视频上（当前未通过）
- [ ] 检测置信度滑块调节有效
- [ ] 检测目标选择（多选/单选/AND/OR模式）正常

### 端侧模型推理（新增 P0）
- [x] 模型文件打入 APK assets
- [x] 模型文件安装后进入手机私有目录：`files/public/nodejs-project/models/`
- [x] 内置 Node 服务模型接口返回真实 `exists/file_size/local_path`
- [x] 修复 nodejs-mobile 不支持 `?.` 导致的启动崩溃
- [ ] 安装/准备 Python 转换依赖 `onnx`
- [ ] 先转换 `models/ppe.pt` 为 `models/ppe.onnx`
- [ ] 将 `ppe.onnx` 和 ONNX Runtime WASM 资源打入 APK
- [ ] 在前端实现本地 ONNX 推理：
  - [ ] 图片 resize/letterbox 到 640x640
  - [ ] 构造 `1x3x640x640` 输入张量
  - [ ] 解析 YOLO 输出 `(1, 14, 8400)`
  - [ ] NMS、置信度过滤、坐标还原
  - [ ] 输出与现有 `BackendYoloDetection[]` 兼容
- [ ] PPE 抓拍检测走本地 ONNX 后返回真实检测框
- [ ] 评估 `filter.pt`、`waterprifer.pt`、`yolo10x.pt`、`yolov8n.pt` 是否继续转换 ONNX 或改为按需下载

---

## 🟡 P1 — 各页面功能验收

### 首页看板 `/`
- [x] 页面加载正常
- [ ] 统计卡片数据从后端正确拉取（需连接后端）
- [ ] 图表/趋势展示正常

### 实时检测 `/live-inspection`
- [x] 摄像头面板 UI 正常
- [x] 摄像头选择下拉框正常
- [ ] 全屏模式（F 键 / 全屏按钮）在移动端表现
- [ ] 文件上传（"上传"按钮）打开系统文件选择器
- [ ] 键盘快捷键在移动端是否需要禁用或替换为手势

### 安全防护 `/safety-equipment`
- [x] 页面加载正常
- [/] PPE 检测摄像头集成验证（与实时检测共享摄像头逻辑）
- [ ] PPE 检测结果展示 — 当前因端侧推理运行时缺失失败

### 质检模版 `/standards`
- [x] 页面加载正常
- [ ] 模版列表 CRUD 操作验证（需连接后端）
- [ ] 模版详情展开/折叠在小屏上的排版

### 模型管理 `/models`
- [x] 页面加载正常
- [x] 模型列表加载 — 内置 Node 接口已能返回手机内真实模型文件状态
- [ ] 模型切换功能 — 文件存在不等于推理可用，需等 ONNX/TFLite 端侧推理实现

### 异常看板 `/anomalies`
- [ ] 页面加载验证
- [ ] 异常数据展示（需连接后端）

### OCR 融合模式 `/ocr`
- [ ] 页面加载验证
- [ ] OCR 摄像头集成（useOCRCamera Hook）
- [ ] 实时 OCR 检测流程

### 批量检测 `/batch`
- [ ] 页面加载验证
- [ ] 批量图片上传
- [ ] 批量检测结果

### 流媒体管理 `/streams`
- [ ] 页面加载验证
- [ ] 流设置在移动端离线场景下的表现

### 各结果页面
- [ ] `/live-inspection-results` 实时检测结果列表
- [ ] `/cleanroom-results` PPE 检测结果列表
- [ ] `/ocr-results` OCR 检测结果列表
- [ ] `/batch-results` 批量检测结果列表
- [ ] `/kit-matching-results` 套件匹配结果

### 工具/评估页面
- [ ] `/wechat-qr-guided` 二维码检出评估
- [ ] `/ocr-guided` OCR 检出能力评估
- [ ] `/help` 帮助指南页面

---

## 🟡 P1 — UI / 交互优化

### 手机端适配
- [x] 底部 Tab 栏 5 项导航
- [x] 底部 Tab 文案修正 — `防护防护` 已改为 `防护`
- [x] 抽屉菜单（右滑出）
- [ ] 长页面滚动流畅性（特别是实时检测页，控件较多）
- [ ] 摄像头视频区域在不同手机分辨率下的高宽比
- [ ] 底部安全区域（`pb-safe`）在刘海屏/挖孔屏上的表现
- [ ] Toast 通知在底部 Tab 栏上方正确显示，不遮挡
- [ ] 模态弹窗（AI 分析进度等）在小屏上不溢出

### 平板端适配
- [x] 侧边栏导航
- [ ] 侧边栏折叠/展开在横屏下的表现
- [ ] 实时检测页多列布局（左摄像头 + 右结果）在平板上的利用率
- [ ] 横屏模式下的整体布局确认

### 通用交互
- [ ] 下拉刷新支持（如有需要）
- [ ] 页面加载骨架屏/Loading 状态
- [ ] 网络断开时的提示与优雅降级
- [ ] 返回键行为（Android 物理返回键 / 手势返回）

---

## 🟢 P2 — 打包发布准备

### APK 优化
- [ ] 启用 ProGuard / R8 代码混淆压缩（当前模型全量内嵌后约356MB）
- [ ] 前端资源分析 — 检查是否打入了不必要的资源（backup 文件等）
- [ ] 图片资源压缩
- [ ] 重新制定体积目标 — 若全量模型内嵌，`<30MB` 不现实；建议拆分轻量 APK + 模型按需下载，或只内嵌首个 ONNX 模型

### 签名与发布
- [ ] 生成 Release 签名密钥（keystore）
- [ ] 配置 `build.gradle` 签名信息
- [ ] 构建 Release APK（`./gradlew assembleRelease`）
- [ ] 在真实设备上安装 Release APK 验证

### 品牌定制
- [ ] 替换应用图标 — `mipmap/ic_launcher` 和 `ic_launcher_round`
- [ ] 替换启动画面 — Capacitor SplashScreen 素材
- [ ] 应用名称确认（当前: "AI检测系统"）
- [ ] 状态栏颜色与主题色统一

### 权限优化
- [ ] 运行时权限请求 UI（首次打开摄像头时的友好提示）
- [ ] 权限被拒绝后的引导（跳转系统设置）
- [ ] 评估是否需要额外权限（存储、网络状态等）

---

## 🟢 P2 — 进阶功能

- [/] 离线检测能力 — 模型文件已下发，本地推理未完成；下一步接 ONNX Runtime Web
- [ ] 检测结果本地缓存 — 断网后仍可查看历史
- [ ] 推送通知 — 异常检测结果即时提醒
- [ ] 应用内更新 — 检查新版本并下载安装
- [ ] 多语言支持（日语等）
- [ ] 深色/浅色主题切换

---

## 参考命令

```bash
# 快速构建并安装（推荐脚本，会同步内置 Node 服务和模型）
cd android-app
bash scripts/build-apk.sh debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# 实时查看日志
adb logcat | grep "Capacitor/Console"

# 截图
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png .

# 验证手机内模型文件
adb shell run-as com.wyl.inspection.mobile ls -lh files/public/nodejs-project/models

# 验证内置 Node 服务
adb forward tcp:5001 tcp:5001
curl -sS http://127.0.0.1:5001/health
curl -sS http://127.0.0.1:5001/api/results/available-models/
```
