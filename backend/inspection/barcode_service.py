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
from typing import Dict, Any, List, Optional, Tuple

try:
    from pyzbar.pyzbar import decode as zbar_decode
    _ZBAR_AVAILABLE = True
    _ZBAR_IMPORT_ERROR = None
except Exception as e:
    zbar_decode = None
    _ZBAR_AVAILABLE = False
    _ZBAR_IMPORT_ERROR = str(e)

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
        logger.info("条码检测服务已初始化")
    
    def detect(self, image) -> Dict[str, Any]:
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
            return self._detect_parallel(image_base64=image_base64, pil_image=pil_image)
        except Exception as e:
            logger.error(f"条码检测失败: {e}", exc_info=True)
            return {
                'success': False,
                'codes': [],
                'count': 0,
                'error': str(e)
            }

    def detect_from_base64(self, image_data: str) -> Dict[str, Any]:
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
            return self._detect_parallel(image_base64=image_data, pil_image=pil_image)
        except Exception as e:
            logger.error(f"条码检测失败: {e}", exc_info=True)
            return {
                'success': False,
                'codes': [],
                'count': 0,
                'error': str(e)
            }

    def _detect_parallel(self, image_base64: str, pil_image: Image.Image) -> Dict[str, Any]:
        errors = {'wechat_qr': None, 'zbar': None}
        wechat_codes: List[Dict[str, Any]] = []
        zbar_codes: List[Dict[str, Any]] = []

        futures = {}
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures['wechat_qr'] = executor.submit(self.wechat_qr.detect_qr_codes, image_base64)
            if self.zbar_available and pil_image is not None:
                futures['zbar'] = executor.submit(self._detect_zbar, pil_image)
            else:
                errors['zbar'] = self.zbar_import_error or 'pyzbar不可用'

            for name, future in futures.items():
                try:
                    result = future.result()
                    if name == 'wechat_qr':
                        if result.get('success'):
                            wechat_codes = self._normalize_wechat_codes(result.get('detected_codes', []))
                        else:
                            errors['wechat_qr'] = result.get('error') or '微信二维码检测失败'
                    elif name == 'zbar':
                        zbar_codes = result or []
                except Exception as e:
                    logger.error(f"{name} 检测异常: {e}", exc_info=True)
                    errors[name] = str(e)

        merged_codes = self._merge_codes(wechat_codes, zbar_codes)
        success = len(merged_codes) > 0 or (errors['wechat_qr'] is None and errors['zbar'] is None)

        return {
            'success': success,
            'codes': merged_codes,
            'count': len(merged_codes),
            'models_used': [m for m, err in errors.items() if err is None],
            'errors': errors
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

    def _detect_zbar(self, image: Image.Image) -> List[Dict[str, Any]]:
        if not self.zbar_available or zbar_decode is None:
            return []

        if image.mode != 'RGB':
            image = image.convert('RGB')

        decoded = zbar_decode(image)
        codes: List[Dict[str, Any]] = []
        if decoded:
            codes.extend(self._format_zbar_results(decoded))
            return codes

        # Preprocess pipeline (upscale -> grayscale -> CLAHE -> denoise -> binarize)
        try:
            np_img = np.array(image)
            variants = self._preprocess_variants(np_img)
            for name, variant in variants:
                decoded_variant = zbar_decode(variant)
                if decoded_variant:
                    formatted = self._format_zbar_results(decoded_variant)
                    for item in formatted:
                        item['preprocess'] = name
                    codes.extend(formatted)
                    break
        except Exception as e:
            logger.error(f"ZBar预处理失败: {e}", exc_info=True)

        return codes

    def _format_zbar_results(self, decoded) -> List[Dict[str, Any]]:
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

    def _preprocess_variants(self, img_rgb: np.ndarray) -> List[Tuple[str, np.ndarray]]:
        # Upscale
        h, w = img_rgb.shape[:2]
        scale = 3.0
        up = cv2.resize(img_rgb, (max(1, int(w * scale)), max(1, int(h * scale))), interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(up, cv2.COLOR_RGB2GRAY)

        # Contrast enhance (CLAHE)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        cl = clahe.apply(gray)

        # Denoise (bilateral + fastNlMeans as fallback)
        denoise = cv2.bilateralFilter(cl, d=9, sigmaColor=75, sigmaSpace=75)
        try:
            denoise = cv2.fastNlMeansDenoising(denoise, None, 10, 7, 21)
        except Exception:
            pass

        # Binarization
        adap = cv2.adaptiveThreshold(
            denoise, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 5
        )
        _, otsu = cv2.threshold(denoise, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Morphology for 1D barcodes
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        morph = cv2.morphologyEx(otsu, cv2.MORPH_CLOSE, kernel, iterations=1)

        return [
            ('up', up),
            ('gray', gray),
            ('clahe', cl),
            ('denoise', denoise),
            ('adaptive', adap),
            ('otsu', otsu),
            ('morph_close', morph),
        ]

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
