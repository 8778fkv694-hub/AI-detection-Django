import { apiRequest } from './config';

export interface FQCRecord {
  id: string;
  fixture_qr: string;
  product_recipe: string | null;
  product_recipe_name: string;
  fqc_stage_code: string;
  fqc_stage_name: string;
  trigger_result: string | null;
  overall_result: '合格' | '不合格' | '存疑';
  result_reason: string;
  stage_summary: Array<{
    stageCode: string;
    stageName: string;
    resultId: string;
    quality: string;
    score: number;
    timestamp: string;
    businessCode: string;
    detectionType: string;
  }>;
  related_inspection_ids: string[];
  trace_flow: Array<{
    stageCode: string;
    stageName: string;
    timestamp: string;
    quality: string;
    resultId: string;
    detectionType: string;
  }>;
  trace_conclusion: string;
  validation_passed: boolean | null;
  validation_details: Array<{
    ruleName: string;
    passed: boolean;
    expected: string;
    actual: string;
    message: string;
  }>;
  created_at: string;
  updated_at: string;
}

const ENDPOINT = '/fqc-records/';

export async function fetchFQCRecords(params?: {
  fixture_qr?: string;
  product_recipe?: string;
}): Promise<FQCRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.fixture_qr) searchParams.set('fixture_qr', params.fixture_qr);
  if (params?.product_recipe) searchParams.set('product_recipe', params.product_recipe);
  const query = searchParams.toString();
  const url = query ? `${ENDPOINT}?${query}` : ENDPOINT;
  return apiRequest<FQCRecord[]>(url);
}

export async function fetchFQCRecord(id: string): Promise<FQCRecord> {
  return apiRequest<FQCRecord>(`${ENDPOINT}${id}/`);
}
