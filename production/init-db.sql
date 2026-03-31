-- AI检测系统数据库初始化脚本

-- 创建数据库（如果不存在）
-- 注意：在Docker环境中，数据库已经通过环境变量创建

-- 设置时区
SET timezone = 'Asia/Shanghai';

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 创建索引优化
-- 这些索引将在Django迁移后创建，这里只是示例

-- 为检测结果表创建索引（如果存在）
-- CREATE INDEX IF NOT EXISTS idx_inspection_results_created_at ON inspection_results(created_at);
-- CREATE INDEX IF NOT EXISTS idx_inspection_results_batch_id ON inspection_results(batch_id);

-- 为检测标准表创建索引（如果存在）
-- CREATE INDEX IF NOT EXISTS idx_inspection_standards_name ON inspection_standards(name);

-- 设置数据库参数优化
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- 重新加载配置
SELECT pg_reload_conf();
