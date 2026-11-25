import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname } from 'node:path';
import multer from 'multer';

const ROOT = './uploads';

/**
 * Opsi multer untuk gambar (jpg/png/webp, maks 5 MB).
 * public  -> ./uploads/public/<folder>  (disajikan statis: avatar, foto paket, lampiran chat)
 * private -> ./uploads/private/<folder> (hanya lewat endpoint ber-token: KTP, KK, struk transfer)
 */
export const imageUpload = (folder: string, isPrivate = false) => ({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const directory = `${ROOT}/${isPrivate ? 'private' : 'public'}/${folder}`;
      try {
        mkdirSync(directory, { recursive: true });
        cb(null, directory);
      } catch (error) {
        cb(error as Error, directory);
      }
    },
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (error: Error | null, acceptFile: boolean) => void) =>
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype)),
});

/** URL publik file di folder public, mis. /uploads/avatars/abc.jpg */
export const publicUrl = (folder: string, file: { filename: string }) => `/uploads/${folder}/${file.filename}`;