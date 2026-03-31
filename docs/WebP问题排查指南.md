# WebP格式404错误排查指南

## 问题现象
前端请求返回404错误：`{"detail":"未找到。"}`

## 可能原因

### 1. Django服务未重启（最可能）
**症状：** Django返回404，但流媒体对象存在
**解决：** 重启Django服务以加载新代码

### 2. Node.js服务不可用
**检查：**
```bash
curl http://localhost:3000/health
```
**解决：** 启动Node.js服务

### 3. 流媒体未启动
**检查：**
```bash
curl http://localhost:8000/api/streams/{stream_id}/status/
```
**解决：** 启动流媒体
```bash
curl -X POST http://localhost:8000/api/streams/{stream_id}/start/
```

### 4. stream_manager中没有流
**检查：** Django日志中是否有"Node.js服务可用"和"获取帧请求"的日志
**解决：** 确保流媒体已启动

## 排查步骤

### 步骤1：检查Node.js服务
```bash
curl http://localhost:3000/health
# 应该返回: {"status":"ok","service":"stream-media-service"}
```

### 步骤2：测试Node.js服务直接调用
```bash
curl "http://localhost:3000/api/streams/{stream_id}/frame?format=webp&quality=95&width=1280&url={视频路径}&stream_type=file"
# 应该返回: {"frame":"data:image/webp;base64,...",...}
```

### 步骤3：检查Django服务
```bash
curl http://localhost:8000/api/streams/{stream_id}/
# 应该返回流媒体对象信息
```

### 步骤4：检查Django日志
查看Django控制台输出，应该看到：
- `获取帧请求: stream_id=..., format=webp`
- `Node.js服务可用: True/False`
- `使用 Node.js 服务获取帧: ...` 或 `Node.js 服务返回None`

### 步骤5：重启Django服务
如果日志中没有看到新代码的输出，需要重启Django服务：
```bash
# 停止当前Django服务（Ctrl+C）
# 然后重新启动
python manage.py runserver 0.0.0.0:8000
```

## 验证WebP格式

### 成功标志
1. 前端请求URL包含 `format=webp`
2. Django返回200状态码
3. 响应中的frame字段以 `data:image/webp;base64,` 开头
4. 前端成功显示视频流

### 失败标志
1. 返回404：流媒体对象未找到或服务未重启
2. 返回500：Node.js服务错误或FFmpeg错误
3. frame字段为空：无法获取视频帧

## 快速修复

如果确认是Django服务未重启的问题：

1. **停止Django服务**（在运行Django的终端按Ctrl+C）

2. **重新启动Django服务**：
   ```bash
   cd backend
   python manage.py runserver 0.0.0.0:8000
   ```

3. **测试API**：
   ```bash
   curl "http://localhost:8000/api/streams/{stream_id}/frame/?format=webp&quality=95&width=1280"
   ```

4. **检查前端**：刷新浏览器页面，重新开启摄像头

## 当前状态

- ✅ Node.js服务：正常运行，WebP格式测试通过
- ✅ 前端代码：正确使用WebP格式
- ✅ Django代码：已集成Node.js服务
- ⚠️ Django服务：需要重启以加载新代码

---

**注意：** Django开发服务器通常会自动重载，但如果修改了导入的模块（如stream_api_nodejs），可能需要手动重启。

