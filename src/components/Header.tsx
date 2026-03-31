
    import React from 'react'; import { Link, NavLink } from 'react-router-dom'; import { Aperture, Settings, ClipboardList, ScanLine, FileCheck2, Home } from 'lucide-react';
    const Header: React.FC = () => {
      const navLinkClass = ({ isActive }: { isActive: boolean }) => `flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5'}`;
      return (
        <header className="bg-card border-b sticky top-0 z-40"><div className="container mx-auto flex h-16 items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2"><Aperture className="h-6 w-6 text-primary" /><span className="font-bold text-lg"><JSGCWYL></JSGCWYL> 视觉质检系统</span></Link>
            <nav className="hidden md:flex items-center space-x-2 lg:space-x-4">
              <NavLink to="/" className={navLinkClass} end><Home className="mr-2 h-4 w-4" />主页</NavLink>
              <NavLink to="/standards" className={navLinkClass}><ClipboardList className="mr-2 h-4 w-4" />模板管理</NavLink>
              <NavLink to="/inspection" className={navLinkClass}><ScanLine className="mr-2 h-4 w-4" />单件检测</NavLink>
              <NavLink to="/results" className={navLinkClass}><FileCheck2 className="mr-2 h-4 w-4" />检测结果</NavLink>
            </nav>
            <NavLink to="/config" className={navLinkClass}><Settings className="h-5 w-5" /><span className="hidden sm:inline sm:ml-2">AI 配置</span></NavLink>
        </div></header>
      );
    };
    export default Header;
  