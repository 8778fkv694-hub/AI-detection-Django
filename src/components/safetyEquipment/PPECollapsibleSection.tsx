import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PPECollapsibleSectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  isCollapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  expandedContentClassName?: string;
}

export const PPECollapsibleSection: React.FC<PPECollapsibleSectionProps> = ({
  title,
  icon,
  isCollapsed,
  onToggle,
  children,
  rightSlot,
  className,
  headerClassName,
  contentClassName,
  expandedContentClassName = 'mt-3 max-h-[1200px] opacity-100',
}) => {
  return (
    <div className={cn('rounded-lg border border-slate-700 bg-slate-900/40 p-3', className)}>
      <div>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'flex w-full items-center justify-between rounded-md p-2 text-left transition-colors hover:bg-slate-700/30 active:bg-slate-700/50',
            headerClassName
          )}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onToggle();
            }
          }}
          aria-expanded={!isCollapsed}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
            {icon}
            <span>{title}</span>
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {rightSlot}
            <span>{isCollapsed ? '展开' : '收起'}</span>
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isCollapsed ? 'max-h-0 opacity-0' : expandedContentClassName
        )}
      >
        <div className={cn(contentClassName)}>{children}</div>
      </div>
    </div>
  );
};

export default PPECollapsibleSection;
