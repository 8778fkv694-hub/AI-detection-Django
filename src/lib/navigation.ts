export function buildClientRouteUrl(path: string): string {
  if (typeof window === 'undefined') return path;

  const route = path.startsWith('/') ? path : `/${path}`;
  if ((window as any).__IS_ELECTRON__) {
    const base = (window as any).__ELECTRON_ASSET_BASE__ || window.location.href.split('#')[0];
    return `${base}#${route}`;
  }

  return route;
}

export function navigateClientRoute(path: string): void {
  if (typeof window === 'undefined') return;

  if ((window as any).__IS_ELECTRON__) {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
    return;
  }

  window.location.href = path;
}
