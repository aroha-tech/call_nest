import multer from 'multer';
import { env } from '../config/env.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: env.csvImportMaxFileBytes },
});

/**
 * Multer middleware for a single CSV field named "file", with size limit.
 * On LIMIT_FILE_SIZE, responds with 400 JSON (does not call next with multer error).
 */
export function uploadCsvImportSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.max(1, Math.round(env.csvImportMaxFileBytes / 1024 / 1024));
      return res.status(400).json({
        error: `CSV file too large. Maximum size is ${mb} MB. Try splitting the file or increase CSV_IMPORT_MAX_FILE_BYTES (server config).`,
      });
    }
    return next(err);
  });
}
