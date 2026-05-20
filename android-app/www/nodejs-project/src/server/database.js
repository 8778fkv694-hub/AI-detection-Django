const LowDB = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

// 数据库文件路径
let dbPath = path.join(__dirname, '../../data/db.json');

// 检测是否在 nodejs-mobile 移动端环境
try {
  const cordova = require('cordova-bridge');
  if (cordova && cordova.app && typeof cordova.app.datadir === 'function') {
    const d = cordova.app.datadir();
    if (d) {
      dbPath = path.join(d, 'persistent_data', 'db', 'db.json');
      console.log('📱 [Database] 移动端环境检测成功，重定向数据路径为:', dbPath);
    }
  }
} catch (e) {
  // 忽略，在非 Cordova 环境下使用常规路径
}

// 确保数据目录存在
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 如果是移动端环境且数据库文件不存在，尝试从出厂 seed 导入
if (!fs.existsSync(dbPath)) {
  const seedPath = path.join(__dirname, 'db-seed.json');
  if (fs.existsSync(seedPath)) {
    console.log('🌱 [Database] 发现出厂数据包，正在导入...');
    try {
      fs.copyFileSync(seedPath, dbPath);
    } catch (err) {
      console.error('❌ [Database] 导入出厂数据包失败:', err);
    }
  }
}

// 初始化数据库
const adapter = new FileSync(dbPath);
const db = LowDB(adapter);

// 默认数据结构
const defaultData = {
  results: [],
  standards: [],
  modelVersions: [],
  ppeModelStatus: {
    isLoaded: false,
    lastUpdated: null,
    version: '1.0.0'
  }
};

// 初始化数据库（如果不存在）
if (!db.has('results').value()) {
  db.defaults(defaultData).write();
}

// 获取数据库实例
const getDb = () => db;

module.exports = {
  getDb
};
