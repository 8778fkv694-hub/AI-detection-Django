# 流媒体API检查结果报告

## 检查时间
2025-11-13

## 检查结果总结

### ✅ 1. Network面板URL检查

**开发环境：**
- ✅ Request URL正确以 `/api` 开头
- ✅ 完整URL格式：`http://localhost:3303/api/streams/{id}/frame/?...`
- ✅ 已修复URL拼接问题（确保endpoint以/开头）

**修复内容：**
```typescript
// src/lib/config.ts - apiFetch函数
// 确保endpoint以/开头（相对路径）
const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
const url = normalizedEndpoint.startsWith('http') ? normalizedEndpoint : `${API_BASE_URL}${normalizedEndpoint}`;
```

### ✅ 2. GET /api/streams/{id}/ 检查

**测试结果：**
```bash
curl "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/"
```

**响应：**
- ✅ 状态码：200 OK
- ✅ 流媒体对象存在
- ✅ 返回完整的流媒体信息

**结论：** 流媒体对象存在，ID正确，无权限问题。

### ✅ 3. startStream(id) 和 getStreamFrame(id) ID一致性

**代码流程：**

1. **KitMatchingScreen.tsx:**
   ```typescript
   const streamId = deviceId.replace('stream-', ''); // 提取流ID
   ```

2. **StreamPlayer构造函数:**
   ```typescript
   constructor(options: StreamPlayerOptions) {
     this.streamId = options.streamId; // 保存streamId
   }
   ```

3. **StreamPlayer.start():**
   ```typescript
   const firstFrame = await getStreamFrame(this.streamId, ...); // 使用相同的streamId
   ```

4. **StreamPlayer.fetchAndRenderFrame():**
   ```typescript
   const frameData = await getStreamFrame(this.streamId, ...); // 使用相同的streamId
   ```

**验证：**
- ✅ `startStream` 和 `getStreamFrame` 使用完全相同的 `streamId`
- ✅ `streamId` 从 `deviceId.replace('stream-', '')` 提取后直接使用
- ✅ 没有额外的ID转换或处理

**注意：** 在KitMatchingScreen中，如果使用HLS模式，会调用 `startHLSStream(streamId)`，但WebP模式直接使用StreamPlayer，StreamPlayer内部调用 `getStreamFrame(streamId)`，两者使用相同的streamId。

### ✅ 4. Authorization头检查

**当前配置：**
```typescript
const defaultOptions: RequestInit = {
  credentials: 'include', // 包含cookies
  headers: {
    'Content-Type': 'application/json',
    'X-CSRFToken': csrfToken, // CSRF token（POST/PUT/PATCH/DELETE）
    ...options.headers,
  },
  ...options,
};
```

**检查结果：**
- ✅ `credentials: 'include'` - 正确设置，包含cookies
- ✅ CSRF Token - 自动添加（POST/PUT/PATCH/DELETE请求）
- ⚠️ Authorization头 - 未配置（当前后端不需要，如果需要JWT/Bearer token，需要添加）

**结论：** 当前配置满足需求，如果后端需要Authorization头，需要额外配置。

### ✅ 5. Vite代理配置检查

**当前配置（vite.config.ts）：**
```typescript
proxy: {
  '/api': {
    target: 'http://127.0.0.1:8000',
    changeOrigin: true,
    secure: false,
    configure: (proxy, options) => {
      proxy.on('error', (err, req, res) => {
        console.log('Django proxy error', err);
      });
      proxy.on('proxyReq', (proxyReq, req, res) => {
        console.log('Sending Request to Django:', req.method, req.url);
      });
      proxy.on('proxyRes', (proxyRes, req, res) => {
        console.log('Received Response from Django:', proxyRes.statusCode, req.url);
      });
    },
  }
}
```

**验证：**
- ✅ `/api` 路径正确代理到 `http://127.0.0.1:8000`
- ✅ `changeOrigin: true` - 正确设置
- ✅ `secure: false` - 允许自签名证书
- ✅ 代理日志已配置（可在Vite控制台查看）

**测试：**
- ✅ 代理正常工作
- ✅ 请求正确转发到Django后端

## 发现的问题和修复

### 问题1：URL拼接可能缺少前导斜杠
**状态：** ✅ 已修复

**修复内容：**
- 在 `apiFetch` 函数中添加endpoint规范化
- 确保endpoint以 `/` 开头

### 问题2：Django服务需要重启
**状态：** ⚠️ 需要手动操作

**说明：**
- Django服务需要重启以加载新代码（Node.js集成）
- 重启后，frame API应该能正常工作

## 测试验证

### 测试1：获取流媒体对象
```bash
curl "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/"
```
**结果：** ✅ 200 OK

### 测试2：启动流媒体
```bash
curl -X POST "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/start/"
```
**结果：** ✅ 200 OK，流媒体启动成功

### 测试3：获取帧（需要重启Django后测试）
```bash
curl "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/frame/?format=webp&quality=100&width=1280"
```
**预期：** 重启Django后应该返回200和WebP格式的帧数据

## 下一步操作

1. **重启Django服务**（必须）
   - 停止当前Django服务（Ctrl+C）
   - 重新启动：`python manage.py runserver 0.0.0.0:8000`

2. **验证修复**
   - 刷新前端页面
   - 开启摄像头
   - 检查Network面板，确认请求成功

3. **检查日志**
   - 查看Django控制台，应该看到：
     - `获取帧请求: stream_id=..., format=webp`
     - `Node.js服务可用: True`
     - `使用 Node.js 服务获取帧: ...`

## 总结

所有检查项都已通过：
- ✅ URL拼接正确
- ✅ 流媒体对象存在
- ✅ ID一致性正确
- ✅ Authorization头配置正确（当前需求）
- ✅ Vite代理配置正确

**唯一需要操作：** 重启Django服务以加载新代码。

---

**检查完成时间：** 2025-11-13

