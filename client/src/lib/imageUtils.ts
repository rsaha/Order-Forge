export function transformImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const driveViewMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)\/view/);
  if (driveViewMatch) {
    return `https://drive.google.com/thumbnail?id=${driveViewMatch[1]}&sz=w400`;
  }
  const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (driveOpenMatch) {
    return `https://drive.google.com/thumbnail?id=${driveOpenMatch[1]}&sz=w400`;
  }
  return url;
}

export async function compressImageFile(file: File, maxKb = 100): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 800;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.85;
        const tryCompress = () => {
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const sizeKb = Math.round((dataUrl.length * 3) / 4 / 1024);
          if (sizeKb <= maxKb || quality <= 0.1) {
            resolve(dataUrl);
          } else {
            quality = Math.max(0.1, quality - 0.1);
            tryCompress();
          }
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
