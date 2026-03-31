import { apiFetch, apiRequest } from './config';

const RULES_ENDPOINT = '/anomaly-rules/';
const RECORDS_ENDPOINT = '/anomaly-records/';

export type AnomalyType =
  | 'consecutive_fail'
  | 'batch_anomaly'
  | 'trace_break'
  | 'timeout'
  | 'critical_defect';

export type AnomalySeverity = 'warning' | 'critical' | 'emergency';
export type AnomalyStatus =
  | 'open'
  | 'suspended'
  | 'in_progress'
  | 'resolved'
  | 'escalated'
  | 'scrapped';

export interface AnomalyRule {
  id: string;
  name: string;
  description: string;
  recipe: string | null;
  processStageCode: string;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  thresholds: Record<string, any>;
  autoEscalateMinutes: number | null;
  passwordSuspend?: string;
  passwordResolve?: string;
  passwordEscalate?: string;
  passwordScrap?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  externalNotifyUrl: string;
  externalNotifyPayloadTemplate: Record<string, any>;
}

export interface AnomalyResolution {
  id: string;
  anomaly: string;
  action: 'suspend' | 'resume' | 'resolve' | 'escalate' | 'scrap' | 'comment';
  comment: string;
  operator: string;
  passwordVerified: boolean;
  createdAt: string;
}

export interface AnomalyRecord {
  id: string;
  rule: string | null;
  ruleName: string;
  recipe: string | null;
  recipeName: string;
  anomalyType: AnomalyType | string;
  severity: AnomalySeverity | string;
  status: AnomalyStatus;
  processStageCode: string;
  fixtureQr: string;
  title: string;
  description: string;
  relatedResults: string[];
  triggerSnapshot: Record<string, any>;
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  escalatedAt?: string | null;
  clientId: string;
  synced: boolean;
  resolutions: AnomalyResolution[];
}

export interface ActiveAlert {
  id: string;
  title: string;
  severity: AnomalySeverity | string;
  anomalyType: AnomalyType | string;
  status: AnomalyStatus;
  openedAt: string;
  processStageCode: string;
}

export interface DashboardPoint {
  date: string;
  count: number;
}

export interface AnomalyDashboardData {
  openCount: number;
  suspendedCount: number;
  inProgressCount: number;
  resolvedToday: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  trend: DashboardPoint[];
  recentAnomalies: AnomalyRecord[];
}

export interface FetchAnomalyRecordsParams {
  status?: string;
  anomalyType?: string;
  severity?: string;
  processStageCode?: string;
  limit?: number;
}

function mapRuleFromApi(data: any): AnomalyRule {
  return {
    id: data.id,
    name: data.name ?? '',
    description: data.description ?? '',
    recipe: data.recipe ?? null,
    processStageCode: data.process_stage_code ?? '',
    anomalyType: data.anomaly_type ?? 'consecutive_fail',
    severity: data.severity ?? 'warning',
    thresholds: data.thresholds ?? {},
    autoEscalateMinutes: data.auto_escalate_minutes ?? null,
    passwordSuspend: data.password_suspend,
    passwordResolve: data.password_resolve,
    passwordEscalate: data.password_escalate,
    passwordScrap: data.password_scrap,
    isActive: data.is_active ?? true,
    createdAt: data.created_at ?? '',
    updatedAt: data.updated_at ?? '',
    externalNotifyUrl: data.external_notify_url ?? '',
    externalNotifyPayloadTemplate: data.external_notify_payload_template ?? {},
  };
}

function mapRuleToApi(payload: Partial<AnomalyRule>): Record<string, any> {
  const result: Record<string, any> = {};
  if (payload.name !== undefined) result.name = payload.name;
  if (payload.description !== undefined) result.description = payload.description;
  if (payload.recipe !== undefined) result.recipe = payload.recipe;
  if (payload.processStageCode !== undefined) result.process_stage_code = payload.processStageCode;
  if (payload.anomalyType !== undefined) result.anomaly_type = payload.anomalyType;
  if (payload.severity !== undefined) result.severity = payload.severity;
  if (payload.thresholds !== undefined) result.thresholds = payload.thresholds;
  if (payload.autoEscalateMinutes !== undefined) result.auto_escalate_minutes = payload.autoEscalateMinutes;
  if (payload.passwordSuspend !== undefined) result.password_suspend = payload.passwordSuspend;
  if (payload.passwordResolve !== undefined) result.password_resolve = payload.passwordResolve;
  if (payload.passwordEscalate !== undefined) result.password_escalate = payload.passwordEscalate;
  if (payload.passwordScrap !== undefined) result.password_scrap = payload.passwordScrap;
  if (payload.isActive !== undefined) result.is_active = payload.isActive;
  if (payload.externalNotifyUrl !== undefined) result.external_notify_url = payload.externalNotifyUrl;
  if (payload.externalNotifyPayloadTemplate !== undefined) {
    result.external_notify_payload_template = payload.externalNotifyPayloadTemplate;
  }
  return result;
}

function mapResolutionFromApi(data: any): AnomalyResolution {
  return {
    id: data.id,
    anomaly: data.anomaly ?? '',
    action: data.action ?? 'comment',
    comment: data.comment ?? '',
    operator: data.operator ?? '',
    passwordVerified: data.password_verified ?? false,
    createdAt: data.created_at ?? '',
  };
}

function mapRecordFromApi(data: any): AnomalyRecord {
  return {
    id: data.id,
    rule: data.rule ?? null,
    ruleName: data.rule_name ?? '',
    recipe: data.recipe ?? null,
    recipeName: data.recipe_name ?? '',
    anomalyType: data.anomaly_type ?? '',
    severity: data.severity ?? 'warning',
    status: data.status ?? 'open',
    processStageCode: data.process_stage_code ?? '',
    fixtureQr: data.fixture_qr ?? '',
    title: data.title ?? '',
    description: data.description ?? '',
    relatedResults: data.related_results ?? [],
    triggerSnapshot: data.trigger_snapshot ?? {},
    openedAt: data.opened_at ?? '',
    updatedAt: data.updated_at ?? '',
    resolvedAt: data.resolved_at ?? null,
    escalatedAt: data.escalated_at ?? null,
    clientId: data.client_id ?? '',
    synced: data.synced ?? true,
    resolutions: Array.isArray(data.resolutions) ? data.resolutions.map(mapResolutionFromApi) : [],
  };
}

function buildQuery(params?: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export async function fetchAnomalyRules(): Promise<AnomalyRule[]> {
  const data = await apiRequest<any[]>(RULES_ENDPOINT);
  return Array.isArray(data) ? data.map(mapRuleFromApi) : [];
}

export async function createAnomalyRule(payload: Omit<AnomalyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AnomalyRule> {
  const data = await apiRequest<any>(RULES_ENDPOINT, {
    method: 'POST',
    body: JSON.stringify(mapRuleToApi(payload)),
  });
  return mapRuleFromApi(data);
}

export async function updateAnomalyRule(id: string, payload: Partial<AnomalyRule>): Promise<AnomalyRule> {
  const data = await apiRequest<any>(`${RULES_ENDPOINT}${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(mapRuleToApi(payload)),
  });
  return mapRuleFromApi(data);
}

export async function deleteAnomalyRule(id: string): Promise<void> {
  const response = await apiFetch(`${RULES_ENDPOINT}${id}/`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    throw new Error(errorText || '删除异常规则失败');
  }
}

export async function fetchAnomalyRecords(params?: FetchAnomalyRecordsParams): Promise<AnomalyRecord[]> {
  const data = await apiRequest<any[]>(
    `${RECORDS_ENDPOINT}${buildQuery({
      status: params?.status,
      anomaly_type: params?.anomalyType,
      severity: params?.severity,
      process_stage_code: params?.processStageCode,
      limit: params?.limit,
    })}`
  );
  return Array.isArray(data) ? data.map(mapRecordFromApi) : [];
}

export async function fetchActiveAlerts(processStageCode?: string): Promise<ActiveAlert[]> {
  const data = await apiRequest<{ alerts?: any[] }>(
    `${RECORDS_ENDPOINT}active-alerts/${buildQuery({ process_stage_code: processStageCode })}`
  );
  return Array.isArray(data.alerts)
    ? data.alerts.map((item) => ({
        id: item.id,
        title: item.title ?? '',
        severity: item.severity ?? 'warning',
        anomalyType: item.anomaly_type ?? '',
        status: item.status ?? 'open',
        openedAt: item.opened_at ?? '',
        processStageCode: item.process_stage_code ?? '',
      }))
    : [];
}

export async function transitionAnomaly(
  id: string,
  action: string,
  password: string,
  comment = '',
  operator = ''
): Promise<AnomalyRecord> {
  const data = await apiRequest<any>(`${RECORDS_ENDPOINT}${id}/transition/`, {
    method: 'POST',
    body: JSON.stringify({ action, password, comment, operator }),
  });
  return mapRecordFromApi(data);
}

export async function fetchDashboard(params?: { timeRange?: string; processStageCode?: string }): Promise<AnomalyDashboardData> {
  const data = await apiRequest<any>(
    `${RECORDS_ENDPOINT}dashboard/${buildQuery({
      time_range: params?.timeRange,
      process_stage_code: params?.processStageCode,
    })}`
  );
  return {
    openCount: data.openCount ?? 0,
    suspendedCount: data.suspendedCount ?? 0,
    inProgressCount: data.inProgressCount ?? 0,
    resolvedToday: data.resolvedToday ?? 0,
    byType: data.byType ?? {},
    bySeverity: data.bySeverity ?? {},
    trend: Array.isArray(data.trend) ? data.trend : [],
    recentAnomalies: Array.isArray(data.recentAnomalies) ? data.recentAnomalies.map(mapRecordFromApi) : [],
  };
}

export async function syncAnomalyBatch(records: Array<Record<string, any>>): Promise<{ created: number; skipped: number }> {
  return apiRequest(`${RECORDS_ENDPOINT}sync-batch/`, {
    method: 'POST',
    body: JSON.stringify({ records }),
  });
}
