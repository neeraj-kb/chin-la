export function frameFingerprint(dataUrl: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 20;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return reject(new Error('Could not compare screen frames.'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const fingerprint = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
        fingerprint[p] = Math.round((pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114) / 16);
      }
      resolve(fingerprint);
    };
    image.onerror = () => reject(new Error('Could not read the captured frame.'));
    image.src = dataUrl;
  });
}

export { changeRatio } from './changeRatio.mjs';
