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

      // 4. Upload to S3 under the 'new/' prefix (triggers AWS Lambda)
      const uploadPrefix = prefix || process.env.S3_UPLOAD_PREFIX || 'new';
      const s3Result = await uploadImageToS3(buffer, filename, mimeType, uploadPrefix, dishName);

      // Determine expected processed key adhering to the 'compressed' naming convention
      const expectedProcessedKey = getExpectedProcessedKey(s3Result.key);
      const imageId = `img_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      // Processed image URL path matching application retrieval flow (e.g. /uploads/compressed/...)
      const processedUrl = `/uploads/${expectedProcessedKey}`;
      const pendingUrl = `/uploads/${s3Result.key}`;

      // 5. Store image upload metadata in Amazon RDS MySQL (and local database)
      await saveImageUploadMetadata({
        id: imageId,
        originalFilename: filename,
        processedFilename: path.basename(expectedProcessedKey),
        originalS3Key: s3Result.key,
        processedS3Key: expectedProcessedKey,
        imageUrl: processedUrl,
        status: 'PENDING',
        mimeType: s3Result.contentType,
        originalSize: s3Result.size,
        compressedSize: null,
        width: null,
        height: null,
        aspectRatio: '1:1',
        entityType: entityType || (dishName ? 'menu_item' : 'general'),
        entityId: entityId || null
      });

      return res.json({
        success: true,
        imageId,
        status: 'PENDING',
        isReady: false,
        key: s3Result.key,
        originalKey: s3Result.key,
        processedKey: expectedProcessedKey,
        url: processedUrl,
        pendingUrl,
        filename: path.basename(s3Result.key),
        size: s3Result.size,
        contentType: s3Result.contentType,
        aspectRatio: '1:1',
        message: "Image uploaded under 'new/' prefix. Lambda processing pending for square compression."
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

      // If record is still PENDING, verify if the processed file has arrived in S3
      if (record && record.status === 'PENDING') {
        const found = await findProcessedS3Object(record.original_s3_key || identifier);
        if (found) {
          record = await updateImageProcessedMetadata(record.id, {
            status: 'COMPLETED',
            processed_s3_key: found.key,
            processed_filename: path.basename(found.key),
            compressed_size: found.contentLength,
            mime_type: found.contentType || record.mime_type,
            aspect_ratio: '1:1',
            processed_at: new Date()
          });
        }
      }

      if (!record) {
        // If not in database, attempt direct S3 check
        const directS3 = await findProcessedS3Object(identifier);
        if (directS3) {
          return res.json({
            success: true,
            status: 'COMPLETED',
            isReady: true,
            url: `/uploads/${directS3.key}`,
            key: directS3.key,
            size: directS3.contentLength,
            aspectRatio: '1:1'
          });
        }

        return res.status(404).json({
          error: `Image '${identifier}' record not found.`,
          code: 'IMAGE_NOT_FOUND',
          status: 'NOT_FOUND',
          isReady: false
        });
      }

      return res.json({
        success: true,
        imageId: record.id,
        status: record.status,
        isReady: record.status === 'COMPLETED',
        url: record.image_url || `/uploads/${record.processed_s3_key}`,
        originalKey: record.original_s3_key,
        processedKey: record.processed_s3_key,
        originalSize: record.original_size,
        compressedSize: record.compressed_size,
        width: record.width,
        height: record.height,
        aspectRatio: record.aspect_ratio || '1:1',
        uploadedAt: record.uploaded_at,
        processedAt: record.processed_at
      });
    } catch (err) {
      console.error('Image status check error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/upload/processed & POST /api/upload/callback
  // AWS Lambda callback endpoint to record completed image processing & metadata into Amazon RDS MySQL
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
        aspectRatio = '1:1',
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
      console.error('Lambda processed callback error:', err);
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
 * Express middleware / router to securely stream uploaded images from S3 (or fallback to local disk).
 * Mounted at /uploads and /dishes.
 *
 * Implements requirement:
 * "The application must display the processed image to users only after processing has completed successfully.
 * Do not allow the application to treat an unprocessed image as a successfully processed image."
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

    // 1. Check if the request is specifically targeting an unprocessed raw key (e.g. new/...)
    const isUnprocessedKey = isPendingKey(rawKey);

    if (isUnprocessedKey) {
      // Check if the processed counterpart is already ready in S3
      if (isS3Configured()) {
        const processedS3 = await findProcessedS3Object(rawKey);
        if (processedS3) {
          // Serve the processed image instead
          try {
            const streamObj = await getImageStreamFromS3(processedS3.key);
            res.setHeader('Content-Type', streamObj.contentType || 'image/jpeg');
            if (streamObj.contentLength) res.setHeader('Content-Length', streamObj.contentLength);
            if (streamObj.etag) res.setHeader('ETag', streamObj.etag);
            res.setHeader('X-Image-Status', 'COMPLETED');
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            return streamObj.bodyStream.pipe(res);
          } catch (e) {
            // fall through
          }
        }
      }

      // Do NOT treat unprocessed image as successfully processed
      res.setHeader('X-Image-Status', 'PENDING');
      if (req.accepts('html') || req.headers.accept?.includes('application/json')) {
        return res.status(202).json({
          error: 'IMAGE_PROCESSING_PENDING',
          status: 'PENDING',
          message: 'Image is currently pending square compression by AWS Lambda and is not ready for display yet.'
        });
      }

      // Return a lightweight SVG placeholder indicating pending processing if rendered in an <img> tag
      const placeholderSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
          <rect width="400" height="400" fill="#f3f4f6"/>
          <circle cx="200" cy="180" r="40" stroke="#d97706" stroke-width="4" stroke-dasharray="60 40" fill="none"/>
          <text x="200" y="250" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#374151">Processing 1:1 Image...</text>
          <text x="200" y="275" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#6b7280">AWS Lambda compression in progress</text>
        </svg>
      `.trim();
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.status(202).send(placeholderSvg);
    }

    // 2. Normal retrieval flow for processed images or legacy assets
    // Generate candidates covering the required 'compressed' naming conventions
    const processedPrefix = (process.env.S3_PROCESSED_PREFIX || 'compressed').replace(/^\/+|\/+$/g, '');
    const candidateKeys = [
      rawKey,
      `${processedPrefix}/${safeKeyName}`,
      `compressed/${safeKeyName}`,
      safeKeyName,
      rawKey.replace(/^uploads\//, ''),
      rawKey.replace(/^dishes\//, '')
    ];

    if (isS3Configured()) {
      for (const candidateKey of candidateKeys) {
        // Skip keys that are known to be raw unprocessed 'new/' keys
        if (isPendingKey(candidateKey)) continue;

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

          res.setHeader('X-Image-Status', 'COMPLETED');
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
    }

    // 3. Fallback to local uploads directory (for existing seeded/legacy files)
    const localPath = path.join(uploadsDir, safeKeyName);
    if (fs.existsSync(localPath)) {
      res.setHeader('X-Image-Status', 'LOCAL_FALLBACK');
      return res.sendFile(localPath);
    }

    // 4. If image is not yet available, check if it's currently pending processing under new/
    if (isS3Configured()) {
      const uploadPrefix = (process.env.S3_UPLOAD_PREFIX || 'new').replace(/^\/+|\/+$/g, '');
      const rawUploadKey = `${uploadPrefix}/${safeKeyName}`;
      const pendingMeta = await getS3ObjectMetadata(rawUploadKey);

      if (pendingMeta) {
        res.setHeader('X-Image-Status', 'PENDING');
        const placeholderSvg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
            <rect width="400" height="400" fill="#f3f4f6"/>
            <circle cx="200" cy="180" r="40" stroke="#d97706" stroke-width="4" stroke-dasharray="60 40" fill="none"/>
            <text x="200" y="250" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#374151">Processing 1:1 Image...</text>
            <text x="200" y="275" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#6b7280">AWS Lambda compression in progress</text>
          </svg>
        `.trim();
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        return res.status(202).send(placeholderSvg);
      }
    }

    return res.status(404).json({
      error: `Image '${safeKeyName}' not found.`,
      code: 'IMAGE_NOT_FOUND',
      status: 'NOT_FOUND'
    });
  });

  return router;
}
