const RouteLoadingFallback = () => (
  <div
    className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
    role="status"
    aria-live="polite"
  >
    <div className="flex items-center gap-3">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
      正在加载页面…
    </div>
  </div>
);

export default RouteLoadingFallback;
