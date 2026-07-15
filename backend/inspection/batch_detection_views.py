"""
批处理检测API视图
提供批量ROI检测的HTTP接口
"""
import logging
import base64
import io
from PIL import Image
import numpy as np
import cv2

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status

from inspection.roi_cache import get_roi_cache
from inspection.batch_detection_service import get_batch_detection_service

logger = logging.getLogger(__name__)


@api_view(['POST'])
def batch_ocr_detection(request):
    """
    批处理OCR检测API
    
    POST /api/ocr/batch-detection/
    
    Request Body:
    {
        "roi_ids": ["label1_xxx", "label2_yyy", ...],  // ROI缓存ID列表
        "apply_rules": false,                          // 是否应用目标规则验证
        "enable_barcode": true,                        // 是否启用条码检测
        "target_configs": {                            // 目标配置（可选）
            "label1": {
                "enable_keywords": true,
                "required_keywords": "关键词1,关键词2",
                "excluded_keywords": "排除词",
                "require_barcode": false
            }
        }
    }
    
    Response:
    {
        "success": true,
        "mode": "batch",
        "overall_quality": "合格",
        "reason": "批处理完成: 5/5个ROI处理成功",
        "ocr_text": "[label1] 文本1\n[label2] 文本2",
        "barcode_count": 3,
        "roi_count": 5,
        "processing_time": 0.523,
        "processing_mode": "cpu_concurrent",
        "worker_count": 3,
        "stitched_image": "data:image/jpeg;base64,...",
        "details": [
            {
                "label": "water_efficiency_label",
                "grid_index": 1,
                "success": true,
                "ocr_text": "文本内容",
                "barcode_count": 1,
                "qualified": true,
                "reason": "验证通过"
            },
            ...
        ]
    }
    """
    try:
        # 1. 解析请求参数
        roi_ids = request.data.get('roi_ids', [])
        apply_rules = request.data.get('apply_rules', False)
        enable_barcode = request.data.get('enable_barcode', True)
        target_configs = request.data.get('target_configs', {})
        keyword_configs = request.data.get('keyword_configs', [])  # 关键词配置
        keyword_match_mode = request.data.get('keyword_match_mode', 'contains')
        barcode_configs = request.data.get('barcode_configs', [])  # 条码配置
        non_grid_targets = request.data.get('non_grid_targets', [])  # mini模式目标
        selected_targets = request.data.get('selected_targets', [])
        ocr_model = request.data.get('ocr_model') or 'auto'
        use_angle_cls = bool(request.data.get('use_angle_cls', False))
        
        logger.info(f"批处理请求: {len(roi_ids)}个ROI, apply_rules={apply_rules}, keyword_configs={len(keyword_configs)}, barcode_configs={len(barcode_configs)}")
        
        # 2. 参数验证
        if not roi_ids:
            return Response({
                'success': False,
                'error': '没有可处理的ROI，请先完成实时检测'
            }, status=status.HTTP_400_BAD_REQUEST)
        if not selected_targets or not isinstance(selected_targets, list):
            return Response({
                'success': False,
                'error': '缺少批处理必须的 selected_targets'
            }, status=status.HTTP_400_BAD_REQUEST)
        if keyword_match_mode not in ('contains', 'exact'):
            return Response({
                'success': False,
                'error': 'keyword_match_mode 必须为 contains 或 exact'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # 3. 从缓存获取ROI数据
        roi_cache = get_roi_cache()
        rois = roi_cache.get_multiple(roi_ids)
        
        if not rois:
            return Response({
                'success': False,
                'error': 'ROI缓存已过期或不存在，请重新检测'
            }, status=status.HTTP_404_NOT_FOUND)
        
        found_labels = {roi.get('label') for roi in rois}
        missing_labels = [label for label in selected_targets if label not in found_labels]
        if len(rois) < len(roi_ids) or missing_labels:
            logger.warning(
                f"批处理ROI不完整: 请求{len(roi_ids)}个, 找到{len(rois)}个, "
                f"缺少目标={missing_labels}"
            )
            return Response({
                'success': False,
                'error': 'ROI不完整或已过期，请重新检测',
                'missing_labels': missing_labels,
                'requested_count': len(roi_ids),
                'found_count': len(rois),
            }, status=status.HTTP_409_CONFLICT)
        
        # 4. 执行批处理检测
        batch_service = get_batch_detection_service()
        result = batch_service.process_batch(
            rois=rois,
            apply_rules=apply_rules,
            enable_barcode=enable_barcode,
            target_configs=target_configs,
            keyword_configs=keyword_configs,
            keyword_match_mode=keyword_match_mode,
            barcode_configs=barcode_configs,
            selected_targets=selected_targets,
            ocr_model=ocr_model,
            use_angle_cls=use_angle_cls,
        )
        
        # 5. 生成拼接图预览
        stitched_image = None
        try:
            stitched_image = generate_stitched_preview(rois, result['details'], non_grid_targets)
        except Exception as e:
            logger.error(f"生成拼接图失败: {e}")
            # 不阻塞主流程，拼接图失败不影响结果
        
        # 6. 构建响应
        response_data = {
            'success': result.get('success', True),
            'mode': 'batch',
            'overall_quality': result['overall_quality'],
            'reason': result['reason'],
            'ocr_text': result['ocr_text'],
            'barcode_count': result['barcode_count'],
            'roi_count': result['roi_count'],
            'processing_time': result.get('processing_time', 0),
            'processing_mode': result.get('processing_mode', 'cpu_serial_safe'),
            'worker_count': result.get('worker_count', 0),
            'stitched_image': stitched_image,
            'details': result['details']
        }
        
        logger.info(
            f"批处理完成: {result['roi_count']}个ROI, "
            f"状态={result['overall_quality']}, "
            f"耗时={result.get('processing_time', 0):.3f}s"
        )
        
        return Response(response_data, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"批处理检测失败: {e}", exc_info=True)
        return Response({
            'success': False,
            'error': f'批处理检测失败: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
def roi_cache_stats(request):
    """
    获取ROI缓存统计信息
    
    GET /api/ocr/roi-cache-stats/
    
    Response:
    {
        "total_count": 10,
        "max_size": 200,
        "ttl": 300,
        "labels": {
            "water_efficiency_label": 3,
            "energy_label": 2,
            ...
        },
        "oldest_age": 45.2
    }
    """
    try:
        roi_cache = get_roi_cache()
        stats = roi_cache.get_stats()
        
        return Response(stats, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"获取缓存统计失败: {e}")
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def cleanup_roi_cache(request):
    """
    清理ROI缓存
    
    POST /api/ocr/cleanup-roi-cache/

    Request Body:
    {
        "mode": "expired",  // "expired" | "all"
        "owner_id": "ocr:169..."  // 可选；"all"模式下传入时只清理该owner的ROI，
                                   // 不影响其他窗口；不传则保留旧行为（清空全部）
    }

    Response:
    {
        "success": true,
        "cleaned_count": 5,
        "remaining_count": 10
    }
    """
    try:
        mode = request.data.get('mode', 'expired')
        owner_id = request.data.get('owner_id')
        roi_cache = get_roi_cache()

        if mode == 'all':
            cleaned_count = roi_cache.clear_scoped(owner_id=owner_id)
            remaining_count = roi_cache.get_stats()['total_count']
        else:
            cleaned_count = roi_cache.cleanup_expired()
            remaining_count = roi_cache.get_stats()['total_count']
        
        logger.info(f"缓存清理完成: mode={mode}, 清理{cleaned_count}个")
        
        return Response({
            'success': True,
            'mode': mode,
            'cleaned_count': cleaned_count,
            'remaining_count': remaining_count
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        logger.error(f"清理缓存失败: {e}")
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def generate_stitched_preview(rois, details, non_grid_targets=None):
    """
    生成拼接图预览
    使用 Masonry (瀑布流) 布局：
    1. 统一列宽，将所有图片缩放至相同宽度（保持宽高比）
    2. 依次将图片放入当前高度最小的列
    3. 这种布局能最有效地利用空间，避免大小不一导致的留白，视觉效果类似 Pinterest
    4. nonGrid(mini)目标缩小显示，紧凑排列在底部
    """
    try:
        if not rois: return None
        if non_grid_targets is None:
            non_grid_targets = []

        roi_count = len(rois)

        # 1. 确定列数和列宽
        # 根据图片数量决定列数
        if roi_count <= 2: cols = 2
        elif roi_count <= 9: cols = 3
        else: cols = 4

        # 设定一个总画布宽度的理想值，例如 1200px
        TOTAL_WIDTH = 1200
        PADDING = 20

        # 计算单列宽度
        col_width = (TOTAL_WIDTH - (cols + 1) * PADDING) // cols

        # 2. 准备列数据
        # col_heights 记录每列当前的高度 (初始只有PADDING)
        col_heights = [PADDING] * cols
        # col_images 记录每列包含的图片数据 [(img, y_pos), ...]
        col_images = [[] for _ in range(cols)]

        # 优化排序：优先展示重要目标（非mini），然后再展示小图
        # 完全依赖前端传来的 nonGridTargets，不再做硬编码和面积阈值的强制判断，避免用户未选中却被自动缩小
        all_non_grid = set(non_grid_targets) if non_grid_targets else set()

        grid_rois = []
        non_grid_rois = []
        for roi in rois:
            label = roi.get('label', '')
            if label in all_non_grid:
                non_grid_rois.append(roi)
            else:
                grid_rois.append(roi)
        
        # Grid目标按面积降序排列（大的在前）
        grid_rois.sort(key=lambda r: r['image'].shape[0] * r['image'].shape[1], reverse=True)
        # Non-Grid目标也按面积降序排列
        non_grid_rois.sort(key=lambda r: r['image'].shape[0] * r['image'].shape[1], reverse=True)
        
        # 合并列表，Grid优先
        sorted_rois = grid_rois + non_grid_rois
        
        # 3. 瀑布流填充
        MINI_SCALE = 0.4  # mini目标缩小到40%
        for roi in sorted_rois:
            img = roi['image']
            h, w = img.shape[:2]
            label = roi.get('label', '')
            is_mini = label in all_non_grid or roi in non_grid_rois

            # mini目标缩小显示
            target_width = int(col_width * MINI_SCALE) if is_mini else col_width
            scale = target_width / w
            new_h = int(h * scale)
            resized_img = cv2.resize(img, (target_width, new_h), interpolation=cv2.INTER_LINEAR)
            
            # 找到当前最短的一列
            min_col_idx = col_heights.index(min(col_heights))
            
            # 记录位置和图片
            y_pos = col_heights[min_col_idx]
            col_images[min_col_idx].append((resized_img, y_pos))
            
            # 更新该列高度
            col_heights[min_col_idx] += new_h + PADDING
            
        # 4. 创建画布
        max_h = max(col_heights)
        # 至少保证一定高度
        if max_h < 600: max_h = 600
        
        canvas = np.full((max_h, TOTAL_WIDTH, 3), 255, dtype=np.uint8)
        
        # 5. 绘制所有图片
        for col_idx in range(cols):
            x_pos = PADDING + col_idx * (col_width + PADDING)
            
            for (img, y_pos) in col_images[col_idx]:
                h, w = img.shape[:2]
                # 绘制
                canvas[y_pos:y_pos+h, x_pos:x_pos+w] = img
                
                # 可选：绘制边框（淡淡的灰色，增强边界感）
                # cv2.rectangle(canvas, (x_pos, y_pos), (x_pos+w, y_pos+h), (240, 240, 240), 1)

        # 6. 转换为Base64
        # 略微提高压缩质量，保证清晰度
        _, buffer = cv2.imencode('.jpg', canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return f"data:image/jpeg;base64,{img_base64}"
        
    except Exception as e:
        logger.error(f"生成拼接图失败: {e}", exc_info=True)
        return None
