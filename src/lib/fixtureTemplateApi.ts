import { apiRequest } from './config';

export interface FixtureTemplate {
  id: string;
  name: string;
  description: string;
  prefixes: string;
  pattern: string;
  created_at: string;
  updated_at: string;
  // A12：引用影响提示 — 哪些工序配方以快照复制方式引用了本模板
  used_by_recipes?: Array<{ id: string; name: string }>;
}

const API_BASE = '/fixture-templates';

export const fixtureTemplateApi = {
  async list(): Promise<FixtureTemplate[]> {
    return apiRequest(`${API_BASE}/`);
  },

  async get(id: string): Promise<FixtureTemplate> {
    return apiRequest(`${API_BASE}/${id}/`);
  },

  async create(data: Partial<FixtureTemplate>): Promise<FixtureTemplate> {
    return apiRequest(`${API_BASE}/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<FixtureTemplate>): Promise<FixtureTemplate> {
    return apiRequest(`${API_BASE}/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string): Promise<void> {
    return apiRequest(`${API_BASE}/${id}/`, {
      method: 'DELETE',
    });
  },
};
