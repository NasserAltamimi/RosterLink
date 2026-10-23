import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from '../lib/errors.js';

export function localImageStorage(directory) {
  const root = resolve(directory);
  const pathFor = key => {
    if (basename(key) !== key || !/^[a-f0-9-]+\.webp$/.test(key)) throw new Error('Invalid storage key');
    return join(root, key);
  };
  return {
    async save(file, kind) {
      if (!file) throw new HttpError(400, 'Choose an image to upload.');
      const expectedFormats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
      if (!expectedFormats[file.mimetype]) throw new HttpError(400, 'Choose a JPEG, PNG, or WebP image.');
      let buffer;
      try {
        const image = sharp(file.buffer, { limitInputPixels: 20_000_000, animated: false, failOn: 'warning' });
        const metadata = await image.metadata();
        if (metadata.format !== expectedFormats[file.mimetype] || (metadata.pages || 1) > 1) throw new Error('Invalid image format');
        buffer = await image.rotate().resize({ width: kind === 'header' ? 1920 : 640, height: kind === 'header' ? 1080 : 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      } catch {
        throw new HttpError(400, 'The image could not be read. Use a valid, non-animated JPEG, PNG, or WebP under 20 megapixels.');
      }
      await mkdir(root, { recursive: true });
      const key = `${randomUUID()}.webp`;
      await writeFile(pathFor(key), buffer, { flag: 'wx' });
      return key;
    },
    async path(key) { const path = pathFor(key); await access(path); return path; },
    async remove(key) {
      if (!key) return;
      try { await unlink(pathFor(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    },
  };
}
