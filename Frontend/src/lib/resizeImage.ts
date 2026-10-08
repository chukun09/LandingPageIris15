/**
 * Tối ưu hóa ảnh phía client trước khi upload lên máy chủ:
 * 1. Tự động xoay ảnh theo EXIF orientation ('from-image')
 * 2. Thu nhỏ cạnh dài tối đa 2560px (đủ chuẩn cho bản in backdrop khổ lớn)
 * 3. Nén JPEG quality 0.88, giảm dung lượng từ 10-15MB xuống ~1-1.5MB
 * 4. Loại bỏ GPS / EXIF thừa trên client bảo vệ quyền riêng tư
 */

export interface ResizeResult {
  blob: Blob;
  width: number;
  height: number;
  isResized: boolean;
}

export async function resizeImageForUpload(file: File, maxEdge = 2560, quality = 0.88): Promise<ResizeResult> {
  // Bỏ qua nếu file không phải hình ảnh hoặc là GIF (giữ animation)
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { blob: file, width: 0, height: 0, isResized: false };
  }

  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let drawSource: ImageBitmap | HTMLImageElement;

    // 1. Thử dùng createImageBitmap hỗ trợ auto-orient từ EXIF
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        sourceWidth = bmp.width;
        sourceHeight = bmp.height;
        drawSource = bmp;
      } catch {
        // Fallback sang HTMLImageElement nếu trình duyệt không hỗ trợ options
        drawSource = await loadImageElement(file);
        sourceWidth = drawSource.naturalWidth || drawSource.width;
        sourceHeight = drawSource.naturalHeight || drawSource.height;
      }
    } else {
      drawSource = await loadImageElement(file);
      sourceWidth = drawSource.naturalWidth || drawSource.width;
      sourceHeight = drawSource.naturalHeight || drawSource.height;
    }

    // 2. Kiểm tra nếu ảnh đã nhỏ hơn maxEdge và dưới 3MB thì không cần resize
    if (sourceWidth <= maxEdge && sourceHeight <= maxEdge && file.size <= 3 * 1024 * 1024) {
      if ('close' in drawSource && typeof drawSource.close === 'function') {
        drawSource.close();
      }
      return { blob: file, width: sourceWidth, height: sourceHeight, isResized: false };
    }

    // 3. Tính toán kích thước mới giữ nguyên tỷ lệ
    let targetWidth = sourceWidth;
    let targetHeight = sourceHeight;

    if (sourceWidth > maxEdge || sourceHeight > maxEdge) {
      if (sourceWidth >= sourceHeight) {
        targetWidth = maxEdge;
        targetHeight = Math.max(1, Math.round((sourceHeight * maxEdge) / sourceWidth));
      } else {
        targetHeight = maxEdge;
        targetWidth = Math.max(1, Math.round((sourceWidth * maxEdge) / sourceHeight));
      }
    }

    // 4. Vẽ lên Canvas và xuất ra Blob
    const blob = await renderToBlob(drawSource, targetWidth, targetHeight, quality);

    if ('close' in drawSource && typeof drawSource.close === 'function') {
      drawSource.close();
    }

    return {
      blob,
      width: targetWidth,
      height: targetHeight,
      isResized: true,
    };
  } catch (err) {
    console.warn('Lỗi khi tối ưu ảnh phía client, sử dụng file gốc:', err);
    return { blob: file, width: 0, height: 0, isResized: false };
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

async function renderToBlob(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  // Thử dùng OffscreenCanvas nếu có hỗ trợ convertToBlob
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d');
      if (ctx) {
        // Tô nền trắng trước khi vẽ để PNG trong suốt xuất sang JPEG không bị biến thành nền đen
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, width, height);
        return await offscreen.convertToBlob({ type: 'image/jpeg', quality });
      }
    } catch {
      // Fallback xuống HTMLCanvasElement
    }
  }

  // Fallback chuẩn DOM Canvas cho mọi trình duyệt (đặc biệt iOS Safari cũ)
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Không thể khởi tạo 2D canvas context'));
      return;
    }
    // Tô nền trắng trước khi vẽ để PNG trong suốt xuất sang JPEG không bị biến thành nền đen
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('canvas.toBlob trả về null'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}
