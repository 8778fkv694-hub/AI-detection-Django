/**
 * ROI拼接工具
 * 提供ROI截图拼接、多区域拼接等功能
 */

/**
 * ROI截图接口
 */
export interface ROISnapshot {
  imageDataUrl: string;
  label: string;
}

/**
 * 检测区域接口
 */
export interface Detection {
  label: string;
  bbox: {
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  confidence?: number;
}

/**
 * 空白区域接口
 */
export interface EmptySpace {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 已占用区域接口
 */
export interface OccupiedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 寻找合适的空白位置来放置ROI
 * 智能填充到任何空白区域，避免与已占用区域重叠
 *
 * @param imgWidth - ROI图片宽度
 * @param imgHeight - ROI图片高度
 * @param canvasWidth - 画布宽度
 * @param canvasHeight - 画布高度
 * @param occupiedRegions - 已占用的区域列表
 * @param padding - 间距
 * @param borderWidth - 边框宽度
 * @returns 找到的空白位置，如果没有返回null
 */
export function findEmptySpaceForROI(
  imgWidth: number,
  imgHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  occupiedRegions: OccupiedRegion[],
  padding: number,
  borderWidth: number
): EmptySpace | null {
  // 需要的实际尺寸（包括边框）
  const requiredWidth = imgWidth + borderWidth * 2;
  const requiredHeight = imgHeight + borderWidth * 2;

  // 检查区域是否与已占用区域重叠（考虑padding间距）
  const hasOverlap = (x: number, y: number, width: number, height: number): boolean => {
    for (const occupied of occupiedRegions) {
      // 检查是否有重叠（包括padding间距）
      const overlapX = !(x + width + padding <= occupied.x || x >= occupied.x + occupied.width + padding);
      const overlapY = !(y + height + padding <= occupied.y || y >= occupied.y + occupied.height + padding);

      if (overlapX && overlapY) {
        return true;
      }
    }
    return false;
  };

  // 定义候选位置的扫描步长
  const step = 20; // 每次移动20像素

  // 扫描画布寻找合适的空白位置
  // 优先从左上角开始，逐行扫描
  for (let y = padding; y <= canvasHeight - requiredHeight - padding; y += step) {
    for (let x = padding; x <= canvasWidth - requiredWidth - padding; x += step) {
      // 检查这个位置是否与已占用区域重叠
      if (!hasOverlap(x, y, requiredWidth, requiredHeight)) {
        // 找到合适的位置
        return {
          x: x,
          y: y,
          width: requiredWidth,
          height: requiredHeight
        };
      }
    }
  }

  // 没有找到合适的位置
  return null;
}

/**
 * 拼接已提取的ROI截图
 * 将多个ROI截图拼接成一张网格布局的图片
 *
 * @param roiSnapshots - ROI截图数组
 * @param nonGridTargets - 不占格子的目标标签列表
 * @returns Promise<拼接后的Base64图片（不含前缀）| null>
 */
export async function stitchROISnapshots(
  roiSnapshots: ROISnapshot[],
  nonGridTargets: string[] = []
): Promise<string | null> {
  if (roiSnapshots.length === 0) {
    return null;
  }

  // 将ROI分类：占格子的和不占格子的
  const gridROIs = roiSnapshots.filter(snapshot => !nonGridTargets.includes(snapshot.label));
  const nonGridROIs = roiSnapshots.filter(snapshot => nonGridTargets.includes(snapshot.label));

  console.log(`📊 ROI分类：占格子${gridROIs.length}个，不占格子${nonGridROIs.length}个`);

  return new Promise((resolve) => {
    const gridImages: Array<{ img: HTMLImageElement; label: string }> = [];
    const nonGridImages: Array<{ img: HTMLImageElement; label: string }> = [];
    let loadedCount = 0;

    roiSnapshots.forEach((snapshot) => {
      const img = new Image();
      img.onload = () => {
        // 根据label分类存储
        if (nonGridTargets.includes(snapshot.label)) {
          nonGridImages.push({ img, label: snapshot.label });
        } else {
          gridImages.push({ img, label: snapshot.label });
        }
        loadedCount++;
        if (loadedCount === roiSnapshots.length) {
          if (gridImages.length === 0 && nonGridImages.length === 0) {
            resolve(null);
            return;
          }
          // 所有图片加载完成，开始拼接
          const padding = 15; // 间距
          const borderWidth = 2; // 边框宽度
          const maxCanvasWidth = 1600; // 最大画布宽度
          const maxCanvasHeight = 1200; // 最大画布高度

          // 计算布局：只根据占格子的ROI数量优化布局
          let cols: number;
          let rows: number;
          const count = gridImages.length;

          if (count === 0) {
            // 只有不占格子的ROI，使用最小布局
            cols = 1;
            rows = 1;
          } else if (count === 1) {
            cols = 1;
            rows = 1;
          } else if (count === 2) {
            cols = 2;
            rows = 1;
          } else if (count <= 4) {
            cols = 2;
            rows = 2;
          } else if (count <= 6) {
            cols = 3;
            rows = 2;
          } else if (count <= 9) {
            cols = 3;
            rows = 3;
          } else {
            cols = 4;
            rows = Math.ceil(count / 4);
          }

          // 计算所有图片的统计信息，用于平衡大小（只计算占格子的）
          const allWidths = gridImages.map(item => item.img.width);
          const allHeights = gridImages.map(item => item.img.height);
          const medianWidth = gridImages.length > 0 ? [...allWidths].sort((a, b) => a - b)[Math.floor(allWidths.length / 2)] : 300;
          const medianHeight = gridImages.length > 0 ? [...allHeights].sort((a, b) => a - b)[Math.floor(allHeights.length / 2)] : 300;

          // 计算可用空间
          const availableWidth = maxCanvasWidth - (cols + 1) * padding;
          const availableHeight = maxCanvasHeight - (rows + 1) * padding;

          // 计算每个单元格的理想尺寸（尽量填满可用空间）
          let idealCellWidth = availableWidth / cols;
          let idealCellHeight = availableHeight / rows;

          // 如果理想尺寸远大于中位数，使用中位数的合理倍数（避免过大空白）
          // 如果理想尺寸小于中位数，使用理想尺寸（尽量填满）
          const maxCellWidth = Math.max(medianWidth * 1.3, idealCellWidth * 0.9);
          const maxCellHeight = Math.max(medianHeight * 1.3, idealCellHeight * 0.9);

          // 统一单元格尺寸（平衡大小，减少空白）
          // 取理想尺寸和最大尺寸的较小值，确保不会太大也不会太小
          const cellWidth = Math.min(idealCellWidth, maxCellWidth);
          const cellHeight = Math.min(idealCellHeight, maxCellHeight);

          // 计算实际画布尺寸
          const canvasWidth = cols * cellWidth + (cols + 1) * padding;
          const canvasHeight = rows * cellHeight + (rows + 1) * padding;

          const stitchCanvas = document.createElement('canvas');
          stitchCanvas.width = canvasWidth;
          stitchCanvas.height = canvasHeight;
          const stitchCtx = stitchCanvas.getContext('2d');

          if (!stitchCtx) {
            resolve(null);
            return;
          }

          // 填充白色背景
          stitchCtx.fillStyle = '#FFFFFF';
          stitchCtx.fillRect(0, 0, canvasWidth, canvasHeight);

          // 记录所有已占用区域（用于智能填充不占格子的ROI）
          const occupiedRegions: OccupiedRegion[] = [];

          // 绘制每个占格子的ROI图片（统一单元格大小，平衡缩放）
          gridImages.forEach(({ img, label }, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;

            // 计算缩放比例（填充单元格，保持宽高比，平衡大小）
            const scaleX = (cellWidth - borderWidth * 2) / img.width;
            const scaleY = (cellHeight - borderWidth * 2) / img.height;
            const scale = Math.min(scaleX, scaleY); // 保持宽高比

            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;

            // 计算位置（居中显示，减少空白）
            const x = padding + col * (cellWidth + padding) + (cellWidth - scaledWidth) / 2;
            const y = padding + row * (cellHeight + padding) + (cellHeight - scaledHeight) / 2;

            // 记录占用区域
            occupiedRegions.push({
              x: x - borderWidth,
              y: y - borderWidth,
              width: scaledWidth + borderWidth * 2,
              height: scaledHeight + borderWidth * 2
            });

            // 绘制边框（阴影效果）
            stitchCtx.shadowColor = 'rgba(0, 0, 0, 0.1)';
            stitchCtx.shadowBlur = 4;
            stitchCtx.shadowOffsetX = 2;
            stitchCtx.shadowOffsetY = 2;

            // 绘制边框
            stitchCtx.fillStyle = '#E5E5E5';
            stitchCtx.fillRect(x - borderWidth, y - borderWidth, scaledWidth + borderWidth * 2, scaledHeight + borderWidth * 2);

            // 重置阴影
            stitchCtx.shadowColor = 'transparent';
            stitchCtx.shadowBlur = 0;
            stitchCtx.shadowOffsetX = 0;
            stitchCtx.shadowOffsetY = 0;

            // 绘制图片
            stitchCtx.drawImage(img, x, y, scaledWidth, scaledHeight);

            console.log(`✅ 绘制占格子ROI [${label}] 到格子位置 (${col}, ${row})`);
          });

          // 🎯 智能填充不占格子的ROI到空白区域（mini模式：缩小+紧凑瀑布流排列）
          if (nonGridImages.length > 0) {
            console.log(`🔍 开始智能填充${nonGridImages.length}个mini ROI（瀑布流布局）`);

            // mini目标缩小到格子的40%高度，紧凑排列
            const miniScale = 0.4;
            const miniMaxHeight = cellHeight * miniScale;
            const miniPadding = 6; // mini之间的间距更小

            // 1. 识别格子布局中的空白格子区域
            const totalGrids = cols * rows;
            const emptyGridCells: EmptySpace[] = [];

            for (let i = gridImages.length; i < totalGrids; i++) {
              const eRow = Math.floor(i / cols);
              const eCol = i % cols;
              const gridX = padding + eCol * (cellWidth + padding);
              const gridY = padding + eRow * (cellHeight + padding);
              emptyGridCells.push({ x: gridX, y: gridY, width: cellWidth, height: cellHeight });
            }

            // 2. 预计算每个mini的缩放尺寸
            const miniSized = nonGridImages.map(({ img, label }) => {
              const scale = Math.min(miniMaxHeight / img.height, (cellWidth * 0.48) / img.width, 1);
              return {
                img, label,
                w: Math.round(img.width * scale),
                h: Math.round(img.height * scale),
              };
            });

            // 3. 瀑布流布局：在空白格子内从左到右、从上到下紧凑排列
            let cursorX = 0;
            let cursorY = 0;
            let rowMaxH = 0;
            let cellIdx = 0;
            let cellOriginX = 0;
            let cellOriginY = 0;
            let cellAvailW = 0;
            let cellAvailH = 0;

            const initCell = () => {
              if (cellIdx < emptyGridCells.length) {
                const cell = emptyGridCells[cellIdx];
                cellOriginX = cell.x + borderWidth;
                cellOriginY = cell.y + borderWidth;
                cellAvailW = cell.width - borderWidth * 2;
                cellAvailH = cell.height - borderWidth * 2;
              } else {
                // 画布底部追加区域
                cellOriginX = padding;
                cellOriginY = canvasHeight; // 会扩展画布
                cellAvailW = canvasWidth - padding * 2;
                cellAvailH = miniMaxHeight * 3;
              }
              cursorX = 0;
              cursorY = 0;
              rowMaxH = 0;
            };

            initCell();
            let filledCount = 0;

            for (const { img, label, w, h } of miniSized) {
              // 换行检查
              if (cursorX + w > cellAvailW) {
                cursorY += rowMaxH + miniPadding;
                cursorX = 0;
                rowMaxH = 0;
              }
              // 换格子检查
              if (cursorY + h > cellAvailH) {
                cellIdx++;
                initCell();
              }

              const drawX = cellOriginX + cursorX;
              const drawY = cellOriginY + cursorY;

              // 绘制mini边框
              stitchCtx.fillStyle = '#D4D4D8';
              stitchCtx.fillRect(drawX - 1, drawY - 1, w + 2, h + 2);

              // 绘制缩小后的图片
              stitchCtx.drawImage(img, drawX, drawY, w, h);

              // 记录占用
              occupiedRegions.push({ x: drawX - 1, y: drawY - 1, width: w + 2, height: h + 2 });

              cursorX += w + miniPadding;
              rowMaxH = Math.max(rowMaxH, h);
              filledCount++;
              console.log(`✅ mini ROI [${label}] 缩放到 ${w}×${h} 放置于 (${Math.round(drawX)}, ${Math.round(drawY)})`);
            }

            console.log(`📊 成功填充${filledCount}个mini ROI（瀑布流布局）`);
          }

          const stitchedBase64 = stitchCanvas.toDataURL('image/jpeg', 0.9); // 提高质量
          resolve(stitchedBase64.split(',')[1]);
        }
      };
      img.onerror = (error) => {
        console.error(`加载ROI图片失败: ${snapshot.label}`, error);
        loadedCount++;
        if (loadedCount === roiSnapshots.length) {
          resolve((gridImages.length === 0 && nonGridImages.length === 0) ? null : null);
        }
      };
      img.src = snapshot.imageDataUrl.includes('data:') ? snapshot.imageDataUrl : `data:image/jpeg;base64,${snapshot.imageDataUrl}`;
    });
  });
}

/**
 * 拼接多个检测区域
 * 从原始图片中提取多个检测区域并拼接成一张图片
 *
 * @param base64Image - 原始图片的Base64编码（含data:image/jpeg;base64,前缀）
 * @param detections - 检测结果数组
 * @returns Promise<拼接后的Base64图片（含前缀）>
 */
export async function stitchMultipleROIs(
  base64Image: string,
  detections: Detection[]
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (detections.length === 0) {
          console.log('⚠️ 没有检测结果，返回原图');
          resolve(base64Image);
          return;
        }

        console.log(`🔍 开始多区域拼接，检测目标数量: ${detections.length}`);
        console.log('检测目标详情:', detections.map(d => ({ label: d.label, bbox: d.bbox })));

        // 计算拼接后的画布尺寸
        const maxWidth = 800;
        const maxHeight = 600;
        const padding = 20; // 区域之间的间距

        // 计算每个区域的尺寸
        const regions = detections.map(detection => {
          let x1, y1, x2, y2;

          if (detection.bbox.x1 !== undefined && detection.bbox.y1 !== undefined &&
            detection.bbox.x2 !== undefined && detection.bbox.y2 !== undefined) {
            // 使用x1,y1,x2,y2格式
            if (detection.bbox.x1 > 1 || detection.bbox.y1 > 1 || detection.bbox.x2 > 1 || detection.bbox.y2 > 1) {
              x1 = detection.bbox.x1;
              y1 = detection.bbox.y1;
              x2 = detection.bbox.x2;
              y2 = detection.bbox.y2;
            } else {
              x1 = detection.bbox.x1 * img.width;
              y1 = detection.bbox.y1 * img.height;
              x2 = detection.bbox.x2 * img.width;
              y2 = detection.bbox.y2 * img.height;
            }
          } else if (detection.bbox.x !== undefined && detection.bbox.y !== undefined &&
            detection.bbox.width !== undefined && detection.bbox.height !== undefined) {
            // 使用x,y,width,height格式
            const { x, y, width, height } = detection.bbox;
            if (x > 1 || y > 1 || width > 1 || height > 1) {
              x1 = x;
              y1 = y;
              x2 = x + width;
              y2 = y + height;
            } else {
              x1 = x * img.width;
              y1 = y * img.height;
              x2 = (x + width) * img.width;
              y2 = (y + height) * img.height;
            }
          } else {
            console.warn(`检测框格式不支持:`, detection.bbox);
            return null;
          }

          // 确保坐标在图片范围内
          x1 = Math.max(0, Math.min(x1, img.width));
          y1 = Math.max(0, Math.min(y1, img.height));
          x2 = Math.max(0, Math.min(x2, img.width));
          y2 = Math.max(0, Math.min(y2, img.height));

          const regionWidth = x2 - x1;
          const regionHeight = y2 - y1;

          // 添加边距
          const margin = 10;
          const cropX = Math.max(0, x1 - margin);
          const cropY = Math.max(0, y1 - margin);
          const cropWidth = Math.min(img.width - cropX, regionWidth + 2 * margin);
          const cropHeight = Math.min(img.height - cropY, regionHeight + 2 * margin);

          return {
            label: detection.label,
            x: cropX,
            y: cropY,
            width: cropWidth,
            height: cropHeight,
            confidence: detection.confidence
          };
        }).filter(region => region !== null) as Array<{
          label: string;
          x: number;
          y: number;
          width: number;
          height: number;
          confidence?: number;
        }>;

        if (regions.length === 0) {
          console.warn('没有有效的检测区域');
          resolve(base64Image);
          return;
        }

        // 计算拼接布局
        let canvasWidth, canvasHeight;
        if (regions.length === 1) {
          // 单个区域，直接使用该区域尺寸
          const region = regions[0];
          canvasWidth = Math.min(region.width, maxWidth);
          canvasHeight = Math.min(region.height, maxHeight);
        } else if (regions.length === 2) {
          // 两个区域，水平排列
          const totalWidth = regions.reduce((sum, r) => sum + r.width, 0) + padding;
          const maxRegionHeight = Math.max(...regions.map(r => r.height));
          canvasWidth = Math.min(totalWidth, maxWidth);
          canvasHeight = Math.min(maxRegionHeight, maxHeight);
        } else {
          // 多个区域，网格布局
          const cols = Math.ceil(Math.sqrt(regions.length));
          const rows = Math.ceil(regions.length / cols);
          const maxRegionWidth = Math.max(...regions.map(r => r.width));
          const maxRegionHeight = Math.max(...regions.map(r => r.height));
          canvasWidth = Math.min(cols * maxRegionWidth + (cols - 1) * padding, maxWidth);
          canvasHeight = Math.min(rows * maxRegionHeight + (rows - 1) * padding, maxHeight);
        }

        // 创建拼接画布
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          console.error('无法创建拼接canvas上下文');
          resolve(base64Image);
          return;
        }

        // 设置白色背景
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // 绘制各个区域
        let currentX = 0;
        let currentY = 0;
        let currentRow = 0;
        let currentCol = 0;
        const cols = Math.ceil(Math.sqrt(regions.length));

        regions.forEach((region, index) => {
          if (regions.length === 1) {
            // 单个区域，居中显示
            const scaleX = canvasWidth / region.width;
            const scaleY = canvasHeight / region.height;
            const scale = Math.min(scaleX, scaleY, 1);
            const scaledWidth = region.width * scale;
            const scaledHeight = region.height * scale;
            const offsetX = (canvasWidth - scaledWidth) / 2;
            const offsetY = (canvasHeight - scaledHeight) / 2;

            ctx.drawImage(
              img,
              region.x, region.y, region.width, region.height,
              offsetX, offsetY, scaledWidth, scaledHeight
            );
          } else if (regions.length === 2) {
            // 两个区域，水平排列
            const scaleX = (canvasWidth - padding) / (regions[0].width + regions[1].width);
            const scaleY = canvasHeight / Math.max(regions[0].height, regions[1].height);
            const scale = Math.min(scaleX, scaleY, 1);

            const scaledWidth = region.width * scale;
            const scaledHeight = region.height * scale;
            const offsetY = (canvasHeight - scaledHeight) / 2;

            ctx.drawImage(
              img,
              region.x, region.y, region.width, region.height,
              currentX, offsetY, scaledWidth, scaledHeight
            );

            currentX += scaledWidth + padding;
          } else {
            // 多个区域，网格布局
            const cellWidth = (canvasWidth - (cols - 1) * padding) / cols;
            const cellHeight = (canvasHeight - (Math.ceil(regions.length / cols) - 1) * padding) / Math.ceil(regions.length / cols);

            const scaleX = cellWidth / region.width;
            const scaleY = cellHeight / region.height;
            const scale = Math.min(scaleX, scaleY, 1);

            const scaledWidth = region.width * scale;
            const scaledHeight = region.height * scale;
            const offsetX = (cellWidth - scaledWidth) / 2;
            const offsetY = (cellHeight - scaledHeight) / 2;

            const drawX = currentCol * (cellWidth + padding) + offsetX;
            const drawY = currentRow * (cellHeight + padding) + offsetY;

            ctx.drawImage(
              img,
              region.x, region.y, region.width, region.height,
              drawX, drawY, scaledWidth, scaledHeight
            );

            currentCol++;
            if (currentCol >= cols) {
              currentCol = 0;
              currentRow++;
            }
          }
        });

        const stitchedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        console.log(`🎯 多区域拼接完成: ${regions.length}个区域 -> ${canvasWidth}x${canvasHeight}`);
        console.log(`🎯 拼接后base64长度: ${stitchedBase64.length}`);

        resolve(stitchedBase64);
      } catch (error) {
        console.error('多区域拼接失败:', error);
        resolve(base64Image);
      }
    };
    img.onerror = () => {
      console.error('图片加载失败');
      resolve(base64Image);
    };
    img.src = base64Image;
  });
}
