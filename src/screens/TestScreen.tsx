
import React from 'react'; import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'; import { Button } from '@/components/ui/Button'; import toast from 'react-hot-toast';
const TestScreen: React.FC = () => (
    <div className="animate-fade-in"><h1 className="page-header">组件测试页</h1><div className="space-y-8">
        <Card><CardHeader><CardTitle>按钮 (Buttons)</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-4"><Button variant="default">主要按钮</Button><Button variant="secondary">次要按钮</Button><Button variant="destructive">危险按钮</Button><Button variant="default" isLoading>加载中</Button><Button variant="default" disabled>已禁用</Button></CardContent></Card>
        <Card><CardHeader><CardTitle>消息提示 (Toasts)</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-4"><Button variant="secondary" onClick={() => toast.success('操作成功！')}>显示成功提示</Button><Button variant="secondary" onClick={() => toast.error('发生了一个错误。')}>显示错误提示</Button><Button variant="secondary" onClick={() => toast.loading('正在加载中...')}>显示加载提示</Button><Button variant="secondary" onClick={() => toast('这是一条普通通知。')}>显示普通通知</Button></CardContent></Card>
    </div></div>
);
export default TestScreen;
