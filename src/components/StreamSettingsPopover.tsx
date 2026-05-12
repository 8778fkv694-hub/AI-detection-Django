import React, { useState } from 'react';
import { useStreamSettingsStore } from '@/state/streamSettingsStore';
import { Sliders, X } from 'lucide-react';

export const StreamSettingsPopover: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { fps, quality, targetWidth, setFps, setQuality, setTargetWidth, resetDefaults } =
    useStreamSettingsStore();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all w-full"
        title="全局视频流显示设置"
      >
        <Sliders className="h-5 w-5" />
        <span>视频流设置</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-border/50 bg-background/95 backdrop-blur-md shadow-xl p-4 z-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">视频流显示设置</h3>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            仅影响浏览器显示质量，不影响 YOLO 检测精度。降低参数可减少 Jetson CPU 占用。
          </p>

          {/* FPS */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">显示帧率</span>
              <span className="text-foreground font-mono">{fps} fps</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              step={1}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>5 (省CPU)</span>
              <span>30 (流畅)</span>
            </div>
          </div>

          {/* Quality */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">JPEG 质量</span>
              <span className="text-foreground font-mono">{quality}%</span>
            </div>
            <input
              type="range"
              min={30}
              max={100}
              step={5}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>30 (体积小)</span>
              <span>100 (无损)</span>
            </div>
          </div>

          {/* Resolution */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">显示宽度</span>
              <span className="text-foreground font-mono">{targetWidth}px</span>
            </div>
            <input
              type="range"
              min={320}
              max={1920}
              step={80}
              value={targetWidth}
              onChange={(e) => setTargetWidth(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>320 (省CPU)</span>
              <span>1920 (高清)</span>
            </div>
          </div>

          {/* Reset */}
          <button
            onClick={resetDefaults}
            className="w-full text-xs py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors"
          >
            恢复默认 (12fps / 75% / 960px)
          </button>
        </div>
      )}
    </div>
  );
};
