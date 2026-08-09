/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Profile pictures, sized for a datastore that is a JSON file.
 *
 * There is no object store behind this app — a picture is persisted inside the
 * record itself, so it travels in every API response that carries that record.
 * A 4 MB phone photo pasted in raw would bloat data.json and slow every list
 * that renders it. Downscaling to a square thumbnail first keeps an avatar in
 * the tens of kilobytes, which is all one is ever displayed at.
 */

/** Largest file we will even attempt to read, before downscaling. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024;

export class ImageTooLargeError extends Error {}
export class UnsupportedImageError extends Error {}

/**
 * Read a picked file into a square, downscaled JPEG data URL.
 *
 * @param size    Edge length of the output square, in pixels.
 * @param quality JPEG quality, 0–1.
 */
export function fileToAvatarDataUrl(file: File, size = 320, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new UnsupportedImageError('Please choose an image file (JPG, PNG or WebP).'));
  }
  if (file.size > MAX_INPUT_BYTES) {
    return Promise.reject(new ImageTooLargeError('That image is over 12 MB. Please choose a smaller one.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Could not process the image in this browser.'));
          return;
        }

        // Cover-crop: scale so the shorter edge fills the square, then centre
        // the overflow. Squashing a portrait into a square would distort a face.
        const scale = Math.max(size / image.width, size / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        context.drawImage(
          image,
          (size - drawWidth) / 2,
          (size - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );

        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not process the image.'));
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new UnsupportedImageError('That file could not be read as an image.'));
    };

    image.src = objectUrl;
  });
}
