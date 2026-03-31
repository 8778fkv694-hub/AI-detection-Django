# 流媒体API诊断检查清单

## 1. Network面板URL检查

### 开发环境
- ✅ Request URL应该以 `/api` 开头
- ✅ 完整URL格式：`http://localhost:3303/api/streams/{id}/frame/?...`
- ✅ Vite代理会将 `/api` 转发到 `http://127.0.0.1:8000`

### 生产环境
- ✅ Request URL应该以 `http://localhost:8012/api` 或 `https://localhost:8012/api` 开头
- ✅ 完整URL格式：`http://localhost:8012/api/streams/{id}/frame/?...`

### 修复
如果URL以 `api/...` 开头（缺少前导斜杠），已修复 `apiFetch` 函数：
```typescript
// 确保endpoint以/开头（相对路径）
const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
const url = normalizedEndpoint.startsWith('http') ? normalizedEndpoint : `${API_BASE_URL}${normalizedEndpoint}`;
```

## 2. GET /api/streams/{id}/ 检查

### 测试命令
```bash
curl "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/"
```

### 预期结果
- ✅ 状态码：200 OK
- ✅ 响应包含流媒体对象信息

### 如果返回404
可能原因：
1. 流ID错误
2. 流媒体对象已删除
3. 权限问题（需要检查Django权限设置）

## 3. startStream(id) 和 getStreamFrame(id) ID一致性

### 代码检查点

**KitMatchingScreen.tsx:**
```typescript
const streamId = deviceId.replace('stream-', ''); // 提取流ID
// ...
await startHLSStream(streamId); // 或 startStream(streamId)
// ...
getStreamFrame(streamId, ...); // 使用同一个streamId
```

### 验证
- ✅ `startStream` 和 `getStreamFrame` 使用相同的 `streamId`
- ✅ `streamId` 从 `deviceId.replace('stream-', '')` 提取
- ✅ 没有额外的ID转换或处理

## 4. Authorization头检查

### 当前配置
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

### 检查项
- ✅ `credentials: 'include'` - 包含cookies
- ✅ CSRF Token - 自动添加（POST/PUT/PATCH/DELETE请求）
- ⚠️ Authorization头 - 未配置（如果后端需要JWT/Bearer token，需要添加）

### 如果需要添加Authorization头
```typescript
// 在 apiFetch 函数中添加
const authToken = localStorage.getItem('auth_token'); // 或其他存储方式
if (authToken) {
  defaultOptions.headers['Authorization'] = `Bearer ${authToken}`;
}
```

## 5. Vite代理配置检查

### 当前配置（vite.config.ts）
```typescript
proxy: {
  // 所有其他API请求转发到Django后端
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

### 验证
- ✅ `/api` 路径代理到 `http://127.0.0.1:8000`
- ✅ `changeOrigin: true` - 修改请求头中的origin
- ✅ `secure: false` - 允许自签名证书
- ✅ 代理日志已配置（可在Vite控制台查看）

### 测试代理
1. 打开浏览器开发者工具
2. 查看Network面板
3. 发送请求到 `/api/streams/...`
4. 检查Vite控制台是否有代理日志输出

## 6. 完整测试流程

### 步骤1：检查流媒体对象存在
```bash
curl "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/"
# 应该返回200和流媒体对象信息
```

### 步骤2：启动流媒体
```bash
curl -X POST "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/start/" \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <token>" \
  --cookie "csrftoken=<token>"
# 应该返回200和成功消息
```

### 步骤3：获取帧
```bash
curl "http://localhost:8000/api/streams/cd2b481b-6f0a-4b6e-9250-215e4924c4d8/frame/?format=webp&quality=100&width=1280"
# 应该返回200和WebP格式的帧数据
```

### 步骤4：前端测试
1. 打开浏览器开发者工具
2. 切换到Network面板
3. 过滤：`frame`
4. 在前端开启摄像头
5. 检查请求：
   - URL格式：`/api/streams/{id}/frame/?...`
   - 状态码：200
   - 响应格式：JSON with `frame` field

## 7. 常见问题排查

### 问题1：404 Not Found
**可能原因：**
- Django服务未重启（新代码未加载）
- 流ID错误
- 流媒体对象已删除

**解决：**
1. 重启Django服务
2. 检查流ID是否正确
3. 验证流媒体对象是否存在

### 问题2：CORS错误
**可能原因：**
- Vite代理未正确配置
- Django CORS设置问题

**解决：**
1. 检查Vite代理配置
2. 检查Django `django-cors-headers` 配置

### 问题3：CSRF验证失败
**可能原因：**
- CSRF token未正确获取
- Cookie未正确设置

**解决：**
1. 检查CSRF token获取逻辑
2. 确保cookie正确设置
3. 检查Django CSRF设置

### 问题4：URL拼接错误
**症状：** URL为 `api/streams/...` 而不是 `/api/streams/...`

**已修复：** `apiFetch` 函数已添加endpoint规范化

## 8. 验证清单

- [ ] Network面板URL以 `/api` 开头（开发）或 `http://localhost:8012/api` 开头（生产）
- [ ] GET `/api/streams/{id}/` 返回200
- [ ] `startStream(id)` 和 `getStreamFrame(id)` 使用相同的id
- [ ] Authorization头正确携带（如果需要）
- [ ] Vite代理正确转发请求到Django
- [ ] CSRF token正确添加
- [ ] 请求头包含 `Content-Type: application/json`
- [ ] `credentials: include` 已设置

---

**最后更新：** 2025-11-13

