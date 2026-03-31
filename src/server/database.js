const LowDB = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

// 数据库文件路径
const dbPath = path.join(__dirname, '../../data/db.json');

// 确保数据目录存在
const fs = require('fs');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
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
