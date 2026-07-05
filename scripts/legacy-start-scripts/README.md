# 历史启动脚本归档（W6 卫生，2026-07-05）

根目录曾有 25 个 `start_*.sh` 脚本，全部堆在项目根目录，造成严重的仓库卫生问题。
排查后确认它们几乎都是同一天（2026-03-31，Initial Django project snapshot）批量导入的历史试验版本，
此后只有 `start_full_project.sh` 在 2026-05-13 被单独维护过。

## 判定依据

1. **官方入口**：`docs/项目启动说明.md` 明确推荐 `start_full_project.sh`（完整项目）和
   `start_django_only.sh`（仅 Django 后端），两者留在根目录。
2. **仍有功能文档背书**：以下脚本虽非主入口，但对应功能模块的专门说明文档仍引用它们，
   **未归档，留在根目录**：
   - `start_complete.sh`、`start_https_production.sh` — `上线前改善清单_Jetson.md`
   - `start_moondream.sh` — `docs/MOONDREAM_使用说明.md`
   - `start_ollama.sh`、`start_ollama_with_proxy.sh` — `docs/本地模型使用说明.md` 等
   - `start_production.sh` — `docs/生产环境配置说明.md`
   - `start_simple.sh` — `docs/Django数据管理指南.md`、`上线前改善清单_Jetson.md`
   - `start_rpa.sh` — 无文档引用，但 RPA 服务（`rpa-server.js`）功能仍在被前端实际调用
     （见 `src/lib/rpa.ts`），保留。
3. **本目录下的 13 个脚本**：全仓库文档搜索（`docs/*.md`、根目录 `*.md`）**无任何引用**，
   且是 HTTP/HTTPS/局域网/Conda/生产环境等主题的多个平行变体（一个需求改一次就复制一份、
   从未回头清理），判定为已废弃的历史试验版本。**内容原样保留、仅移动位置**（`git mv`，
   历史可追溯），未删除，如发现仍在使用请告知。

## 未完成事项（需要人工确认业务背景，AI 未擅自处理）

根目录剩余 10 个脚本（3 个核心 + 7 个功能脚本）之间仍有大量重复内容（每个都手写了
"检查 Python3 是否安装"之类的样板代码），行动文档里"归并为 3–4 个带参数入口"的目标
**尚未完成**。需要仓库所有者确认：
- 当前生产环境实际部署用的是哪一个（`start_production*` 系列有 3 个变体，只有
  `start_production.sh` 被文档引用，另外两个已归档到本目录）；
- HTTPS/HTTP、局域网访问等场景是否还有实际需求，还是已经被 Docker/Nginx 方案取代。

确认后才能安全地做真正的整合（不确认就合并，容易在某个脚本的证书路径/端口号等
细节上引入无法立即被发现的部署故障）。
