/**
 * 测试和验证工具
 * 用于在开发过程中验证功能是否正常工作
 */

import type { InspectionResult } from '@/types';

/**
 * 功能测试套件
 */
export class FunctionTestSuite {
  private tests: Array<{
    name: string;
    test: () => Promise<boolean> | boolean;
    description: string;
  }> = [];

  /**
   * 添加测试用例
   */
  addTest(name: string, test: () => Promise<boolean> | boolean, description: string) {
    this.tests.push({ name, test, description });
  }

  /**
   * 运行所有测试
   */
  async runAllTests(): Promise<{
    passed: number;
    failed: number;
    results: Array<{
      name: string;
      passed: boolean;
      error?: string;
    }>;
  }> {
    const results = [];
    let passed = 0;
    let failed = 0;

    console.group('🧪 功能测试开始');
    
    for (const test of this.tests) {
      try {
        console.log(`测试: ${test.name}`);
        const result = await test.test();
        
        if (result) {
          console.log(`✅ ${test.name}: 通过`);
          passed++;
        } else {
          console.log(`❌ ${test.name}: 失败`);
          failed++;
        }
        
        results.push({
          name: test.name,
          passed: result,
          error: result ? undefined : '测试失败'
        });
      } catch (error) {
        console.log(`❌ ${test.name}: 错误 - ${error}`);
        failed++;
        results.push({
          name: test.name,
          passed: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    console.groupEnd();
    
    return { passed, failed, results };
  }
}

/**
 * 状态管理测试工具
 */
export class StateManagementTester {
  /**
   * 测试状态同步
   */
  static testStateSync<T>(
    localState: T[],
    globalState: T[],
    stateName: string
  ): boolean {
    console.log(`测试状态同步: ${stateName}`);
    
    if (localState.length !== globalState.length) {
      console.error(`❌ 状态长度不匹配: 本地${localState.length} vs 全局${globalState.length}`);
      return false;
    }
    
    const localIds = new Set(localState.map((item: any) => item.id));
    const globalIds = new Set(globalState.map((item: any) => item.id));
    
    const missingInGlobal = [...localIds].filter(id => !globalIds.has(id));
    const missingInLocal = [...globalIds].filter(id => !localIds.has(id));
    
    if (missingInGlobal.length > 0) {
      console.error(`❌ 全局状态缺少: ${missingInGlobal.join(', ')}`);
      return false;
    }
    
    if (missingInLocal.length > 0) {
      console.error(`❌ 本地状态缺少: ${missingInLocal.join(', ')}`);
      return false;
    }
    
    console.log(`✅ 状态同步正常`);
    return true;
  }

  /**
   * 测试状态更新
   */
  static testStateUpdate<T>(
    initialState: T,
    updateFunction: (state: T) => T,
    expectedState: T,
    testName: string
  ): boolean {
    console.log(`测试状态更新: ${testName}`);
    
    try {
      const newState = updateFunction(initialState);
      
      if (JSON.stringify(newState) === JSON.stringify(expectedState)) {
        console.log(`✅ 状态更新正确`);
        return true;
      } else {
        console.error(`❌ 状态更新不正确`);
        console.error('期望:', expectedState);
        console.error('实际:', newState);
        return false;
      }
    } catch (error) {
      console.error(`❌ 状态更新出错: ${error}`);
      return false;
    }
  }
}

/**
 * 图片数据测试工具
 */
export class ImageDataTester {
  /**
   * 测试图片数据格式
   */
  static testImageDataFormat(imageData: string): boolean {
    console.log('测试图片数据格式');
    
    if (!imageData) {
      console.error('❌ 图片数据为空');
      return false;
    }
    
    if (!imageData.startsWith('data:image/')) {
      console.error('❌ 图片数据格式不正确，应该以data:image/开头');
      return false;
    }
    
    if (!imageData.includes('base64,')) {
      console.error('❌ 图片数据缺少base64前缀');
      return false;
    }
    
    const base64Part = imageData.split('base64,')[1];
    if (!base64Part || base64Part.length === 0) {
      console.error('❌ 图片数据缺少base64内容');
      return false;
    }
    
    console.log('✅ 图片数据格式正确');
    return true;
  }

  /**
   * 测试图片加载
   */
  static testImageLoad(imageData: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('测试图片加载');
      
      const img = new Image();
      
      img.onload = () => {
        console.log('✅ 图片加载成功');
        resolve(true);
      };
      
      img.onerror = () => {
        console.error('❌ 图片加载失败');
        resolve(false);
      };
      
      img.src = imageData;
    });
  }
}

/**
 * 配置测试工具
 */
export class ConfigTester {
  /**
   * 测试阈值配置
   */
  static testThresholdConfig(thresholds: Record<string, number>): boolean {
    console.log('测试阈值配置');
    
    const errors: string[] = [];
    
    Object.entries(thresholds).forEach(([key, value]) => {
      if (typeof value !== 'number') {
        errors.push(`${key}: 必须是数字`);
      } else if (value < 0 || value > 1) {
        errors.push(`${key}: 必须在0-1之间`);
      }
    });
    
    if (errors.length > 0) {
      console.error('❌ 阈值配置错误:');
      errors.forEach(error => console.error(`  ${error}`));
      return false;
    }
    
    console.log('✅ 阈值配置正确');
    return true;
  }
}

/**
 * 检测结果测试工具
 */
export class DetectionResultTester {
  /**
   * 测试检测结果完整性
   */
  static testResultCompleteness(result: Partial<InspectionResult>): boolean {
    console.log('测试检测结果完整性');
    
    const requiredFields = ['id', 'timestamp', 'image', 'overallQuality', 'score', 'reason'];
    const missingFields = requiredFields.filter(field => {
      const value = result[field as keyof InspectionResult];
      return value === null || value === undefined || value === '';
    });
    
    if (missingFields.length > 0) {
      console.error(`❌ 缺少必需字段: ${missingFields.join(', ')}`);
      return false;
    }
    
    console.log('✅ 检测结果完整');
    return true;
  }

  /**
   * 测试检测结果格式
   */
  static testResultFormat(result: InspectionResult): boolean {
    console.log('测试检测结果格式');
    
    // 测试ID格式
    if (!result.id || typeof result.id !== 'string') {
      console.error('❌ ID格式不正确');
      return false;
    }
    
    // 测试时间戳格式
    if (!result.timestamp || isNaN(Date.parse(result.timestamp))) {
      console.error('❌ 时间戳格式不正确');
      return false;
    }
    
    // 测试图片数据格式
    if (!ImageDataTester.testImageDataFormat(result.image)) {
      return false;
    }
    
    // 测试质量等级
    const validQualities = ['合格', '存疑', '需复检'];
    if (!validQualities.includes(result.overallQuality)) {
      console.error(`❌ 质量等级不正确: ${result.overallQuality}`);
      return false;
    }
    
    // 测试分数范围
    if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
      console.error(`❌ 分数范围不正确: ${result.score}`);
      return false;
    }
    
    console.log('✅ 检测结果格式正确');
    return true;
  }
}

/**
 * 创建默认测试套件
 */
export function createDefaultTestSuite(): FunctionTestSuite {
  const suite = new FunctionTestSuite();
  
  // 添加基础测试
  suite.addTest(
    '图片数据格式测试',
    () => {
      const testData = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...';
      return ImageDataTester.testImageDataFormat(testData);
    },
    '验证图片数据格式是否正确'
  );
  
  suite.addTest(
    '阈值配置测试',
    () => {
      const testThresholds = {
        person: 0.5,
        cleanroom_cap: 0.8,
        mask: 0.7
      };
      return ConfigTester.testThresholdConfig(testThresholds);
    },
    '验证阈值配置是否正确'
  );
  
  return suite;
}

/**
 * 快速验证函数
 */
export const quickValidate = {
  /**
   * 验证状态管理
   */
  state: StateManagementTester.testStateSync,
  
  /**
   * 验证图片数据
   */
  image: ImageDataTester.testImageDataFormat,
  
  /**
   * 验证配置
   */
  config: ConfigTester.testThresholdConfig,
  
  /**
   * 验证检测结果
   */
  result: DetectionResultTester.testResultCompleteness
};
