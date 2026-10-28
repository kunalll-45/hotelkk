import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  isS3Configured,
  uploadImageToS3,
  getImageStreamFromS3,
  validateImage,
  validateAwsConfig,
  getExpectedProcessedKey,
  getProcessedCandidateKeys,
  findProcessedS3Object,
  isPendingKey,
  getS3ObjectMetadata
} from '../services/s3Service.js';
import {
  saveImageUploadMetadata,
  updateImageProcessedMetadata,
  getImageMetadata
} from '../services/rdsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Creates the upload router for managing image uploads, Lambda processing callbacks,
 * and checking image processing status.
 */
export default function createUploadRouter() {
  const router = express.Router();

  // POST /api/upload (Upload image to S3 under 'new/' prefix, queue for Lambda processing)
  router.post('/', async (req, res) => {
    try {
      const { image, filename = 'image.jpg', dishName = '', prefix = '', entityType, entityId } = req.body;

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

      // 4. Upload to S3 directly (preserves original aspect ratio and dimensions)
      const uploadPrefix = prefix || process.env.S3_UPLOAD_PREFIX || 'new';
      const s3Result = await uploadImageToS3(buffer, filename, mimeType, uploadPrefix, dishName);

      const imageId = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const imageUrl = `/uploads/${s3Result.key}`;

      // 5. Store image upload metadata in Amazon RDS MySQL (and local database)
      await saveImageUploadMetadata({
        id: imageId,
        originalFilename: filename,
        processedFilename: path.basename(s3Result.key),
        originalS3Key: s3Result.key,
        processedS3Key: s3Result.key,
        imageUrl: imageUrl,
        status: 'COMPLETED',
        mimeType: s3Result.contentType,
        originalSize: s3Result.size,
        compressedSize: s3Result.size,
        width: null,
        height: null,
        aspectRatio: 'original',
        entityType: entityType || (dishName ? 'menu_item' : 'general'),
        entityId: entityId || null
      });

      return res.json({
        success: true,
        imageId,
        status: 'COMPLETED',
        isReady: true,
        key: s3Result.key,
        originalKey: s3Result.key,
        processedKey: s3Result.key,
        url: imageUrl,
        filename: path.basename(s3Result.key),
        size: s3Result.size,
        contentType: s3Result.contentType,
        aspectRatio: 'original',
        message: "Image uploaded to AWS S3 in original format and size."
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

  // GET /api/upload/status/:id? (Check processing status of uploaded image)
  router.get('/status/:id?', async (req, res) => {
    try {
      const identifier = req.params.id || req.query.id || req.query.key;
      if (!identifier) {
        return res.status(400).json({ error: 'Image identifier or key is required.' });
      }

      let record = await getImageMetadata(identifier);

      if (!record) {
        const cleanKey = identifier.replace(/^\/+/, '').replace(/^uploads\//, '');
        const exists = await checkS3ObjectExists(cleanKey) || await checkS3ObjectExists(`new/${cleanKey}`);
        if (exists) {
          return res.json({
            success: true,
            status: 'COMPLETED',
            isReady: true,
            url: `/uploads/${cleanKey}`,
            key: cleanKey,
            aspectRatio: 'original'
          });
        }

        return res.status(404).json({
          error: `Image '${identifier}' not found in AWS S3.`,
          code: 'IMAGE_NOT_FOUND',
          status: 'NOT_FOUND',
          isReady: false
        });
      }

      return res.json({
        success: true,
        imageId: record.id,
        status: 'COMPLETED',
        isReady: true,
        url: record.image_url || `/uploads/${record.original_s3_key || record.processed_s3_key}`,
        originalKey: record.original_s3_key,
        processedKey: record.processed_s3_key,
        originalSize: record.original_size,
        compressedSize: record.compressed_size || record.original_size,
        width: record.width,
        height: record.height,
        aspectRatio: record.aspect_ratio || 'original',
        uploadedAt: record.uploaded_at,
        processedAt: record.processed_at
      });
    } catch (err) {
      console.error('Image status check error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/upload/processed & POST /api/upload/callback
  // Callback endpoint to record image processing & metadata into Amazon RDS MySQL
  router.post(['/processed', '/callback'], async (req, res) => {
    try {
      const {
        imageId,
        id,
        originalKey,
        processedKey,
        key,
        status = 'COMPLETED',
        compressedSize,
        fileSize,
        size,
        width,
        height,
        aspectRatio = 'original',
        mimeType,
        format,
        errorMessage
      } = req.body;

      const lookupId = imageId || id || originalKey || key;
      if (!lookupId) {
        return res.status(400).json({ error: 'Image identifier (imageId, id, or key) is required.' });
      }

      const finalProcessedKey = processedKey || key;
      const finalSize = compressedSize !== undefined ? compressedSize : (fileSize !== undefined ? fileSize : size);

      const updated = await updateImageProcessedMetadata(lookupId, {
        status,
        processed_s3_key: finalProcessedKey,
        processed_filename: finalProcessedKey ? path.basename(finalProcessedKey) : undefined,
        compressed_size: finalSize !== undefined ? parseInt(finalSize, 10) : undefined,
        width: width ? parseInt(width, 10) : undefined,
        height: height ? parseInt(height, 10) : undefined,
        aspect_ratio: aspectRatio,
        mime_type: mimeType || format,
        error_message: errorMessage,
        processed_at: new Date()
      });

      return res.json({
        success: true,
        message: 'Image processing metadata recorded in Amazon RDS MySQL successfully.',
        record: updated
      });
    } catch (err) {
      console.error('Processed callback error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // GET /api/upload/metadata/:id (Retrieve full metadata for an image)
  router.get('/metadata/:id?', async (req, res) => {
    try {
      const identifier = req.params.id || req.query.id || req.query.key;
      if (!identifier) {
        return res.status(400).json({ error: 'Image identifier or key required.' });
      }

      const record = await getImageMetadata(identifier);
      if (!record) {
        return res.status(404).json({ error: 'Image metadata not found.' });
      }

      return res.json({ success: true, metadata: record });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

/**
 * Express middleware / router to stream uploaded images exclusively from AWS S3.
 * Mounted at /uploads and /dishes.
 *
 * Strictly adheres to:
 * - Only show images actually retrieved from AWS S3 bucket.
 * - Do NOT use placeholder, dummy, or locally stored images.
 * - Serve images in their original format, dimensions, and size.
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

    if (!isS3Configured()) {
      return res.status(503).json({
        error: 'AWS S3 is not configured. Only images retrieved from AWS S3 are permitted.',
        code: 'S3_NOT_CONFIGURED'
      });
    }

    // Clean key stripping leading slashes and router prefixes
    const cleanKey = rawKey.replace(/^\/+/, '').replace(/^uploads\//, '').replace(/^dishes\//, '');
    const uploadPrefix = (process.env.S3_UPLOAD_PREFIX || 'new').replace(/^\/+|\/+$/g, '');
    const processedPrefix = (process.env.S3_PROCESSED_PREFIX || 'compressed').replace(/^\/+|\/+$/g, '');

    // Build candidate S3 object keys to locate the real object in AWS S3
    const candidateKeys = [
      cleanKey,                                        // Exact key e.g. new/filename.jpg or filename.jpg
      `${uploadPrefix}/${safeKeyName}`,               // new/filename.jpg
      `${processedPrefix}/${safeKeyName}`,            // compressed/filename.jpg
      safeKeyName                                     // filename.jpg
    ];

    if (cleanKey.startsWith(`${processedPrefix}/`)) {
      candidateKeys.unshift(cleanKey.replace(new RegExp(`^${processedPrefix}/`), `${uploadPrefix}/`));
    }
    if (cleanKey.startsWith('compressed/')) {
      candidateKeys.unshift(cleanKey.replace(/^compressed\//, 'new/'));
    }

    const uniqueCandidates = Array.from(new Set(candidateKeys.filter(Boolean)));

    for (const candidateKey of uniqueCandidates) {
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

        res.setHeader('X-Image-Source', 'AWS-S3');
        res.setHeader('X-S3-Key', candidateKey);
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

        return s3Object.bodyStream.pipe(res);
      } catch (s3Err) {
        if (s3Err.code === 'OBJECT_NOT_FOUND') {
          continue;
        }
        console.error(`S3 GetObject notice for key '${candidateKey}':`, s3Err.message);
        break;
      }
    }

    // No local fallback, no dummy/placeholder SVG. Only images actually retrieved from AWS S3 are served.
    return res.status(404).json({
      error: `Image '${safeKeyName}' not found in AWS S3 bucket.`,
      code: 'IMAGE_NOT_FOUND_IN_S3'
    });
  });

  return router;
}
