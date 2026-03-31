# jeston-step2 多页面隔离与工装追踪完整交接文档

## 1. 交接目标

本次工作围绕两个主目标展开：

1. 解决同功能不同页面之间的状态、模型、工序绑定串扰问题
2. 在不破坏原有拼接图、批量检验、OCR/条码规则主流程的前提下，增加“工装二维码追踪链”

当前分支：

```text
jeston-step2
```

## 2. 已完成的核心能力

### 2.1 多页面隔离

已实现：

- OCR 页面持久化配置按页面作用域隔离，不再默认共享一个固定 `localStorage` key
- 支持按以下优先级分片：
  - `page_instance_id`
  - `stage_code`
  - `windowId`
  - 当前标签页 `sessionStorage` 兜底 scope
- 同功能不同页面可绑定不同工序
- 页面级 OCR 引擎绑定已支持
- YOLO 实时检测主链路已显式传 `model_id`
- OCR 引擎改为请求级解析，不再依赖共享 `current_model`

相关文件：

- [src/state/ocrDetectionStore.ts](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/state/ocrDetectionStore.ts)
- [src/hooks/ocr/useRealtimeDetectionLoop.ts](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/hooks/ocr/useRealtimeDetectionLoop.ts)
- [src/screens/OCRDetectionScreen.tsx](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/screens/OCRDetectionScreen.tsx)
- [backend/inspection/ocr_service.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/ocr_service.py)

### 2.2 工装二维码追踪链

已实现：

- `fixture_qr` 作为统一追踪字段
- 支持工序、页面、相机、工装、业务码字段落库
- 支持追踪结论、规则说明、关联工序信息落库
- 新增最小追踪规则服务

相关文件：

- [backend/inspection/models.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/models.py)
- [backend/inspection/migrations/0027_add_trace_fields_to_inspectionresult.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/migrations/0027_add_trace_fields_to_inspectionresult.py)
- [backend/inspection/product_trace_service.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/product_trace_service.py)
- [backend/inspection/serializers.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/serializers.py)
- [src/state/appStore.ts](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/state/appStore.ts)
- [src/types/index.ts](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/types/index.ts)
- [src/hooks/ocr/useDetectionSave.ts](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/hooks/ocr/useDetectionSave.ts)

### 2.3 工装二维码输入策略

当前策略已经改成：

- 原有拼接图、批量检验、OCR/条码规则主流程不变
- 整图视觉抓拍只作为“工装二维码输入链”的第一优先方式
- 视觉失败时不打断原有主流程
- 视觉失败后进入“待补录工装码”
- 支持切换：
  - `vision`
  - `scanner`
  - `nfc`
  - `manual`
- 所有输入方式最终统一写入：
  - `fixture_qr`
  - `fixture_qr_source`

### 2.4 整图多二维码场景

已实现：

- 从整图二维码结果中筛工装二维码
- 支持按以下规则筛工装码：
  - `fixture_qr_prefixes`
  - `fixture_qr_pattern`
- 若无法唯一筛出工装码：
  - 视觉模式下返回 `存疑`
  - 提示改用扫码、NFC 或人工补录
- 已修复一个关键风险：
  - 未配置工装规则时，不再盲目把整图里唯一二维码当工装码

### 2.5 页面可视化与结果可视化

已实现：

- OCR 检测页增加“页面绑定信息”面板
- OCR 检测页增加“工装二维码补录”区
- OCR 检测页右侧结果区增加“当前追踪上下文”
- OCR 结果页增加追踪信息展示

相关文件：

- [src/screens/OCRDetectionScreen.tsx](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/screens/OCRDetectionScreen.tsx)
- [src/components/ocr/OCRResultsSection.tsx](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/components/ocr/OCRResultsSection.tsx)
- [src/screens/OCRInspectionResultsScreen.tsx](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/src/screens/OCRInspectionResultsScreen.tsx)

## 3. 数据库与迁移状态

已执行迁移：

```text
inspection.0027_add_trace_fields_to_inspectionresult
```

验证命令：

```bash
backend/venv/bin/python backend/manage.py showmigrations inspection | tail -n 5
```

结果：

```text
[X] 0027_add_trace_fields_to_inspectionresult
```

## 4. 自动化测试与验证结果

### 4.1 通过的检查

已通过：

- `npm run build`
- `backend/venv/bin/python backend/manage.py check`
- `backend/venv/bin/python backend/manage.py migrate`
- `backend/venv/bin/python -m py_compile ...` 针对本次后端关键修改文件

### 4.2 已执行的真实功能验证

已通过的真实链路验证：

1. serializer 保存链路
2. `/api/results/` 真实接口保存
3. `multipart/form-data` 保存
4. `PATCH /api/results/<id>/` 更新链路
5. 工装码视觉待补录逻辑
6. 工装码规则筛选
7. 同工装跨工序匹配通过
8. 同工装跨工序冲突复检
9. 同工装并发写入
10. 不同工装混合并发写入

### 4.3 关键接口验证结果

已验证场景与结果：

- 视觉模式、无工装规则
  - `trace_conclusion = 存疑`
  - 等待补录工装码
- 视觉模式、配置工装前缀规则、整图多二维码
  - 能自动筛出工装码
- 视觉模式、多候选工装码冲突
  - `trace_conclusion = 存疑`
  - 提示改用扫码/NFC/人工补录
- 非视觉输入失败
  - `trace_conclusion = 需复检`
- 同工装、跨工序、业务码一致
  - `trace_conclusion = 合格`
- 同工装、跨工序、业务码冲突
  - `trace_conclusion = 需复检`
- `PATCH` 更新结果后补录工装码
  - 接口已通
  - 追踪规则会重算

### 4.4 并发测试结果

#### 修复前

- `/api/results/` 写请求被全路径全局锁限制
- 大量返回 `429 Too Many Requests`
- 不同工装之间也会互相阻塞

#### 修复后

已修：

- 锁粒度从按路径改为优先按 `fixture_qr`
- 增加短暂等待窗口
- 同工装后续写入会回填重算已有结果

修复后结果：

- 不同工装混合并发：
  - 不再出现大面积 `429`
  - 全部 `201`
- 同工装并发：
  - 请求返回可能仍有早到请求看到中间态
  - 但数据库最终状态会收敛一致

当前结论：

- 已达到数据库最终一致
- 尚未达到“每个并发响应体都立刻是最终态”

## 5. 已发现并修复的问题

### 5.1 视觉误绑定工装码

问题：

- 未配置工装规则时，整图里唯一二维码会被误当成工装码

修复：

- 现在未配置工装规则时，不自动绑定视觉工装码
- 返回待补录状态

### 5.2 sqlite 连接状态判断错误

问题：

- 中间件访问 `connection.connection.closed`
- sqlite 连接对象没有该属性

修复：

- 改成通过 Django `is_usable()` 检查

### 5.3 `/api/results/` 全局锁过粗

问题：

- 原先整接口全路径一把锁
- 并发写请求大量返回 `429`

修复：

- 改为优先按 `fixture_qr` 细粒度锁

### 5.4 同工装并发后数据库状态不一致

问题：

- 后写入结果不会回填前面的记录

修复：

- 新结果写入后会刷新同工装已有记录的追踪状态

### 5.5 `PATCH /api/results/<id>/` 404

问题：

- `get_queryset()` 对非 list 场景也做了截断切片

修复：

- 非 `list` action 不再切片
- serializer `update()` 也加入追踪重算

## 6. 未通过或未完全通过的检查

### 6.1 `manage.py test`

未通过，原因不是本次改动引入：

- `test_local_video.py`
  - 依赖本地视频 `IMG_2043.MOV`
  - 当前环境无法打开
- `test_video_server.py`
  - 依赖 `flask`
  - 当前环境未安装

### 6.2 `npx tsc --noEmit`

未通过，仓库存在大量历史类型问题，包括但不限于：

- 未使用变量
- 历史屏幕 / 备份页面类型不一致
- 第三方类型缺失
- 旧接口定义与现状不一致

结论：

- 当前仓库不能被视为 TS 全绿项目
- 这些问题不是这次改动单独造成的

## 7. 仍然存在的已知问题 / 风险

### 7.1 并发响应体仍可能是中间态

现象：

- 同工装并发写入时
- 早到响应可能看到 `存疑`
- 随后数据库会被回填成 `合格`

影响：

- 最终一致性已具备
- 即时响应一致性还不够强

后续方向：

- 如果需要，可以在写入后对当前工装做一次最终刷新再返回
- 或者做异步刷新 + 前端轮询状态

### 7.2 二维码服务仍为共享单例

相关：

- [backend/inspection/wechat_qr_service.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/wechat_qr_service.py)
- [backend/inspection/barcode_service.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/barcode_service.py)

问题：

- 不是页面级不同二维码模型架构
- 仍属于共享资源复用

### 7.3 仓库测试基线不干净

问题：

- `manage.py test` 本身跑不干净
- `tsc --noEmit` 本身也不干净

影响：

- 后续模型接手时不要误以为“当前分支新增逻辑导致整个仓库测试全红”

### 7.4 中间件整体设计仍偏重

相关文件：

- [backend/inspection/middleware.py](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/backend/inspection/middleware.py)

问题：

- 还有自动同步、缓存清理、连接重建等额外副作用
- 高并发环境下仍建议继续审视

## 8. 已生成的设计/审计/联调文档

### 已存在文档

- [工装二维码多工序追踪系统设计说明_v1.md](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/docs/工装二维码多工序追踪系统设计说明_v1.md)
- [多页面多工序隔离能力审计报告_v1.md](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/docs/多页面多工序隔离能力审计报告_v1.md)
- [多页面工序隔离与工装码补录联调清单_v1.md](/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/docs/多页面工序隔离与工装码补录联调清单_v1.md)

## 9. 已完成提交

本次相关提交：

```text
6ec6992 docs: add trace system design and isolation audit
cdf83e7 fix: preserve live preview video node in stream settings
834a4aa feat: isolate OCR pages and add fixture trace workflow
f9488d3 fix: require fixture rules for automatic vision binding
1f7dae1 fix: narrow result locks and refresh fixture trace state
6242125 fix: support result detail updates for trace recalculation
```

## 10. 当前工作区状态

交接时状态：

- 分支：`jeston-step2`
- 工作区：干净

## 11. 建议下一个模型优先处理的事项

优先级建议如下：

### P0

1. 处理并发响应体中间态问题
2. 做真实浏览器双页面联调
3. 做真实相机链路联调

### P1

1. 压 OCR 并发
2. 压二维码接口并发
3. 压 YOLO 接口并发
4. 检查前端对 429/失败返回的提示与恢复行为

### P2

1. 梳理并修复 `manage.py test` 依赖问题
2. 逐步清理仓库 `tsc --noEmit` 历史错误
3. 继续收缩中间件副作用

## 12. 推荐继续接手的执行顺序

建议下一个模型按这个顺序继续：

1. 先读本文件
2. 再读：
   - 设计说明
   - 隔离审计报告
   - 联调清单
3. 先做真实双页面联调
4. 再决定是否优先修“并发响应体中间态”
5. 最后再做 OCR / 二维码 / YOLO 的压力测试深化

## 13. 对下一个模型的注意事项

- 不要误删现有中间件逻辑，先理解再改
- 不要把整图抓拍工装码逻辑改成替代原有拼接图和批量检验主流程
- 视觉工装码链条只是附加输入链，不是主检验链
- 无工装规则时，不允许自动把整图二维码盲绑成工装码
- 当前数据库最终一致性已经有了，继续修时重点看“响应即时一致性”
