/**
 * Downscales a user-picked image (mobile camera photos are routinely
 * 10-50MB at 4000px+) to a card-thumbnail-appropriate JPEG before it's
 * pinned to IPFS — avoids slow uploads on mobile data and oversized pins.
 * `imageOrientation: "from-image"` applies the photo's EXIF rotation
 * during decode, so no manual EXIF parsing is needed.
 */
export async function resizeImageFile(file: File, maxDimension = 960, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode resized image"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close();
  }
}
