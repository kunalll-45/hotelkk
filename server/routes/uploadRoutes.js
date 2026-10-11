import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isS3Configured,
  uploadImageToS3,
  getImageStreamFromS3,
  validateImage,
  validateAwsConfig
} from '../services/s3Service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Creates the upload router for POST /api/upload
 */
export default function createUploadRouter() {
  const router = express.Router();

  // POST /api/upload (Upload image as base64 DataURL or raw base64)
  router.post('/', async (req, res) => {
    try {
      const { image, filename = 'image.jpg', dishName = '', prefix = '' } = req.body;

      if (!image) {
        return res.status(400).json({
          error: 'Image data is required.',
          code: 'MISSING_IMAGE_DATA'
        });
      }

      // 1. Verify AWS S3 configuration
      try {
        validateAwsConfig();
      } catch (awsConfigErr) {
        return res.status(500).json({
          error: awsConfigErr.message,
          code: awsConfigErr.code || 'MISSING_AWS_ENV_VARS',
          missingVars: awsConfigErr.missingVars || []
        });
      }

      // 2. Parse and decode base64
      let buffer;
      let mimeType = 'image/jpeg';

      if (typeof image === 'string' && image.startsWith('data:')) {
        const matches = image.match(/^data:([A-Za-z0-9\-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({
            error: 'Invalid base64 data URL format.',
            code: 'INVALID_BASE64_FORMAT'
          });
        }
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else if (typeof image === 'string') {
        buffer = Buffer.from(image, 'base64');
      } else {
        return res.status(400).json({
          error: 'Invalid image payload. Expected base64 string or data URL.',
          code: 'INVALID_PAYLOAD'
        });
      }

      // 3. Validate image size and MIME type
      try {
        validateImage(buffer, filename, mimeType);
      } catch (valErr) {
        return res.status(400).json({
          error: valErr.message,
          code: valErr.code || 'VALIDATION_FAILED'
        });
      }

      // 4. Upload directly to AWS S3 bucket root (no subfolders)
      const s3Result = await uploadImageToS3(buffer, filename, mimeType, prefix, dishName);

      // Return URL path matching application retrieval flow (e.g. /uploads/img_xxx.jpg)
      // Stored in the database image_url field.
      const fileUrl = `/uploads/${s3Result.key}`;

      return res.json({
        success: true,
        url: fileUrl,
        key: s3Result.key,
        bucket: s3Result.bucket,
        filename: path.basename(s3Result.key),
        size: s3Result.size,
        contentType: s3Result.contentType
      });
    } catch (err) {
      console.error('S3 Upload endpoint error:', err);

      const statusCode = err.code === 'INVALID_FILE_TYPE' || err.code === 'FILE_TOO_LARGE' ? 400 : 500;
      return res.status(statusCode).json({
        error: err.message || 'File upload failed.',
        code: err.code || 'UPLOAD_ERROR'
      });
    }
  });

  return router;
}

/**
 * Express middleware / router to securely stream uploaded images from S3 (or fallback to local disk)
 * Mounted at /uploads and /dishes
 */
export function createUploadRetrievalRouter() {
  const router = express.Router();

  router.get('/*', async (req, res) => {
    const rawKey = req.params[0] || req.path.replace(/^\//, '');

    // Prevent directory traversal
    const safeKeyName = path.basename(rawKey);
    if (!safeKeyName || safeKeyName.includes('..')) {
      return res.status(400).json({ error: 'Invalid file key.' });
    }

    // Possible S3 keys to try: direct root bucket key first, followed by legacy subfolder keys
    const candidateKeys = [
      safeKeyName,
      rawKey,
      rawKey.replace(/^uploads\//, ''),
      rawKey.replace(/^dishes\//, ''),
      `dishes/${safeKeyName}`,
      `uploads/${safeKeyName}`
    ];

    // 1. If S3 is configured, attempt retrieval from S3 first
    if (isS3Configured()) {
      for (const candidateKey of candidateKeys) {
        try {
          const s3Object = await getImageStreamFromS3(candidateKey);

          if (s3Object.contentType) {
            res.setHeader('Content-Type', s3Object.contentType);
          }
          if (s3Object.contentLength) {
            res.setHeader('Content-Length', s3Object.contentLength);
          }
          if (s3Object.etag) {
            res.setHeader('ETag', s3Object.etag);
          }
          if (s3Object.lastModified) {
            res.setHeader('Last-Modified', new Date(s3Object.lastModified).toUTCString());
          }

          // Cache control for performance (1 day browser cache, 7 days revalidate)
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

          // Pipe the readable stream to client response
          return s3Object.bodyStream.pipe(res);
        } catch (s3Err) {
          // If object not found under this candidate key, continue trying candidates
          if (s3Err.code === 'OBJECT_NOT_FOUND') {
            continue;
          }
          console.error(`S3 GetObject notice for key '${candidateKey}':`, s3Err.message);
          break;
        }
      }
    }

    // 2. Fallback to local uploads directory (for existing seeded/legacy files)
    const localPath = path.join(uploadsDir, safeKeyName);
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    return res.status(404).json({
      error: `Image '${safeKeyName}' not found.`,
      code: 'IMAGE_NOT_FOUND'
    });
  });

  return router;
}
