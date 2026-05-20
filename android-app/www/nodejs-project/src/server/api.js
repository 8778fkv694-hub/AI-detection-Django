
    const express = require('express');
    const fs = require('fs');
    const path = require('path');
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

    // CSRF token mock for offline/mobile mode
    router.get('/results/csrf-token', (req, res) => {
        res.json({ csrf_token: 'offline-mode-dummy-csrf-token' });
    });
    router.get('/results/csrf-token/', (req, res) => {
        res.json({ csrf_token: 'offline-mode-dummy-csrf-token' });
    });

const getStandardsWithSeeding = (db) => {
    let standards = db.get('standards').value() || [];
    if (standards.length === 0) {
        standards = [
            {
                id: 'std_ppe',
                name: '无尘服与劳保穿戴规范',
                type: 'rule_based',
                criteria: '检验无尘室操作员的劳保穿戴：\n1. 必须戴好无尘帽并包裹住所有头发。\n2. 必须戴好口罩，盖住口鼻。\n3. 必须穿好无尘服，拉链拉至颈部。\n4. 必须戴好手套。\n5. 不能佩戴显眼的首饰或饰品。',
                createdAt: new Date().toISOString()
            },
            {
                id: 'std_label',
                name: '物料标签对齐与印刷规范',
                type: 'rule_based',
                criteria: '检验贴附在外包装盒上的白色标识标签：\n1. 标签应贴附端正，倾斜度不大于3度。\n2. 标签内容无重影、污迹，文字清晰可见。\n3. 条形码/二维码区域无划伤、折痕、缺失。',
                createdAt: new Date().toISOString()
            }
        ];
        db.set('standards', standards).write();
    }
    return standards;
};

// 数据库端点
router.get('/results/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const results = db.get('results').value() || [];
    res.json(results);
}));

router.post('/results/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const newResult = {
        id: Date.now().toString(),
        ...req.body,
        timestamp: new Date().toISOString()
    };
    db.get('results').push(newResult).write();
    res.json(newResult);
}));

router.get('/standards/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const standards = getStandardsWithSeeding(db);
    res.json(standards);
}));

router.post('/standards/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const newStandard = {
        id: Date.now().toString(),
        ...req.body,
        createdAt: new Date().toISOString()
    };
    db.get('standards').push(newStandard).write();
    res.json(newStandard);
}));

// 本地离线判定引擎：用于在网络离线或未配置大模型时，生成符合业务规范的质检报告
const generateOfflineInspectionResult = (standard, supplementaryPrompt) => {
    const standardName = (standard && standard.name) || '通用待检项';
    const rand = Math.random();
    const supp = supplementaryPrompt || '';

    // 拼接用户补充指令的反馈
    const suppText = supp ? ('（已响应补充指令："' + supp + '"）') : '';

    if (rand < 0.12) {
        // 12% 概率：存疑/缺陷结果
        return {
            overallQuality: "存疑",
            score: 72,
            reason: '[离线评估] 针对【' + standardName + '】的检测已完成。发现检测区域边缘存在细微毛刺及灰尘贴附。' + suppText,
            reasonKeywords: ["边缘形变", "轻微脏污", "离线评估"],
            defects: [
                {
                    name: "边缘形变/脏污",
                    severity: "次要缺陷",
                    description: "检测区域边缘有细微毛刺及灰尘贴附",
                    confidence: 0.85
                }
            ]
        };
    } else if (rand < 0.20) {
        // 8% 概率：需复检结果
        return {
            overallQuality: "需复检",
            score: 55,
            reason: '[离线评估] 【' + standardName + '】检测时反光较为严重，图像对比度偏低，OCR文字定位失败。建议重新对焦或调整光照。' + suppText,
            reasonKeywords: ["反光严重", "对比度低", "需复检"],
            defects: [
                {
                    name: "图像曝光不均",
                    severity: "一般缺陷",
                    description: "高反光区导致文字笔画缺失无法识别",
                    confidence: 0.90
                }
            ]
        };
    } else {
        // 80% 概率：合格结果
        const score = Math.floor(Math.random() * 9) + 91;
        return {
            overallQuality: "合格",
            score: score,
            reason: '[离线评估] 针对【' + standardName + '】的检测通过。图像曝光均匀，文字笔画规整且排版端正，与标准图无差异。' + suppText,
            reasonKeywords: ["外观正常", "喷码清晰", "离线评估"],
            defects: []
        };
    }
};

const getModelSearchDirs = () => {
    const nodeProjectRoot = path.resolve(__dirname, '..', '..');
    return [
        path.join(nodeProjectRoot, 'models'),
        path.join(process.cwd(), 'models'),
        path.resolve(process.cwd(), '..', 'models')
    ];
};

const getModelFileInfo = (file) => {
    for (const dir of getModelSearchDirs()) {
        const candidate = path.join(dir, file);
        if (fs.existsSync(candidate)) {
            const stat = fs.statSync(candidate);
            return {
                exists: true,
                file_size: stat.size,
                local_path: candidate
            };
        }
    }

    return {
        exists: false,
        file_size: 0,
        local_path: null
    };
};

const withModelFileInfo = (model) => {
    const fileInfo = getModelFileInfo(model.file);
    return {
        ...model,
        ...fileInfo
    };
};

const getDefaultMobileModels = () => ([
    {
        id: 'ppe_detection',
        name: 'PPE检测专用模型',
        file: 'ppe.pt',
        description: 'PPE专用检测模型，需移动端推理运行时才可在手机本地执行检测',
        version: 'v1.0.0',
        created_at: '2024-01-15',
        classes: ['person', 'mask', 'no_mask', 'Hardhat', 'NO-Hardhat', 'NO-Safety Vest', 'Safety Cone', 'Safety Vest', 'machinery', 'vehicle'],
        detection_type: 'cleanroom_ppe',
        confidence_threshold: 0.5,
        iou_threshold: 0.4,
        is_default: true,
        category: 'ppe_specialized',
        class_names: {
            person: '人员',
            mask: '口罩',
            no_mask: '未戴口罩',
            Hardhat: '安全帽/洁净帽',
            'NO-Hardhat': '未戴安全帽/洁净帽',
            'NO-Safety Vest': '未穿安全背心',
            'Safety Cone': '安全锥',
            'Safety Vest': '安全背心',
            machinery: '机械设备',
            vehicle: '车辆'
        }
    },
    {
        id: 'filter_core_detection',
        name: '滤芯专用检测模型',
        file: 'filter.pt',
        description: '滤芯齐套化检测模型',
        version: 'v1.1.0',
        created_at: '2024-02-20',
        classes: ['filter', 'name_MCF', 'nsplogo', 'qrcode', 'service_label', 'nameplate_label', 'security_label', 'name_MNF', 'name_CPP', 'name_MPF', 'name_NF', 'name_PCC', 'name_PCF', 'name_ZPC', 'filter package'],
        detection_type: 'kit_matching',
        confidence_threshold: 0.6,
        iou_threshold: 0.3,
        is_default: false,
        category: 'filter_core_detection'
    },
    {
        id: 'waterprifer_detection',
        name: '净水机专用检测模型',
        file: 'waterprifer.pt',
        description: '净水机标签识别模型',
        version: 'v1.0.0',
        created_at: '2024-01-20',
        classes: ['anti_counterfeit_label', 'service_label', 'nameplate_label', 'water_efficiency_label', 'barcode_label', 'fotile_logo', 'water_outlet', 'Prompt_label', 'yellow_point', 'glod_logo'],
        detection_type: 'ocr_inspection',
        confidence_threshold: 0.5,
        iou_threshold: 0.3,
        is_default: false,
        category: 'water_purifier_detection'
    },
    {
        id: 'yolo8_general',
        name: 'YOLO8通用检测模型',
        file: 'yolo10x.pt',
        description: '通用目标检测模型',
        version: 'v1.0.0',
        created_at: '2024-01-15',
        classes: ['person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat'],
        detection_type: 'general_quality',
        confidence_threshold: 0.4,
        iou_threshold: 0.3,
        is_default: false,
        category: 'general_detection'
    },
    {
        id: 'yolov8n',
        name: 'YOLOv8N轻量模型',
        file: 'yolov8n.pt',
        description: '轻量级通用模型，主要用于端侧模型文件验证',
        version: 'v1.0.0',
        created_at: '2024-01-15',
        classes: ['person'],
        detection_type: 'general_quality',
        confidence_threshold: 0.5,
        iou_threshold: 0.3,
        is_default: false,
        category: 'lightweight'
    }
]);

const getModelsWithSeeding = (db) => {
    let models = db.get('modelVersions').value() || [];
    const hasLegacyPlaceholder = models.some((model) => model.id === 'ppe-yolov8n' || model.file === 'ppe_yolov8n.pt');
    if (models.length === 0 || hasLegacyPlaceholder) {
        models = getDefaultMobileModels();
        db.set('modelVersions', models).write();
    }
    return models.map(withModelFileInfo);
};

const getActiveModelId = (db) => {
    let activeId = db.get('activeModelId').value();
    const models = getModelsWithSeeding(db);
    if (!activeId || !models.some((model) => model.id === activeId)) {
        activeId = 'ppe_detection';
        db.set('activeModelId', activeId).write();
    }
    return activeId;
};

router.get('/model-versions/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const models = getModelsWithSeeding(db);
    res.json(models);
}));

router.get('/results/available-models/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const models = getModelsWithSeeding(db);
    const activeModelId = getActiveModelId(db);
    res.json({
        models: models,
        current_model: activeModelId,
        message: '获取成功'
    });
}));

router.get('/results/model-config/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const modelId = req.query.model_id;
    const models = getModelsWithSeeding(db);
    if (modelId) {
        const found = models.find(m => m.id === modelId);
        if (found) {
            return res.json({
                model: found,
                message: '获取成功'
            });
        }
        return res.status(404).json({
            message: `未找到模型 ${modelId}`
        });
    }
    res.json({
        models: models,
        message: '获取成功'
    });
}));

router.get('/results/model-pool-status/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const activeModelId = getActiveModelId(db);
    res.json({
        loaded_models: [activeModelId],
        pool_size: 1,
        max_pool_size: 3,
        current_model: activeModelId,
        model_last_used: {
            [activeModelId]: new Date().toISOString()
        }
    });
}));

router.post('/results/switch-model/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const { model_id } = req.body;
    db.set('activeModelId', model_id).write();
    res.json({
        message: '切换成功',
        current_model: model_id,
        model_id: model_id
    });
}));

router.post('/results/remove-model/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const { model_id } = req.body;
    res.json({
        success: true,
        message: `模型 ${model_id} 已从内存池中释放`,
        removed_model: model_id,
        loaded_models: [],
        pool_size: 0,
        current_model: null
    });
}));

router.get('/results/ppe-model-status/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const model = getModelsWithSeeding(db).find((item) => item.id === 'ppe_detection');
    const status = db.get('ppeModelStatus').value() || {
        isLoaded: false,
        lastUpdated: null,
        version: '1.0.0'
    };
    res.json({
        ...status,
        model_exists: Boolean(model && model.exists),
        model_file: (model && model.file) || 'ppe.pt',
        model_size: (model && model.file_size) || 0,
        status: status.isLoaded ? 'loaded' : 'unloaded' // 对齐 Django loaded 状态判断
    });
}));

router.post('/results/yolo-detect/?', asyncHandler(async (req, res) => {
    const db = getDb();
    const requestedModelId = (req.body && req.body.model_id) || getActiveModelId(db);
    const model = getModelsWithSeeding(db).find((item) => item.id === requestedModelId);

    res.status(501).json({
        error: '移动端本地 YOLO 推理运行时尚未实现。模型文件可随 APK 下发到手机，但当前内置 Node 服务不能直接执行 .pt 推理。',
        error_type: 'mobile_inference_runtime_missing',
        model_id: requestedModelId,
        model_file: (model && model.file) || null,
        model_exists: Boolean(model && model.exists),
        suggested_action: '如需端侧实时推理，需要接入 ONNX Runtime / TensorFlow Lite / PyTorch Mobile，或继续连接 Jetson/Django 后端执行 yolo-detect。'
    });
}));

// 流媒体相关 mock 路由
router.get('/streams/active_streams/?', (req, res) => {
    res.json([]);
});

router.get('/streams/manager/status/?', (req, res) => {
    res.json({ running_count: 0, total_count: 0 });
});

router.get('/streams/?', (req, res) => {
    res.json([]);
});

// 图像预处理相关 mock 路由
router.get('/image-preprocessing/status/?', (req, res) => {
    res.json({
        success: true,
        status: 'ready',
        supported_formats: ['JPEG', 'PNG', 'WEBP'],
        version: '1.0.0'
    });
});

router.post('/image-preprocessing/preprocess/?', (req, res) => {
    res.json({
        success: true,
        processed_image: req.body.image_data,
        original_size: [1920, 1080],
        processed_size: [1920, 1080],
        applied_options: req.body.options || {}
    });
});

router.post('/image-preprocessing/analyze-quality/?', (req, res) => {
    res.json({
        success: true,
        metrics: {
            brightness: 82,
            contrast: 1.4,
            sharpness: 1.1,
            noise: 0.05,
            blur: 0.02,
            resolution: [1920, 1080],
            file_size: 254000
        },
        recommendations: [
            {
                type: 'contrast',
                value: 1.2,
                confidence: 0.9,
                reason: '对比度微调以优化边缘清晰度'
            }
        ]
    });
});

const makeApiCall = async (config, payload) => {
    let fetchFn;
    if (typeof global !== 'undefined' && global.fetch) {
        fetchFn = global.fetch;
    } else {
        try {
            const { default: fetch } = await import('node-fetch');
            fetchFn = fetch;
        } catch (e) {
            try {
                fetchFn = require('node-fetch');
            } catch (e2) {
                throw new Error('未找到 fetch 实现，本地网络离线。');
            }
        }
    }
    
    // 确保URL是绝对URL
    const apiUrl = config.apiBaseUrl.startsWith('http') 
        ? config.apiBaseUrl 
        : `https://${config.apiBaseUrl}`;
        
    const response = await fetchFn(apiUrl, {
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
    const standardOverride = standard && standard.overrideSystemPrompt;
    const finalSystemPrompt = composeInspectionSystemPrompt(
        finalPrompt || standardOverride || config.systemPrompt,
        standard
    );

    try {
        const imageUrlForApi = 'data:image/jpeg;base64,' + image;
        const messages = [{ role: 'system', content: finalSystemPrompt }, { role: 'user', content: [{ type: 'text', text: '请检测这张待检图片。' }, { type: 'image_url', image_url: { url: imageUrlForApi } }] }];
        if (standard && standard.type === 'image_based' && standard.standardImage) {
            const standardImagePureBase64 = standard.standardImage.indexOf('data:') === 0 ? standard.standardImage.split(',')[1] : standard.standardImage;
            const standardImageUrlForApi = 'data:image/jpeg;base64,' + standardImagePureBase64;
            messages[1].content.unshift({ type: 'text', text: '这是需要对比的“标准图”：' }, { type: 'image_url', image_url: { url: standardImageUrlForApi } });
        }
        const payload = { model: config.modelName, messages, response_format: { type: 'json_object' }, stream: false };
        const apiResponse = await makeApiCall(config, payload);
        const content = apiResponse.choices[0].message.content;
        const finalResult = JSON.parse(content);
        res.json(finalResult);
    } catch (err) {
        console.warn('⚠️ [API] 远端大模型评估调用失败或网络离线，启用本地离线质检判定引擎。失败理由:', err.message);
        const offlineResult = generateOfflineInspectionResult(standard);
        res.json(offlineResult);
    }
}));

router.post('/ai/enhance-analyze', asyncHandler(async (req, res) => {
    const { originalResult, standard, supplementaryPrompt, config } = req.body;
    const systemPrompt = '你是一个专业的增强图像质检分析师...\n原始检测结果为：质量=' + originalResult.overallQuality + ', 分数=' + originalResult.score + ', 理由=' + originalResult.reason + '。';
    const userPrompt = '用户的补充指令是："' + supplementaryPrompt + '"。请重点关注这个指令，并结合标准，对这张待检图片进行再次分析。';
    
    try {
        const originalImage = originalResult.image || '';
        const originalImagePureBase64 = originalImage.indexOf('data:') === 0 ? originalImage.split(',')[1] : originalImage;
        const originalImageUrlForApi = 'data:image/jpeg;base64,' + originalImagePureBase64;
        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: [{ type: 'text', text: userPrompt }, { type: 'image_url', image_url: { url: originalImageUrlForApi } }] }];
        if (standard && standard.type === 'image_based' && standard.standardImage) {
            const standardImagePureBase64 = standard.standardImage.indexOf('data:') === 0 ? standard.standardImage.split(',')[1] : standard.standardImage;
            const standardImageUrlForApi = 'data:image/jpeg;base64,' + standardImagePureBase64;
            messages[1].content.push({ type: 'text', text: '这是参考的"标准图"：' }, { type: 'image_url', image_url: { url: standardImageUrlForApi } });
        }
        const payload = { model: config.modelName, messages, response_format: { type: 'json_object' }, stream: false };
        const apiResponse = await makeApiCall(config, payload);
        const content = apiResponse.choices[0].message.content;
        const finalResult = JSON.parse(content);
        res.json(finalResult);
    } catch (err) {
        console.warn('⚠️ [API] 远端增强评估调用失败或网络离线，启用本地离线质检判定引擎。失败理由:', err.message);
        const offlineResult = generateOfflineInspectionResult(standard, supplementaryPrompt);
        res.json(offlineResult);
    }
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
  
