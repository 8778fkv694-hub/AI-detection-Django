import { apiRequest } from './config';

export interface ProductStage {
  id: string;
  stage_recipe: string;
  stage_recipe_name: string;
  order: number;
  is_fqc: boolean;
}

export interface FQCValidationRule {
  name: string;
  type: 'occurrence_count' | 'cross_stage_match' | 'target_match';
  source_field: string;
  extract_mode: 'suffix' | 'prefix' | 'full';
  extract_length: number;
  /** occurrence_count 专用 */
  expected_count?: number;
  operator?: 'eq' | 'gte' | 'lte';
  /** cross_stage_match 专用 */
  stage_codes?: string[];
  /** target_match 专用 */
  target_labels?: string[];
  min_target_count?: number;
  contains_text?: string;
  same_prefix_length?: number;
  same_suffix_length?: number;
  regex_pattern?: string;
  description?: string;
}

export interface ProductRecipe {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  fqc_validation_enabled: boolean;
  fqc_validation_rules: FQCValidationRule[];
  stages: ProductStage[];
  created_at: string;
  updated_at: string;
}

const API_BASE = '/product-recipes';

export const productRecipeApi = {
  async list(): Promise<ProductRecipe[]> {
    return apiRequest(`${API_BASE}/`);
  },

  async get(id: string): Promise<ProductRecipe> {
    return apiRequest(`${API_BASE}/${id}/`);
  },

  async create(data: Partial<ProductRecipe>): Promise<ProductRecipe> {
    return apiRequest(`${API_BASE}/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: Partial<ProductRecipe>): Promise<ProductRecipe> {
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

  async assignStages(productId: string, stages: { stage_recipe_id: string; order: number; is_fqc?: boolean }[]): Promise<ProductStage[]> {
    return apiRequest(`${API_BASE}/${productId}/assign-stages/`, {
      method: 'POST',
      body: JSON.stringify({ stages }),
    });
  }
};
