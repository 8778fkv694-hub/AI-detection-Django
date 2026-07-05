/**
 * RPA 本地文件夹操作 API 出口（行动文档 W5）
 *
 * 收口 useTempFolder.ts / useFolderOperations.ts 中重复的三个 /api/rpa/* 调用。
 * 这三个接口由本机 rpa-server.js 提供（vite 代理转发的相对路径），
 * 不走 Django buildApiUrl 机制，因此保持裸相对路径 fetch。
 */

export interface RpaSaveImageResult {
  ok: boolean;
  result?: any;
  status?: number;
  statusText?: string;
}

export async function saveImageToFolder(
  base64Image: string,
  fileName: string,
  folder: string
): Promise<RpaSaveImageResult> {
  const response = await fetch('/api/rpa/save-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64Image, fileName, folder }),
  });
  if (response.ok) {
    const result = await response.json();
    return { ok: true, result };
  }
  return { ok: false, status: response.status, statusText: response.statusText };
}

export async function openTempFolder(folderPath: string): Promise<boolean> {
  const response = await fetch('/api/rpa/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  return response.ok;
}

export interface RpaClearFolderResult {
  ok: boolean;
  deletedCount?: number;
}

export async function clearTempFolder(folderPath: string): Promise<RpaClearFolderResult> {
  const response = await fetch('/api/rpa/clear-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  if (response.ok) {
    const result = await response.json();
    return { ok: true, deletedCount: result.deletedCount };
  }
  return { ok: false };
}
