
import type { APIRoute } from 'astro';
import { AIConfig, Standard } from '@/types';
import { composeInspectionSystemPrompt } from '@/lib/llmPrompt';

// **DEFINITIVE FINAL FIX**: This function is robust and handles all null/undefined/empty cases for the base URL.
function getApiUrl(config: AIConfig): string {
  const baseUrl = config.apiBaseUrl || '';
  if (baseUrl) {
    if (baseUrl.endsWith('/chat/completions')) return baseUrl;
    return baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
  }
  return 'https://api.openai.com/v1/chat/completions';
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      image,
      config,
      standard,
      finalPrompt
    }: { image: string; config?: AIConfig; standard?: Standard; finalPrompt?: string } = body;

    // **CRITICAL CHECK**: Ensure config object exists before proceeding.
    if (!config || !config.apiKey) {
      return new Response(JSON.stringify({ message: 'AI配置错误或缺失API Key' }), { status: 400 });
    }
    if (!image) {
      return new Response(JSON.stringify({ message: '缺失图片数据' }), { status: 400 });
    }

    const customPrompt = finalPrompt || standard?.overrideSystemPrompt || config.systemPrompt;
    const systemPrompt = composeInspectionSystemPrompt({
      customPrompt,
      standard
    });

    const payload = {
      model: config.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请基于系统提示词和检测标准，分析这张待检图片。' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }
          ]
        }
      ],
      max_tokens: 1024,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    };

    const apiUrl = getApiUrl(config);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API Error:', errorText);
      return new Response(JSON.stringify({ message: `AI API请求失败: ${response.status} - ${errorText}` }), { status: response.status });
    }

    const data = await response.json();
    const analysisResult = JSON.parse(data.choices[0].message.content);
    return new Response(JSON.stringify(analysisResult), { status: 200 });
  } catch (error) {
    console.error('Analysis API Error:', error);
    return new Response(JSON.stringify({ message: error instanceof Error ? error.message : '未知错误' }), { status: 500 });
  }
};
