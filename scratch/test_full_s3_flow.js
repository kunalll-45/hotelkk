import express from 'express';
import assert from 'assert';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import createUploadRouter, { createUploadRetrievalRouter } from '../server/routes/uploadRoutes.js';
import { initDatabase, db } from '../server/db.js';
import { MenuService } from '../server/services/menuService.js';

console.log('--- Starting Complete End-to-End AWS S3 Integration Simulation ---');

// Mock S3 in-memory store
const mockS3Storage = new Map();

// Intercept S3Client.prototype.send
const originalSend = S3Client.prototype.send;
S3Client.prototype.send = async function (command) {
  if (command instanceof PutObjectCommand) {
    const { Bucket, Key, Body, ContentType } = command.input;
    mockS3Storage.set(`${Bucket}/${Key}`, {
      body: Buffer.isBuffer(Body) ? Body : Buffer.from(Body),
      contentType: ContentType || 'image/jpeg',
      lastModified: new Date(),
      etag: '"mock-etag-12345"'
    });
    return {
      $metadata: { httpStatusCode: 200 },
      ETag: '"mock-etag-12345"'
    };
  }

  if (command instanceof GetObjectCommand) {
    const { Bucket, Key } = command.input;
    const item = mockS3Storage.get(`${Bucket}/${Key}`);
    if (!item) {
      const err = new Error(`NoSuchKey: ${Key}`);
      err.name = 'NoSuchKey';
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }
    return {
      $metadata: { httpStatusCode: 200 },
      Body: Readable.from(item.body),
      ContentType: item.contentType,
      ContentLength: item.body.length,
      LastModified: item.lastModified,
      ETag: item.etag
    };
  }

  return originalSend.apply(this, arguments);
};

// Set valid AWS environment variables for simulation
process.env.AWS_ACCESS_KEY_ID = 'AKIA_MOCK_TEST_KEY_ID';
process.env.AWS_SECRET_ACCESS_KEY = 'mock_secret_access_key_1234567890';
process.env.AWS_REGION = 'ap-south-1';
process.env.S3_BUCKET_NAME = 'hotel-kk-assets';

// Setup Express app matching server/index.js
const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/api/upload', createUploadRouter());
app.use('/uploads', createUploadRetrievalRouter());

const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

async function runTest() {
  try {
    await initDatabase();

    // Step 1: User uploads an image via the frontend flow
    console.log('Step 1: Frontend initiates upload to POST /api/upload...');
    const sampleImageBase64 = Buffer.from('MOCK_JPEG_IMAGE_BINARY_DATA_FOR_PANEER_TIKKA').toString('base64');
    const uploadPayload = {
      image: `data:image/jpeg;base64,${sampleImageBase64}`,
      filename: 'paneer_special.jpg'
    };

    const uploadRes = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadPayload)
    });

    assert.strictEqual(uploadRes.status, 200, `Upload failed with status ${uploadRes.status}`);
    const uploadData = await uploadRes.json();
    console.log('Upload response received:', uploadData);

    assert(uploadData.success === true, 'Upload response should indicate success');
    assert(uploadData.key.startsWith('uploads/img_'), 'S3 object key must be unique and properly prefixed');
    assert(uploadData.key.endsWith('.jpg'), 'S3 object key should preserve proper image extension');
    assert.strictEqual(uploadData.bucket, 'hotel-kk-assets', 'Target S3 bucket must match config');
    assert(uploadData.url.startsWith('/uploads/img_'), 'Application URL must match /uploads/ path format');
    console.log('✓ Step 1 Passed: S3 key generated and uploaded successfully.');

    // Step 2: Verify binary was stored in S3 mock store (not in database)
    console.log('Step 2: Verifying object in S3 bucket...');
    const s3Object = mockS3Storage.get(`hotel-kk-assets/${uploadData.key}`);
    assert(s3Object !== undefined, 'Image binary must exist in S3');
    assert.strictEqual(s3Object.contentType, 'image/jpeg');
    console.log('✓ Step 2 Passed: Binary stored strictly in AWS S3.');

    // Step 3: Frontend saves Menu Item with imageUrl (Database Update)
    console.log('Step 3: Storing S3 object key path in database via MenuService...');
    const createdItem = MenuService.createMenuItem({
      name: 'Paneer Angara S3 Special',
      category: 'Starters',
      price: 280,
      isVeg: 1,
      description: 'Charcoal-infused spicy cottage cheese skewers',
      imageUrl: uploadData.url
    });

    // Query database directly to verify
    const dbRecord = db.prepare('SELECT id, name, image_url FROM menu_items WHERE id = ?').get(createdItem.id);
    assert.strictEqual(dbRecord.image_url, uploadData.url, 'Database must store S3 object key path');
    console.log('Database record stored:', dbRecord);
    console.log('✓ Step 3 Passed: S3 object key path successfully stored in SQLite database.');

    // Step 4: Frontend / Customer retrieves image using existing flow (<img src={item.image_url} />)
    console.log(`Step 4: Requesting image from application retrieval route: GET ${uploadData.url}...`);
    const imageFetchRes = await fetch(`${baseUrl}${uploadData.url}`);
    assert.strictEqual(imageFetchRes.status, 200, `Image fetch failed with status ${imageFetchRes.status}`);
    assert.strictEqual(imageFetchRes.headers.get('content-type'), 'image/jpeg');
    const imageBuffer = Buffer.from(await imageFetchRes.arrayBuffer());
    assert.strictEqual(imageBuffer.toString(), 'MOCK_JPEG_IMAGE_BINARY_DATA_FOR_PANEER_TIKKA');
    console.log(`✓ Step 4 Passed: Image stream securely retrieved from S3 via application endpoint (${imageBuffer.length} bytes, HTTP 200).`);

    // Step 5: Clean up test item
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(createdItem.id);
    console.log('✓ Step 5: Test data cleaned up.');

    console.log('\n======================================================');
    console.log('  ALL END-TO-END AWS S3 INTEGRATION TESTS PASSED!     ');
    console.log('======================================================');
  } finally {
    // Restore S3Client prototype
    S3Client.prototype.send = originalSend;
    server.close();
  }
}

runTest().catch(err => {
  console.error('Simulation test error:', err);
  process.exit(1);
});
