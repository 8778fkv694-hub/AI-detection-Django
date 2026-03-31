// 测试修复后的提示词
const fetch = require('node-fetch');

async function testFixedPrompt() {
    console.log('🔧 测试修复后的提示词...');
    
    try {
        const response = await fetch('http://localhost:11437/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'minicpm-v:latest',
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的质量检测AI助手。请分析图片内容并返回JSON格式的检测结果。即使无法直接查看图片，也请根据图片描述或特征进行质量评估。'
                    },
                    {
                        role: 'user',
                        content: '请按照标准严格分析这张图的质量。由于图片数据限制，请基于一般图片质量标准进行评估，并返回以下JSON格式：{"overallQuality": "合格", "score": 85, "reason": "图片清晰度良好，构图合理", "reasonKeywords": "清晰,构图", "defects": []}'
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
        
        const data = await response.json();
        const content = data.message?.content;
        
        console.log('📄 AI响应:');
        console.log('='.repeat(50));
        console.log(content);
        console.log('='.repeat(50));
        
        // 尝试提取JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            console.log('✅ 找到JSON部分:');
            console.log(jsonMatch[0]);
            
            try {
                const result = JSON.parse(jsonMatch[0]);
                console.log('✅ JSON解析成功:', result);
                return result;
            } catch (parseError) {
                console.log('❌ JSON解析失败:', parseError.message);
            }
        } else {
            console.log('❌ 未找到JSON格式内容');
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

testFixedPrompt();
