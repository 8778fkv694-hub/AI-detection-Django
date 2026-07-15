"""
条码检测服务包装器
统一封装条码/二维码检测功能
"""
import logging
import base64
import io
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np
from PIL import Image
from typing import Dict, Any, Iterable, List, Tuple

try:
    from pyzbar.pyzbar import decode as zbar_decode
    _ZBAR_AVAILABLE = True
    _ZBAR_IMPORT_ERROR = None
except Exception as e:
    zbar_decode = None
    _ZBAR_AVAILABLE = False
    _ZBAR_IMPORT_ERROR = str(e)

try:
    import zxingcpp
    _ZXING_AVAILABLE = True
    _ZXING_IMPORT_ERROR = None
except Exception as e:
    zxingcpp = None
    _ZXING_AVAILABLE = False
    _ZXING_IMPORT_ERROR = str(e)

logger = logging.getLogger(__name__)


class BarcodeDetectionService:
    """
    条码检测服务
    
    封装微信二维码检测和其他条码检测方法
    """
    
    def __init__(self):
        """初始化条码检测服务"""
        from inspection.wechat_qr_service import wechat_qr_service
        self.wechat_qr = wechat_qr_service
        self.zbar_available = _ZBAR_AVAILABLE
        self.zbar_import_error = _ZBAR_IMPORT_ERROR
        self.zxing_available = _ZXING_AVAILABLE
        self.zxing_import_error = _ZXING_IMPORT_ERROR
        logger.info("条码检测服务已初始化")
    
    def detect(
        self,
        image,
        detect_qr: bool = True,
        detect_linear: bool = True,
    ) -> Dict[str, Any]:
        """
        检测图像中的条码/二维码
        
        Args:
            image: 图像数据（numpy数组或PIL Image）
        
        Returns:
            检测结果字典
        """
        try:
            image_base64 = self._image_to_base64(image)
            pil_image = self._ensure_pil_image(image)
            return self._detect_parallel(
                image_base64=image_base64,
                pil_image=pil_image,
                detect_qr=detect_qr,
                detect_linear=detect_linear,
            )
        except Exception as e:
            logger.error(f"条码检测失败: {e}", exc_info=True)
            return {
                'success': False,
                'codes': [],
                'count': 0,
                'error': str(e)
            }

    def detect_from_base64(
        self,
        image_data: str,
        detect_qr: bool = True,
        detect_linear: bool = True,
    ) -> Dict[str, Any]:
        """
        使用base64图片数据检测条码/二维码
        
        Args:
            image_data: base64编码的图片数据
        
        Returns:
            检测结果字典
        """
        try:
            img = self._decode_base64_image(image_data)
            pil_image = self._ensure_pil_image(img)
            return self._detect_parallel(
                image_base64=image_data,
                pil_image=pil_image,
                detect_qr=detect_qr,
                detect_linear=detect_linear,
            )
        except Exception as e:
            logger.error(f"条码检测失败: {e}", exc_info=True)
            return {
                'success': False,
                'codes': [],
                'count': 0,
                'error': str(e)
            }

    def _detect_parallel(
        self,
        image_base64: str,
        pil_image: Image.Image,
        detect_qr: bool = True,
        detect_linear: bool = True,
    ) -> Dict[str, Any]:
        errors = {'wechat_qr': None, 'zbar': None, 'opencv_barcode': None}
        wechat_codes: List[Dict[str, Any]] = []
        linear_codes: List[Dict[str, Any]] = []
        models_used: List[str] = []
        linear_attempts: List[str] = []

        futures = {}
        with ThreadPoolExecutor(max_workers=2) as executor:
            if detect_qr:
                futures['wechat_qr'] = executor.submit(self.wechat_qr.detect_qr_codes, image_base64)
            if detect_linear:
                futures['linear_barcode'] = executor.submit(self._detect_linear_barcodes, pil_image)

            for name, future in futures.items():
                try:
                    result = future.result()
                    if name == 'wechat_qr':
                        if result.get('success'):
                            wechat_codes = self._normalize_wechat_codes(result.get('detected_codes', []))
                            models_used.append('wechat_qr')
                        else:
                            errors['wechat_qr'] = result.get('error') or '微信二维码检测失败'
                    elif name == 'linear_barcode':
                        linear_codes = result.get('codes', [])
                        linear_attempts = result.get('attempts', [])
                        models_used.extend(result.get('models_used', []))
                        errors.update(result.get('errors', {}))
                except Exception as e:
                    logger.error(f"{name} 检测异常: {e}", exc_info=True)
                    if name == 'linear_barcode':
                        errors['zbar'] = errors['zbar'] or str(e)
                        errors['opencv_barcode'] = errors['opencv_barcode'] or str(e)
                    else:
                        errors[name] = str(e)

        merged_codes = self._merge_codes(wechat_codes, linear_codes)
        success = len(merged_codes) > 0 or bool(models_used) or not futures

        return {
            'success': success,
            'codes': merged_codes,
            'count': len(merged_codes),
            'models_used': list(dict.fromkeys(models_used)),
            'errors': errors,
            'linear_attempts': linear_attempts,
        }

    def _normalize_wechat_codes(self, detected_codes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        codes = []
        for code in detected_codes or []:
            codes.append({
                'type': code.get('type', 'qr'),
                'data': code.get('data', ''),
                'confidence': code.get('confidence', 0.95),
                'bbox': code.get('location', {}),
                'polygon': code.get('corners', []),
                'source': 'wechat_qr'
            })
        return codes

    def _detect_linear_barcodes(self, image: Image.Image) -> Dict[str, Any]:
        """一维码检测：优先用 zxing-cpp 对原图单次扫描（自带多方向/降采样/反色鲁棒性，
        实测比旧级联快约60倍且检出率更高）；zxing 未检出时才降级到 OpenCV+ZBar 多变体
        穷举级联（更慢，但对 zxing 漏检的极端场景仍有一定兜底能力）。"""
        errors = {
            'zbar': None if self.zbar_available else (self.zbar_import_error or 'pyzbar不可用'),
            'opencv_barcode': None,
            'zxingcpp': None if self.zxing_available else (self.zxing_import_error or 'zxing-cpp不可用'),
        }
        models_used: List[str] = []
        attempts: List[str] = []
        codes: List[Dict[str, Any]] = []

        if image.mode != 'RGB':
            image = image.convert('RGB')

        try:
            zxing_codes = self._detect_zxing(image)
        except Exception as exc:
            zxing_codes = []
            errors['zxingcpp'] = str(exc)
            logger.debug('zxing-cpp条码检测失败: %s', exc)

        if zxing_codes:
            return {
                'codes': zxing_codes,
                'models_used': ['zxingcpp'],
                'errors': errors,
                'attempts': ['zxingcpp'],
            }

        attempts.append('zxingcpp(no-match)')
        image_bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        try:
            opencv_detector = cv2.barcode_BarcodeDetector()
            models_used.append('opencv_barcode')
        except Exception as exc:
            opencv_detector = None
            errors['opencv_barcode'] = str(exc)

        if self.zbar_available and zbar_decode is not None:
            models_used.append('zbar')

        orig_h, orig_w = image_bgr.shape[:2]

        for name, variant in self._iter_linear_variants(image_bgr):
            attempts.append(name)
            variant_codes: List[Dict[str, Any]] = []

            if opencv_detector is not None:
                try:
                    variant_codes.extend(
                        self._detect_opencv_variant(opencv_detector, variant, name)
                    )
                except Exception as exc:
                    errors['opencv_barcode'] = str(exc)
                    logger.debug('OpenCV条码检测失败 [%s]: %s', name, exc)

            # OpenCV 是主解码器；仅在当前变体未解出时调用 ZBar。旧实现对
            # 每个变体都重复解码，并因 ZBar 的静态置信度更高而覆盖已经正确
            # 的 OpenCV 结果，既增加 Jetson CPU 开销也让结果来源不稳定。
            if not variant_codes and self.zbar_available and zbar_decode is not None:
                try:
                    decoded = zbar_decode(variant)
                    formatted = self._format_zbar_results(decoded, include_qr=False)
                    for item in formatted:
                        item['preprocess'] = name
                    variant_codes.extend(formatted)
                except Exception as exc:
                    errors['zbar'] = str(exc)
                    logger.debug('ZBar条码检测失败 [%s]: %s', name, exc)

            if variant_codes:
                # bbox/polygon 此时仍处于该变体（旋转+静区边框+缩放后）的坐标系，
                # 必须映射回原图坐标，前端才能正确画框/做遮罩。
                rotation_name, scale, border_x, border_y = self._variant_transform(name, orig_w, orig_h)
                for code in variant_codes:
                    self._remap_code_to_original(code, rotation_name, scale, border_x, border_y, orig_w, orig_h)
                codes = self._merge_codes([], variant_codes)
                break

        return {
            'codes': codes,
            'models_used': models_used,
            'errors': errors,
            'attempts': attempts,
        }

    def _detect_zxing(self, image: Image.Image) -> List[Dict[str, Any]]:
        """用 zxing-cpp 直接在原图坐标系上扫描一维码（内置多方向/降采样/反色），
        因此这里得到的 bbox/polygon 无需像 OpenCV/ZBar 级联那样反算旋转/边框/缩放。"""
        if not (self.zxing_available and zxingcpp is not None):
            return []

        results = zxingcpp.read_barcodes(image, formats=zxingcpp.BarcodeFormat.LinearCodes)

        codes: List[Dict[str, Any]] = []
        for result in results:
            if not result.valid or not result.text:
                continue
            pos = result.position
            polygon = [
                [pos.top_left.x, pos.top_left.y],
                [pos.top_right.x, pos.top_right.y],
                [pos.bottom_right.x, pos.bottom_right.y],
                [pos.bottom_left.x, pos.bottom_left.y],
            ]
            codes.append({
                'type': 'barcode',
                'data': result.text,
                'confidence': 0.92,
                'bbox': self._polygon_bbox(polygon),
                'polygon': polygon,
                'format': str(result.format),
                'source': 'zxingcpp',
            })
        return codes

    def _detect_opencv_variant(
        self,
        detector,
        image: np.ndarray,
        preprocess: str,
    ) -> List[Dict[str, Any]]:
        """兼容 OpenCV 4.10+ BarcodeDetector 的多码返回格式。"""
        ok, decoded_info, decoded_types, points = detector.detectAndDecodeWithType(image)
        if not ok or not decoded_info:
            return []

        point_sets = list(points) if points is not None else []
        codes: List[Dict[str, Any]] = []
        for index, data in enumerate(decoded_info):
            if not data:
                continue
            polygon = []
            if index < len(point_sets):
                polygon = np.asarray(point_sets[index]).reshape(-1, 2).tolist()
            bbox = self._polygon_bbox(polygon)
            code_format = decoded_types[index] if index < len(decoded_types) else 'UNKNOWN'
            codes.append({
                'type': 'barcode',
                'data': str(data),
                'confidence': 0.88,
                'bbox': bbox,
                'polygon': polygon,
                'format': str(code_format),
                'source': 'opencv_barcode',
                'preprocess': preprocess,
            })
        return codes

    def _format_zbar_results(self, decoded, include_qr: bool = True) -> List[Dict[str, Any]]:
        codes: List[Dict[str, Any]] = []
        for item in decoded:
            data = ''
            try:
                data = item.data.decode('utf-8', errors='ignore')
            except Exception:
                data = str(item.data)

            rect = item.rect
            polygon = []
            if item.polygon:
                polygon = [[p.x, p.y] for p in item.polygon]

            symbology = getattr(item, 'type', '') or 'UNKNOWN'
            code_type = 'qr' if symbology.upper() == 'QRCODE' else 'barcode'
            if code_type == 'qr' and not include_qr:
                continue

            codes.append({
                'type': code_type,
                'data': data,
                'confidence': 0.9,
                'bbox': {
                    'x': rect.left,
                    'y': rect.top,
                    'width': rect.width,
                    'height': rect.height
                },
                'polygon': polygon,
                'format': symbology,
                'source': 'zbar'
            })
        return codes

    def _iter_linear_variants(self, image_bgr: np.ndarray) -> Iterable[Tuple[str, np.ndarray]]:
        """低内存逐个生成静区、方向、多尺度和对比度增强变体。"""
        rotations = (
            ('r0', None),
            ('r90', cv2.ROTATE_90_CLOCKWISE),
            ('r270', cv2.ROTATE_90_COUNTERCLOCKWISE),
            ('r180', cv2.ROTATE_180),
        )

        for rotation_name, rotation in rotations:
            rotated = cv2.rotate(image_bgr, rotation) if rotation is not None else image_bgr
            h, w = rotated.shape[:2]
            border_x = max(12, min(96, int(w * 0.12)))
            border_y = max(8, min(64, int(h * 0.08)))
            quiet = cv2.copyMakeBorder(
                rotated,
                border_y,
                border_y,
                border_x,
                border_x,
                cv2.BORDER_CONSTANT,
                value=(255, 255, 255),
            )

            yield f'{rotation_name}_quiet_raw', quiet

            # 小 ROI 才放大，防止 Jetson 因超大中间图产生内存峰值。
            max_side = max(quiet.shape[:2])
            scale = min(3.0, max(1.0, 900.0 / max(1, max_side)))
            working = quiet if scale <= 1.05 else cv2.resize(
                quiet,
                None,
                fx=scale,
                fy=scale,
                interpolation=cv2.INTER_CUBIC,
            )
            if working is not quiet:
                yield f'{rotation_name}_up{scale:.1f}', working

            gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8)).apply(gray)
            yield f'{rotation_name}_clahe', clahe

            blurred = cv2.GaussianBlur(clahe, (0, 0), 1.2)
            sharpened = cv2.addWeighted(clahe, 1.8, blurred, -0.8, 0)
            yield f'{rotation_name}_unsharp', sharpened

            _, otsu = cv2.threshold(
                sharpened,
                0,
                255,
                cv2.THRESH_BINARY + cv2.THRESH_OTSU,
            )
            yield f'{rotation_name}_otsu', otsu

    @staticmethod
    def _variant_transform(preprocess_name: str, orig_w: int, orig_h: int) -> Tuple[str, float, int, int]:
        """重新计算某个变体名称相对原图的几何变换参数（旋转/静区边框/缩放）。

        _iter_linear_variants 生成的每个变体的边框宽度、缩放比例都是由原图尺寸
        和旋转方向确定性推导出来的，因此这里不需要改动生成器结构，直接按同样
        的公式重新计算一遍即可用来把该变体坐标系下的点映射回原图坐标系。
        """
        rotation_name = preprocess_name.split('_', 1)[0]

        if rotation_name in ('r90', 'r270'):
            rotated_w, rotated_h = orig_h, orig_w
        else:
            rotated_w, rotated_h = orig_w, orig_h

        border_x = max(12, min(96, int(rotated_w * 0.12)))
        border_y = max(8, min(64, int(rotated_h * 0.08)))

        if preprocess_name.endswith('_quiet_raw'):
            scale = 1.0
        else:
            quiet_w = rotated_w + 2 * border_x
            quiet_h = rotated_h + 2 * border_y
            max_side = max(quiet_w, quiet_h)
            scale = min(3.0, max(1.0, 900.0 / max(1, max_side)))

        return rotation_name, scale, border_x, border_y

    @staticmethod
    def _map_point_to_original(
        x: float,
        y: float,
        rotation_name: str,
        scale: float,
        border_x: int,
        border_y: int,
        orig_w: int,
        orig_h: int,
    ) -> Tuple[float, float]:
        """将某一检测变体坐标系下的点，反向映射回原图坐标系（先撤销缩放，再撤销静区边框，最后撤销旋转）。"""
        x_quiet = x / scale
        y_quiet = y / scale
        x_rotated = x_quiet - border_x
        y_rotated = y_quiet - border_y

        if rotation_name == 'r180':
            return orig_w - 1 - x_rotated, orig_h - 1 - y_rotated
        if rotation_name == 'r90':
            return y_rotated, orig_h - 1 - x_rotated
        if rotation_name == 'r270':
            return orig_w - 1 - y_rotated, x_rotated
        return x_rotated, y_rotated

    def _remap_code_to_original(
        self,
        code: Dict[str, Any],
        rotation_name: str,
        scale: float,
        border_x: int,
        border_y: int,
        orig_w: int,
        orig_h: int,
    ) -> Dict[str, Any]:
        polygon = code.get('polygon') or []
        if not polygon:
            bbox = code.get('bbox') or {'x': 0, 'y': 0, 'width': 0, 'height': 0}
            x, y, w, h = bbox['x'], bbox['y'], bbox['width'], bbox['height']
            polygon = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

        mapped_polygon = []
        for px, py in polygon:
            mx, my = self._map_point_to_original(px, py, rotation_name, scale, border_x, border_y, orig_w, orig_h)
            mapped_polygon.append([
                min(max(mx, 0), orig_w - 1),
                min(max(my, 0), orig_h - 1),
            ])
        code['polygon'] = mapped_polygon
        code['bbox'] = self._polygon_bbox(mapped_polygon)
        return code

    @staticmethod
    def _polygon_bbox(polygon: List[List[float]]) -> Dict[str, int]:
        if not polygon:
            return {'x': 0, 'y': 0, 'width': 0, 'height': 0}
        points = np.asarray(polygon, dtype=np.float32).reshape(-1, 2)
        x_min, y_min = points.min(axis=0)
        x_max, y_max = points.max(axis=0)
        return {
            'x': int(round(float(x_min))),
            'y': int(round(float(y_min))),
            'width': int(round(float(x_max - x_min))),
            'height': int(round(float(y_max - y_min))),
        }

    def _merge_codes(
        self,
        wechat_codes: List[Dict[str, Any]],
        zbar_codes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        merged: List[Dict[str, Any]] = []
        seen: Dict[Tuple[str, str], Dict[str, Any]] = {}

        for code in (wechat_codes or []) + (zbar_codes or []):
            data = code.get('data', '')
            code_type = code.get('type', 'barcode')
            if not data:
                merged.append(code)
                continue

            key = (data, code_type)
            existing = seen.get(key)
            if not existing:
                seen[key] = code
                merged.append(code)
            else:
                if code.get('confidence', 0) > existing.get('confidence', 0):
                    index = merged.index(existing)
                    merged[index] = code
                    seen[key] = code

        return merged
    
    def _image_to_base64(self, image) -> str:
        """
        将图像转换为base64字符串
        
        Args:
            image: numpy数组或PIL Image
        
        Returns:
            base64编码的图像字符串
        """
        try:
            pil_image = self._ensure_pil_image(image)

            buffer = io.BytesIO()
            pil_image.save(buffer, format='JPEG', quality=95)
            image_bytes = buffer.getvalue()

            image_base64 = base64.b64encode(image_bytes).decode('utf-8')

            return f"data:image/jpeg;base64,{image_base64}"
        except Exception as e:
            logger.error(f"图像转换失败: {e}")
            raise

    def _ensure_pil_image(self, image) -> Image.Image:
        if isinstance(image, np.ndarray):
            if len(image.shape) == 3 and image.shape[2] == 3:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            return Image.fromarray(image)
        if isinstance(image, Image.Image):
            return image
        raise ValueError(f"不支持的图像类型: {type(image)}")

    def _decode_base64_image(self, image_data: str) -> np.ndarray:
        if 'base64,' in image_data:
            image_data = image_data.split('base64,', 1)[1]
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("图片解码失败")
        return img


# 全局单例实例
_barcode_service_instance = None


def get_barcode_service() -> BarcodeDetectionService:
    """
    获取条码检测服务实例（单例模式）
    
    Returns:
        BarcodeDetectionService实例
    """
    global _barcode_service_instance
    if _barcode_service_instance is None:
        _barcode_service_instance = BarcodeDetectionService()
    return _barcode_service_instance


# 为了向后兼容，创建一个全局实例
barcode_service = get_barcode_service()
