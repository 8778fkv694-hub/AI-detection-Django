/**
 * 检测阈值/配置默认值 — 单一真源（行动文档 W3）
 *
 * 背景：2026-05-20 的回退改造中，"离线端阈值自动迁移"补丁被迫散落到
 * liveInspectionStore / ocrDetectionStore / ppeDetectionStore 多处，
 * 根源是各 store 各自硬编码默认值。此文件之后：
 *
 *  纪律：任何检测相关的默认阈值/默认模型 ID，只允许定义在这里；
 *  store 一律 import 引用，禁止再写数字字面量。
 *  未来若需要"离线端(APK)整体降阈值"之类的策略，也只改这一个文件。
 */

/** 实时/抓拍检测的默认置信度（live 与 OCR 页共用） */
export const DETECTION_CONFIDENCE_DEFAULT = 0.8;

/** OCR 关键词分析的最低置信度默认值 */
export const OCR_MIN_CONFIDENCE_DEFAULT = 0.5;

/** PPE 页：抓拍触发阈值默认值 */
export const PPE_CAPTURE_THRESHOLD_DEFAULT = 0.5;

/** PPE 页：判定合格阈值默认值 */
export const PPE_INSPECTION_THRESHOLD_DEFAULT = 0.8;

/** PPE 逐类别置信度阈值 */
export interface PPEThresholds {
  cleanroom_cap: number;
  mask: number;
  person: number;
  helmet: number;
  'face-mask': number;
  'safety-helmet': number;
  'hard-hat': number;
  gloves: number;
  'rubber-gloves': number;
  'work-gloves': number;
  'safety-vest': number;
  'protective-clothing': number;
  'safety-goggles': number;
  'ear-protection': number;
  filter: number;
  name_MCF: number;
  nsplogo: number;
  qrcode: number;
  service_label: number;
  nameplate_label: number;
  security_label: number;
  name_MNF: number;
  name_CPP: number;
  name_MPF: number;
  name_NF: number;
  name_PCC: number;
  name_PCF: number;
  name_ZPC: number;
  'filter package': number;
  anti_counterfeit_label: number;
  water_efficiency_label: number;
  barcode_label: number;
  fotile_logo: number;
  water_outlet: number;
  Prompt_label: number;
  yellow_point: number;
  glod_logo: number;
}

/** PPE 逐类别默认阈值（从 ppeDetectionStore 迁入，值未变） */
export const defaultPPEThresholds: PPEThresholds = {
  cleanroom_cap: 0.8,
  mask: 0.8,
  person: 0.8,
  helmet: 0.3,
  'face-mask': 0.3,
  'safety-helmet': 0.3,
  'hard-hat': 0.3,
  gloves: 0.3,
  'rubber-gloves': 0.3,
  'work-gloves': 0.3,
  'safety-vest': 0.3,
  'protective-clothing': 0.3,
  'safety-goggles': 0.3,
  'ear-protection': 0.3,
  filter: 0.6,
  name_MCF: 0.6,
  nsplogo: 0.6,
  qrcode: 0.6,
  service_label: 0.6,
  nameplate_label: 0.6,
  security_label: 0.6,
  name_MNF: 0.6,
  name_CPP: 0.6,
  name_MPF: 0.6,
  name_NF: 0.6,
  name_PCC: 0.6,
  name_PCF: 0.6,
  name_ZPC: 0.6,
  'filter package': 0.6,
  anti_counterfeit_label: 0.6,
  water_efficiency_label: 0.6,
  barcode_label: 0.6,
  fotile_logo: 0.6,
  water_outlet: 0.6,
  Prompt_label: 0.6,
  yellow_point: 0.6,
  glod_logo: 0.6,
};
