// 测试AI检测功能
const fetch = require('node-fetch');

async function testAIDetection() {
    console.log('🧪 开始测试AI检测功能...');
    
    try {
        // 1. 测试代理服务器状态
        console.log('1️⃣ 检查代理服务器状态...');
        const statusResponse = await fetch('http://localhost:11437/api/tags');
        if (!statusResponse.ok) {
            throw new Error(`代理服务器不可用: ${statusResponse.status}`);
        }
        const statusData = await statusResponse.json();
        console.log('✅ 代理服务器正常，可用模型:', statusData.models.map(m => m.name));
        
        // 2. 测试简单聊天
        console.log('2️⃣ 测试简单聊天...');
        const chatResponse = await fetch('http://localhost:11437/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'minicpm-v:latest',
                messages: [
                    {
                        role: 'user',
                        content: '你好，请简单回复确认连接正常'
                    }
                ],
                stream: false
            })
        });
        
        if (!chatResponse.ok) {
            throw new Error(`聊天API失败: ${chatResponse.status}`);
        }
        const chatData = await chatResponse.json();
        console.log('✅ 聊天API正常，回复:', chatData.message?.content?.substring(0, 50) + '...');
        
        // 3. 测试图片分析（模拟）
        console.log('3️⃣ 测试图片分析...');
        const analysisResponse = await fetch('http://localhost:11437/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'minicpm-v:latest',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的质量检测AI助手。请根据用户提供的描述进行质量分析，并返回JSON格式的结果。请用中文回答用户的问题。'
                    },
                    {
                        role: 'user',
                        content: '请按照标准严格分析这张图的质量，返回JSON格式：{"overallQuality": "合格/不合格/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词", "defects": []}'
                    }
                ],
                stream: false,
                options: {
                    temperature: 0.7,
                    top_p: 0.9,
                    top_k: 40,
                    repeat_penalty: 1.1,
                    num_predict: 1024
                }
            })
        });
        
        if (!analysisResponse.ok) {
            throw new Error(`分析API失败: ${analysisResponse.status}`);
        }
        const analysisData = await analysisResponse.json();
        console.log('✅ 分析API正常，回复:', analysisData.message?.content?.substring(0, 100) + '...');
        
        // 尝试解析JSON
        try {
            const jsonMatch = analysisData.message?.content?.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                console.log('✅ JSON解析成功:', result);
            } else {
                console.log('⚠️  无法提取JSON格式');
            }
        } catch (parseError) {
            console.log('⚠️  JSON解析失败:', parseError.message);
        }
        
        console.log('🎉 所有测试通过！AI检测功能正常');
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        process.exit(1);
    }
}

// 运行测试
testAIDetection();
