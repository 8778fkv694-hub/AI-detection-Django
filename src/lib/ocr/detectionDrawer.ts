/**
 * Detection Drawer Utility
 *
 * 用途：绘制 YOLO 检测结果到画布上
 * 功能：根据检测类别设置不同颜色，绘制边界框和标签
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen, KitMatchingScreen 等
 */

import type React from 'react';
import type { BackendYoloDetection } from '@/lib/api';

/**
 * 绘制检测结果到画布
 * @param detections 检测结果数组
 * @param canvas 目标画布元素
 */
export const drawDetections = (detections: BackendYoloDetection[], canvas: HTMLCanvasElement | null) => {
  if (!canvas) {
    console.log('画布元素不存在');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.log('无法获取画布上下文');
    return;
  }

  // 清除之前的绘制
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  detections.forEach((detection, index) => {
    const { bbox, label, confidence } = detection;
    if (!bbox || typeof bbox.x1 === 'undefined' || typeof bbox.y1 === 'undefined' || 
        typeof bbox.x2 === 'undefined' || typeof bbox.y2 === 'undefined') {
      console.warn(`检测 ${index + 1} 的 bbox 格式不正确:`, bbox);
      return;
    }
    const { x1, y1, x2, y2 } = bbox;
    const width = x2 - x1;
    const height = y2 - y1;

    // 根据检测类别设置颜色
    let color = '#00ff00'; // 默认绿色
    
    // 人员检测
    if (label === 'person') color = '#ff0000'; // 人员红色
    
    // 帽子相关检测
    else if (['cleanroom_cap', 'hat', 'Hardhat', 'helmet'].includes(label)) 
      color = '#00ffff'; // 帽子青色
    
    // 口罩相关检测
    else if (['mask', 'face-mask', 'face-guard'].includes(label)) 
      color = '#ffff00'; // 口罩黄色
    
    // 负面检测
    else if (['no_mask', 'NO-Mask', 'no_cleanroom_cap', 'NO-Hardhat'].includes(label)) 
      color = '#ff8000'; // 负面检测橙色
    
    // 其他PPE装备
    else if (['gloves', 'glasses', 'shoes', 'ear', 'ear-mufs', 'face', 'foot', 'tool', 'hands', 'head'].includes(label)) 
      color = '#ff00ff'; // 其他装备紫色
    
    // 自定义滤芯检测模型的4个类别
    else if (label === 'filter') color = '#ff6600'; // 滤芯组件橙色
    else if (label === 'name_MCF') color = '#0066ff'; // 名称MCF蓝色
    else if (label === 'nsplogo') color = '#ff0066'; // NSP标志粉色
    else if (label === 'qrcode') color = '#66ff00'; // 二维码亮绿色

    // 净水机模型 waterprifer 五类
    else if (label === 'anti_counterfeit_label') color = '#ffcc00'; // 防伪标签 金黄
    else if (label === 'service_label') color = '#00ccff'; // 售后服务标签 天蓝
    else if (label === 'nameplate_label') color = '#cc00ff'; // 铭牌标签 紫色
    else if (label === 'water_efficiency_label') color = '#00ffcc'; // 水效标签 薄荷绿
    else if (label === 'barcode_label') color = '#999999'; // 条码标签 灰色

    // YOLO11滤芯检测模型的额外类别
    else if (label === 'service_label') color = '#00ccff'; // 服务标签青色

    // 绘制边界框
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x1, y1, width, height);

    // 绘制标签
    ctx.fillStyle = color;
    ctx.font = '16px Arial';
    ctx.fillText(`${label}: ${(confidence * 100).toFixed(1)}%`, x1, y1 - 5);
  });
};

/**
 * 检测框颜色映射 - 齐套化检测专用
 */
const getKitMatchingColor = (className: string): string => {
  // 人员检测
  if (className === 'person') return '#ff0000';

  // 滤芯模型类别
  if (className === 'filter') return '#ff6600';
  if (className === 'name_MCF') return '#0066ff';
  if (className === 'nsplogo') return '#ff0066';
  if (className === 'qrcode') return '#66ff00';

  // 净水机模型类别
  if (className === 'anti_counterfeit_label') return '#ffcc00';
  if (className === 'service_label') return '#00ccff';
  if (className === 'nameplate_label') return '#cc00ff';
  if (className === 'water_efficiency_label') return '#00ffcc';
  if (className === 'barcode_label') return '#999999';
  if (className === 'fotile_logo') return '#ff6600';
  if (className === 'water_outlet') return '#0066ff';
  if (className === 'Prompt_label') return '#ff0066';
  if (className === 'yellow_point') return '#ffff00';
  if (className === 'glod_logo') return '#ffd700';

  return '#00ff00'; // 默认绿色
};

/**
 * 数组格式检测结果接口 (用于 KitMatchingScreen)
 */
export interface ArrayBboxDetection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

/**
 * 绘制齐套化检测结果 (数组格式 bbox)
 * @param detections 检测结果数组
 * @param canvas 目标画布元素
 * @param videoRef 视频元素引用 (用于验证尺寸)
 */
export const drawKitMatchingDetections = (
  detections: ArrayBboxDetection[],
  canvas: HTMLCanvasElement | null,
  videoRef?: React.RefObject<HTMLVideoElement>
) => {
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 清除之前的绘制
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 验证视频尺寸
  if (videoRef?.current) {
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    if (videoWidth <= 0 || videoHeight <= 0) {
      return;
    }
  }

  detections.forEach(detection => {
    const [x, y, width, height] = detection.bbox;
    const confidence = detection.confidence;

    // 确保坐标在有效范围内
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      return;
    }

    // 计算实际绘制坐标
    const finalX = Math.max(0, Math.min(x, canvas.width));
    const finalY = Math.max(0, Math.min(y, canvas.height));
    const finalWidth = Math.min(width, canvas.width - finalX);
    const finalHeight = Math.min(height, canvas.height - finalY);

    const color = getKitMatchingColor(detection.class);

    // 绘制边界框
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(finalX, finalY, finalWidth, finalHeight);

    // 绘制标签
    ctx.fillStyle = color;
    ctx.font = '16px Arial';
    const labelText = `${detection.class}: ${(confidence * 100).toFixed(1)}%`;
    const textY = Math.max(15, finalY - 5);
    ctx.fillText(labelText, finalX, textY);
  });
};

