
    const express = require('express');
    const { getDb } = require('./database');
    const router = express.Router();

    const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
    const parse = (jsonString) => (jsonString ? JSON.parse(jsonString) : null);

    const LLM_HANDSHAKE_SYSTEM_PROMPT = `你是本项目中的“LLM检验助手”。本项目是一个工业视觉检测系统，结合图片、OCR结果、检测标准、区域信息和上下文说明，对产品外观、标签文字、印刷质量、对齐情况、洁净用品穿戴状态及其他工业检验项进行综合判定。

你的任务不是闲聊，也不是泛泛描述图片，而是输出稳定、保守、可解析、可复核的检验结论，供前端页面展示、后端保存和人工复核使用。

你的职责：
1. 根据检测图片识别是否存在缺陷、异常、不合规项或疑似风险。
2. 结合 OCR 结果判断标签、喷码、批号、条码周边文字、印刷清晰度和文本一致性是否满足标准。
3. 结合标准图、标准说明、ROI区域、缺陷类型、用户补充要求做综合分析。
4. 当图像信息不足、依据不足或结果冲突时，必须明确输出“需复检”，不能强行给出“合格”。
5. 输出结果必须适合作为工业质检记录，避免口语化和模糊表达。

判定原则：
1. 仅根据当前输入内容判断，不补充未提供的事实。
2. 若提供了检测标准、字段定义、标准图或业务规则，优先以业务输入为准。
3. 先判断关键项，再判断整体结论。
4. 对每个结论都给出可追溯的依据，依据必须来自图像、OCR文本、区域信息或标准要求。
5. 对边界案例采用保守策略，宁可“需复检”，不要武断判定“合格”。

回复要求：
1. 默认使用简体中文。
2. 以结构化结果为主，不写寒暄，不写多余解释，不输出与检验无关的内容。
3. 如果调用方要求 JSON，则只能输出合法 JSON，不能在 JSON 外追加文字。
4. 字段名必须稳定，不能随意变更，不能漏掉必填字段。`;

    const DEFAULT_LLM_TASK_PROMPT = '请作为工业视觉检验模型，对当前输入执行严格质检，并返回 JSON 结果。重点关注外观缺陷、标签状态、OCR关键信息一致性、印刷清晰度、贴附是否端正，以及标准中明确要求的关键项。';

    // Helper to construct the standard details part of the prompt, ensures consistency with frontend
    const buildStandardDetailsPrompt = (standard) => {
      if (!standard) return '';

      const lines = [
        '当前业务检测标准：',
        `- 标准名称: ${standard.name || '未命名标准'}`,
        `- 标准类型: ${standard.type === 'image_based' ? '图像对比' : '规则描述'}`,
        `- 检测要求: ${standard.criteria || standard.requirements || '无'}`
      ];

      if (standard.qualityCriteria) {
        lines.push(`- 质量标准: ${standard.qualityCriteria}`);
      }

      if (standard.keywords) {
        lines.push(`- OCR关键词: ${standard.keywords}`);
      }

      if (Array.isArray(standard.inspectionAreas) && standard.inspectionAreas.length > 0) {
        lines.push('- 重点检测区域:');
        standard.inspectionAreas.forEach((area) => {
          lines.push(`  - ${area.name}: ${area.description || '无描述'} (x:${area.x}, y:${area.y}, w:${area.width}, h:${area.height})`);
        });
      }

      if (Array.isArray(standard.rois) && standard.rois.length > 0) {
        lines.push('- ROI区域:');
        standard.rois.forEach((roi) => {
          lines.push(`  - ${roi.label || roi.name || '未命名ROI'} (x:${Math.round(roi.x)}, y:${Math.round(roi.y)}, w:${Math.round(roi.width)}, h:${Math.round(roi.height)})`);
        });
      }

      return `\n\n${lines.join('\n')}`;
    };

    const composeInspectionSystemPrompt = (customPrompt, standard) => {
      const prompt = (customPrompt || '').trim() || DEFAULT_LLM_TASK_PROMPT;
      const sections = [
        LLM_HANDSHAKE_SYSTEM_PROMPT,
        `当前业务补充要求：\n${prompt}`
      ];
      const standardDetails = buildStandardDetailsPrompt(standard);
      if (standardDetails) {
        sections.push(standardDetails.trim());
      }
      return sections.join('\n\n');
    };

    // 数据库端点
    router.get('/results', asyncHandler(async (req, res) => {
        const db = getDb();
        const results = db.get('results').value() || [];
        res.json(results);
    }));

    router.post('/results', asyncHandler(async (req, res) => {
        const db = getDb();
        const newResult = {
            id: Date.now().toString(),
            ...req.body,
            timestamp: new Date().toISOString()
        };
        db.get('results').push(newResult).write();
        res.json(newResult);
    }));

    router.get('/standards', asyncHandler(async (req, res) => {
        const db = getDb();
        const standards = db.get('standards').value() || [];
        res.json(standards);
    }));

    router.post('/standards', asyncHandler(async (req, res) => {
        const db = getDb();
        const newStandard = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        db.get('standards').push(newStandard).write();
        res.json(newStandard);
    }));

    router.get('/model-versions', asyncHandler(async (req, res) => {
        const db = getDb();
        const versions = db.get('modelVersions').value() || [];
        res.json(versions);
    }));

    router.get('/results/available-models', asyncHandler(async (req, res) => {
        const db = getDb();
        const models = db.get('modelVersions').value() || [];
        res.json(models);
    }));

    router.get('/results/ppe-model-status', asyncHandler(async (req, res) => {
        const db = getDb();
        const status = db.get('ppeModelStatus').value() || {
            isLoaded: false,
            lastUpdated: null,
            version: '1.0.0'
        };
        res.json(status);
    }));

    const makeApiCall = async (config, payload) => {
        // 使用动态导入来支持ES模块
        const { default: fetch } = await import('node-fetch');
        
        // 确保URL是绝对URL
        const apiUrl = config.apiBaseUrl.startsWith('http') 
            ? config.apiBaseUrl 
            : `https://${config.apiBaseUrl}`;
            
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 调用失败: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        return await response.json();
    };
    router.post('/ai/test', asyncHandler(async (req, res) => {
        const { config } = req.body;
        const testPayload = {
            model: config.modelName,
            messages: [
                { role: 'system', content: '你是一个测试助手' },
                { role: 'user', content: '请回复"测试成功"' }
            ],
            max_tokens: 50
        };
        
        try {
            const response = await makeApiCall(config, testPayload);
            res.json({ 
                success: true, 
                message: 'API 连接测试成功',
                response: response
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'API 连接测试失败',
                error: error.message 
            });
        }
    }));

    router.post('/ai/analyze', asyncHandler(async (req, res) => {
        const { image, config, standard, finalPrompt } = req.body;
        const finalSystemPrompt = composeInspectionSystemPrompt(
            finalPrompt || standard?.overrideSystemPrompt || config.systemPrompt,
            standard
        );

        const imageUrlForApi = `data:image/jpeg;base64,${image}`;
        const messages = [{ role: 'system', content: finalSystemPrompt }, { role: 'user', content: [{ type: 'text', text: '请检测这张待检图片。' }, { type: 'image_url', image_url: { url: imageUrlForApi } }] }];
        if (standard?.type === 'image_based' && standard.standardImage) {
            const standardImagePureBase64 = standard.standardImage.startsWith('data:') ? standard.standardImage.split(',')[1] : standard.standardImage;
            const standardImageUrlForApi = `data:image/jpeg;base64,${standardImagePureBase64}`;
            messages[1].content.unshift({ type: 'text', text: '这是需要对比的“标准图”：' }, { type: 'image_url', image_url: { url: standardImageUrlForApi } });
        }
        const payload = { model: config.modelName, messages, response_format: { type: 'json_object' }, stream: false };
        const apiResponse = await makeApiCall(config, payload);
        const content = apiResponse.choices[0].message.content;
        const finalResult = JSON.parse(content);
        res.json(finalResult);
    }));

    router.post('/ai/enhance-analyze', asyncHandler(async (req, res) => {
        const { originalResult, standard, supplementaryPrompt, config } = req.body;
        const systemPrompt = `你是一个专业的增强图像质检分析师...\n原始检测结果为：质量=${originalResult.overallQuality}, 分数=${originalResult.score}, 理由=${originalResult.reason}。`;
        const userPrompt = `用户的补充指令是："${supplementaryPrompt}"。请重点关注这个指令，并结合标准，对这张待检图片进行再次分析。`;
        const originalImagePureBase64 = originalResult.image && originalResult.image.startsWith('data:') ? originalResult.image.split(',')[1] : originalResult.image || '';
        const originalImageUrlForApi = `data:image/jpeg;base64,${originalImagePureBase64}`;
        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: originalImageUrlForApi } }] }];
        if (standard?.type === 'image_based' && standard.standardImage) {
            const standardImagePureBase64 = standard.standardImage.startsWith('data:') ? standard.standardImage.split(',')[1] : standard.standardImage;
            const standardImageUrlForApi = `data:image/jpeg;base64,${standardImagePureBase64}`;
            messages[1].content.push({ type: 'text', text: '这是参考的"标准图"：' }, { type: 'image_url', image_url: { url: standardImageUrlForApi } });
        }
        const payload = { model: config.modelName, messages, response_format: { type: 'json_object' }, stream: false };
        const apiResponse = await makeApiCall(config, payload);
        const content = apiResponse.choices[0].message.content;
        const finalResult = JSON.parse(content);
        res.json(finalResult);
    }));

    // AI配置相关端点
    router.get('/ai-configs', asyncHandler(async (req, res) => {
        const db = getDb();
        const configs = db.get('aiConfigs').value() || [];
        res.json(configs);
    }));

    router.post('/ai-configs', asyncHandler(async (req, res) => {
        const db = getDb();
        const newConfig = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        db.get('aiConfigs').push(newConfig).write();
        res.json(newConfig);
    }));

    router.put('/ai-configs/:id', asyncHandler(async (req, res) => {
        const db = getDb();
        const { id } = req.params;
        const updatedConfig = {
            ...req.body,
            id,
            updatedAt: new Date().toISOString()
        };
        db.get('aiConfigs').find({ id }).assign(updatedConfig).write();
        res.json(updatedConfig);
    }));

    router.get('/ai-configs/current', asyncHandler(async (req, res) => {
        const db = getDb();
        const configs = db.get('aiConfigs').value() || [];
        const currentConfig = configs[configs.length - 1] || {
            modelName: 'qwen2.5-vl-32b-instruct',
            apiKey: '',
            apiBaseUrl: 'https://wcode.net/api/gpt/v1/chat/completions',
            systemPrompt: DEFAULT_LLM_TASK_PROMPT,
            compressionEnabled: true,
            compressionQuality: 0.8,
            imageWidth: 400,
            imageHeight: 400
        };
        res.json(currentConfig);
    }));

    // 测试AI连接
    router.post('/ai-configs/test-connection', asyncHandler(async (req, res) => {
        const { config } = req.body;
        
        if (!config.apiKey) {
            return res.status(400).json({
                success: false,
                message: 'API Key 不能为空'
            });
        }

        if (!config.apiBaseUrl) {
            return res.status(400).json({
                success: false,
                message: 'API Base URL 不能为空'
            });
        }

        const testPayload = {
            model: config.modelName,
            messages: [
                { role: 'system', content: '你是一个测试助手' },
                { role: 'user', content: '请回复"测试成功"' }
            ],
            max_tokens: 50
        };
        
        try {
            const response = await makeApiCall(config, testPayload);
            res.json({ 
                success: true, 
                message: 'AI模型连接测试成功',
                response: response
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                message: 'AI模型连接测试失败',
                error: error.message 
            });
        }
    }));

    // 查询API KEY余额
    router.post('/ai-configs/check-balance', asyncHandler(async (req, res) => {
        const { config } = req.body;
        
        if (!config.apiKey) {
            return res.status(400).json({
                success: false,
                message: 'API Key 不能为空'
            });
        }

        const apiKey = config.apiKey;
        const apiBaseUrl = config.apiBaseUrl || 'https://wcode.net/api/gpt/v1/chat/completions';
        
        // 从API Base URL提取基础URL用于余额查询
        let balanceUrl;
        if (apiBaseUrl.includes('wcode.net')) {
            balanceUrl = 'https://wcode.net/api/account/billing/grants';
        } else {
            // 如果是其他API提供商，尝试从base URL推断余额查询URL
            const url = new URL(apiBaseUrl);
            balanceUrl = `${url.protocol}//${url.host}/api/account/billing/grants`;
        }
        
        try {
            const { default: fetch } = await import('node-fetch');
            
            const response = await fetch(balanceUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const balanceData = await response.json();
            
            // 解析余额信息
            if (balanceData.status === 'success') {
                const data = balanceData.data || {};
                const totalAvailable = data.total_available || 0;
                const currency = data.total_available_currency || 'CNY';
                const currencySymbol = data.total_available_currency_symbol || '¥';
                
                res.json({
                    success: true,
                    message: '余额查询成功',
                    data: {
                        total_available: totalAvailable,
                        currency: currency,
                        currency_symbol: currencySymbol,
                        formatted_balance: `${currencySymbol}${totalAvailable.toFixed(2)} ${currency}`
                    }
                });
            } else {
                const errorMessage = balanceData.error_message || '未知错误';
                res.status(400).json({
                    success: false,
                    message: `余额查询失败: ${errorMessage}`
                });
            }
            
        } catch (error) {
            console.error('余额查询错误:', error);
            res.status(500).json({
                success: false,
                message: `余额查询失败: ${error.message}`
            });
        }
    }));

    router.use((err, req, res, next) => { console.error(err); res.status(500).json({ message: err.message || 'An internal server error occurred' }); });
    module.exports = router;
  
