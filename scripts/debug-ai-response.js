// 调试AI响应内容
const fetch = require('node-fetch');

async function debugAIResponse() {
    console.log('🔍 调试AI响应内容...');
    
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
                        content: '你是一个专业的质量检测AI助手。请根据用户提供的描述进行质量分析，并返回JSON格式的结果。请用中文回答用户的问题。'
                    },
                    {
                        role: 'user',
                        content: '检测图片质量。图片: data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
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
        
        console.log('📄 完整响应内容:');
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
            } catch (parseError) {
                console.log('❌ JSON解析失败:', parseError.message);
            }
        } else {
            console.log('❌ 未找到JSON格式内容');
        }
        
    } catch (error) {
        console.error('❌ 调试失败:', error.message);
    }
}

debugAIResponse();
