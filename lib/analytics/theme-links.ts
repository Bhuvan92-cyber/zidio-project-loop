export function themeDrilldownPath(themeId: string) {
  return `/inbox?themeId=${encodeURIComponent(themeId)}`;
}
