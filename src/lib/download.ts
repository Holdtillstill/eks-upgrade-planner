export function downloadTextFile(filename: string, contents: string, mimeType = 'text/plain;charset=utf-8') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([contents], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function safeArtifactName(label: string, extension: string) {
  const clean = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${clean || 'eks-upgrade-planner'}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}
