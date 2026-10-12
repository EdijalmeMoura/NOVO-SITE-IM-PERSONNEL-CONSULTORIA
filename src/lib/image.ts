// Reduz a imagem no próprio navegador antes do envio: uma foto de celular de 5 MB
// vira um arquivo leve, e o visitante do site não paga o download do original.
const MAX_EDGE = 1920;
const WEBP_QUALITY = 0.82;
// Abaixo disso a economia não compensa o risco de perder definição em telas grandes.
const SKIP_BELOW_BYTES = 320 * 1024;

export type OptimizedImage = {
  file: File;
  originalBytes: number;
  bytes: number;
  optimized: boolean;
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export async function optimizeImage(file: File): Promise<OptimizedImage> {
  const original: OptimizedImage = { file, originalBytes: file.size, bytes: file.size, optimized: false };
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return original;
  try {
    const bitmap = await createImageBitmap(file);
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_EDGE / longestEdge);
    if (scale === 1 && file.size <= SKIP_BELOW_BYTES) { bitmap.close(); return original; }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) { bitmap.close(); return original; }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return original;
    const name = file.name.replace(/\.[^.]+$/, '') || 'imagem';
    return { file: new File([blob], `${name}.webp`, { type: 'image/webp' }), originalBytes: file.size, bytes: blob.size, optimized: true };
  } catch {
    // Navegador sem suporte à decodificação: envia o arquivo escolhido, como antes.
    return original;
  }
}
