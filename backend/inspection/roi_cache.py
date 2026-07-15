"""
ROI缓存管理器
用于在实时检测和批处理之间共享ROI数据，避免重复传输
"""
import time
import logging
import uuid
from typing import Dict, List, Optional, Any
from threading import RLock

logger = logging.getLogger(__name__)


class ROICacheManager:
    """
    ROI缓存管理器
    
    功能：
    1. 缓存实时检测提取的ROI图像
    2. 自动过期清理（TTL）
    3. 线程安全
    4. 支持批量读取
    
    使用场景：
    - 实时检测时存储ROI
    - 批处理时读取ROI（避免重复传输）
    """
    
    def __init__(self, max_size: int = 200, ttl: int = 300):
        """
        初始化缓存管理器
        
        Args:
            max_size: 最大缓存数量（超过后自动清理最旧的）
            ttl: 生存时间（秒），默认5分钟
        """
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.max_size = max_size
        self.ttl = ttl
        # store -> _cleanup_if_needed -> cleanup_expired 会重入加锁。
        self.lock = RLock()
        logger.info(f"ROI缓存管理器已初始化: max_size={max_size}, ttl={ttl}s")
    
    def store(
        self,
        label: str,
        roi_image,
        bbox: Dict[str, int],
        detection: Optional[Dict] = None,
        metadata: Optional[Dict] = None,
        owner_id: Optional[str] = None,
    ) -> str:
        """
        存储ROI到缓存

        Args:
            label: 目标标签（如 'water_efficiency_label'）
            roi_image: ROI图像（numpy数组）
            bbox: 边界框 {'x1', 'y1', 'x2', 'y2'} 或 {'x', 'y', 'w', 'h'}
            detection: 完整的检测结果（可选）
            metadata: 额外的元数据（可选）
            owner_id: 归属窗口/调用方标识（可选），用于 clear_scoped 精确清理

        Returns:
            roi_id: 生成的ROI唯一ID
        """
        with self.lock:
            # 生成唯一ID
            timestamp_ms = int(time.time() * 1000)
            # 两个窗口可能在同一毫秒缓存同名ROI；随机后缀防止互相覆盖。
            roi_id = f"{label}_{timestamp_ms}_{uuid.uuid4().hex[:10]}"

            # 存储数据
            self.cache[roi_id] = {
                'roi_id': roi_id,
                'label': label,
                'image': roi_image,
                'bbox': bbox,
                'detection': detection or {},
                'metadata': metadata or {},
                'timestamp': time.time(),
                'owner_id': owner_id,
            }
            
            # 检查容量并清理
            self._cleanup_if_needed()
            
            logger.debug(f"ROI已缓存: {roi_id}, 当前缓存数: {len(self.cache)}")
            return roi_id
    
    def get(self, roi_id: str) -> Optional[Dict[str, Any]]:
        """
        获取单个ROI
        
        Args:
            roi_id: ROI ID
        
        Returns:
            ROI数据字典，如果不存在或已过期则返回None
        """
        with self.lock:
            data = self.cache.get(roi_id)
            
            if data is None:
                logger.warning(f"ROI不存在: {roi_id}")
                return None
            
            # 检查是否过期
            if self._is_expired(data):
                logger.warning(f"ROI已过期: {roi_id}")
                del self.cache[roi_id]
                return None
            
            return data
    
    def get_multiple(self, roi_ids: List[str]) -> List[Dict[str, Any]]:
        """
        批量获取ROI
        
        Args:
            roi_ids: ROI ID列表
        
        Returns:
            ROI数据列表（过滤掉不存在或已过期的）
        """
        results = []
        for roi_id in roi_ids:
            data = self.get(roi_id)
            if data is not None:
                results.append(data)
        
        logger.info(f"批量获取ROI: 请求{len(roi_ids)}个, 成功{len(results)}个")
        return results
    
    def delete(self, roi_id: str) -> bool:
        """
        删除指定ROI
        
        Args:
            roi_id: ROI ID
        
        Returns:
            是否删除成功
        """
        with self.lock:
            if roi_id in self.cache:
                del self.cache[roi_id]
                logger.debug(f"ROI已删除: {roi_id}")
                return True
            return False
    
    def clear(self):
        """清空所有缓存"""
        with self.lock:
            count = len(self.cache)
            self.cache.clear()
            logger.info(f"缓存已清空: 删除了{count}个ROI")

    def clear_scoped(self, owner_id: Optional[str] = None) -> int:
        """
        按 owner_id 精确清理缓存；不传 owner_id 时退化为清空所有（兼容旧调用方）。

        双窗口场景下，一个窗口点"清理缓存"不应清掉另一个窗口尚未消费的 ROI；
        旧版 clear() 对所有窗口一视同仁地全清，这里改为按 owner_id 归属过滤。

        Args:
            owner_id: 归属窗口/调用方标识；None 表示清空全部（保留原有语义）

        Returns:
            实际清理的数量
        """
        if owner_id is None:
            with self.lock:
                count = len(self.cache)
            self.clear()
            return count

        with self.lock:
            matched_ids = [
                roi_id for roi_id, data in self.cache.items()
                if data.get('owner_id') == owner_id
            ]
            for roi_id in matched_ids:
                del self.cache[roi_id]
            if matched_ids:
                logger.info(f"缓存已按owner清理: owner_id={owner_id}, 删除了{len(matched_ids)}个ROI")
            return len(matched_ids)
    
    def cleanup_expired(self) -> int:
        """
        清理所有过期的ROI
        
        Returns:
            清理的数量
        """
        with self.lock:
            expired_ids = [
                roi_id for roi_id, data in self.cache.items()
                if self._is_expired(data)
            ]
            
            for roi_id in expired_ids:
                del self.cache[roi_id]
            
            if expired_ids:
                logger.info(f"已清理{len(expired_ids)}个过期ROI")
            
            return len(expired_ids)
    
    def get_stats(self) -> Dict[str, Any]:
        """
        获取缓存统计信息
        
        Returns:
            统计信息字典
        """
        with self.lock:
            now = time.time()
            labels = {}
            
            for data in self.cache.values():
                label = data['label']
                labels[label] = labels.get(label, 0) + 1
            
            return {
                'total_count': len(self.cache),
                'max_size': self.max_size,
                'ttl': self.ttl,
                'labels': labels,
                'oldest_age': now - min((d['timestamp'] for d in self.cache.values()), default=now) if self.cache else 0
            }
    
    def _is_expired(self, data: Dict[str, Any]) -> bool:
        """检查ROI是否过期"""
        age = time.time() - data['timestamp']
        return age > self.ttl
    
    def _cleanup_if_needed(self):
        """如果超过最大容量，清理最旧的ROI"""
        if len(self.cache) <= self.max_size:
            return
        
        # 先清理过期的
        expired_count = self.cleanup_expired()
        
        # 如果还是超过容量，删除最旧的
        if len(self.cache) > self.max_size:
            # 按时间排序，删除最旧的
            sorted_items = sorted(
                self.cache.items(),
                key=lambda x: x[1]['timestamp']
            )
            
            to_remove = len(self.cache) - self.max_size
            for roi_id, _ in sorted_items[:to_remove]:
                del self.cache[roi_id]
            
            logger.warning(f"缓存容量超限，已删除{to_remove}个最旧的ROI")


# 全局单例实例
_roi_cache_instance = None


def get_roi_cache() -> ROICacheManager:
    """
    获取全局ROI缓存实例（单例模式）
    
    Returns:
        ROICacheManager实例
    """
    global _roi_cache_instance
    if _roi_cache_instance is None:
        _roi_cache_instance = ROICacheManager(
            max_size=200,  # 最多缓存200个ROI
            ttl=300  # 5分钟过期
        )
    return _roi_cache_instance
