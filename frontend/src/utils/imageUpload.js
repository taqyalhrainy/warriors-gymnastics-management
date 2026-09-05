export const compressProfileImage = (file, options = {}) => new Promise((resolve, reject) => {
  if (!file) {
    resolve('');
    return;
  }

  if (!file.type?.startsWith('image/')) {
    reject(new Error('Please choose an image file.'));
    return;
  }

  const maxSide = options.maxSide || 720;
  const quality = options.quality ?? 0.82;
  const reader = new FileReader();

  reader.onerror = () => reject(new Error('Unable to read image.'));
  reader.onload = () => {
    const image = new Image();

    image.onerror = () => reject(new Error('Unable to load image.'));
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.src = String(reader.result || '');
  };

  reader.readAsDataURL(file);
});
