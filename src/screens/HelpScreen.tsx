import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Camera,
  FileText,
  Shield,
  Grid,
  Eye,
  ExternalLink,
  Play,
  Keyboard,
  MousePointer,
  Settings,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';

const HelpScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <HelpCircle className="h-8 w-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">AI检测系统帮助指南</h1>
          </div>
          <p className="text-slate-300 text-lg">了解如何使用AI检测系统进行各种检测任务</p>
        </div>

        {/* 快速开始 */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-400" />
              快速开始
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-700/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Camera className="h-5 w-5 text-blue-400" />
                  <h3 className="font-semibold text-white">1. 开启摄像头</h3>
                </div>
                <p className="text-slate-300 text-sm">点击"开启摄像头"按钮，选择要使用的摄像头设备</p>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="h-5 w-5 text-green-400" />
                  <h3 className="font-semibold text-white">2. 开始检测</h3>
                </div>
                <p className="text-slate-300 text-sm">点击"开始检测"或"开始监控"按钮启动AI检测</p>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5 text-purple-400" />
                  <h3 className="font-semibold text-white">3. 查看结果</h3>
                </div>
                <p className="text-slate-300 text-sm">在检测结果页面查看详细的检测数据和统计信息</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 功能模块说明 */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* 实时检测 */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Camera className="h-5 w-5 text-blue-400" />
                实时检测
                <Badge variant="secondary" className="ml-auto">实时</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">使用YOLO模型进行实时目标检测，支持多种检测类型。</p>

              <div className="space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <Keyboard className="h-4 w-4" />
                  快捷键
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">空格键</span>
                    <span className="text-white">抓拍图片</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">M键</span>
                    <span className="text-white">开始/停止检测</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">L键</span>
                    <span className="text-white">加载模型</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">F键</span>
                    <span className="text-white">全屏显示</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-white">操作流程</h4>
                <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                  <li>选择检测模型（PPE检测、通用检测等）</li>
                  <li>选择检测目标（人员、口罩、安全帽等）</li>
                  <li>开启摄像头并开始检测</li>
                  <li>实时查看检测结果和统计信息</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          {/* PPE检测 */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-400" />
                PPE检测
                <Badge variant="secondary" className="ml-auto">安全</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">专门用于检测个人防护装备（PPE），确保工作场所安全。</p>

              <div className="space-y-3">
                <h4 className="font-semibold text-white flex items-center gap-2">
                  <Keyboard className="h-4 w-4" />
                  快捷键
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">空格键</span>
                    <span className="text-white">手动抓拍</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">回车键</span>
                    <span className="text-white">开始检测</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">M键</span>
                    <span className="text-white">开始/停止监控</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">L键</span>
                    <span className="text-white">加载模型</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-white">检测项目</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">人员</Badge>
                  <Badge variant="outline" className="text-xs">口罩</Badge>
                  <Badge variant="outline" className="text-xs">安全帽</Badge>
                  <Badge variant="outline" className="text-xs">防护服</Badge>
                  <Badge variant="outline" className="text-xs">手套</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* OCR检测 */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5 text-purple-400" />
                OCR检测
                <Badge variant="secondary" className="ml-auto">文字识别</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">使用OCR技术识别图片中的文字内容，支持融合模式进行智能分析。</p>

              <div className="space-y-3">
                <h4 className="font-semibold text-white">融合模式 (双层融合架构)</h4>
                <div className="bg-slate-700/50 p-3 rounded-lg">
                  <p className="text-sm text-slate-300 mb-2">系统采用先进的"双层融合"架构，结合规则与AI：</p>
                  <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
                    <li>
                      <span className="text-blue-300 font-medium">第一层：规则融合 (Rule Fusion)</span>
                      <p className="pl-5 text-gray-400 text-xs mt-1">
                        基于OCR识别结果，通过<span className="text-white">关键词匹配</span>、<span className="text-white">置信度阈值</span>和<span className="text-white">文字方向检测</span>进行初筛。支持"负面清单"（如"存疑"）直接排除。
                      </p>
                    </li>
                    <li>
                      <span className="text-purple-300 font-medium">第二层：多模态AI融合 (AI Fusion)</span>
                      <p className="pl-5 text-gray-400 text-xs mt-1">
                        将OCR结果与<span className="text-white">视觉大模型 (LLM)</span>的语义分析相结合。AI能理解"表面无划痕"、"标签粘贴端正"等复杂外观标准。
                      </p>
                    </li>
                    <li className="pt-1">
                      <span className="text-green-300 font-medium">双重确认</span>: 只有当规则层和AI层都判定合格时，最终结果才为合格。
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-white">操作流程与快捷键</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm bg-slate-700/30 p-2 rounded">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Space (空格)</span>
                      <span className="text-white">手动抓拍</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">C 键</span>
                      <span className="text-white">开启摄像头</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">R 键</span>
                      <span className="text-white">重置状态</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Enter (回车)</span>
                      <span className="text-white">确认结果</span>
                    </div>
                  </div>
                  <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                    <li>上传图片或打开摄像头 (快捷键 C)</li>
                    <li>选择检测标准与关键词配置</li>
                    <li>启用"融合模式"以获得更高精度</li>
                    <li>点击抓拍 (快捷键 Space) 或开始实时检测</li>
                    <li>查看包含规则判定和AI分析的综合报告</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 批量检测 */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Grid className="h-5 w-5 text-orange-400" />
                批量检测
                <Badge variant="secondary" className="ml-auto">批量</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-300">批量处理多张图片，提高检测效率。</p>

              <div className="space-y-2">
                <h4 className="font-semibold text-white">支持格式</h4>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">JPG</Badge>
                  <Badge variant="outline" className="text-xs">PNG</Badge>
                  <Badge variant="outline" className="text-xs">BMP</Badge>
                  <Badge variant="outline" className="text-xs">TIFF</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-white">操作流程</h4>
                <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">
                  <li>选择或拖拽多张图片到上传区域</li>
                  <li>配置检测参数</li>
                  <li>开始批量检测</li>
                  <li>查看批量检测结果</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 多窗口功能 */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-cyan-400" />
              多窗口功能
              <Badge variant="secondary" className="ml-auto">新功能</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-slate-300">支持同时打开多个检测窗口，每个窗口独立运行，互不干扰。</p>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-semibold text-white">如何打开新窗口</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-slate-300">在侧边栏找到检测页面</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-slate-300">点击页面名称右侧的"新窗口"按钮</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-slate-300">新窗口会自动打开并跳转到对应页面</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-white">多窗口优势</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-slate-300">独立摄像头连接</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-slate-300">独立参数设置</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-slate-300">独立状态管理</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-slate-300">窗口标识符区分</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-700/50 p-4 rounded-lg">
              <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                <Info className="h-4 w-4 text-blue-400" />
                摄像头冲突处理
              </h4>
              <p className="text-sm text-slate-300">
                当多个窗口同时使用摄像头时，系统会自动检测冲突并提示用户。每个窗口都有独立的摄像头选择器，
                可以选择不同的摄像头设备避免冲突。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 常见问题 */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              常见问题
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-white mb-2">摄像头无法访问</h4>
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    <li>检查浏览器摄像头权限设置</li>
                    <li>确保摄像头没有被其他应用占用</li>
                    <li>尝试刷新页面重新获取权限</li>
                    <li>检查摄像头硬件连接</li>
                  </ul>
                </div>

                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-white mb-2">检测结果不准确</h4>
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    <li>确保图片清晰度足够</li>
                    <li>检查光照条件是否合适</li>
                    <li>尝试调整检测参数</li>
                    <li>选择更合适的检测模型</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-white mb-2">模型加载失败</h4>
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    <li>检查网络连接状态</li>
                    <li>确认后端服务正常运行</li>
                    <li>尝试重新加载模型</li>
                    <li>检查模型配置是否正确</li>
                  </ul>
                </div>

                <div className="bg-slate-700/50 p-4 rounded-lg">
                  <h4 className="font-semibold text-white mb-2">多窗口冲突</h4>
                  <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
                    <li>为每个窗口选择不同的摄像头</li>
                    <li>查看窗口ID区分不同窗口</li>
                    <li>关闭不需要的窗口释放资源</li>
                    <li>检查摄像头设备数量</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 技术支持 */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings className="h-5 w-5 text-slate-400" />
              技术支持
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto">
                  <MousePointer className="h-6 w-6 text-blue-400" />
                </div>
                <h4 className="font-semibold text-white">操作指南</h4>
                <p className="text-sm text-slate-300">详细的操作步骤和功能介绍</p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="h-6 w-6 text-green-400" />
                </div>
                <h4 className="font-semibold text-white">最佳实践</h4>
                <p className="text-sm text-slate-300">推荐的使用方法和配置建议</p>
              </div>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto">
                  <HelpCircle className="h-6 w-6 text-purple-400" />
                </div>
                <h4 className="font-semibold text-white">问题反馈</h4>
                <p className="text-sm text-slate-300">遇到问题时的解决方案</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HelpScreen;
