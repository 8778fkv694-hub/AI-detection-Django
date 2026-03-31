
from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.urls import path
from django.shortcuts import render, redirect
from django.contrib import messages
from django.conf import settings
from django.http import HttpResponse
import os
import shutil
from datetime import datetime
from .models import (
    AIConfig, DefectType, DefectSeverity, Standard,
    InspectionArea, InspectionResult, Defect,
    ModelVersion, ModelDeployment, ModelUpload, ModelPerformance, ModelConfig,
    ClassCategory, OCRKeywordTemplate, OCRBarcodeTemplate
)
from .stream_models import StreamSource

@admin.register(AIConfig)
class AIConfigAdmin(admin.ModelAdmin):
    list_display = ['model_name', 'compression_enabled', 'compression_quality']
    list_editable = ['compression_enabled', 'compression_quality']
    search_fields = ['model_name']

@admin.register(DefectType)
class DefectTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'color', 'created_at']
    list_filter = ['category', 'created_at']
    search_fields = ['name', 'description']

@admin.register(DefectSeverity)
class DefectSeverityAdmin(admin.ModelAdmin):
    list_display = ['name', 'level', 'color', 'created_at']
    list_editable = ['level', 'color']
    ordering = ['level']

@admin.register(Standard)
class StandardAdmin(admin.ModelAdmin):
    list_display = ['name', 'send_standard_image']
    list_filter = ['send_standard_image']
    search_fields = ['name', 'criteria']
    readonly_fields = ['id']

@admin.register(InspectionArea)
class InspectionAreaAdmin(admin.ModelAdmin):
    list_display = ['name', 'standard', 'importance', 'severity_threshold']
    list_filter = ['standard', 'importance', 'severity_threshold']
    search_fields = ['name', 'description']
    readonly_fields = ['id']

@admin.register(InspectionResult)
class InspectionResultAdmin(admin.ModelAdmin):
    list_display = ['id', 'timestamp', 'standard', 'overall_quality', 'score', 'get_detection_type_display']
    list_filter = ['overall_quality', 'timestamp', 'standard', 'detection_type']
    readonly_fields = ['id', 'timestamp']
    date_hierarchy = 'timestamp'
    search_fields = ['id', 'reason', 'reason_keywords']
    
    fieldsets = (
        ('基本信息', {
            'fields': ('id', 'timestamp', 'detection_type', 'standard', 'overall_quality', 'score', 'reason', 'reason_keywords', 'image')
        }),
        ('OCR检测结果', {
            'fields': ('ocr_result',),
            'classes': ('collapse',)
        }),
        ('二维码/条码检测结果', {
            'fields': ('barcode_result',),
            'classes': ('collapse',)
        }),
        ('LLM分析结果', {
            'fields': ('llm_result', 'llm_full_text', 'llm_full_detail'),
            'classes': ('collapse',)
        }),
    )
    
    def get_detection_type_display(self, obj):
        """显示检测类型的中文名称"""
        return obj.get_detection_type_display()
    get_detection_type_display.short_description = '检测类型'

@admin.register(Defect)
class DefectAdmin(admin.ModelAdmin):
    list_display = ['type', 'severity', 'confidence', 'inspection_result']
    list_filter = ['type', 'severity', 'confidence']
    search_fields = ['type', 'description']

# 模型管理相关
@admin.register(ModelVersion)
class ModelVersionAdmin(admin.ModelAdmin):
    list_display = ['name', 'version', 'model_type', 'status', 'get_file_name', 'get_file_exists_status', 'get_related_config', 'file_size_mb', 'created_at']
    list_filter = ['model_type', 'status', 'created_at']
    search_fields = ['name', 'description', 'author']
    readonly_fields = ['id', 'created_at', 'updated_at', 'file_size', 'file_size_mb', 'get_file_name', 'get_file_exists_status', 'get_related_config', 'get_related_model_id']
    list_editable = ['status']
    
    def get_queryset(self, request):
        """只显示与4个确认模型相关的记录"""
        import os
        from .model_config import ppe_model_config
        
        # 获取4个确认模型的文件名
        confirmed_models = ['ppe_detection', 'yolo8_general', 'filter_core_detection', 'waterprifer_detection']
        confirmed_files = set()
        for model_id in confirmed_models:
            config = ppe_model_config.get_model_config(model_id)
            if config and config.get('file'):
                confirmed_files.add(config.get('file'))
        
        # 过滤出文件名匹配的记录
        qs = super().get_queryset(request)
        if confirmed_files:
            # 构建查询：文件名包含任一确认模型文件名
            from django.db.models import Q
            query = Q()
            for file_name in confirmed_files:
                query |= Q(model_file__icontains=file_name)
            qs = qs.filter(query)
        
        return qs
    
    fieldsets = (
        ('基本信息', {
            'fields': ('name', 'version', 'model_type', 'status', 'description', 'author', 'tags')
        }),
        ('关联配置', {
            'fields': ('get_related_config', 'get_related_model_id'),
        }),
        ('文件信息', {
            'fields': ('model_file', 'get_file_name', 'get_file_exists_status', 'file_size', 'file_hash'),
            'classes': ('collapse',)
        }),
        ('性能指标', {
            'fields': ('accuracy', 'precision', 'recall', 'f1_score'),
            'classes': ('collapse',)
        }),
        ('技术信息', {
            'fields': ('framework_version', 'input_shape', 'output_shape'),
            'classes': ('collapse',)
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at', 'deployed_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_file_name(self, obj):
        """显示文件名"""
        import os
        if obj.model_file:
            return os.path.basename(obj.model_file.name)
        return '-'
    get_file_name.short_description = '文件名'
    
    def get_file_exists_status(self, obj):
        """显示文件是否存在"""
        import os
        if obj.model_file:
            try:
                # 获取文件名（处理相对路径如models/xxx.pt）
                file_name = os.path.basename(obj.model_file.name)
                
                # 获取项目根目录（与model_config.py保持一致）
                # admin.py位于 backend/inspection/admin.py，需要向上3级到项目根目录
                current_file = os.path.abspath(__file__)
                repo_root = os.path.dirname(os.path.dirname(os.path.dirname(current_file)))
                
                # 按优先级查找文件路径（优先检查models目录，因为文件实际在那里）
                models_path = os.path.join(repo_root, 'models', file_name)
                ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', file_name)
                backend_path = os.path.join(os.path.dirname(os.path.dirname(current_file)), file_name)
                root_path = os.path.join(repo_root, file_name)
                
                # 也检查Django media目录（如果model_file有path属性）
                media_path = None
                if hasattr(obj.model_file, 'path'):
                    try:
                        media_path = obj.model_file.path
                    except:
                        pass
                
                # 按优先级选择存在的第一个路径（优先models目录）
                if os.path.exists(models_path):
                    size = os.path.getsize(models_path) / (1024 * 1024)  # MB
                    return f'✅ 存在 ({size:.2f} MB)'
                elif media_path and os.path.exists(media_path):
                    size = os.path.getsize(media_path) / (1024 * 1024)  # MB
                    return f'✅ 存在 ({size:.2f} MB)'
                elif os.path.exists(ppe_model_path):
                    size = os.path.getsize(ppe_model_path) / (1024 * 1024)  # MB
                    return f'✅ 存在 ({size:.2f} MB)'
                elif os.path.exists(backend_path):
                    size = os.path.getsize(backend_path) / (1024 * 1024)  # MB
                    return f'✅ 存在 ({size:.2f} MB)'
                elif os.path.exists(root_path):
                    size = os.path.getsize(root_path) / (1024 * 1024)  # MB
                    return f'✅ 存在 ({size:.2f} MB)'
                else:
                    return f'❌ 不存在'
            except Exception as e:
                return f'⚠️ 检查失败: {str(e)}'
        return '-'
    get_file_exists_status.short_description = '文件状态'
    
    def get_related_config(self, obj):
        """显示关联的ModelConfig"""
        import os
        try:
            from .models import ModelConfig
            from .model_config import ppe_model_config
            
            # 获取文件名
            if obj.model_file:
                file_name = os.path.basename(obj.model_file.name)
                
                # 通过文件名查找对应的模型ID
                for model_id, config in ppe_model_config.models.items():
                    if config.get('file') == file_name:
                        # 查找对应的ModelConfig
                        # 根据model_type匹配
                        model_type_mapping = {
                            'PPE_YOLO': 'PPE_YOLO',
                            'YOLO_GENERAL': 'YOLO_GENERAL',
                            'CUSTOM': 'CUSTOM',
                        }
                        # 如果model_id匹配，也查找
                        try:
                            model_config = ModelConfig.objects.get(current_model_id=model_id)
                            return f"✅ {model_config.get_model_type_display()}"
                        except ModelConfig.DoesNotExist:
                            # 尝试通过model_type匹配
                            model_type = model_type_mapping.get(obj.model_type)
                            if model_type:
                                try:
                                    model_config = ModelConfig.objects.get(model_type=model_type)
                                    return f"⚠️ {model_config.get_model_type_display()} (当前ID: {model_config.current_model_id})"
                                except ModelConfig.DoesNotExist:
                                    pass
                        break
        except Exception as e:
            return f'检查失败'
        return '-'
    get_related_config.short_description = '关联配置'
    
    def get_related_model_id(self, obj):
        """显示关联的模型ID"""
        import os
        try:
            from .model_config import ppe_model_config
            
            if obj.model_file:
                file_name = os.path.basename(obj.model_file.name)
                
                # 通过文件名查找对应的模型ID
                for model_id, config in ppe_model_config.models.items():
                    if config.get('file') == file_name:
                        return model_id
        except:
            pass
        return '-'
    get_related_model_id.short_description = '模型ID'

@admin.register(ModelDeployment)
class ModelDeploymentAdmin(admin.ModelAdmin):
    list_display = ['model_version', 'environment', 'status', 'deployed_at', 'success_rate']
    list_filter = ['status', 'environment', 'deployed_at']
    search_fields = ['model_version__name', 'deployed_by']
    readonly_fields = ['id', 'created_at', 'updated_at', 'success_rate']
    list_editable = ['status']
    
    fieldsets = (
        ('部署信息', {
            'fields': ('model_version', 'environment', 'status', 'deployed_by')
        }),
        ('配置信息', {
            'fields': ('config', 'resources'),
            'classes': ('collapse',)
        }),
        ('性能监控', {
            'fields': ('request_count', 'error_count', 'avg_response_time'),
            'classes': ('collapse',)
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at', 'deployed_at', 'stopped_at'),
            'classes': ('collapse',)
        }),
    )

@admin.register(ModelUpload)
class ModelUploadAdmin(admin.ModelAdmin):
    list_display = ['file_name', 'file_size', 'upload_progress', 'status', 'uploaded_at']
    list_filter = ['status', 'uploaded_at']
    search_fields = ['file_name', 'uploaded_by']
    readonly_fields = ['id', 'uploaded_at', 'completed_at', 'validation_result']
    
    fieldsets = (
        ('文件上传', {
            'fields': ('model_file',),
            'description': '💡 选择模型文件（.pt格式）进行上传。上传后会自动填充文件名和文件大小。'
        }),
        ('上传信息', {
            'fields': ('file_name', 'file_size', 'upload_progress', 'status', 'uploaded_by')
        }),
        ('验证结果', {
            'fields': ('validation_result', 'error_message', 'model_version'),
            'classes': ('collapse',)
        }),
        ('时间信息', {
            'fields': ('uploaded_at', 'completed_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """保存时自动填充文件名和文件大小"""
        if obj.model_file:
            # 如果上传了文件，自动填充文件名和大小
            if not obj.file_name or obj.file_name == '':
                obj.file_name = obj.model_file.name
            if not obj.file_size or obj.file_size == 0:
                try:
                    obj.file_size = obj.model_file.size
                except:
                    pass
        super().save_model(request, obj, form, change)

@admin.register(ModelPerformance)
class ModelPerformanceAdmin(admin.ModelAdmin):
    list_display = ['model_version', 'deployment', 'response_time', 'memory_usage', 'timestamp']
    list_filter = ['timestamp', 'deployment']
    search_fields = ['model_version__name']
    readonly_fields = ['id', 'timestamp']
    date_hierarchy = 'timestamp'
    
    fieldsets = (
        ('基本信息', {
            'fields': ('model_version', 'deployment', 'timestamp')
        }),
        ('性能指标', {
            'fields': ('response_time', 'memory_usage', 'cpu_usage', 'gpu_usage')
        }),
        ('请求统计', {
            'fields': ('request_count', 'success_count', 'error_count'),
            'classes': ('collapse',)
        }),
    )

@admin.register(ClassCategory)
class ClassCategoryAdmin(admin.ModelAdmin):
    """检测类别分类管理"""
    list_display = ['class_name', 'get_chinese_name', 'category', 'display_order', 'is_active', 'updated_at']
    list_filter = ['category', 'is_active', 'created_at']
    search_fields = ['class_name', 'chinese_name', 'description']
    list_editable = ['category', 'display_order', 'is_active']
    readonly_fields = ['created_at', 'updated_at', 'get_chinese_name_display_field']
    ordering = ['category', 'display_order', 'class_name']
    
    fieldsets = (
        ('基本信息', {
            'fields': ('class_name', 'get_chinese_name_display_field', 'chinese_name', 'category', 'display_order', 'is_active')
        }),
        ('详细信息', {
            'fields': ('description',),
            'classes': ('collapse',)
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_chinese_name(self, obj):
        """显示中文名称"""
        return obj.get_chinese_name_display()
    get_chinese_name.short_description = '中文名称'
    
    def get_chinese_name_display_field(self, obj):
        """显示中文名称（只读字段）"""
        return obj.get_chinese_name_display()
    get_chinese_name_display_field.short_description = '中文名称（自动）'
    
    actions = ['sync_from_model_config', 'reset_to_defaults']
    
    def sync_from_model_config(self, request, queryset):
        """从 model_config.py 同步分类信息"""
        from .model_config import ppe_model_config
        
        # 获取所有模型的类别
        all_classes = set()
        for config in ppe_model_config.models.values():
            all_classes.update(config.get('classes', []))
        
        created_count = 0
        updated_count = 0
        
        for class_name in all_classes:
            # 从 model_config.py 获取分类
            category = ppe_model_config.get_class_category(class_name)
            chinese_name = ppe_model_config.get_class_chinese_name(class_name)
            
            # 创建或更新记录
            obj, created = ClassCategory.objects.get_or_create(
                class_name=class_name,
                defaults={
                    'category': category,
                    'chinese_name': chinese_name,
                }
            )
            
            if created:
                created_count += 1
            else:
                # 如果数据库中没有中文名称，则更新
                if not obj.chinese_name:
                    obj.chinese_name = chinese_name
                    obj.save()
                    updated_count += 1
        
        self.message_user(request, f'同步完成：创建 {created_count} 条，更新 {updated_count} 条')
    sync_from_model_config.short_description = '从 model_config.py 同步分类信息'
    
    def reset_to_defaults(self, request, queryset):
        """重置为 model_config.py 中的默认分类"""
        from .model_config import ppe_model_config
        
        updated_count = 0
        for obj in queryset:
            default_category = ppe_model_config.get_class_category(obj.class_name)
            default_chinese_name = ppe_model_config.get_class_chinese_name(obj.class_name)
            
            obj.category = default_category
            if not obj.chinese_name:
                obj.chinese_name = default_chinese_name
            obj.save()
            updated_count += 1
        
        self.message_user(request, f'已重置 {updated_count} 条记录为默认分类')
    reset_to_defaults.short_description = '重置为默认分类'

@admin.register(ModelConfig)
class ModelConfigAdmin(admin.ModelAdmin):
    """
    模型配置管理
    
    前端模型列表与ModelConfig的对应关系：
    1. PPE检测专用模型 (ppe_detection) -> PPE_YOLO类型
    2. YOLO8通用检测模型 (yolo8_general) -> YOLO_GENERAL类型
    3. 滤芯专用检测模型 (filter_core_detection) -> FILTER_CORE类型
    4. 净水机专用检测模型 (waterprifer_detection) -> WATER_PURIFIER类型
    
    注意：前端显示6个模型，但ModelConfig只配置4个类型，每个类型可以选择不同的模型ID。
    """
    list_display = ['get_model_type_display_name', 'current_model_id', 'get_model_file_name', 'get_file_exists_status', 'get_frontend_model_name', 'get_related_version', 'created_at', 'updated_at']
    list_filter = ['model_type', 'created_at']
    search_fields = ['model_type', 'current_model_id']
    readonly_fields = ['id', 'created_at', 'updated_at', 'get_model_file_name', 'get_file_exists_status', 'get_model_file_path', 'get_frontend_model_name', 'get_model_mapping_info', 'get_related_version']
    list_editable = ['current_model_id']
    
    fieldsets = (
        ('模型配置', {
            'fields': ('model_type', 'current_model_id', 'get_frontend_model_name')
        }),
        ('关联版本', {
            'fields': ('get_related_version',),
        }),
        ('对应关系说明', {
            'fields': ('get_model_mapping_info',),
            'classes': ('collapse',)
        }),
        ('文件信息', {
            'fields': ('get_model_file_name', 'get_file_exists_status', 'get_model_file_path'),
        }),
        ('配置详情', {
            'fields': ('model_config',),
            'classes': ('collapse',)
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def get_model_type_display_name(self, obj):
        """显示模型类型的中文名称"""
        return obj.get_model_type_display()
    get_model_type_display_name.short_description = '模型类型'
    
    def get_model_file_name(self, obj):
        """显示对应的模型文件名"""
        try:
            from .model_config import ppe_model_config
            config = ppe_model_config.get_model_config(obj.current_model_id)
            if config:
                return config.get('file', '未知')
        except:
            pass
        return '未知'
    get_model_file_name.short_description = '模型文件'
    
    def get_file_exists_status(self, obj):
        """显示文件是否存在"""
        import os
        try:
            from .model_config import ppe_model_config
            config = ppe_model_config.get_model_config(obj.current_model_id)
            if config:
                model_file = config.get('file')
                # 获取项目根目录（与model_config.py保持一致）
                repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                
                # 按优先级查找模型文件路径（与model_config.py保持一致）
                models_dir_path = os.path.join(repo_root, 'models', model_file)
                ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', model_file)
                backend_dir_model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), model_file)
                root_model_path = os.path.join(repo_root, model_file)
                
                # 按优先级选择存在的第一个路径
                if os.path.exists(models_dir_path):
                    model_path = models_dir_path
                elif os.path.exists(ppe_model_path):
                    model_path = ppe_model_path
                elif os.path.exists(backend_dir_model_path):
                    model_path = backend_dir_model_path
                elif os.path.exists(root_model_path):
                    model_path = root_model_path
                else:
                    model_path = models_dir_path
                
                if os.path.exists(model_path):
                    size = os.path.getsize(model_path) / (1024 * 1024)  # MB
                    return f'✅ 存在 ({size:.2f} MB)'
                else:
                    return f'❌ 不存在 (检查路径: {model_path})'
        except Exception as e:
            return f'⚠️ 检查失败: {str(e)}'
    get_file_exists_status.short_description = '文件状态'
    
    def get_model_file_path(self, obj):
        """显示模型文件的完整路径"""
        import os
        try:
            from .model_config import ppe_model_config
            config = ppe_model_config.get_model_config(obj.current_model_id)
            if config:
                model_file = config.get('file')
                # 获取项目根目录（与model_config.py保持一致）
                repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                
                # 按优先级查找模型文件路径
                models_dir_path = os.path.join(repo_root, 'models', model_file)
                ppe_model_path = os.path.join(repo_root, 'PPE_detection_YOLO', model_file)
                backend_dir_model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), model_file)
                root_model_path = os.path.join(repo_root, model_file)
                
                # 按优先级选择存在的第一个路径
                if os.path.exists(models_dir_path):
                    return models_dir_path
                elif os.path.exists(ppe_model_path):
                    return ppe_model_path
                elif os.path.exists(backend_dir_model_path):
                    return backend_dir_model_path
                elif os.path.exists(root_model_path):
                    return root_model_path
                else:
                    return models_dir_path  # 返回默认路径
        except Exception as e:
            return f'路径计算失败: {str(e)}'
    get_model_file_path.short_description = '文件路径'
    
    def get_frontend_model_name(self, obj):
        """显示前端对应的模型名称"""
        try:
            from .model_config import ppe_model_config
            config = ppe_model_config.get_model_config(obj.current_model_id)
            if config:
                return config.get('name', '未知')
        except:
            pass
        return '未知'
    get_frontend_model_name.short_description = '前端模型名称'
    
    def get_model_mapping_info(self, obj):
        """显示模型对应关系说明"""
        mapping_info = {
            'PPE_YOLO': '对应前端"PPE检测专用模型" (ppe_detection)',
            'YOLO_GENERAL': '对应前端"YOLO8通用检测模型" (yolo8_general)',
            'FILTER_CORE': '对应前端"滤芯专用检测模型" (filter_core_detection)',
            'WATER_PURIFIER': '对应前端"净水机专用检测模型" (waterprifer_detection)',
        }
        info = mapping_info.get(obj.model_type, '未知类型')
        return f'{info}\n\n前端显示6个模型，但ModelConfig只配置4个类型。\n每个类型可以选择不同的模型ID作为当前激活的模型。'
    get_model_mapping_info.short_description = '对应关系说明'
    
    def get_related_version(self, obj):
        """显示关联的ModelVersion"""
        import os
        try:
            from .models import ModelVersion
            from .model_config import ppe_model_config
            
            # 获取当前模型ID对应的文件
            config = ppe_model_config.get_model_config(obj.current_model_id)
            if config:
                model_file = config.get('file')
                file_name = os.path.basename(model_file) if model_file else None
                
                if file_name:
                    # 查找对应的ModelVersion
                    # 首先尝试精确匹配文件名
                    versions = ModelVersion.objects.filter(
                        model_file__icontains=file_name
                    )
                    
                    # 如果没找到，尝试通过model_type匹配
                    if not versions.exists():
                        model_type_mapping = {
                            'PPE_YOLO': 'PPE_YOLO',
                            'YOLO_GENERAL': 'YOLO_GENERAL',
                            'FILTER_CORE': 'CUSTOM',  # 滤芯在ModelVersion中归类为CUSTOM
                            'WATER_PURIFIER': 'CUSTOM',  # 净水机在ModelVersion中归类为CUSTOM
                        }
                        model_type = model_type_mapping.get(obj.model_type)
                        if model_type:
                            versions = ModelVersion.objects.filter(model_type=model_type, status='ACTIVE')
                    
                    if versions.exists():
                        version_list = []
                        for v in versions[:3]:  # 最多显示3个
                            version_list.append(f"• {v.name} v{v.version} ({v.get_status_display()})")
                        if versions.count() > 3:
                            version_list.append(f"... 还有 {versions.count() - 3} 个版本")
                        return "\n".join(version_list) if version_list else "无关联版本"
                    else:
                        # 检查文件是否存在，但未在ModelVersion中注册
                        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                        models_path = os.path.join(repo_root, 'models', file_name)
                        if os.path.exists(models_path):
                            size = os.path.getsize(models_path) / (1024 * 1024)  # MB
                            return f"⚠️ 文件存在但未注册 ({size:.2f} MB)\n💡 建议：在Model versions中创建记录"
                        else:
                            return "⚠️ 未找到关联的ModelVersion记录"
        except Exception as e:
            return f'检查失败: {str(e)}'
        return '-'
    get_related_version.short_description = '关联版本'


# 流媒体管理
@admin.register(StreamSource)
class StreamSourceAdmin(admin.ModelAdmin):
    """流媒体源管理"""
    list_display = ['name', 'stream_type', 'display_url', 'status', 'enabled', 'is_active', 'created_at']
    list_filter = ['stream_type', 'status', 'enabled', 'created_at']
    search_fields = ['name', 'url']
    readonly_fields = ['id', 'created_at', 'updated_at', 'last_connected_at', 'last_error', 'error_count', 'display_url', 'is_active']
    list_editable = ['enabled']
    
    fieldsets = (
        ('基本信息', {
            'fields': ('name', 'stream_type', 'url', 'enabled')
        }),
        ('认证信息', {
            'fields': ('username', 'password'),
            'classes': ('collapse',)
        }),
        ('连接配置', {
            'fields': ('auto_reconnect', 'reconnect_interval')
        }),
        ('状态信息', {
            'fields': ('status', 'is_active', 'last_connected_at', 'last_error', 'error_count'),
            'classes': ('collapse',)
        }),
        ('时间信息', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(OCRKeywordTemplate)
class OCRKeywordTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'match_mode', 'min_confidence', 'is_active', 'updated_at']
    list_filter = ['match_mode', 'is_active', 'updated_at']
    search_fields = ['name', 'description', 'keywords']
    readonly_fields = ['id', 'created_at', 'updated_at']
    ordering = ['-updated_at']


@admin.register(OCRBarcodeTemplate)
class OCRBarcodeTemplateAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'updated_at']
    list_filter = ['is_active', 'updated_at']
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at']
    ordering = ['-updated_at']


# 自定义Admin视图函数
@staff_member_required
def backup_database_view(request):
    """备份数据库"""
    if request.method == 'POST':
        try:
            db_config = settings.DATABASES['default']
            db_engine = db_config['ENGINE']
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

            if 'sqlite3' in db_engine:
                # SQLite数据库备份
                db_path = db_config['NAME']
                backup_dir = os.path.join(settings.BASE_DIR, 'backups')
                os.makedirs(backup_dir, exist_ok=True)

                backup_filename = f'db_backup_{timestamp}.sqlite3'
                backup_path = os.path.join(backup_dir, backup_filename)

                # 复制数据库文件
                shutil.copy2(db_path, backup_path)

                messages.success(request, f'数据库备份成功！文件保存在: {backup_path}')

            elif 'postgresql' in db_engine:
                # PostgreSQL数据库备份
                backup_dir = os.path.join(settings.BASE_DIR, 'backups')
                os.makedirs(backup_dir, exist_ok=True)

                backup_filename = f'db_backup_{timestamp}.sql'
                backup_path = os.path.join(backup_dir, backup_filename)

                # 构建pg_dump命令
                db_name = db_config['NAME']
                db_user = db_config['USER']
                db_host = db_config['HOST']
                db_port = db_config['PORT']
                db_password = db_config['PASSWORD']

                # 设置环境变量以避免密码提示
                env = os.environ.copy()
                env['PGPASSWORD'] = db_password

                import subprocess
                cmd = [
                    'pg_dump',
                    '-h', db_host,
                    '-p', str(db_port),
                    '-U', db_user,
                    '-F', 'c',
                    '-f', backup_path,
                    db_name
                ]

                subprocess.run(cmd, env=env, check=True)
                messages.success(request, f'数据库备份成功！文件保存在: {backup_path}')
            else:
                messages.error(request, f'不支持的数据库类型: {db_engine}')
                return redirect('admin:index')

            # 备份成功后，跳转到确认页面
            return redirect('admin_backup_confirm')

        except Exception as e:
            messages.error(request, f'备份失败: {str(e)}')
            return redirect('admin:index')

    # GET请求，显示备份确认页面
    from django.contrib.admin import site as admin_site
    context = {
        **admin_site.each_context(request),
        'title': '备份数据库',
        'db_engine': settings.DATABASES['default']['ENGINE'],
    }
    return render(request, 'admin/backup_database.html', context)


@staff_member_required
def backup_confirm_view(request):
    """备份完成后的确认页面"""
    from django.contrib.admin import site as admin_site
    context = {
        **admin_site.each_context(request),
        'title': '备份完成',
    }
    return render(request, 'admin/backup_confirm.html', context)


@staff_member_required
def clear_history_view(request):
    """清除历史数据"""
    if request.method == 'POST':
        try:
            # 统计要删除的数据量
            inspection_count = InspectionResult.objects.count()
            defect_count = Defect.objects.count()
            performance_count = ModelPerformance.objects.count()

            # 删除历史数据
            InspectionResult.objects.all().delete()
            Defect.objects.all().delete()
            ModelPerformance.objects.all().delete()

            messages.success(
                request,
                f'历史数据清除成功！共删除: {inspection_count}条检测结果, '
                f'{defect_count}条缺陷记录, {performance_count}条性能记录'
            )
            return redirect('admin:index')

        except Exception as e:
            messages.error(request, f'清除失败: {str(e)}')
            return redirect('admin:index')

    # GET请求，显示确认页面
    from django.contrib.admin import site as admin_site
    context = {
        **admin_site.each_context(request),
        'title': '清除历史数据',
        'inspection_count': InspectionResult.objects.count(),
        'defect_count': Defect.objects.count(),
        'performance_count': ModelPerformance.objects.count(),
    }
    return render(request, 'admin/clear_history.html', context)
