# FQC 工装识别-绑定-终检-条码校验 全链路审计与实现报告

> 审计日期：2026-03-19
> 涉及分支：jeston-step2

---

## 一、整体数据流

```
用户扫描/抓拍
    ↓
前端 OCRDetectionScreen
  traceContext: fixtureQr + fixtureQrPrefixes + fixtureQrPattern
    ↓
后端 serializer.create()
    ↓
evaluate_trace_for_result()
  ├─ _resolve_fixture_qr_from_candidates()   → 工装码识别
  ├─ _resolve_business_code()                → 业务码提取
  ├─ _collect_latest_stages()                → 同工装多工序聚合
  └─ 跨工序 normalized business_code 比对    → trace_conclusion
    ↓
refresh_fixture_trace_results()              → 级联刷新同工装所有历史记录
    ↓
generate_fqc_record()                        → 若当前工序 is_fqc=True，生成终检记录
    ↓
前端 handleSaveComplete()
  → toast 通知 + 报警灯 + 自动绑定工装码
  → OCRResultsSection 加载 FQC 记录卡片
```

---

## 二、关键模块说明

### 2.1 工装码识别 (`_resolve_fixture_qr_from_candidates`)

**文件**：`backend/inspection/product_trace_service.py` lines 62-118

| 场景 | 结果 | 状态 |
|------|------|------|
| 用户已手动输入 | 直接使用 | `source=manual/scanner/nfc` |
| 1 个候选匹配 prefix/regex | 自动绑定 | `source=vision, status=success` |
| >1 个候选匹配 | 不绑定 | `status=failed`, 返回 candidateCount |
| 0 个匹配 | 不绑定 | `status=pending` |
| 未配置 prefix/regex | 不绑定 | `status=pending`（避免盲选） |

### 2.2 业务码提取 (`_resolve_business_code`)

**文件**：`backend/inspection/product_trace_service.py` lines 141-162

级联优先级：
1. 手动填入的 business_code
2. barcode_result 中非 fixture_qr 的第一个条码
3. OCR detailed_results 中的短文本（≤50 字符）
4. OCR full_text（≤50 字符）
5. 空值

### 2.3 跨工序条码校验

**文件**：`backend/inspection/product_trace_service.py` lines 264-369

- 按 fixture_qr 查找所有最新工序结果
- 归一化 business_code（`_normalize_code`：去空格、大写、仅字母数字）
- 一致 → `合格`，不一致 → `需复检`，数据不全 → `存疑`
- 保存后级联刷新同工装所有历史记录（`refresh_fixture_trace_results`）

### 2.4 FQC 终检生成 (`generate_fqc_record`)

**文件**：`backend/inspection/fqc_service.py` lines 251-319

**触发条件**：当前保存的工序在 ProductStage 中标记为 `is_fqc=True`

**聚合流程**：
1. `_collect_fixture_inspections` — 收集同 fixture_qr 下所有配方工序的最新结果
2. `_build_stage_summary` — 轻量 JSON 引用（stageCode, quality, score, businessCode 等）
3. `_build_trace_flow` — 完整时间线
4. `_determine_overall_result` — 任一不合格→不合格，全部合格→合格，其余→存疑
5. `_run_validation` — 执行 ProductRecipe 上配置的校验规则
6. `update_or_create` FQCRecord（fixture_qr + product_recipe 唯一键，atomic 事务保护）

### 2.5 校验规则引擎

**文件**：`backend/inspection/fqc_service.py` lines 150-248

支持两种规则类型：

#### occurrence_count（出现次数校验）
- 从 stage_summary 中按 source_field + extract_mode 提取值
- 统计出现次数
- 用 operator（eq/gte/lte）与 expected_count 比较
- 示例：`businessCode 后缀 4 位出现次数 = 3`

#### cross_stage_match（跨工序一致性校验）
- 从指定 stage_codes（或全部）中提取值
- 验证所有值一致
- 排除空值/纯空白（防误通过）
- 示例：`工序 A/B/C 的 businessCode 必须相同`

**规则配置存储**：`ProductRecipe.fqc_validation_rules`（JSONField）

```json
[
  {
    "name": "业务码一致性",
    "type": "cross_stage_match",
    "source_field": "businessCode",
    "extract_mode": "full",
    "extract_length": 0,
    "stage_codes": ["ST01", "ST02", "ST03"]
  },
  {
    "name": "业务码出现3次",
    "type": "occurrence_count",
    "source_field": "businessCode",
    "extract_mode": "suffix",
    "extract_length": 4,
    "expected_count": 3,
    "operator": "eq"
  }
]
```

---

## 三、数据模型

### FQCRecord (`backend/inspection/models.py` lines 790-839)

| 字段 | 类型 | 说明 |
|------|------|------|
| `fixture_qr` | CharField(255) | 工装码 |
| `product_recipe` | FK(ProductRecipe) | 产品配方 |
| `product_recipe_name` | CharField | 配方名称快照 |
| `fqc_stage_code` | CharField | 触发 FQC 的工序代码 |
| `trigger_result` | FK(InspectionResult) | 触发的检验记录 |
| `overall_result` | CharField | 合格/不合格/存疑 |
| `result_reason` | TextField | 判定原因 |
| `stage_summary` | JSONField(list) | 各工序摘要 |
| `related_inspections` | M2M(InspectionResult) | 关联检验记录 |
| `trace_flow` | JSONField(list) | 流转时间线 |
| `trace_conclusion` | CharField | 追踪结论 |
| `validation_passed` | BooleanField(null=True) | 校验通过（null=未启用） |
| `validation_details` | JSONField(list) | 每条规则执行结果 |

**索引**：`fixture_qr`、`(fixture_qr, product_recipe)`

### ProductRecipe 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `fqc_validation_enabled` | BooleanField(default=False) | 是否启用校验 |
| `fqc_validation_rules` | JSONField(default=list) | 校验规则列表 |

### ProductStage 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `is_fqc` | BooleanField(default=False) | 标记为终检工序 |

---

## 四、前端关键文件

| 文件 | 用途 |
|------|------|
| `src/lib/fqcApi.ts` | FQCRecord 类型定义 + API 客户端 |
| `src/lib/productRecipeApi.ts` | FQCValidationRule 类型 + ProductRecipe API |
| `src/components/ocr/FQCResultCard.tsx` | FQC 结果卡片（自动展开失败项、标题栏显示通过率） |
| `src/components/ocr/OCRResultsSection.tsx` | 检测结果面板中的 FQC 记录加载与展示 |
| `src/screens/TemplatesScreen.tsx` | 产品配方编辑 — FQC 规则编辑器 UI |
| `src/screens/OCRInspectionResultsScreen.tsx` | 检测结果页 — FQC 终检看板 |
| `src/screens/OCRDetectionScreen.tsx` | 检测主屏 — 保存回调、toast 通知、报警灯、自动绑定 |

---

## 五、API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/fqc-records/` | 列出 FQC 记录 |
| GET | `/api/fqc-records/?fixture_qr=XXX` | 按工装码筛选 |
| GET | `/api/fqc-records/?product_recipe=UUID` | 按配方筛选 |
| GET | `/api/fqc-records/{id}/` | 单条详情 |
| GET/POST/PATCH/DELETE | `/api/product-recipes/` | 产品配方 CRUD（含 fqc_validation_rules） |
| POST | `/api/product-recipes/{id}/assign-stages/` | 分配工序（含 is_fqc） |

FQCRecord API 为只读（记录由后端自动生成）。

---

## 六、已修复的问题

### 后端

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| 1 | FQC 生成异常被静默 `pass` | `serializers.py` | 改用 `logger.exception` |
| 2 | FQC `update_or_create` 无事务 | `fqc_service.py` | 包裹 `transaction.atomic()` |
| 3 | 业务码 OCR 全文回退无长度限制 | `product_trace_service.py` | 加 50 字符上限，优先取 detailed_results |
| 4 | `refresh_fixture_trace_results` 无事务 | `product_trace_service.py` | 包裹 `transaction.atomic()` |
| 5 | `cross_stage_match` 空值/纯空白误通过 | `fqc_service.py` | 加 `val.strip()` 过滤 |
| 6 | `occurrence_count` 空白值未过滤 | `fqc_service.py` | 同上 |
| 7 | `_extract_value` length 边界异常 | `fqc_service.py` | 负数/超长回退完整值 |
| 8 | `StageRecipeTemplate` 未使用 import | `fqc_service.py` | 移除 |

### 前端

| # | 问题 | 文件 | 修复方式 |
|---|------|------|----------|
| 9 | 规则配置 UI 完全缺失 | `TemplatesScreen.tsx` | 新增 FQCRuleEditorRow 组件 + 规则编辑 section |
| 10 | FQC 校验失败不够突出 | `FQCResultCard.tsx` | 不合格/校验失败自动展开 + 标题栏通过率标签 |
| 11 | 无 FQC 历史看板 | `OCRInspectionResultsScreen.tsx` | 新增 FQCDashboardSection（搜索/筛选/统计） |
| 12 | FQC 看板加载逻辑缺陷 | `OCRInspectionResultsScreen.tsx` | `records.length===0` → `loaded` flag |

---

## 七、待后续迭代事项

| 优先级 | 事项 | 说明 |
|--------|------|------|
| P1 | 候选码选择 UI | 多个候选时展示列表让操作员点选，而不是只显示数量 |
| P1 | 前置工序状态预览 | 非 FQC 工序也显示同工装已完成工序的简要状态 |
| P2 | 补录入口优化 | 扫码枪自动聚焦、浮动快捷按钮 |
| P2 | 回退建议可操作化 | "建议扫码"旁放切换按钮 |
| P2 | FQC 看板导出 | 批量导出 FQC 记录 CSV |
| P2 | 规则复制按钮 | 操作员配多条相似规则时减少重复配置 |
| P2 | 规则预览/测试 | 输入 fixture_qr 用历史数据试跑规则，配置页面直接显示结果 |
| P2 | 保存时规则格式校验 | 前端校验规则名称非空、source_field 必选等 |
| P3 | 后端规则 JSON Schema | model `clean()` 或 serializer 中验证规则格式 |
| P3 | `refresh` 性能优化 | 高频工装码增量评估或分页 |
| P3 | 多 FQC 工序支持 | 中间检+终检场景，`_find_fqc_product_recipe` 返回所有匹配 |

---

## 八、测试要点

### 规则配置测试

1. 新建产品配方 → 添加 3 个工序 → 标记最后一个为 FQC → 出现"FQC 规则校验配置" section
2. 启用校验 → 添加 `occurrence_count` 规则 → 保存 → 再次编辑确认规则被加载
3. 添加 `cross_stage_match` 规则 → 点选参与比对的工序 → 保存
4. 移除所有 FQC 标记 → FQC 配置 section 自动隐藏
5. 产品卡片列表显示 "FQC校验: N 条规则" 标签

### FQC 终检测试

1. 按工序顺序分别保存检验结果（绑定同一 fixture_qr）
2. 最后一个 FQC 工序保存时 → 自动生成 FQCRecord
3. 前端 toast 显示 FQC 结果 → 报警灯响应
4. OCRResultsSection 显示 FQC 卡片 → 不合格时自动展开

### FQC 看板测试

1. 打开检测结果页 → 底部 FQC 看板折叠按钮
2. 展开 → 自动加载全部 FQC 记录 + 统计卡片
3. 输入工装码搜索 → 结果筛选
4. 按结果状态过滤（全部/合格/不合格/存疑）

### 边界情况

- 并发保存同一 fixture_qr 的 FQC 工序 → 事务保护不冲突
- 空 business_code 的工序 → 跨工序校验不误通过
- OCR 全文超长 → 不被当作 business_code
- 截取长度超过字段长度 → 回退完整值
