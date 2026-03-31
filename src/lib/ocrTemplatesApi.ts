import type { OCRTemplate, KeywordConfig, BarcodeTemplate, BarcodeConfig } from '@/types/ocr';
import { apiRequest, apiFetch } from './config';

const KEYWORD_TEMPLATES_ENDPOINT = '/ocr-keyword-templates/';
const BARCODE_TEMPLATES_ENDPOINT = '/ocr-barcode-templates/';

type KeywordTemplatePayload = {
  name: string;
  keywords: string;
  keywordConfigs: Array<Omit<KeywordConfig, 'id'>>;
  keywordMatchMode: 'contains' | 'exact';
  minConfidence: number;
  description?: string;
};

type BarcodeTemplatePayload = {
  name: string;
  configs: BarcodeConfig[];
  description?: string;
};

const mapKeywordTemplate = (data: any): OCRTemplate => ({
  id: data.id,
  name: data.name,
  keywords: data.keywords ?? '',
  keywordConfigs: data.keyword_configs ?? [],
  keywordMatchMode: data.match_mode ?? 'contains',
  minConfidence: data.min_confidence ?? 0.5,
  createdAt: data.created_at ?? '',
  updatedAt: data.updated_at ?? undefined,
  description: data.description ?? undefined,
  isActive: data.is_active ?? true,
});

const mapBarcodeTemplate = (data: any): BarcodeTemplate => ({
  id: data.id,
  name: data.name,
  configs: data.barcode_configs ?? [],
  createdAt: data.created_at ?? '',
  updatedAt: data.updated_at ?? undefined,
  description: data.description ?? undefined,
  isActive: data.is_active ?? true,
});

export async function fetchKeywordTemplates(): Promise<OCRTemplate[]> {
  const data = await apiRequest<any[]>(KEYWORD_TEMPLATES_ENDPOINT);
  return Array.isArray(data) ? data.map(mapKeywordTemplate) : [];
}

export async function createKeywordTemplate(payload: KeywordTemplatePayload): Promise<OCRTemplate> {
  const body = {
    name: payload.name,
    keywords: payload.keywords,
    keyword_configs: payload.keywordConfigs,
    match_mode: payload.keywordMatchMode,
    min_confidence: payload.minConfidence,
    description: payload.description ?? '',
  };

  const data = await apiRequest<any>(KEYWORD_TEMPLATES_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return mapKeywordTemplate(data);
}

export async function deleteKeywordTemplate(templateId: string): Promise<void> {
  const response = await apiFetch(`${KEYWORD_TEMPLATES_ENDPOINT}${templateId}/`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    throw new Error(errorText || '删除关键词模板失败');
  }
}

export async function fetchBarcodeTemplates(): Promise<BarcodeTemplate[]> {
  const data = await apiRequest<any[]>(BARCODE_TEMPLATES_ENDPOINT);
  return Array.isArray(data) ? data.map(mapBarcodeTemplate) : [];
}

export async function createBarcodeTemplate(payload: BarcodeTemplatePayload): Promise<BarcodeTemplate> {
  const body = {
    name: payload.name,
    barcode_configs: payload.configs,
    description: payload.description ?? '',
  };

  const data = await apiRequest<any>(BARCODE_TEMPLATES_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return mapBarcodeTemplate(data);
}

export async function deleteBarcodeTemplate(templateId: string): Promise<void> {
  const response = await apiFetch(`${BARCODE_TEMPLATES_ENDPOINT}${templateId}/`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    throw new Error(errorText || '删除二维码模板失败');
  }
}
