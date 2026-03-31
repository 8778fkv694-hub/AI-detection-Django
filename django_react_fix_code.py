"""
AI检测Django项目修复脚本
用于修复模型识别不出自定义类别的问题
"""

# Django views.py 修复代码
DJANGO_VIEWS_FIX = '''
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
import os
from ultralytics import YOLO
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# 全局模型变量
detection_model = None

def load_model():
    """加载检测模型"""
    global detection_model
    if detection_model is None:
        # 模型路径 - 请根据实际情况修改
        model_path = os.path.join(settings.BASE_DIR, 'static', 'models', 'best.pt')
        
        # 如果模型不在static目录，尝试其他路径
        if not os.path.exists(model_path):
            model_path = os.path.join(settings.BASE_DIR, 'best.pt')
        
        if not os.path.exists(model_path):
            raise FileNotFoundError(f"模型文件不存在: {model_path}")
        
        logger.info(f"加载模型: {model_path}")
        detection_model = YOLO(model_path)
        
        # 验证模型类别
        expected_classes = ['filter', 'filtername', 'nsplogo', 'qrcode']
        model_classes = list(detection_model.names.values())
        
        logger.info(f"模型类别: {model_classes}")
        
        for expected_class in expected_classes:
            if expected_class not in model_classes:
                raise ValueError(f"模型缺少预期类别: {expected_class}")
        
        logger.info("模型验证通过")
    
    return detection_model

@csrf_exempt
@require_http_methods(["POST"])
def detect_objects(request):
    """检测目标"""
    try:
        # 加载模型
        model = load_model()
        
        # 获取上传的图片
        image_file = request.FILES.get('image')
        if not image_file:
            return JsonResponse({'error': '没有上传图片'}, status=400)
        
        logger.info(f"开始检测图片: {image_file.name}")
        
        # 进行检测
        results = model(image_file, conf=0.25)
        
        # 处理结果
        detections = []
        for result in results:
            if result.boxes is not None:
                for box in result.boxes:
                    detection = {
                        'class_id': int(box.cls[0]),
                        'class_name': model.names[int(box.cls[0])],
                        'confidence': float(box.conf[0]),
                        'bbox': box.xyxy[0].tolist()
                    }
                    detections.append(detection)
        
        logger.info(f"检测到 {len(detections)} 个目标")
        
        return JsonResponse({
            'success': True,
            'detections': detections,
            'model_classes': list(model.names.values()),
            'total_detections': len(detections)
        })
        
    except Exception as e:
        logger.error(f"检测失败: {str(e)}")
        return JsonResponse({'error': str(e)}, status=500)

@require_http_methods(["GET"])
def debug_model(request):
    """调试模型信息"""
    try:
        model = load_model()
        
        return JsonResponse({
            'success': True,
            'model_classes': list(model.names.values()),
            'class_count': len(model.names),
            'task_type': model.task,
            'expected_classes': ['filter', 'filtername', 'nsplogo', 'qrcode']
        })
        
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
'''

# Django settings.py 配置
DJANGO_SETTINGS_CONFIG = '''
# 在settings.py中添加以下配置

# 模型配置
MODEL_PATH = os.path.join(BASE_DIR, 'static', 'models', 'best.pt')
MODEL_CONFIDENCE = 0.25

# 静态文件配置
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'static'),
]

# 日志配置
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.FileHandler',
            'filename': 'django.log',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['file'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}
'''

# Django urls.py 配置
DJANGO_URLS_CONFIG = '''
# 在urls.py中添加以下路由

from django.urls import path
from . import views

urlpatterns = [
    path('api/detect/', views.detect_objects, name='detect_objects'),
    path('api/debug-model/', views.debug_model, name='debug_model'),
    # ... 其他路由
]
'''

# React组件修复代码
REACT_COMPONENT_FIX = '''
import React, { useState, useCallback } from 'react';

const DetectionComponent = () => {
    const [detections, setDetections] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // 类别名称映射
    const classNames = {
        0: 'filter',
        1: 'filtername', 
        2: 'nsplogo',
        3: 'qrcode'
    };

    const detectObjects = useCallback(async (imageFile) => {
        setLoading(true);
        setError(null);
        
        const formData = new FormData();
        formData.append('image', imageFile);
        
        try {
            const response = await fetch('/api/detect/', {
                method: 'POST',
                body: formData,
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('检测结果:', result);
                console.log('模型类别:', result.model_classes);
                console.log('检测数量:', result.total_detections);
                
                setDetections(result.detections);
            } else {
                setError(result.error || '检测失败');
            }
        } catch (error) {
            console.error('检测失败:', error);
            setError('网络错误: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const debugModel = useCallback(async () => {
        try {
            const response = await fetch('/api/debug-model/');
            const result = await response.json();
            
            if (result.success) {
                console.log('模型信息:', result);
                console.log('模型类别:', result.model_classes);
                console.log('预期类别:', result.expected_classes);
            } else {
                console.error('调试失败:', result.error);
            }
        } catch (error) {
            console.error('调试请求失败:', error);
        }
    }, []);

    return (
        <div>
            <h2>AI目标检测</h2>
            
            {/* 调试按钮 */}
            <button onClick={debugModel} style={{marginBottom: '10px'}}>
                调试模型信息
            </button>
            
            {/* 文件上传 */}
            <input 
                type="file" 
                accept="image/*" 
                onChange={(e) => {
                    if (e.target.files[0]) {
                        detectObjects(e.target.files[0]);
                    }
                }}
                disabled={loading}
            />
            
            {/* 加载状态 */}
            {loading && <p>检测中...</p>}
            
            {/* 错误信息 */}
            {error && <p style={{color: 'red'}}>错误: {error}</p>}
            
            {/* 检测结果 */}
            {detections.length > 0 && (
                <div>
                    <h3>检测结果 ({detections.length} 个目标):</h3>
                    {detections.map((detection, index) => (
                        <div key={index} style={{border: '1px solid #ccc', padding: '10px', margin: '5px'}}>
                            <p><strong>类别:</strong> {detection.class_name}</p>
                            <p><strong>置信度:</strong> {(detection.confidence * 100).toFixed(1)}%</p>
                            <p><strong>位置:</strong> {detection.bbox.map(coord => coord.toFixed(1)).join(', ')}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DetectionComponent;
'''

# 模型文件部署脚本
DEPLOYMENT_SCRIPT = '''
#!/bin/bash
# 模型文件部署脚本

echo "🚀 部署AI检测模型到Django项目"
echo "=================================="

# 创建模型目录
mkdir -p static/models

# 复制模型文件
echo "📁 复制模型文件..."
cp runs/detect/train/weights/best.pt static/models/
cp yolo_dataset_trainable/classes.txt static/models/
cp yolo_dataset_trainable/data.yaml static/models/

# 设置权限
chmod 644 static/models/*

echo "✅ 模型文件部署完成"
echo "📁 模型文件位置: static/models/"
echo "🎯 主要文件:"
echo "   - best.pt (模型权重)"
echo "   - classes.txt (类别列表)"
echo "   - data.yaml (数据集配置)"

echo ""
echo "💡 下一步:"
echo "1. 更新Django views.py中的模型路径"
echo "2. 重启Django服务器"
echo "3. 测试检测功能"
'''

if __name__ == "__main__":
    print("🔧 AI检测Django+React项目修复指南")
    print("=" * 50)
    
    print("\n📝 修复步骤:")
    print("1. 将模型文件复制到Django项目的static/models/目录")
    print("2. 更新Django views.py文件")
    print("3. 更新Django settings.py配置")
    print("4. 更新Django urls.py路由")
    print("5. 更新React组件代码")
    print("6. 重启Django服务器")
    print("7. 测试检测功能")
    
    print("\n📁 文件说明:")
    print("- DJANGO_VIEWS_FIX: Django后端检测代码")
    print("- DJANGO_SETTINGS_CONFIG: Django配置文件")
    print("- DJANGO_URLS_CONFIG: Django路由配置")
    print("- REACT_COMPONENT_FIX: React前端组件代码")
    print("- DEPLOYMENT_SCRIPT: 模型部署脚本")
