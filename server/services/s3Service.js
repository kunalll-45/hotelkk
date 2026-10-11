import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';

// Max file size: 10 MB
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Allowed MIME types
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
];

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

/**
 * Checks whether all required AWS S3 environment variables are provided.
 */
export function isS3Configured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
    process.env.AWS_REGION?.trim() &&
    process.env.S3_BUCKET_NAME?.trim()
  );
}

/**
 * Validates presence of required AWS configuration environment variables.
 * Throws explicit, actionable errors if any are missing.
 */
export function validateAwsConfig() {
  const missing = [];
  if (!process.env.AWS_ACCESS_KEY_ID?.trim()) missing.push('AWS_ACCESS_KEY_ID');
  if (!process.env.AWS_SECRET_ACCESS_KEY?.trim()) missing.push('AWS_SECRET_ACCESS_KEY');
  if (!process.env.AWS_REGION?.trim()) missing.push('AWS_REGION');
  if (!process.env.S3_BUCKET_NAME?.trim()) missing.push('S3_BUCKET_NAME');

  if (missing.length > 0) {
    const error = new Error(`Missing required AWS S3 configuration environment variable(s): ${missing.join(', ')}`);
    error.code = 'MISSING_AWS_ENV_VARS';
    error.missingVars = missing;
    throw error;
  }
}

let s3ClientInstance = null;
let lastUsedAccessKey = null;

/**
 * Returns a configured S3Client instance.
 */
export function getS3Client() {
  validateAwsConfig();

  // Re-instantiate if access key changed (e.g., dynamically updated in tests or .env)
  if (!s3ClientInstance || lastUsedAccessKey !== process.env.AWS_ACCESS_KEY_ID) {
    s3ClientInstance = new S3Client({
      region: process.env.AWS_REGION.trim(),
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim()
      }
    });
    lastUsedAccessKey = process.env.AWS_ACCESS_KEY_ID;
  }

  return s3ClientInstance;
}

/**
 * Validates file buffer size and MIME type.
 */
export function validateImage(buffer, originalFilename = '', mimeType = '') {
  if (!buffer || buffer.length === 0) {
    const err = new Error('Image file is empty.');
    err.code = 'EMPTY_FILE';
    throw err;
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const err = new Error(`File size ${(buffer.length / (1024 * 1024)).toFixed(2)}MB exceeds maximum allowed limit of 10MB.`);
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const normalizedMime = mimeType ? mimeType.toLowerCase().trim() : '';
  const ext = path.extname(originalFilename || '').toLowerCase();

  const isMimeValid = normalizedMime && ALLOWED_MIME_TYPES.includes(normalizedMime);
  const isExtValid = ext && Boolean(EXT_TO_MIME[ext]);

  if (!isMimeValid && !isExtValid) {
    const err = new Error(`Invalid file type. Allowed formats: JPEG, PNG, WebP, GIF.`);
    err.code = 'INVALID_FILE_TYPE';
    throw err;
  }
}

/**
 * Helper to slugify a text string into a clean, safe filename portion.
 */
export function slugify(text = '') {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Generates a unique collision-resistant S3 object key.
 * When prefix is empty, stores directly in the root of the bucket:
 * e.g. paneer-butter-masala-1728514800000-a1b2c3d4.jpg
 */
export function generateS3Key(originalFilename = '', mimeType = '', prefix = '', dishName = '') {
  const normalizedMime = mimeType ? mimeType.toLowerCase().trim() : '';
  const extFromFilename = path.extname(originalFilename || '').toLowerCase();
  const finalExt = EXT_TO_MIME[extFromFilename] ? extFromFilename : (MIME_TO_EXT[normalizedMime] || '.jpg');

  const baseName = dishName
    ? slugify(dishName)
    : slugify(path.basename(originalFilename || 'dish', extFromFilename)) || 'dish';

  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const cleanPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') : '';

  return cleanPrefix ? `${cleanPrefix}/${baseName}-${uniqueId}${finalExt}` : `${baseName}-${uniqueId}${finalExt}`;
}

/**
 * Uploads an image buffer directly to the AWS S3 bucket (no subfolders by default).
 * Returns the unique S3 object key and metadata.
 */
export async function uploadImageToS3(buffer, originalFilename = 'image.jpg', mimeType = 'image/jpeg', prefix = '', dishName = '') {
  validateAwsConfig();
  validateImage(buffer, originalFilename, mimeType);

  const key = generateS3Key(originalFilename, mimeType, prefix, dishName);
  const ext = path.extname(key);
  const contentType = mimeType && ALLOWED_MIME_TYPES.includes(mimeType) ? mimeType : (EXT_TO_MIME[ext] || 'image/jpeg');

  const client = getS3Client();
  const bucketName = process.env.S3_BUCKET_NAME.trim();

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType
  });

  try {
    await client.send(putCommand);

    return {
      key,
      bucket: bucketName,
      contentType,
      size: buffer.length
    };
  } catch (err) {
    console.error('AWS S3 PutObject error:', err);

    if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
      const error = new Error(`AWS S3 Access Denied: The configured IAM user lacks 's3:PutObject' permission on bucket '${bucketName}'.`);
      error.code = 'S3_PERMISSION_DENIED';
      throw error;
    }
    if (err.name === 'NoSuchBucket' || err.$metadata?.httpStatusCode === 404) {
      const error = new Error(`AWS S3 Bucket Not Found: Bucket '${bucketName}' does not exist or region '${process.env.AWS_REGION}' is incorrect.`);
      error.code = 'S3_BUCKET_NOT_FOUND';
      throw error;
    }

    const error = new Error(`Failed to upload image to AWS S3: ${err.message}`);
    error.code = 'S3_UPLOAD_FAILED';
    error.originalError = err;
    throw error;
  }
}

/**
 * Retrieves an image object stream securely from AWS S3 without making the bucket public.
 */
export async function getImageStreamFromS3(key) {
  validateAwsConfig();

  // Normalize key by stripping leading slashes
  const normalizedKey = key.replace(/^\/+/, '');
  const client = getS3Client();
  const bucketName = process.env.S3_BUCKET_NAME.trim();

  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: normalizedKey
  });

  try {
    const response = await client.send(getCommand);
    return {
      bodyStream: response.Body,
      contentType: response.ContentType || 'image/jpeg',
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      etag: response.ETag
    };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      const error = new Error(`Object '${normalizedKey}' not found in S3 bucket '${bucketName}'.`);
      error.code = 'OBJECT_NOT_FOUND';
      throw error;
    }
    if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
      const error = new Error(`AWS S3 Access Denied: The configured IAM user lacks 's3:GetObject' permission for object '${normalizedKey}'.`);
      error.code = 'S3_PERMISSION_DENIED';
      throw error;
    }

    const error = new Error(`Failed to retrieve image from AWS S3: ${err.message}`);
    error.code = 'S3_GET_FAILED';
    throw error;
  }
}

/**
 * Checks if an object exists in AWS S3 using HeadObjectCommand.
 */
export async function checkS3ObjectExists(key) {
  if (!key || !isS3Configured()) return false;

  let normalizedKey = key.replace(/^\/+/, '');
  if (normalizedKey.startsWith('uploads/')) {
    normalizedKey = normalizedKey.replace(/^uploads\//, '');
  }

  try {
    const client = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME.trim();

    const head = await client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: normalizedKey
    }));

    return Boolean(head);
  } catch (err) {
    if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    console.warn(`HeadObject check notice for key '${normalizedKey}':`, err.message);
    return false;
  }
}

/**
 * Deletes an image object from AWS S3 safely when no longer needed.
 */
export async function deleteImageFromS3(key) {
  if (!key || !isS3Configured()) return false;

  let normalizedKey = key.replace(/^\/+/, '');

  // Strip leading /uploads/ if present in the stored URL
  if (normalizedKey.startsWith('uploads/')) {
    normalizedKey = normalizedKey.replace(/^uploads\//, '');
  }

  // Avoid deleting external / unsplash URLs
  if (normalizedKey.startsWith('http://') || normalizedKey.startsWith('https://')) {
    const bucketName = process.env.S3_BUCKET_NAME?.trim();
    if (bucketName && normalizedKey.includes(bucketName)) {
      try {
        const urlObj = new URL(key);
        normalizedKey = urlObj.pathname.replace(/^\/+/, '');
      } catch (e) {
        return false;
      }
    } else {
      return false;
    }
  }

  // Avoid deleting empty keys or keys with directory traversal
  if (!normalizedKey || normalizedKey.includes('..')) {
    return false;
  }

  try {
    const client = getS3Client();
    const bucketName = process.env.S3_BUCKET_NAME.trim();

    await client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: normalizedKey
    }));

    console.log(`Deleted S3 object '${normalizedKey}' directly from bucket '${bucketName}'.`);
    return true;
  } catch (err) {
    console.warn(`Failed to delete S3 object '${normalizedKey}':`, err.message);
    return false;
  }
}
