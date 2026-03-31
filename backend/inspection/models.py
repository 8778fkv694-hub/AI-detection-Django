from django.db import models
import uuid
import os

class AIConfig(models.Model):
    model_name = models.CharField(max_length=255)
    api_key = models.CharField(max_length=255, blank=True, default='')
    api_base_url = models.URLField(blank=True, default='')
    system_prompt = models.TextField(blank=True, default='')
    user_message = models.TextField(blank=True, default='', help_text="用户消息模板")
    compression_enabled = models.BooleanField(default=False)
    compression_quality = models.IntegerField(default=80)

    class Meta:
        verbose_name = 'AI配置'
        verbose_name_plural = 'AI配置'

    def __str__(self):
        return self.model_name or "AI Config"

class ModelVersion(models.Model):
    """模型版本管理"""
    MODEL_TYPES = [
        ('PPE_YOLO', 'PPE YOLO检测模型'),
        ('YOLO_GENERAL', '通用YOLO模型'),
        ('CUSTOM', '自定义模型'),
    ]
    
    STATUS_CHOICES = [
        ('DRAFT', '草稿'),
        ('ACTIVE', '激活'),
        ('DEPRECATED', '已弃用'),
        ('ARCHIVED', '已归档'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text="模型名称")
    version = models.CharField(max_length=50, help_text="版本号")
    model_type = models.CharField(max_length=20, choices=MODEL_TYPES, default='PPE_YOLO')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    
    # 模型文件信息
    model_file = models.FileField(upload_to='models/', help_text="模型文件")
    file_size = models.BigIntegerField(default=0, help_text="文件大小(字节)")
    file_hash = models.CharField(max_length=64, blank=True, help_text="文件哈希值")
    
    # 模型元数据
    description = models.TextField(blank=True, help_text="模型描述")
    author = models.CharField(max_length=100, blank=True, help_text="作者")
    tags = models.JSONField(default=list, help_text="标签列表")
    
    # 性能指标
    accuracy = models.FloatField(null=True, blank=True, help_text="准确率")
    precision = models.FloatField(null=True, blank=True, help_text="精确率")
    recall = models.FloatField(null=True, blank=True, help_text="召回率")
    f1_score = models.FloatField(null=True, blank=True, help_text="F1分数")
    
    # 技术信息
    framework_version = models.CharField(max_length=50, blank=True, help_text="框架版本")
    input_shape = models.CharField(max_length=100, blank=True, help_text="输入形状")
    output_shape = models.CharField(max_length=100, blank=True, help_text="输出形状")
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deployed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = '模型版本'
        verbose_name_plural = '模型版本'
        unique_together = ['name', 'version']
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} v{self.version}"
    
    def save(self, *args, **kwargs):
        # 自动计算文件大小
        if self.model_file and not self.file_size:
            try:
                self.file_size = self.model_file.size
            except:
                pass
        super().save(*args, **kwargs)
    
    @property
    def is_active(self):
        return self.status == 'ACTIVE'
    
    @property
    def file_size_mb(self):
        return round(self.file_size / (1024 * 1024), 2) if self.file_size else 0

class ModelDeployment(models.Model):
    """模型部署管理"""
    DEPLOYMENT_STATUS = [
        ('PENDING', '待部署'),
        ('DEPLOYING', '部署中'),
        ('ACTIVE', '已激活'),
        ('FAILED', '部署失败'),
        ('STOPPED', '已停止'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model_version = models.ForeignKey(ModelVersion, on_delete=models.CASCADE, related_name='deployments')
    environment = models.CharField(max_length=50, default='production', help_text="部署环境")
    status = models.CharField(max_length=20, choices=DEPLOYMENT_STATUS, default='PENDING')
    
    # 部署配置
    config = models.JSONField(default=dict, help_text="部署配置")
    resources = models.JSONField(default=dict, help_text="资源配置")
    
    # 部署信息
    deployed_by = models.CharField(max_length=100, blank=True, help_text="部署人员")
    deployed_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    
    # 性能监控
    request_count = models.IntegerField(default=0, help_text="请求次数")
    error_count = models.IntegerField(default=0, help_text="错误次数")
    avg_response_time = models.FloatField(default=0.0, help_text="平均响应时间(ms)")
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = '模型部署'
        verbose_name_plural = '模型部署'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.model_version.name} v{self.model_version.version} - {self.environment}"
    
    @property
    def success_rate(self):
        if self.request_count == 0:
            return 100.0
        return round((self.request_count - self.error_count) / self.request_count * 100, 2)

class ModelUpload(models.Model):
    """模型上传记录"""
    UPLOAD_STATUS = [
        ('UPLOADING', '上传中'),
        ('VALIDATING', '验证中'),
        ('SUCCESS', '上传成功'),
        ('FAILED', '上传失败'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # 文件上传字段
    model_file = models.FileField(upload_to='uploads/models/', null=True, blank=True, help_text="模型文件（.pt格式）")
    
    file_name = models.CharField(max_length=255, help_text="文件名")
    file_size = models.BigIntegerField(help_text="文件大小")
    upload_progress = models.IntegerField(default=0, help_text="上传进度(0-100)")
    status = models.CharField(max_length=20, choices=UPLOAD_STATUS, default='UPLOADING')
    
    # 上传信息
    uploaded_by = models.CharField(max_length=100, blank=True, help_text="上传人员")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    
    # 验证结果
    validation_result = models.JSONField(default=dict, help_text="验证结果")
    error_message = models.TextField(blank=True, help_text="错误信息")
    
    # 关联的模型版本
    model_version = models.ForeignKey(ModelVersion, null=True, blank=True, on_delete=models.SET_NULL)
    
    class Meta:
        verbose_name = '模型上传'
        verbose_name_plural = '模型上传'
        ordering = ['-uploaded_at']
    
    def __str__(self):
        return f"{self.file_name} - {self.status}"

class ModelPerformance(models.Model):
    """模型性能记录"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model_version = models.ForeignKey(ModelVersion, on_delete=models.CASCADE, related_name='performance_records')
    deployment = models.ForeignKey(ModelDeployment, on_delete=models.CASCADE, related_name='performance_records')
    
    # 性能指标
    timestamp = models.DateTimeField(auto_now_add=True)
    response_time = models.FloatField(help_text="响应时间(ms)")
    memory_usage = models.FloatField(help_text="内存使用(MB)")
    cpu_usage = models.FloatField(help_text="CPU使用率(%)")
    gpu_usage = models.FloatField(null=True, blank=True, help_text="GPU使用率(%)")
    
    # 请求信息
    request_count = models.IntegerField(default=1, help_text="请求次数")
    success_count = models.IntegerField(default=1, help_text="成功次数")
    error_count = models.IntegerField(default=0, help_text="错误次数")
    
    class Meta:
        verbose_name = '模型性能'
        verbose_name_plural = '模型性能'
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.model_version.name} - {self.timestamp}"

class ModelConfig(models.Model):
    """模型配置管理"""
    MODEL_TYPES = [
        ('PPE_YOLO', 'PPE YOLO检测模型'),
        ('YOLO_GENERAL', '通用YOLO模型'),
        ('FILTER_CORE', '滤芯检测模型'),
        ('WATER_PURIFIER', '净水机模型'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    model_type = models.CharField(max_length=20, choices=MODEL_TYPES, unique=True, help_text="模型类型")
    current_model_id = models.CharField(max_length=100, help_text="当前激活的模型ID")
    model_config = models.JSONField(default=dict, help_text="模型配置信息")
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = '模型配置'
        verbose_name_plural = '模型配置'
        ordering = ['model_type']
    
    def __str__(self):
        return f"{self.get_model_type_display()} - {self.current_model_id}"
    
    @classmethod
    def get_current_model(cls, model_type='PPE_YOLO'):
        """获取当前激活的模型ID"""
        try:
            config = cls.objects.get(model_type=model_type)
            return config.current_model_id
        except cls.DoesNotExist:
            # 如果数据库中没有配置，返回默认值
            return 'ppe_detection'
    
    @classmethod
    def set_current_model(cls, model_type='PPE_YOLO', model_id='ppe_detection', model_config=None):
        """设置当前激活的模型"""
        config, created = cls.objects.get_or_create(
            model_type=model_type,
            defaults={
                'current_model_id': model_id,
                'model_config': model_config or {}
            }
        )
        
        if not created:
            config.current_model_id = model_id
            if model_config:
                config.model_config = model_config
            config.save()
        
        return config

class ClassCategory(models.Model):
    """检测类别分类管理"""
    CATEGORY_CHOICES = [
        ('names', '名称类'),
        ('labels', '标签类'),
        ('logos', 'Logo类'),
        ('ppe', '劳保类'),
        ('materials', '材质类'),
        ('components', '组件类'),
        ('features', '特征类'),
        ('others', '其他类'),
    ]
    
    class_name = models.CharField(max_length=100, unique=True, help_text="类别英文名称（如：name_MCF, service_label）")
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='others', help_text="分类")
    chinese_name = models.CharField(max_length=100, blank=True, help_text="中文名称（可选，如果为空则从model_config.py获取）")
    display_order = models.IntegerField(default=0, help_text="显示顺序（数字越小越靠前）")
    is_active = models.BooleanField(default=True, help_text="是否启用")
    description = models.TextField(blank=True, help_text="描述")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = '检测类别分类'
        verbose_name_plural = '检测类别分类'
        ordering = ['category', 'display_order', 'class_name']
        indexes = [
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['class_name']),
        ]
    
    def __str__(self):
        return f"{self.class_name} ({self.get_category_display()})"
    
    def get_chinese_name_display(self):
        """获取中文名称（优先使用数据库中的，否则从model_config.py获取）"""
        if self.chinese_name:
            return self.chinese_name
        try:
            from .model_config import ppe_model_config
            return ppe_model_config.get_class_chinese_name(self.class_name)
        except:
            return self.class_name

class DefectType(models.Model):
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=100, blank=True, default='')
    description = models.TextField(blank=True, default='')
    severity_levels = models.JSONField(default=list)
    color = models.CharField(max_length=16, default='#FF00FF')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = '缺陷类型'
        verbose_name_plural = '缺陷类型'

    def __str__(self):
        return self.name

class DefectSeverity(models.Model):
    name = models.CharField(max_length=100, unique=True)
    level = models.IntegerField(unique=True)
    description = models.TextField(blank=True, default='')
    color = models.CharField(max_length=16, default='#FF0000')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = '缺陷严重等级'
        verbose_name_plural = '缺陷严重等级'

    def __str__(self):
        return f'{self.name}({self.level})'

class Standard(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    criteria = models.TextField(blank=True, default='')
    standard_image = models.ImageField(upload_to='standards/', blank=True, null=True)
    send_standard_image = models.BooleanField(default=False)
    override_system_prompt = models.TextField(blank=True, null=True)
    defect_types = models.TextField(blank=True, default='', help_text="JSON string of defect type configurations")

    class Meta:
        verbose_name = '检测标准'
        verbose_name_plural = '检测标准'

    def __str__(self):
        return self.name

class InspectionArea(models.Model):
    IMPORTANCE_CHOICES = [('低', '低'), ('中', '中'), ('高', '高')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    standard = models.ForeignKey(Standard, related_name='inspection_areas', on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    x = models.FloatField()
    y = models.FloatField()
    width = models.FloatField()
    height = models.FloatField()
    description = models.TextField(blank=True, default='')
    color = models.CharField(max_length=16, default='#00FFFF')
    defect_types = models.JSONField(default=list, help_text="List of defect type names")
    severity_threshold = models.CharField(max_length=20, default='一般')
    importance = models.CharField(max_length=4, choices=IMPORTANCE_CHOICES, default='中')

    class Meta:
        verbose_name = '检测区域'
        verbose_name_plural = '检测区域'

    def __str__(self):
        return f'{self.name}({self.standard.name})'

class InspectionResult(models.Model):
    QUALITY_CHOICES = [('合格', '合格'), ('不合格', '不合格'), ('需复检', '需复检'), ('存疑', '存疑')]
    DETECTION_TYPE_CHOICES = [
        ('cleanroom_ppe', '洁净用品检测'),
        ('standard_inspection', '标准检测'),
        ('general_quality', '通用质量检测'),
        ('ocr_inspection', 'OCR检测'),
        ('ocr_fusion_inspection', 'OCR融合检测'),
        ('kit_matching', '齐套化检测'),
        ('unknown', '未知类型')
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    timestamp = models.DateTimeField(auto_now_add=True)
    image = models.ImageField(upload_to='results/', null=True, blank=True)
    standard = models.ForeignKey(Standard, null=True, blank=True, on_delete=models.SET_NULL)
    overall_quality = models.CharField(max_length=10, choices=QUALITY_CHOICES)
    score = models.FloatField(default=0)
    reason = models.TextField(blank=True, default='')
    reason_keywords = models.TextField(blank=True, null=True)
    detection_type = models.CharField(max_length=25, choices=DETECTION_TYPE_CHOICES, default='unknown', help_text='检测类型')
    
    # 新增：OCR检测详细结果存储
    ocr_result = models.JSONField(null=True, blank=True, help_text='OCR检测详细结果')
    # 新增：二维码/条码检测结果存储
    barcode_result = models.JSONField(null=True, blank=True, help_text='二维码/条码检测详细结果')
    # 新增：LLM分析详细结果存储
    llm_result = models.JSONField(null=True, blank=True, help_text='LLM分析详细结果')
    # 新增：LLM返回的完整文字
    llm_full_text = models.TextField(null=True, blank=True, help_text='LLM返回的完整文字')
    # 新增：LLM/页面"详细结果"的结构化JSON
    llm_full_detail = models.JSONField(null=True, blank=True, help_text='详细结果结构化JSON')

    # 多页面多工序追踪字段
    process_stage_code = models.CharField(max_length=100, blank=True, default='', help_text='工序标识')
    process_stage_name = models.CharField(max_length=100, blank=True, default='', help_text='工序名称')
    page_instance_id = models.CharField(max_length=100, blank=True, default='', help_text='页面实例ID')
    camera_id = models.CharField(max_length=100, blank=True, default='', help_text='相机ID')

    fixture_qr = models.CharField(max_length=255, blank=True, default='', help_text='工装板二维码')
    fixture_qr_detected = models.BooleanField(default=False, help_text='是否识别到工装二维码')
    fixture_qr_source = models.CharField(max_length=20, blank=True, default='', help_text='工装二维码来源')
    fixture_qr_input_status = models.CharField(max_length=20, blank=True, default='', help_text='工装二维码输入状态')
    fixture_qr_confidence = models.FloatField(null=True, blank=True, help_text='工装二维码识别置信度')

    business_code = models.CharField(max_length=255, blank=True, default='', help_text='当前工序业务编码')
    business_code_type = models.CharField(max_length=100, blank=True, default='', help_text='业务编码类型')

    trace_conclusion = models.CharField(max_length=20, blank=True, default='', help_text='追踪结论')
    trace_conclusion_reason = models.TextField(blank=True, default='', help_text='追踪结论说明')
    fixture_rule_passed = models.BooleanField(null=True, blank=True, help_text='工装规则是否通过')
    fixture_rule_reason = models.TextField(blank=True, default='', help_text='工装规则说明')
    trace_rule_summary = models.TextField(blank=True, default='', help_text='规则摘要')
    trace_rule_details = models.JSONField(null=True, blank=True, default=list, help_text='规则明细')
    related_stages = models.JSONField(null=True, blank=True, default=list, help_text='已关联工序')
    trace_context = models.JSONField(null=True, blank=True, default=dict, help_text='追踪上下文')

    class Meta:
        verbose_name = '检测结果'
        verbose_name_plural = '检测结果'
        indexes = [
            models.Index(fields=['fixture_qr']),
            models.Index(fields=['fixture_qr', 'process_stage_code']),
        ]

    def __str__(self):
        return f'Result {self.id}'

class Defect(models.Model):
    SEVERITY_CHOICES = [('轻微', '轻微'), ('一般', '一般'), ('严重', '严重'), ('致命', '致命')]
    inspection_result = models.ForeignKey(InspectionResult, related_name='defects', on_delete=models.CASCADE)
    type = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES)
    confidence = models.FloatField(default=0.0)
    x = models.FloatField(null=True, blank=True)
    y = models.FloatField(null=True, blank=True)
    width = models.FloatField(null=True, blank=True)
    height = models.FloatField(null=True, blank=True)
    area_id = models.UUIDField(null=True, blank=True)

    class Meta:
        verbose_name = '缺陷记录'
        verbose_name_plural = '缺陷记录'

    def __str__(self):
        return f'{self.type}-{self.severity}'


class OCRKeywordTemplate(models.Model):
    """OCR关键词模板，供前端配置管理"""
    MATCH_MODE_CHOICES = [
        ('contains', '包含'),
        ('exact', '完全匹配'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text='模板名称')
    description = models.TextField(blank=True, default='', help_text='模板描述或备注')
    keywords = models.TextField(blank=True, default='', help_text='原始关键词字符串（逗号分隔）')
    keyword_configs = models.JSONField(default=list, blank=True, help_text='关键词配置列表')
    match_mode = models.CharField(max_length=20, choices=MATCH_MODE_CHOICES, default='contains')
    min_confidence = models.FloatField(default=0.5)
    is_active = models.BooleanField(default=True)
    created_by = models.CharField(max_length=100, blank=True, default='', help_text='创建人')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']
        verbose_name = 'OCR关键词模板'
        verbose_name_plural = 'OCR关键词模板'

    def __str__(self):
        return self.name


class OCRBarcodeTemplate(models.Model):
    """OCR二维码/条码模板，支持多二维码配置"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, help_text='模板名称')
    description = models.TextField(blank=True, default='', help_text='模板描述或备注')
    barcode_configs = models.JSONField(default=list, blank=True, help_text='二维码配置列表')
    is_active = models.BooleanField(default=True)
    created_by = models.CharField(max_length=100, blank=True, default='', help_text='创建人')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']
        verbose_name = 'OCR二维码模板'
        verbose_name_plural = 'OCR二维码模板'

    def __str__(self):
        return self.name


class FixtureTemplate(models.Model):
    """工装模板：定义工装码的前缀、正则表达式等参数"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True, help_text="工装名称")
    description = models.TextField(blank=True, default='')
    
    # 参数预设
    prefixes = models.CharField(max_length=500, blank=True, default='', help_text="码前缀(逗号分隔)")
    pattern  = models.CharField(max_length=500, blank=True, default='', help_text="正则表达式")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = '工装模板'
        verbose_name_plural = '工装模板'

    def __str__(self):
        return self.name


class StageRecipeTemplate(models.Model):
    """工序配方模版：将检测参数（工序、关键词、条码、OCR引擎等）封装为可复用的配方"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, default='')

    # 工装模版引用
    fixture_template = models.ForeignKey(
        FixtureTemplate, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='recipes',
        help_text="关联的工装模板"
    )

    # 工序 / 工装码
    process_stage_code   = models.CharField(max_length=100, blank=True, default='')
    process_stage_name   = models.CharField(max_length=255, blank=True, default='')
    fixture_enabled      = models.BooleanField(default=True)
    fixture_qr_prefixes  = models.CharField(max_length=500, blank=True, default='')
    fixture_qr_pattern   = models.CharField(max_length=500, blank=True, default='')
    camera_id            = models.CharField(max_length=100, blank=True, default='')
    current_model_id     = models.CharField(max_length=100, blank=True, default='')
    selected_targets     = models.JSONField(default=list, blank=True)
    non_grid_targets     = models.JSONField(default=list, blank=True, help_text='mini模式目标列表（不占格子，智能填充到空白区域）')
    target_confidences   = models.JSONField(default=dict, blank=True, help_text='每个目标独立置信度覆盖 {"防伪标签":0.8,"条码标签":0.5}')

    # 关键词检测（独立副本，与 OCRKeywordTemplate 无关联）
    enable_keyword_analysis = models.BooleanField(default=False)
    keywords             = models.TextField(blank=True, default='')
    keyword_configs      = models.JSONField(default=list, blank=True)
    keyword_match_mode   = models.CharField(max_length=20, default='contains')
    min_confidence       = models.FloatField(default=0.5)

    # 条码检测（独立副本，与 OCRBarcodeTemplate 无关联）
    enable_barcode_detection = models.BooleanField(default=False)
    barcode_configs      = models.JSONField(default=list, blank=True)

    # OCR 引擎
    ocr_engine_model     = models.CharField(max_length=20, default='auto')
    detection_confidence = models.FloatField(default=0.7)

    # 融合模式
    fusion_mode_enabled  = models.BooleanField(default=False)
    selected_standard_id = models.CharField(max_length=100, blank=True, null=True)

    # 检测流程参数
    auto_capture           = models.BooleanField(default=True)
    capture_delay_seconds  = models.FloatField(default=0)
    detection_interval     = models.FloatField(default=0.1)
    yolo_timeout_seconds   = models.FloatField(default=-1)
    yolo_detection_mode    = models.CharField(max_length=10, default='or')
    qr_detect_interval_seconds = models.FloatField(default=3)

    # 图像处理参数
    image_save_mode        = models.CharField(max_length=10, default='full')
    batch_processing_mode  = models.CharField(max_length=20, default='batch')
    batch_apply_rules      = models.BooleanField(default=True)
    compression_enabled    = models.BooleanField(default=False)
    compression_config     = models.JSONField(default=dict, blank=True)
    roi_weight_ratio       = models.JSONField(default=dict, blank=True)

    # 设备动作配置
    device_action_map      = models.JSONField(default=dict, blank=True, help_text='检测结果→设备指令映射 {"alarm":{"qualified":"GREEN\\n","unqualified":"RED\\n","idle":"OFF\\n"}}')
    required_device_types  = models.JSONField(default=list, blank=True, help_text='必需设备类型 ["alarm","scanner"]')

    # 元数据
    is_default  = models.BooleanField(default=False)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    created_by  = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        ordering = ['-updated_at']
        verbose_name = '工序配方模版'
        verbose_name_plural = '工序配方模版'

    def __str__(self):
        return self.name


class AnomalyRule(models.Model):
    """异常规则 — 关联到配方，定义何时触发异常"""
    ANOMALY_TYPE_CHOICES = [
        ('consecutive_fail', '连续不合格'),
        ('batch_anomaly', '批量异常'),
        ('trace_break', '追踪断裂'),
        ('timeout', '超时未检'),
        ('critical_defect', '关键缺陷'),
    ]
    SEVERITY_CHOICES = [
        ('warning', '警告'),
        ('critical', '严重'),
        ('emergency', '紧急'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    recipe = models.ForeignKey(
        StageRecipeTemplate, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='anomaly_rules'
    )
    process_stage_code = models.CharField(max_length=100, blank=True, default='')
    anomaly_type = models.CharField(max_length=20, choices=ANOMALY_TYPE_CHOICES)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='warning')
    thresholds = models.JSONField(default=dict, blank=True)
    auto_escalate_minutes = models.IntegerField(null=True, blank=True,
        help_text='超时未处理自动升级(分钟)')

    password_suspend = models.CharField(max_length=255, default='password')
    password_resolve = models.CharField(max_length=255, default='password')
    password_escalate = models.CharField(max_length=255, default='password')
    password_scrap = models.CharField(max_length=255, default='password')

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    external_notify_url = models.URLField(blank=True, default='')
    external_notify_payload_template = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = '异常规则'
        verbose_name_plural = '异常规则'
        indexes = [
            models.Index(fields=['anomaly_type', 'is_active']),
            models.Index(fields=['process_stage_code']),
        ]

    def __str__(self):
        return f'{self.name} ({self.get_anomaly_type_display()})'


class AnomalyRecord(models.Model):
    """异常记录 — 单条异常实例"""
    STATUS_CHOICES = [
        ('open', '待处理'),
        ('suspended', '挂起'),
        ('in_progress', '处理中'),
        ('resolved', '已关闭'),
        ('escalated', '已升级'),
        ('scrapped', '已报废'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule = models.ForeignKey(AnomalyRule, null=True, on_delete=models.SET_NULL, related_name='records')
    recipe = models.ForeignKey(StageRecipeTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name='anomaly_records')
    anomaly_type = models.CharField(max_length=20)
    severity = models.CharField(max_length=20, default='warning')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    process_stage_code = models.CharField(max_length=100, blank=True, default='')
    fixture_qr = models.CharField(max_length=255, blank=True, default='')
    title = models.CharField(max_length=500, default='')
    description = models.TextField(blank=True, default='')
    related_results = models.ManyToManyField('InspectionResult', blank=True, related_name='anomaly_records')
    trigger_snapshot = models.JSONField(default=dict, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    client_id = models.CharField(max_length=100, blank=True, default='')
    synced = models.BooleanField(default=True)

    class Meta:
        ordering = ['-opened_at']
        verbose_name = '异常记录'
        verbose_name_plural = '异常记录'
        indexes = [
            models.Index(fields=['status', 'anomaly_type']),
            models.Index(fields=['process_stage_code', 'status']),
            models.Index(fields=['fixture_qr']),
            models.Index(fields=['opened_at']),
        ]

    def __str__(self):
        return f'{self.title} [{self.get_status_display()}]'


class AnomalyResolution(models.Model):
    """异常处理记录 — 每次操作留痕"""
    ACTION_CHOICES = [
        ('suspend', '挂起'),
        ('resume', '恢复'),
        ('resolve', '关闭'),
        ('escalate', '升级'),
        ('scrap', '报废'),
        ('comment', '备注'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    anomaly = models.ForeignKey(AnomalyRecord, on_delete=models.CASCADE, related_name='resolutions')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    comment = models.TextField(blank=True, default='')
    operator = models.CharField(max_length=100, blank=True, default='')
    password_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '异常处理记录'
        verbose_name_plural = '异常处理记录'

    def __str__(self):
        return f'{self.get_action_display()} @ {self.created_at}'


class ProductRecipe(models.Model):
    """产品配方：包含多个工序配方"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, unique=True, help_text="产品配方名称")
    description = models.TextField(blank=True, default='', help_text="描述")
    stages = models.ManyToManyField(
        StageRecipeTemplate,
        through='ProductStage',
        related_name='product_recipes',
        help_text="关联的工序配方列表"
    )
    is_active = models.BooleanField(default=True)

    # FQC规则校验配置
    fqc_validation_enabled = models.BooleanField(default=False, help_text='是否启用FQC规则校验')
    fqc_validation_rules = models.JSONField(default=list, blank=True, help_text='FQC校验规则列表')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        ordering = ['-updated_at']
        verbose_name = '产品配方'
        verbose_name_plural = '产品配方'

    def __str__(self):
        return self.name


class ProductStage(models.Model):
    """产品与工序配方的关联表（含排序）"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product_recipe = models.ForeignKey(ProductRecipe, on_delete=models.CASCADE, related_name='product_stage_links')
    stage_recipe = models.ForeignKey(StageRecipeTemplate, on_delete=models.PROTECT, related_name='product_stage_links')
    order = models.IntegerField(default=0, help_text="工序顺序")
    is_fqc = models.BooleanField(default=False, help_text="是否为FQC（终检）工序")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'created_at']
        verbose_name = '产品工序关联'
        verbose_name_plural = '产品工序关联'
        unique_together = ('product_recipe', 'stage_recipe', 'order')

    def __str__(self):
        return f"{self.product_recipe.name} - {self.stage_recipe.name} ({self.order})"


class FQCRecord(models.Model):
    """FQC终检记录 — 汇总同一工装板上所有工序的检验结果"""
    FQC_RESULT_CHOICES = [
        ('合格', '合格'),
        ('不合格', '不合格'),
        ('存疑', '存疑'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fixture_qr = models.CharField(max_length=255, help_text='工装板二维码')
    product_recipe = models.ForeignKey(ProductRecipe, null=True, blank=True, on_delete=models.SET_NULL, related_name='fqc_records')
    product_recipe_name = models.CharField(max_length=255, blank=True, default='', help_text='产品配方名称快照')

    # FQC触发来源
    fqc_stage_code = models.CharField(max_length=100, blank=True, default='', help_text='触发FQC的工序标识')
    fqc_stage_name = models.CharField(max_length=100, blank=True, default='', help_text='触发FQC的工序名称')
    trigger_result = models.ForeignKey(InspectionResult, null=True, blank=True, on_delete=models.SET_NULL, related_name='fqc_trigger', help_text='触发FQC的检验记录')

    # 汇总结论
    overall_result = models.CharField(max_length=10, choices=FQC_RESULT_CHOICES, default='存疑')
    result_reason = models.TextField(blank=True, default='', help_text='汇总结论说明')

    # 各工序摘要（轻量JSON，不复制完整数据）
    stage_summary = models.JSONField(default=list, blank=True, help_text='各工序检验摘要 [{stageCode, stageName, resultId, quality, timestamp, businessCode}]')

    # 关联的检验记录（引用，不重复存储）
    related_inspections = models.ManyToManyField(InspectionResult, blank=True, related_name='fqc_records')

    # 流转记录
    trace_flow = models.JSONField(default=list, blank=True, help_text='工装板流转记录 [{stageCode, stageName, timestamp, operator, quality}]')
    trace_conclusion = models.CharField(max_length=20, blank=True, default='', help_text='追踪总结论')

    # 规则校验结果
    validation_passed = models.BooleanField(null=True, blank=True, help_text='规则校验是否通过（null=未启用校验）')
    validation_details = models.JSONField(default=list, blank=True, help_text='规则校验明细 [{ruleName, passed, expected, actual, message}]')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'FQC终检记录'
        verbose_name_plural = 'FQC终检记录'
        indexes = [
            models.Index(fields=['fixture_qr']),
            models.Index(fields=['fixture_qr', 'product_recipe']),
        ]

    def __str__(self):
        return f"FQC {self.fixture_qr} - {self.overall_result}"
