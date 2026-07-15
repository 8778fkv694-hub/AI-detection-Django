
from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from inspection.views import (
    AIConfigViewSet, DefectTypeViewSet, DefectSeverityViewSet,
    StandardViewSet, InspectionAreaViewSet, InspectionResultViewSet,
    ModelVersionViewSet, ModelDeploymentViewSet, ModelUploadViewSet, ModelPerformanceViewSet,
    OCRKeywordTemplateViewSet, OCRBarcodeTemplateViewSet, StageRecipeTemplateViewSet,
    FixtureTemplateViewSet,
    ProductRecipeViewSet, FQCRecordViewSet,
    sync_status_api, force_sync_api
)
from inspection.health_system_api import send_report_to_health_system, get_health_system_config, scan_health_system
from inspection.ollama_api import start_ollama_service, stop_ollama_service, ollama_service_status, ollama_chat
# OCR功能
from inspection.ocr_api import ocr_extract, ocr_status, ocr_set_model
# 批处理检测功能
from inspection.batch_detection_views import batch_ocr_detection, roi_cache_stats, cleanup_roi_cache
# ROI缓存功能
from inspection.roi_cache_api import cache_roi
# 微信二维码检测功能
from inspection.wechat_qr_api import wechat_qr_detect, wechat_qr_detect_with_retry, wechat_qr_status
from inspection.barcode_api import barcode_detect
from inspection.ai_api import ai_analyze
# 追踪判定接口
from inspection.product_trace_api import product_trace_evaluate
# 异常管理
from inspection.anomaly_views import AnomalyRuleViewSet, AnomalyRecordViewSet
# 图片预处理功能
from inspection import preprocessing_urls
# 流媒体功能
from inspection.stream_api import StreamSourceViewSet, stream_manager_status, stop_all_streams, restart_all_streams
from inspection.mjpeg_view import mjpeg_stream
from inspection.mjpeg_passthrough import mjpeg_passthrough_view
# Admin自定义视图
from inspection.admin import backup_database_view, backup_confirm_view, clear_history_view
from django.conf import settings
from django.conf.urls.static import static

router = DefaultRouter()
router.register(r'ai-configs', AIConfigViewSet, basename='aiconfig')
router.register(r'defect-types', DefectTypeViewSet, basename='defecttype')
router.register(r'defect-severities', DefectSeverityViewSet, basename='defectseverity')
router.register(r'standards', StandardViewSet, basename='standard')
router.register(r'inspection-areas', InspectionAreaViewSet, basename='inspectionarea')
router.register(r'results', InspectionResultViewSet, basename='inspectionresult')

# 模型管理路由
router.register(r'model-versions', ModelVersionViewSet, basename='modelversion')
router.register(r'model-deployments', ModelDeploymentViewSet, basename='modeldeployment')
router.register(r'model-uploads', ModelUploadViewSet, basename='modelupload')
router.register(r'model-performance', ModelPerformanceViewSet, basename='modelperformance')
router.register(r'ocr-keyword-templates', OCRKeywordTemplateViewSet, basename='ocrkeywordtemplate')
router.register(r'ocr-barcode-templates', OCRBarcodeTemplateViewSet, basename='ocrbarcodetemplate')
router.register(r'stage-recipes', StageRecipeTemplateViewSet, basename='stagerecipe')
router.register(r'fixture-templates', FixtureTemplateViewSet, basename='fixturetemplate')
router.register(r'product-recipes', ProductRecipeViewSet, basename='productrecipe')
router.register(r'fqc-records', FQCRecordViewSet, basename='fqcrecord')

# 异常管理路由
router.register(r'anomaly-rules', AnomalyRuleViewSet, basename='anomalyrule')
router.register(r'anomaly-records', AnomalyRecordViewSet, basename='anomalyrecord')

# 流媒体管理路由
router.register(r'streams', StreamSourceViewSet, basename='stream')

urlpatterns = [
    path('admin/', admin.site.urls),
    # Admin自定义功能
    path('admin/backup-database/', backup_database_view, name='admin_backup_database'),
    path('admin/backup-confirm/', backup_confirm_view, name='admin_backup_confirm'),
    path('admin/clear-history/', clear_history_view, name='admin_clear_history'),
    # 数据同步状态检查API
    path('api/sync/status/', sync_status_api, name='sync_status'),
    path('api/sync/force/', force_sync_api, name='force_sync'),
    
    # 健康系统集成API
    path('api/reports/send-to-health-system/', send_report_to_health_system, name='send_report_to_health_system'),
    path('api/reports/health-system-config/', get_health_system_config, name='get_health_system_config'),
    path('api/reports/scan-health-system/', scan_health_system, name='scan_health_system'),
    
    # Ollama服务管理API
    path('api/ollama/start/', start_ollama_service, name='start_ollama_service'),
    path('api/ollama/stop/', stop_ollama_service, name='stop_ollama_service'),
    path('api/ollama/status/', ollama_service_status, name='ollama_service_status'),
    path('api/ollama/chat/', ollama_chat, name='ollama_chat'),
    
    # OCR文字识别API
    path('api/ocr/extract/', ocr_extract, name='ocr_extract'),
    path('api/ocr/status/', ocr_status, name='ocr_status'),
    path('api/ocr/set-model/', ocr_set_model, name='ocr_set_model'),
    
    # 批处理检测API
    path('api/ocr/batch-detection/', batch_ocr_detection, name='batch_ocr_detection'),
    path('api/ocr/roi-cache-stats/', roi_cache_stats, name='roi_cache_stats'),
    path('api/ocr/cleanup-roi-cache/', cleanup_roi_cache, name='cleanup_roi_cache'),
    
    # ROI缓存API
    path('api/yolo/cache-roi/', cache_roi, name='cache_roi'),
    
    # 微信二维码检测API
    path('api/wechat-qr/detect/', wechat_qr_detect, name='wechat_qr_detect'),
    path('api/wechat-qr/detect-with-retry/', wechat_qr_detect_with_retry, name='wechat_qr_detect_with_retry'),
    path('api/wechat-qr/status/', wechat_qr_status, name='wechat_qr_status'),
    # 条码/二维码融合检测API
    path('api/barcode/detect/', barcode_detect, name='barcode_detect'),
    # 生产环境在线多模态分析（不依赖开发期 Node 辅助进程）
    path('api/ai/analyze', ai_analyze, name='ai_analyze'),
    path('api/ai/analyze/', ai_analyze, name='ai_analyze_slash'),
    # 工装追踪判定接口（预查，不保存结果）
    path('api/product-trace/evaluate/', product_trace_evaluate, name='product_trace_evaluate'),
    
    # 图片预处理API
    path('api/image-preprocessing/', include(preprocessing_urls)),
    
    # 流媒体管理API
    path('api/streams/manager/status/', stream_manager_status, name='stream_manager_status'),
    path('api/streams/manager/stop-all/', stop_all_streams, name='stop_all_streams'),
    path('api/streams/manager/restart-all/', restart_all_streams, name='restart_all_streams'),
    
    # 持续检测循环API
    path('api/streams/<str:stream_id>/detections/', __import__('inspection.detection_api', fromlist=['']).detection_latest_view, name='detection_latest'),
    path('api/streams/<str:stream_id>/snapshot/', __import__('inspection.detection_api', fromlist=['']).detection_snapshot_view, name='detection_snapshot'),
    path('api/streams/<str:stream_id>/detection-loop/start/', __import__('inspection.detection_api', fromlist=['']).detection_loop_start, name='detection_loop_start'),
    path('api/streams/<str:stream_id>/detection-loop/stop/', __import__('inspection.detection_api', fromlist=['']).detection_loop_stop, name='detection_loop_stop'),
    path('api/streams/detection-loop/status/', __import__('inspection.detection_api', fromlist=['']).detection_loop_status, name='detection_loop_status_all'),

    # MJPEG 直推：本地 USB 摄像头走 ffmpeg passthrough 零编解码；其他源 fallback 到 cv2 重编码
    path('api/streams/<str:stream_id>/mjpeg/', mjpeg_passthrough_view, name='mjpeg_stream'),
    path('api/streams/<str:stream_id>/mjpeg-cv2/', mjpeg_stream, name='mjpeg_stream_cv2'),
    
    path('api/', include(router.urls)),
    
    # 新增的PPE统计和洁净用品结果API（通过router自动注册）
    # /api/results/sync-status/ - 数据同步状态
    # /api/results/force-sync/ - 强制数据同步
    # /api/results/ppe-stats/ - PPE检测统计
    # /api/results/cleanroom-results/ - 洁净用品检测结果
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
  
