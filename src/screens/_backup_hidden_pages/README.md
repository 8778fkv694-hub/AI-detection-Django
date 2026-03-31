# 隐藏页面备份文件夹

此文件夹用于存放前端不显示的页面文件。

## 已隐藏的页面

1. **OCR防呆检测页面** (`OCRErrorPreventionScreen.tsx`)
   - 路由路径: `/ocr-error-prevention`
   - 隐藏日期: 2025-01-17
   - 说明: 已从导航菜单和路由中移除，但保留文件以备将来使用

2. **OCR防呆检测结果页面** (`OCRErrorPreventionResultsScreen.tsx`)
   - 路由路径: `/ocr-error-prevention-results`
   - 隐藏日期: 2025-01-17
   - 说明: 已从导航菜单和路由中移除，但保留文件以备将来使用

3. **齐套化检测测试页面** (`KitMatchingScreenTest.tsx`)
   - 路由路径: `/kit-matching-test`
   - 隐藏日期: 2025-01-17
   - 说明: 已从导航菜单和路由中移除，但保留文件以备将来使用

## 备份文件

- `OCRErrorPreventionScreen.tsx.bak` - 原始备份文件
- `OCRErrorPreventionScreen.tsx.before-console-cleanup` - 清理控制台日志前的备份

## 如何恢复页面

如果需要恢复这些页面，请执行以下步骤：

1. 将文件从 `_backup_hidden_pages` 文件夹移回 `src/screens/` 目录
2. 在 `src/App.tsx` 中取消注释相关的导入语句
3. 在 `src/App.tsx` 的 `navItems` 数组中取消注释相关导航项
4. 在 `src/App.tsx` 的 `<Routes>` 中取消注释相关路由

