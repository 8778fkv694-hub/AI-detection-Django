
import { AIConfig, AnalysisResult, Standard } from '@/types';
import { toBase64 } from '@/utils/imageUtils';
import { apiFetch } from '@/lib/config';

export const testConnection = async (config: AIConfig): Promise<boolean> => {
    const response = await apiFetch('/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
    });
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data.success;
};

export const analyzeImage = async (file: File, config: AIConfig, standard?: Standard): Promise<AnalysisResult> => {
    const image = await toBase64(file);
    const response = await apiFetch('/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, config, standard })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'AI analysis failed');
    }
    return response.json();
};