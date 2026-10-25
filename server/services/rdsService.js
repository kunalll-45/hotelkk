import mysql from 'mysql2/promise';
import { db } from '../db.js';

/**
 * Checks whether Amazon RDS MySQL configuration environment variables are provided.
 * Supports both standard AWS Elastic Beanstalk / RDS naming conventions (RDS_HOSTNAME, etc.)
 * and standard database naming conventions (DB_HOST, etc.).
 */
export function isRdsConfigured() {
  const host = process.env.RDS_HOSTNAME || process.env.DB_HOST;
  const user = process.env.RDS_USERNAME || process.env.DB_USER;
  const database = process.env.RDS_DB_NAME || process.env.DB_NAME;
  return Boolean(host && user && database);
}

let rdsPool = null;
let rdsInitPromise = null;
let rdsConnectionFailed = false;

/**
 * Lazily initializes and returns the MySQL connection pool for Amazon RDS.
 */
export async function getRdsPool() {
  if (!isRdsConfigured()) {
    return null;
  }

  if (rdsConnectionFailed) {
    return null;
  }

  if (rdsPool) {
    return rdsPool;
  }

  if (rdsInitPromise) {
    return rdsInitPromise;
  }

  rdsInitPromise = (async () => {
    try {
      const host = (process.env.RDS_HOSTNAME || process.env.DB_HOST).trim();
      const port = parseInt(process.env.RDS_PORT || process.env.DB_PORT || '3306', 10);
      const user = (process.env.RDS_USERNAME || process.env.DB_USER).trim();
      const password = process.env.RDS_PASSWORD || process.env.DB_PASSWORD || '';
      const database = (process.env.RDS_DB_NAME || process.env.DB_NAME).trim();
      const useSsl = process.env.RDS_SSL === 'true' || process.env.DB_SSL === 'true';

      const pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 5000
      });

      // Test connection
      const connection = await pool.getConnection();
      console.log(`[Amazon RDS] Successfully connected to MySQL database '${database}' on '${host}:${port}'.`);

      // Ensure processed_images table exists in RDS MySQL
      await connection.query(`
        CREATE TABLE IF NOT EXISTS processed_images (
          id VARCHAR(64) PRIMARY KEY,
          original_filename VARCHAR(255) NOT NULL,
          processed_filename VARCHAR(255),
          original_s3_key VARCHAR(512) NOT NULL,
          processed_s3_key VARCHAR(512),
          image_url VARCHAR(512),
          status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
          mime_type VARCHAR(64),
          original_size BIGINT,
          compressed_size BIGINT,
          width INT,
          height INT,
          aspect_ratio VARCHAR(32) DEFAULT '1:1',
          entity_type VARCHAR(64),
          entity_id VARCHAR(64),
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          processed_at DATETIME,
          error_message TEXT,
          INDEX idx_status (status),
          INDEX idx_orig_key (original_s3_key(255)),
          INDEX idx_proc_key (processed_s3_key(255))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      connection.release();

      rdsPool = pool;
      return pool;
    } catch (err) {
      console.warn(`[Amazon RDS] Notice: Could not connect to RDS MySQL (${err.message}). Using local database for processed image metadata.`);
      rdsConnectionFailed = true;
      return null;
    } finally {
      rdsInitPromise = null;
    }
  })();

  return rdsInitPromise;
}

/**
 * Helper to mirror records to the local SQLite database.
 */
function saveToLocalDb(record) {
  try {
    const existing = db.prepare('SELECT id FROM processed_images WHERE id = ? OR original_s3_key = ?').get(record.id, record.original_s3_key);
    if (existing) {
      db.prepare(`
        UPDATE processed_images
        SET original_filename = ?, processed_filename = ?, original_s3_key = ?,
            processed_s3_key = ?, image_url = ?, status = ?, mime_type = ?,
            original_size = ?, compressed_size = ?, width = ?, height = ?,
            aspect_ratio = ?, entity_type = ?, entity_id = ?, processed_at = ?, error_message = ?
        WHERE id = ?
      `).run(
        record.original_filename,
        record.processed_filename,
        record.original_s3_key,
        record.processed_s3_key,
        record.image_url,
        record.status,
        record.mime_type,
        record.original_size,
        record.compressed_size,
        record.width,
        record.height,
        record.aspect_ratio || '1:1',
        record.entity_type,
        record.entity_id,
        record.processed_at ? new Date(record.processed_at).toISOString() : null,
        record.error_message,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO processed_images (
          id, original_filename, processed_filename, original_s3_key,
          processed_s3_key, image_url, status, mime_type, original_size,
          compressed_size, width, height, aspect_ratio, entity_type, entity_id,
          uploaded_at, processed_at, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
      `).run(
        record.id,
        record.original_filename,
        record.processed_filename || null,
        record.original_s3_key,
        record.processed_s3_key || null,
        record.image_url || null,
        record.status || 'PENDING',
        record.mime_type || null,
        record.original_size || null,
        record.compressed_size || null,
        record.width || null,
        record.height || null,
        record.aspect_ratio || '1:1',
        record.entity_type || null,
        record.entity_id || null,
        record.processed_at ? new Date(record.processed_at).toISOString() : null,
        record.error_message || null
      );
    }
  } catch (localErr) {
    console.warn('[RDS Service] Local SQLite sync notice:', localErr.message);
  }
}

/**
 * Saves initial image metadata upon upload to S3 (status: 'PENDING').
 * Stores in Amazon RDS MySQL when configured, and keeps local DB in sync.
 */
export async function saveImageUploadMetadata({
  id,
  originalFilename,
  processedFilename = null,
  originalS3Key,
  processedS3Key = null,
  imageUrl = null,
  status = 'PENDING',
  mimeType = null,
  originalSize = null,
  compressedSize = null,
  width = null,
  height = null,
  aspectRatio = '1:1',
  entityType = null,
  entityId = null,
  errorMessage = null
}) {
  const record = {
    id,
    original_filename: originalFilename,
    processed_filename: processedFilename,
    original_s3_key: originalS3Key,
    processed_s3_key: processedS3Key,
    image_url: imageUrl,
    status,
    mime_type: mimeType,
    original_size: originalSize,
    compressed_size: compressedSize,
    width,
    height,
    aspect_ratio: aspectRatio,
    entity_type: entityType,
    entity_id: entityId,
    error_message: errorMessage,
    uploaded_at: new Date(),
    processed_at: null
  };

  // 1. Mirror to local SQLite first
  saveToLocalDb(record);

  // 2. Persist to Amazon RDS MySQL if configured
  try {
    const pool = await getRdsPool();
    if (pool) {
      await pool.query(
        `INSERT INTO processed_images (
          id, original_filename, processed_filename, original_s3_key,
          processed_s3_key, image_url, status, mime_type, original_size,
          compressed_size, width, height, aspect_ratio, entity_type, entity_id,
          uploaded_at, processed_at, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NULL, ?)
        ON DUPLICATE KEY UPDATE
          original_filename = VALUES(original_filename),
          processed_filename = VALUES(processed_filename),
          original_s3_key = VALUES(original_s3_key),
          processed_s3_key = VALUES(processed_s3_key),
          image_url = VALUES(image_url),
          status = VALUES(status),
          mime_type = VALUES(mime_type),
          original_size = VALUES(original_size),
          compressed_size = VALUES(compressed_size),
          width = VALUES(width),
          height = VALUES(height),
          aspect_ratio = VALUES(aspect_ratio),
          entity_type = VALUES(entity_type),
          entity_id = VALUES(entity_id),
          error_message = VALUES(error_message)`,
        [
          record.id,
          record.original_filename,
          record.processed_filename,
          record.original_s3_key,
          record.processed_s3_key,
          record.image_url,
          record.status,
          record.mime_type,
          record.original_size,
          record.compressed_size,
          record.width,
          record.height,
          record.aspect_ratio,
          record.entity_type,
          record.entity_id,
          record.error_message
        ]
      );
      console.log(`[Amazon RDS] Stored initial upload metadata for '${record.id}' (${record.original_s3_key}).`);
    }
  } catch (rdsErr) {
    console.warn(`[Amazon RDS] Notice: Failed to write upload metadata to RDS MySQL (${rdsErr.message}).`);
  }

  return record;
}

/**
 * Updates image record once processed by AWS Lambda (status: 'COMPLETED' or 'FAILED').
 * Stores compressed file size, dimensions (1:1 aspect ratio), processed timestamp, etc.
 */
export async function updateImageProcessedMetadata(identifier, updates = {}) {
  const existing = await getImageMetadata(identifier);
  if (!existing) {
    throw new Error(`Image record '${identifier}' not found.`);
  }

  const updatedRecord = {
    ...existing,
    processed_filename: updates.processed_filename ?? updates.processedFilename ?? existing.processed_filename,
    processed_s3_key: updates.processed_s3_key ?? updates.processedS3Key ?? updates.processedKey ?? existing.processed_s3_key,
    image_url: updates.image_url ?? updates.imageUrl ?? existing.image_url,
    status: updates.status || 'COMPLETED',
    mime_type: updates.mime_type ?? updates.mimeType ?? existing.mime_type,
    compressed_size: updates.compressed_size !== undefined ? updates.compressed_size : (updates.compressedSize !== undefined ? updates.compressedSize : existing.compressed_size),
    width: updates.width !== undefined ? updates.width : existing.width,
    height: updates.height !== undefined ? updates.height : existing.height,
    aspect_ratio: updates.aspect_ratio || updates.aspectRatio || existing.aspect_ratio || '1:1',
    error_message: updates.error_message ?? updates.errorMessage ?? null,
    processed_at: updates.processed_at || new Date()
  };

  // Sync to local SQLite
  saveToLocalDb(updatedRecord);

  // Persist to Amazon RDS MySQL
  try {
    const pool = await getRdsPool();
    if (pool) {
      await pool.query(
        `UPDATE processed_images
         SET processed_filename = ?,
             processed_s3_key = ?,
             image_url = ?,
             status = ?,
             mime_type = ?,
             compressed_size = ?,
             width = ?,
             height = ?,
             aspect_ratio = ?,
             processed_at = NOW(),
             error_message = ?
         WHERE id = ? OR original_s3_key = ? OR processed_s3_key = ?`,
        [
          updatedRecord.processed_filename,
          updatedRecord.processed_s3_key,
          updatedRecord.image_url,
          updatedRecord.status,
          updatedRecord.mime_type,
          updatedRecord.compressed_size,
          updatedRecord.width,
          updatedRecord.height,
          updatedRecord.aspect_ratio,
          updatedRecord.error_message,
          existing.id,
          existing.original_s3_key,
          existing.processed_s3_key
        ]
      );
      console.log(`[Amazon RDS] Successfully updated processed image metadata in RDS MySQL for '${existing.id}' (Status: ${updatedRecord.status}).`);
    }
  } catch (rdsErr) {
    console.warn(`[Amazon RDS] Notice: Failed to update metadata in RDS MySQL (${rdsErr.message}).`);
  }

  return updatedRecord;
}

/**
 * Retrieves image metadata by ID, original S3 key, processed S3 key, or image URL.
 */
export async function getImageMetadata(identifier) {
  if (!identifier) return null;

  const clean = identifier.toString().trim().replace(/^\/+/, '');
  const cleanWithUploads = clean.startsWith('uploads/') ? clean : `uploads/${clean}`;
  const cleanWithoutUploads = clean.replace(/^uploads\//, '');

  // 1. Try Amazon RDS MySQL if configured and available
  try {
    const pool = await getRdsPool();
    if (pool) {
      const [rows] = await pool.query(
        `SELECT * FROM processed_images
         WHERE id = ?
            OR original_s3_key = ?
            OR original_s3_key = ?
            OR processed_s3_key = ?
            OR processed_s3_key = ?
            OR image_url = ?
            OR image_url = ?
         LIMIT 1`,
        [
          clean,
          clean,
          cleanWithoutUploads,
          clean,
          cleanWithoutUploads,
          `/${cleanWithUploads}`,
          `/${cleanWithoutUploads}`
        ]
      );
      if (rows && rows.length > 0) {
        return rows[0];
      }
    }
  } catch (rdsErr) {
    console.warn(`[Amazon RDS] Notice: Query error from RDS MySQL (${rdsErr.message}). Falling back to local database.`);
  }

  // 2. Fallback to local SQLite database
  try {
    const row = db.prepare(`
      SELECT * FROM processed_images
      WHERE id = ?
         OR original_s3_key = ?
         OR original_s3_key = ?
         OR processed_s3_key = ?
         OR processed_s3_key = ?
         OR image_url = ?
         OR image_url = ?
      LIMIT 1
    `).get(
      clean,
      clean,
      cleanWithoutUploads,
      clean,
      cleanWithoutUploads,
      `/${cleanWithUploads}`,
      `/${cleanWithoutUploads}`
    );

    return row || null;
  } catch (localErr) {
    console.warn('[RDS Service] Local lookup notice:', localErr.message);
    return null;
  }
}
