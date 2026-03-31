#!/usr/bin/env node

/**
 * 提交前检查脚本
 * 用于在代码提交前自动检查常见问题
 */

const fs = require('fs');
const path = require('path');

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`)
};

// 检查项目
const checks = [
  {
    name: '状态管理检查',
    check: checkStateManagement
  },
  {
    name: '图片数据格式检查',
    check: checkImageDataFormat
  },
  {
    name: '阈值配置检查',
    check: checkThresholdConfig
  },
  {
    name: '错误处理检查',
    check: checkErrorHandling
  }
];

/**
 * 检查状态管理问题
 */
function checkStateManagement() {
  const issues = [];
  
  // 检查是否有重复的状态定义
  const stateFiles = findFiles('src', ['.tsx', '.ts']).filter(file => 
    file.includes('Screen') || file.includes('Store')
  );
  
  stateFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // 检查是否有重复的useState定义
    const useStateMatches = content.match(/useState<[^>]*>/g) || [];
    const uniqueStates = new Set(useStateMatches);
    
    if (useStateMatches.length !== uniqueStates.size) {
      issues.push(`${file}: 发现重复的useState定义`);
    }
    
    // 检查是否有状态管理混用
    if (content.includes('useState') && content.includes('useAppStore') && content.includes('useSafetyEquipmentStore')) {
      issues.push(`${file}: 可能存在状态管理混用问题`);
    }
  });
  
  return issues;
}

/**
 * 检查图片数据格式
 */
function checkImageDataFormat() {
  const issues = [];
  
  const files = findFiles('src', ['.tsx', '.ts']);
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // 检查是否有纯base64图片数据
    if (content.includes('base64,') && !content.includes('data:image/')) {
      issues.push(`${file}: 可能存在图片数据格式问题`);
    }
    
    // 检查图片处理函数
    if (content.includes('image') && content.includes('base64') && !content.includes('normalizeImageData')) {
      issues.push(`${file}: 建议使用normalizeImageData函数处理图片数据`);
    }
  });
  
  return issues;
}

/**
 * 检查阈值配置
 */
function checkThresholdConfig() {
  const issues = [];
  
  const files = findFiles('src', ['.tsx', '.ts']);
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // 检查是否有硬编码的阈值
    const hardcodedThresholds = content.match(/0\.\d+/g) || [];
    if (hardcodedThresholds.length > 3) {
      issues.push(`${file}: 发现多个硬编码阈值，建议使用配置管理`);
    }
    
    // 检查是否有重复的阈值定义
    if (content.includes('captureThreshold') && content.includes('personThreshold')) {
      issues.push(`${file}: 可能存在重复的阈值定义`);
    }
  });
  
  return issues;
}

/**
 * 检查错误处理
 */
function checkErrorHandling() {
  const issues = [];
  
  const files = findFiles('src', ['.tsx', '.ts']);
  
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    
    // 检查异步操作是否有错误处理
    const asyncFunctions = content.match(/async\s+\w+\s*\(/g) || [];
    const tryCatchBlocks = (content.match(/try\s*{/g) || []).length;
    
    if (asyncFunctions.length > tryCatchBlocks) {
      issues.push(`${file}: 部分异步操作缺少错误处理`);
    }
    
    // 检查fetch调用是否有错误处理
    const fetchCalls = (content.match(/fetch\(/g) || []).length;
    if (fetchCalls > 0 && tryCatchBlocks === 0) {
      issues.push(`${file}: fetch调用缺少错误处理`);
    }
  });
  
  return issues;
}

/**
 * 查找文件
 */
function findFiles(dir, extensions) {
  let results = [];
  const list = fs.readdirSync(dir);
  
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat && stat.isDirectory()) {
      // 跳过node_modules和.git目录
      if (!['node_modules', '.git', 'dist', 'build'].includes(file)) {
        results = results.concat(findFiles(filePath, extensions));
      }
    } else {
      const ext = path.extname(file);
      if (extensions.includes(ext)) {
        results.push(filePath);
      }
    }
  });
  
  return results;
}

/**
 * 主函数
 */
function main() {
  log.info('开始代码质量检查...');
  
  let totalIssues = 0;
  
  checks.forEach(check => {
    log.info(`检查: ${check.name}`);
    const issues = check.check();
    
    if (issues.length === 0) {
      log.success(`${check.name}: 通过`);
    } else {
      log.warning(`${check.name}: 发现 ${issues.length} 个问题`);
      issues.forEach(issue => {
        log.error(`  ${issue}`);
      });
      totalIssues += issues.length;
    }
  });
  
  console.log('\n' + '='.repeat(50));
  
  if (totalIssues === 0) {
    log.success('所有检查通过！可以安全提交代码。');
    process.exit(0);
  } else {
    log.error(`发现 ${totalIssues} 个问题，请修复后再提交。`);
    log.info('建议查看 DEVELOPMENT_GUIDELINES.md 了解最佳实践。');
    process.exit(1);
  }
}

// 运行检查
if (require.main === module) {
  main();
}

module.exports = { checks, main };
