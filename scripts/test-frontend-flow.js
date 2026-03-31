// 模拟前端AI检测流程
const fetch = require('node-fetch');

// 模拟图片压缩函数
function compressImageForAI(base64Image, maxSize = 256) {
    return new Promise((resolve) => {
        // 这里只是模拟，实际压缩需要Canvas
        console.log(`📸 模拟图片压缩: 原始大小 ${base64Image.length} -> 压缩到 ${maxSize}x${maxSize}`);
        resolve(base64Image); // 返回原始数据用于测试
    });
}

// 模拟analyzeImageLocalOptimized函数
async function analyzeImageLocalOptimized(image, localConfig, standard) {
    console.log('🔍 开始本地模型分析...');
    console.log('📊 配置:', localConfig);
    console.log('📏 图片大小:', image.length);
    
    // 1. 图片压缩
    const compressedImage = await compressImageForAI(image, 256);
    console.log('✅ 图片压缩完成');
    
    // 2. 构建消息
    const messages = [
        { 
            role: 'system', 
            content: localConfig.systemPrompt || '你是一个专业的质量检测AI助手。请根据用户提供的描述进行质量分析，并返回JSON格式的结果。请用中文回答用户的问题。'
        },
        { 
            role: 'user', 
            content: `检测图片质量。图片: data:image/jpeg;base64,${compressedImage}`
        }
    ];
    
    console.log('📝 构建消息完成');
    
    // 3. 调用API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5分钟超时
    
    console.log('🌐 调用Ollama API...');
    const response = await fetch('http://localhost:11437/api/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
            model: localConfig.modelName,
            messages,
            stream: false,
            options: {
                temperature: localConfig.temperature,
                top_p: localConfig.topP,
                top_k: localConfig.topK,
                repeat_penalty: localConfig.repeatPenalty,
                num_predict: localConfig.maxTokens,
                num_ctx: 4096,
                num_gpu: 0,
                num_thread: 2,
                f16_kv: true,
                low_vram: true,
            }
        })
    });
    
    clearTimeout(timeoutId);
    console.log('📡 API响应状态:', response.status);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API错误: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('📄 收到响应数据');
    
    const content = data.message?.content;
    if (!content) {
        throw new Error('API返回空内容');
    }
    
    // 4. 解析JSON
    let result;
    try {
        result = JSON.parse(content);
        console.log('✅ JSON解析成功:', result);
    } catch (parseError) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
            console.log('✅ 提取JSON成功:', result);
        } else {
            throw new Error('无法解析AI返回的JSON格式');
        }
    }
    
    return result;
}

// 模拟前端检测流程
async function testFrontendFlow() {
    console.log('🚀 开始模拟前端AI检测流程...');
    
    try {
        // 模拟配置
        const localModelConfig = {
            modelName: 'minicpm-v:latest',
            systemPrompt: '你是一个专业的质量检测AI助手。请根据用户提供的描述进行质量分析，并返回JSON格式的结果。请用中文回答用户的问题。',
            temperature: 0.7,
            maxTokens: 1024,
            topP: 0.9,
            topK: 40,
            repeatPenalty: 1.1
        };
        
        // 模拟图片数据（base64）
        const mockImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; // 1x1像素图片
        
        console.log('📸 模拟图片数据:', mockImage.substring(0, 50) + '...');
        
        // 模拟检测流程
        console.log('🔄 开始检测流程...');
        const result = await analyzeImageLocalOptimized(mockImage, localModelConfig);
        
        console.log('🎉 检测完成！结果:', result);
        
        // 验证结果格式
        const requiredFields = ['overallQuality', 'score', 'reason', 'reasonKeywords', 'defects'];
        const missingFields = requiredFields.filter(field => !(field in result));
        
        if (missingFields.length === 0) {
            console.log('✅ 结果格式正确，包含所有必需字段');
        } else {
            console.log('⚠️  结果格式不完整，缺少字段:', missingFields);
        }
        
    } catch (error) {
        console.error('❌ 检测流程失败:', error.message);
        console.error('📍 错误详情:', error);
    }
}

// 运行测试
testFrontendFlow();
