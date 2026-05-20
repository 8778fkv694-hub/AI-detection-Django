# APK 端开发进度总结

> **更新时间**: 2026-05-20 12:25  
> **当前阶段**: 实机审计暂停点：APK 可启动、模型文件已下发，端侧模型推理未完成

> [!IMPORTANT]
> 本文档已按 2026-05-20 实机审计结果修正。之前总结中“摄像头前后置枚举完成”“模型管理正常/模型检测可用”等结论偏乐观，不能作为发布验收依据。

---

## 一、总体目标

为 **WYL 智能检测系统** 的 React+Django Web 项目打包为 **Android APK**，实现：

1. 手机和平板自适应 UI（区别于 Web 端）
2. 使用 Android 本机前置/后置摄像头（而非 RTSP 流）
3. 完整保留 Web 端核心功能

---

## 二、技术架构

| 层次 | 技术方案 | 说明 |
|------|---------|------|
| **前端框架** | React + TypeScript + Vite | 原 Web 项目基础 |
| **移动端壳** | Capacitor 7.x | Web→Native 桥接 |
| **移动端入口** | [AppMobile.tsx](file:///Users/yiliwen/%E5%BC%80%E5%8F%91/%E6%89%93%E5%8C%85%E5%B8%A6%E8%B5%B0/%E6%94%B9%E5%96%84%E5%91%A8%E9%A1%B9%E7%9B%AE/AI%E6%A3%80%E6%B5%8BReact+Django/src/AppMobile.tsx) | 独立于 Web 的 `App.tsx` |
| **自适应策略** | `window.innerWidth >= 1024` 判定平板 | 手机=底部Tab栏，平板=侧边栏 |
| **摄像头接入** | WebRTC `getUserMedia` + Capacitor Camera 权限 | 通过 AndroidManifest.xml 声明 |
| **打包产物** | Debug APK（约356MB） | 已嵌入 5 个 `.pt` 模型；路径: `android-app/android/app/build/outputs/apk/debug/` |
| **内置服务** | nodejs-mobile + Express | 可启动并提供模型文件状态；不能直接执行 `.pt` YOLO 推理 |
| **端侧推理计划** | ONNX Runtime Web / WASM（待实现） | 已确认项目依赖中存在 `onnxruntime-web`；`.pt -> .onnx` 转换尚未完成 |

### Capacitor 配置

```typescript
// capacitor.config.ts
appId: 'com.wyl.inspection.mobile'
appName: 'AI检测系统'
webDir: 'www/dist'
androidScheme: 'http'  // 允许混合内容
```

---

## 三、已注册页面路由（共 18 个）

| # | 路由 | 页面 | 分类 |
|---|------|------|------|
| 1 | `/` | 首页看板 (HomeScreen) | 主导航 |
| 2 | `/live-inspection` | 实时检测 (LiveInspectionScreen) | 主导航 |
| 3 | `/safety-equipment` | 安全防护 (SafetyEquipmentScreen) | 主导航 |
| 4 | `/standards` | 质检模版 (TemplatesScreen) | 主导航 |
| 5 | `/models` | 模型管理 (ModelManagementScreen) | 更多 |
| 6 | `/anomalies` | 异常看板 (AnomalyDashboardScreen) | 更多 |
| 7 | `/streams` | 流媒体管理 (StreamSettingsScreen) | 更多 |
| 8 | `/ocr` | OCR 融合模式 (OCRDetectionScreen) | 更多 |
| 9 | `/ocr-results` | OCR 检测结果 | 更多 |
| 10 | `/live-inspection-results` | 实时检测结果 | 更多 |
| 11 | `/cleanroom-results` | PPE 检测结果 | 更多 |
| 12 | `/batch` | 批量检测 | 更多 |
| 13 | `/batch-results` | 批量检测结果 | 更多 |
| 14 | `/kit-matching` | 套件匹配 | 更多 |
| 15 | `/kit-matching-results` | 套件匹配结果 | 更多 |
| 16 | `/wechat-qr-guided` | 二维码检出评估 | 更多 |
| 17 | `/ocr-guided` | OCR 检出能力评估 | 更多 |
| 18 | `/help` | 帮助指南 | 更多 |

---

## 四、UI 自适应设计

### 手机端（`< 1024px`）
- **顶部导航栏**：Logo + "移动终端" 标识 + 服务器状态 + WiFi 图标
- **底部 Tab 栏**：首页看板 / 实时检测 / 防护 / 模版 / 更多（5 项）
- **抽屉菜单**：从右侧滑出，包含所有二级功能入口 + 服务器/流设置
- **页面内容**：全宽填充，`pt-[4.5rem] pb-[5rem] px-4` 避让顶底栏

### 平板端（`>= 1024px`）
- **侧边栏导航**：与 Web 端类似的可折叠侧边栏
- **页面布局**：更宽的内容区域，`p-8` 内边距
- **更接近桌面 Web 的体验**

---

## 五、摄像头集成进度

### 审计后的实际状态

| 项目 | 状态 | 详情 |
|------|------|------|
| AndroidManifest 权限声明 | ✅ | `CAMERA` + `INTERNET` |
| `uses-feature` 可选声明 | ✅ | `android.hardware.camera required=false` |
| WebRTC getUserMedia 调用 | ✅ | 通过 [useLiveCamera.ts](file:///Users/yiliwen/%E5%BC%80%E5%8F%91/%E6%89%93%E5%8C%85%E5%B8%A6%E8%B5%B0/%E6%94%B9%E5%96%84%E5%91%A8%E9%A1%B9%E7%9B%AE/AI%E6%A3%80%E6%B5%8BReact+Django/src/hooks/liveInspection/useLiveCamera.ts) 实现 |
| 前置/后置摄像头枚举 | [/] 已修正，待完整复测 | 实机原先显示 4 个 `camera2` 逻辑设备，但用户设备实际只有前/后 2 个物理摄像头。已在 `src/lib/cameraUtils.ts` 折叠 Android WebView 的 front/back 逻辑设备为 `前置摄像头` / `后置摄像头`。 |
| 摄像头切换下拉框 | [/] 已修正，待完整复测 | 新版本使用 `mobile-facing-user` / `mobile-facing-environment` 合成 ID，通过 `facingMode` 启动，不再直接依赖不可用的 camera2 逻辑 ID。 |
| 视频流获取与播放 | [/] 部分通过 | 前置摄像头此前可获取流；后置摄像头画面和抓拍仍需人工确认。 |
| 页面切换清理摄像头 | ✅ 已补充 | `useLiveCamera.ts` 已增加卸载清理，避免旧流、MJPEG/HLS 播放器残留占用摄像头。 |
| 开启/关闭切换 | [/] 待回归 | 之前按钮联动可用；摄像头折叠修正后仍需在真机完整回归。 |

### 📸 摄像头工作截图

![摄像头成功打通 - 实时视频流显示](/Users/yiliwen/.gemini/antigravity/brain/3f8f30bb-b50c-49e1-b4a1-20b307d77524/camera_working.png)

> [!TIP]
> 摄像头已成功打通！上图可见前置摄像头的视频流正在实时显示，按钮已变为"关闭"状态。

### Logcat 关键日志验证

```
11:38:39 开启摄像头
11:38:40 [live_..._wbcnthvvi] 尝试启动摄像头: c19a6b4c...
11:38:44 [live_..._wbcnthvvi] 摄像头流获取成功
11:38:45 [live_..._wbcnthvvi] 视频尺寸: 720 x 1280
```

---

## 六、各页面验收状态

| 页面 | 功能状态 | UI 适配 | 备注 |
|------|---------|---------|------|
| 首页看板 | ✅ 正常 | ✅ | 卡片布局、统计数据显示正常 |
| 实时检测 | [/] 部分通过 | ✅ | 页面可进入，摄像头列表已修正；YOLO/AI 检测未跑通 |
| 安全防护 | [/] 页面可进，检测失败 | ✅ | PPE 抓拍检测调用 `/api/results/yolo-detect/`，当前移动端返回端侧推理运行时缺失 |
| 质检模版 | ✅ 正常 | ✅ | 模版列表展示正常 |
| 模型管理 | [/] 文件状态可展示 | ✅ | 能显示手机内模型文件存在；不代表模型推理可用 |
| 底部 Tab 切换 | ✅ 正常 | ✅ | 5 个标签页均可正常切换 |
| 抽屉菜单 | ✅ 正常 | ✅ | 滑出菜单及二级功能入口 |
| 摄像头权限 | ✅ 已授权 | — | Capacitor WebView 自动处理 |

---

## 六-A、模型与端侧推理审计结论

### 已实测完成

- APK 已重新构建并安装到真机，包体约 `356MB`。
- 构建脚本 `android-app/scripts/build-apk.sh` 已把以下模型同步到 APK assets，并在安装后复制到应用私有目录：
  - `ppe.pt`：约 84MB
  - `filter.pt`：约 115MB
  - `waterprifer.pt`：约 115MB
  - `yolo10x.pt`：约 61MB
  - `yolov8n.pt`：约 6.2MB
- 真机命令已确认模型实际在手机目录：
  - `/data/data/com.wyl.inspection.mobile/files/public/nodejs-project/models/`
- 内置 Node 服务已修复启动崩溃：原因为 `src/server/api.js` 使用了 nodejs-mobile 不支持的可选链 `?.` 语法，导致 SyntaxError 后 APK 退出；已改成旧版 Node 可解析写法。
- `http://127.0.0.1:5001/health` 已返回 `status: ok`。
- `http://127.0.0.1:5001/api/results/available-models/` 已返回 5 个模型，且 `exists: true`、`file_size` 为真实文件大小。

### 未完成且不能误判为完成

- 当前 APK **不能在手机本地执行 `.pt` YOLO 推理**。`.pt` 文件已存在，但 nodejs-mobile/Express 不能直接跑 Ultralytics/PyTorch。
- 当前 `/api/results/yolo-detect/` 在移动端明确返回 `501`：
  - `error_type: mobile_inference_runtime_missing`
  - 含义：模型文件存在，但移动端推理运行时尚未实现。
- 因此“模型检测没有工作”是当前准确结论。PPE 抓拍检测、实时 YOLO 画框、端到端 AI 检测仍未完成。

### 下一步技术路线

1. 优先把 `models/ppe.pt` 转换为 ONNX，先跑通 PPE 单模型闭环。
2. 使用项目已有依赖 `onnxruntime-web` 在 Android WebView WASM 环境中推理，避免新增 Android 原生插件的复杂度。
3. 推理前端需补齐：
   - 图片 resize/letterbox 到 640x640
   - ONNX 输入张量 `1x3x640x640`
   - YOLO 输出解析 `(1, 14, 8400)`
   - NMS、坐标还原、类别映射
4. 当前转换工作已暂停：尝试导出 `ppe.pt -> ppe.onnx` 时发现 Python 环境缺少 `onnx` 包，Ultralytics 触发自动安装；为暂停进度已终止该流程，尚未生成可用 ONNX 文件。

## 七、代码架构关键文件

```
android-app/
├── capacitor.config.ts          # Capacitor 配置
├── package.json                 # 依赖声明
├── android/                     # 原生 Android 项目
│   └── app/src/main/
│       ├── AndroidManifest.xml  # 权限声明
│       └── java/.../MainActivity.java
└── www/dist/                    # 前端构建产物

src/
├── AppMobile.tsx                # 移动端专用入口（独立于 App.tsx）
├── screens/
│   ├── LiveInspectionScreen.tsx  # 实时检测页面
│   └── ...                      # 共 18 个路由页面
├── hooks/
│   └── liveInspection/
│       ├── useLiveCamera.ts     # 摄像头管理核心 Hook
│       ├── useLiveYoloDetection.ts
│       └── useLiveKeyboardShortcuts.ts
├── components/
│   └── liveInspection/
│       ├── LiveCameraPanel.tsx   # 摄像头面板组件
│       └── ...
└── state/
    └── liveInspectionStore.ts   # Zustand 状态管理（持久化）
```

---

## 八、待完成 / 待优化项

### 🔴 高优先级

| 项 | 说明 | 建议方案 |
|----|------|---------|
| 抓拍功能实机验证 | 需在摄像头开启状态下测试抓拍是否生成正确图片 | 点击"抓拍"按钮验证 |
| AI 分析端到端验证 | 当前未通过；端侧 YOLO 推理缺失 | 先实现 ONNX Runtime Web 推理，或临时配置 Jetson/Django 后端 |
| 后置摄像头切换验证 | 已改为 `mobile-facing-environment`，但画面仍待确认 | 选择“后置摄像头”后验证画面、抓拍、释放 |
| 端侧模型推理 | `.pt` 文件已下发，但不能直接检测 | 转换 ONNX 并接入 `onnxruntime-web` |

### 🟡 中优先级

| 项 | 说明 |
|----|------|
| 页面切换时摄像头自动关闭 | 当前切换 Tab 时摄像头关闭（符合预期，但用户可能期望保持） |
| 离线模式下功能降级 | 当前离线检测应提示“端侧推理未实现”，不要重复无意义重试 |
| Release APK 签名打包 | 当前仅有 debug APK（约356MB），需配置签名密钥打正式包 |

### 🟢 低优先级

| 项 | 说明 |
|----|------|
| APK 体积优化 | 内嵌 5 个 `.pt` 后约356MB；若转 ONNX/量化/按需下载，可重新评估体积 |
| 启动画面自定义 | 当前使用默认 Capacitor splash，可替换品牌素材 |
| 应用图标替换 | 替换默认 Capacitor 图标为项目 Logo |
| 手机端横屏适配 | 当前未特殊处理横屏场景 |

---

## 九、构建 & 部署命令

```bash
# 推荐：使用项目脚本构建移动端 APK（会同步 Node 服务和模型文件）
cd android-app
bash scripts/build-apk.sh debug

# 4. 安装到设备/模拟器
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 5. 查看日志
adb logcat | grep "Capacitor/Console"
```

---

> [!IMPORTANT]
> **当前进度核心结论**：APK 打包、安装、启动、内置 Node 服务、模型文件下发已实测通过；摄像头 4 个逻辑设备的问题已做折叠修正但仍需完整回归；模型检测尚未工作，原因是移动端缺少可执行 ONNX/TFLite/PyTorch Mobile 等推理运行时。下一步应先完成 `ppe.pt -> ppe.onnx`，再接入 `onnxruntime-web` 做端侧检测闭环。
