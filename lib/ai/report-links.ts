export function reportPath(reportId: string) {
  return `/reports/${encodeURIComponent(reportId)}`;
}
