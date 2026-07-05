# 历史启动脚本归档（W6 卫生，2026-07-05）

本目录保留历史 `start_*.sh` 变体，便于追溯，但不再作为日常入口使用。

## 当前正式入口

| 场景 | 入口 | 说明 |
|---|---|---|
| Mac 开发机（双击） | `/Users/yiliwen/项目快速启动/4启动AI检测项目.command` | 用户指定的本机入口；进入当前仓库后调用 `./启动AI检测项目.command`，保持终端窗口打开 |
| Mac 开发机（命令行） | `./start_mac.sh full` | 启动 Django `8000`、Node API `3001`、RPA `3002`、Vite `3303`，并保持前台运行 |
| Mac 仅后端/兼容旧文档 | `./start_mac.sh django` 或 `./start_django_only.sh` | `start_django_only.sh` 现在只是兼容包装 |
| Mac 完整项目/兼容旧文档 | `./start_mac.sh full` 或 `./start_full_project.sh` | `start_full_project.sh` 现在只是兼容包装 |
| Mac 本地生产预览 | `./start_mac.sh production` | 构建后用 `serve_spa.py` 托管 `dist/`，端口 `3005` |
| 本地模型辅助 | `./start_mac.sh ollama` / `ollama-proxy` / `moondream` | 取代旧 `start_ollama*.sh` / `start_moondream.sh` |
| Jetson Orin Nano | `bash deploy/start_jetson.sh` 或 `bash deploy/install_systemd_jetson.sh` | 生产部署路径，底层使用 `serve_production.py` + `serve_spa.py` |
| Android 平板/手机 | `cd android-app && bash scripts/build-apk.sh debug` | Capacitor APK 构建路径 |

## 归档原因

历史上根目录与 `scripts/` 下同时存在多套 `start_*.sh`：

- HTTP/HTTPS/局域网/生产预览/本地模型等场景各复制一份；
- 根目录和 `scripts/` 下还有同名副本，内容并不总是一致；
- 部分脚本含旧路径、旧端口或空文件；
- Jetson 与 Android 已有更明确的专用入口，不应继续由根目录 `start_*.sh` 变体承担。

本轮最终收敛为：

- 根目录：`start_mac.sh` + 两个兼容包装（`start_full_project.sh`、`start_django_only.sh`）；
- Jetson：`deploy/start_jetson.sh` / `deploy/install_systemd_jetson.sh`；
- Android：`android-app/scripts/build-apk.sh`；
- 历史脚本：全部移动到本目录，按来源加前缀：
  - `root-start_*.sh`：来自根目录、曾被人工保留的旧变体；
  - `scripts-copy-start_*.sh`：来自 `scripts/` 的同名副本；
  - 无前缀旧文件：W6.4 第一轮已归档的早期无引用变体。

如未来确认某个历史脚本仍有业务价值，不要直接移回根目录；应把它的有效逻辑合并进 `start_mac.sh` 的一个 mode。
