// RPA服务器 - 提供文件管理功能
const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = 3002;

// 启用CORS
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 解析JSON
app.use(express.json());

// 临时文件夹路径
const TEMP_FOLDER = path.join(__dirname, 'temp_live');

// 确保临时文件夹存在
if (!fs.existsSync(TEMP_FOLDER)) {
    fs.mkdirSync(TEMP_FOLDER, { recursive: true });
}

// 保存单张图片
app.post('/api/rpa/save-image', (req, res) => {
    try {
        const { base64Image, fileName, folder } = req.body;
        
        if (!base64Image || !fileName) {
            return res.status(400).json({ error: '缺少必要参数' });
        }

        // 使用传入的文件夹路径或默认路径
        const targetFolder = folder || TEMP_FOLDER;
        
        // 确保目标文件夹存在
        if (!fs.existsSync(targetFolder)) {
            fs.mkdirSync(targetFolder, { recursive: true });
        }

        // 解码base64图片
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const filePath = path.join(targetFolder, fileName);
        
        // 保存文件
        fs.writeFileSync(filePath, imageBuffer);
        
        res.json({ 
            success: true, 
            message: '图片保存成功',
            filePath: filePath
        });
    } catch (error) {
        console.error('保存图片失败:', error);
        res.status(500).json({ error: '保存图片失败: ' + error.message });
    }
});

// 批量保存图片
app.post('/api/rpa/save-images-batch', (req, res) => {
    try {
        const { images } = req.body;
        
        if (!images || !Array.isArray(images)) {
            return res.status(400).json({ error: '缺少图片数据' });
        }

        const results = [];
        let successCount = 0;

        for (let i = 0; i < images.length; i++) {
            const { base64Image, fileName } = images[i];
            
            try {
                const imageBuffer = Buffer.from(base64Image, 'base64');
                const filePath = path.join(TEMP_FOLDER, fileName);
                
                fs.writeFileSync(filePath, imageBuffer);
                
                results.push({
                    index: i,
                    success: true,
                    filePath: filePath
                });
                successCount++;
            } catch (error) {
                results.push({
                    index: i,
                    success: false,
                    error: error.message
                });
            }
        }

        res.json({ 
            success: true, 
            message: `批量保存完成，成功 ${successCount}/${images.length} 张`,
            results: results
        });
    } catch (error) {
        console.error('批量保存图片失败:', error);
        res.status(500).json({ error: '批量保存图片失败: ' + error.message });
    }
});

// 打开文件夹
app.post('/api/rpa/open-folder', (req, res) => {
    try {
        const { folderPath } = req.body;
        const targetPath = folderPath || TEMP_FOLDER;
        
        // 确保文件夹存在
        if (!fs.existsSync(targetPath)) {
            fs.mkdirSync(targetPath, { recursive: true });
        }

        // 根据操作系统打开文件夹
        let command;
        if (process.platform === 'win32') {
            command = `explorer "${targetPath}"`;
        } else if (process.platform === 'darwin') {
            command = `open "${targetPath}"`;
        } else {
            command = `xdg-open "${targetPath}"`;
        }

        console.log(`执行命令: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('打开文件夹失败:', error);
                console.error('stderr:', stderr);
                res.status(500).json({ error: '打开文件夹失败: ' + error.message });
            } else {
                console.log('文件夹打开成功');
                console.log('stdout:', stdout);
                res.json({ success: true, message: '文件夹已打开' });
            }
        });
    } catch (error) {
        console.error('打开文件夹失败:', error);
        res.status(500).json({ error: '打开文件夹失败: ' + error.message });
    }
});

// 打开临时文件夹（不传参数）
app.post('/api/rpa/open-temp-folder', (req, res) => {
    try {
        // 确保临时文件夹存在
        if (!fs.existsSync(TEMP_FOLDER)) {
            fs.mkdirSync(TEMP_FOLDER, { recursive: true });
        }

        // 根据操作系统打开文件夹
        let command;
        if (process.platform === 'win32') {
            command = `explorer "${TEMP_FOLDER}"`;
        } else if (process.platform === 'darwin') {
            command = `open "${TEMP_FOLDER}"`;
        } else {
            command = `xdg-open "${TEMP_FOLDER}"`;
        }

        console.log(`执行命令: ${command}`);
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('打开临时文件夹失败:', error);
                console.error('stderr:', stderr);
                res.status(500).json({ error: '打开临时文件夹失败: ' + error.message });
            } else {
                console.log('临时文件夹打开成功');
                console.log('stdout:', stdout);
                res.json({ success: true, message: '临时文件夹已打开' });
            }
        });
    } catch (error) {
        console.error('打开临时文件夹失败:', error);
        res.status(500).json({ error: '打开临时文件夹失败: ' + error.message });
    }
});

// 清空文件夹
app.post('/api/rpa/clear-folder', (req, res) => {
    try {
        const { folderPath } = req.body;
        const targetPath = folderPath || TEMP_FOLDER;
        
        if (!fs.existsSync(targetPath)) {
            return res.json({ success: true, message: '文件夹不存在', deletedCount: 0 });
        }

        const files = fs.readdirSync(targetPath);
        let deletedCount = 0;

        files.forEach(file => {
            const filePath = path.join(targetPath, file);
            try {
                fs.unlinkSync(filePath);
                deletedCount++;
            } catch (error) {
                console.error(`删除文件失败 ${file}:`, error);
            }
        });

        res.json({ 
            success: true, 
            message: `清空文件夹完成，删除了 ${deletedCount} 个文件`,
            deletedCount: deletedCount
        });
    } catch (error) {
        console.error('清空文件夹失败:', error);
        res.status(500).json({ error: '清空文件夹失败: ' + error.message });
    }
});

// 清空临时文件夹（不传参数）
app.post('/api/rpa/clear-temp-folder', (req, res) => {
    try {
        if (!fs.existsSync(TEMP_FOLDER)) {
            return res.json({ success: true, message: '临时文件夹不存在', deletedCount: 0 });
        }

        const files = fs.readdirSync(TEMP_FOLDER);
        let deletedCount = 0;

        files.forEach(file => {
            const filePath = path.join(TEMP_FOLDER, file);
            try {
                fs.unlinkSync(filePath);
                deletedCount++;
            } catch (error) {
                console.error(`删除文件失败 ${file}:`, error);
            }
        });

        res.json({ 
            success: true, 
            message: `清空临时文件夹完成，删除了 ${deletedCount} 个文件`,
            deletedCount: deletedCount
        });
    } catch (error) {
        console.error('清空临时文件夹失败:', error);
        res.status(500).json({ error: '清空临时文件夹失败: ' + error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 RPA服务器启动成功!`);
    console.log(`📡 服务地址: http://localhost:${PORT}`);
    console.log(`📁 临时文件夹: ${TEMP_FOLDER}`);
    console.log(`🌐 支持文件管理功能`);
});

module.exports = app;
