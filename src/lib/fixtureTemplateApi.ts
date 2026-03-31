import { apiRequest } from './config';

export interface FixtureTemplate {
  id: string;
  name: string;
  description: string;
  prefixes: string;
  pattern: string;
  created_at: string;
  updated_at: string;
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
