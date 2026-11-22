import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import multer from 'multer';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import { HttpError } from '../lib/errors.js';
import { localImageStorage } from './local-images.js';
import { mediaLimits } from '../../shared/post-media.js';

const run = promisify(execFile);
const invalid = message => new HttpError(400, message);
const images = new Set(['image/jpeg','image/png','image/webp']);
const formats = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

export function postMediaStorage(directory) {
  const root = resolve(directory, 'posts');
  const photos = localImageStorage(root);
  async function discard(items) {
    await Promise.all(items.flatMap(item => [item.key, item.poster].filter(Boolean)).map(key => rm(join(root,key), { force: true })));
  }
  async function receive(req, res, current, persist) {
    if (!req.is('multipart/form-data')) return persist(req.body, undefined);
    const temp = await mkdtemp(join(tmpdir(), 'rosterlink-post-'));
    const added = [];
    try {
      const upload = multer({ dest: temp, limits: { fileSize: mediaLimits.videoBytes, files: 4, fields: 2, fieldSize: 10000 } }).array('media', 4);
      await new Promise((ok,fail) => upload(req,res,error => error ? fail(invalid(error.code === 'LIMIT_FILE_SIZE' ? 'Video must be 25 MB or smaller.' : 'Choose up to four photos or one video.')) : ok()));
      let keys;
      try { keys = JSON.parse(req.body.keep || '[]'); } catch { throw invalid('Invalid attachment selection.'); }
      if (!Array.isArray(keys) || keys.length > 4 || new Set(keys).size !== keys.length) throw invalid('Invalid attachment selection.');
      const kept = keys.map(key => {
        const item = current.find(item => item.key === key);
        if (!item) throw new HttpError(409,'Attachments changed. Reload the post before editing.');
        return item;
      });
      const count = kept.length + req.files.length;
      const video = kept.some(item => item.kind === 'video') || req.files.some(file => formats[file.mimetype]);
      if (count > 4 || (video && count !== 1)) throw invalid('Choose up to four photos or one video.');
      await mkdir(root, { recursive: true });
      for (const file of req.files) {
        if (images.has(file.mimetype)) {
          if (file.size > mediaLimits.photoBytes) throw invalid('Photos must be 5 MB or smaller.');
          const key = await photos.save({ ...file, buffer: await readFile(file.path) }, 'post');
          added.push({ kind: 'photo', key });
        } else {
          const format = formats[file.mimetype];
          if (!format) throw invalid('Choose JPEG, PNG, WebP, MP4 or WebM.');
          const id = randomUUID();
          const item = { kind: 'video', key: id + '.' + format, poster: id + '.jpg' };
          added.push(item);
          const input = ['-protocol_whitelist','file','-f',format === 'mp4' ? 'mov' : 'matroska'];
          try {
            const { stdout } = await run(ffprobe.path, ['-v','error',...input,'-show_format','-show_streams','-of','json',file.path], { timeout: 12000 });
            const { streams, format: info } = JSON.parse(stdout);
            const stream = streams.find(s => s.codec_type === 'video');
            const duration = Number(info.duration);
            if (!stream || !(duration > 0 && duration <= mediaLimits.seconds) || stream.width * stream.height > 8300000 ||
              !(format === 'mp4' ? ['h264'] : ['vp8','vp9']).includes(stream.codec_name)) throw Error();
            const args = ['-v','error','-nostdin',...input,'-i',file.path];
            await run(ffmpeg.path,[...args,'-map','0:v:0','-map','0:a:0?','-map_metadata','-1','-c','copy',...(format === 'mp4' ? ['-movflags','+faststart'] : []),join(root,item.key)], { timeout: 20000 });
            await run(ffmpeg.path,[...args,'-frames:v','1','-vf','scale=min(960\\,iw):-2',join(root,item.poster)], { timeout: 15000 });
          } catch { throw invalid('Use a playable H.264 MP4 or VP8/VP9 WebM up to 60 seconds and 8 megapixels.'); }
        }
      }
      return await persist({ body: req.body.body }, [...kept,...added]);
    } catch (error) {
      await discard(added);
      throw error;
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
  return { root, receive, discard };
}
