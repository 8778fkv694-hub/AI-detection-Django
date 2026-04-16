
    import React from 'react';
    import { ScanEye } from 'lucide-react';

    export const Logo: React.FC = () => {
      return (
        <div className="flex items-center gap-3 text-foreground/90">
          <ScanEye className="h-9 w-9 flex-shrink-0 text-accent" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-wider leading-none">Web</span>
            <span className="text-xs font-light tracking-widest text-muted-foreground">检测终端</span>
          </div>
        </div>
      );
    };
  