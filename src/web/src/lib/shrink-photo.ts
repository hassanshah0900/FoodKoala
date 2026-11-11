/** Photos are sent at most this wide or tall: plenty for "where I left it", and well under chat's 5 MB. */
export const MAX_PHOTO_SIDE = 1600;

/** The size to draw a photo at so its longer side fits MAX_PHOTO_SIDE, keeping its shape. */
export function fitSize(width: number, height: number, max = MAX_PHOTO_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * A phone photo made small enough to send: redrawn as a JPEG at most MAX_PHOTO_SIDE on its longer
 * side. Browser only. Falls back to the file as it is when the browser can't decode it.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.82));
  } catch {
    return file;
  }
}
