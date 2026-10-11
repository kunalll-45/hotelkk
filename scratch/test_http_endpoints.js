import express from 'express';
import http from 'http';
import assert from 'assert';
import createUploadRouter, { createUploadRetrievalRouter } from '../server/routes/uploadRoutes.js';

console.log('--- Starting HTTP Upload & Retrieval Endpoints Test ---');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use('/api/upload', createUploadRouter());
app.use('/uploads', createUploadRetrievalRouter());

const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

async function run() {
  try {
    // 1. Missing image body
    console.log('Test 1: POST /api/upload without body...');
    const res1 = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.strictEqual(res1.status, 400);
    const body1 = await res1.json();
    assert.strictEqual(body1.code, 'MISSING_IMAGE_DATA');
    console.log('✓ Test 1 Passed: Rejected empty body with 400 MISSING_IMAGE_DATA.');

    // 2. Missing AWS credentials
    console.log('Test 2: POST /api/upload when AWS credentials are missing...');
    const oldKey = process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_ACCESS_KEY_ID;

    const res2 = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
        filename: 'test.jpg'
      })
    });
    assert.strictEqual(res2.status, 500);
    const body2 = await res2.json();
    assert.strictEqual(body2.code, 'MISSING_AWS_ENV_VARS');
    assert(body2.missingVars.includes('AWS_ACCESS_KEY_ID'));
    console.log('✓ Test 2 Passed: Handled missing AWS config gracefully with clear error code & missingVars.');

    // 3. Invalid file type
    console.log('Test 3: POST /api/upload with invalid MIME type...');
    process.env.AWS_ACCESS_KEY_ID = 'test_access_key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test_secret_key';
    process.env.AWS_REGION = 'us-east-1';
    process.env.S3_BUCKET_NAME = 'test-bucket';

    const res3 = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: 'data:application/x-sh;base64,ZWNobyAiZXZpbCI=',
        filename: 'script.sh'
      })
    });
    assert.strictEqual(res3.status, 400);
    const body3 = await res3.json();
    assert.strictEqual(body3.code, 'INVALID_FILE_TYPE');
    console.log('✓ Test 3 Passed: Rejected invalid file extension and MIME type.');

    // 4. File too large
    console.log('Test 4: POST /api/upload with payload too large...');
    // Base64 of 11MB
    const bigBuf = Buffer.alloc(11 * 1024 * 1024);
    const res4 = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: `data:image/jpeg;base64,${bigBuf.toString('base64')}`,
        filename: 'huge.jpg'
      })
    });
    assert.strictEqual(res4.status, 400);
    const body4 = await res4.json();
    assert.strictEqual(body4.code, 'FILE_TOO_LARGE');
    console.log('✓ Test 4 Passed: Rejected oversized file with 400 FILE_TOO_LARGE.');

    // 5. Existing local file retrieval fallback
    console.log('Test 5: GET /uploads/img_1789211571848_myfim9.jpg (Local legacy file fallback)...');
    const res5 = await fetch(`${baseUrl}/uploads/img_1789211571848_myfim9.jpg`);
    assert.strictEqual(res5.status, 200);
    const contentLen = res5.headers.get('content-length');
    assert(parseInt(contentLen) > 0, 'Should return non-empty file');
    console.log(`✓ Test 5 Passed: Successfully retrieved legacy file (HTTP 200, ${contentLen} bytes).`);

    // 6. Non-existent file retrieval 404
    console.log('Test 6: GET /uploads/non_existent_file.jpg...');
    const res6 = await fetch(`${baseUrl}/uploads/non_existent_file.jpg`);
    assert.strictEqual(res6.status, 404);
    console.log('✓ Test 6 Passed: Non-existent image returns 404.');

    // Restore env vars
    if (oldKey) process.env.AWS_ACCESS_KEY_ID = oldKey;
    else delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_REGION;
    delete process.env.S3_BUCKET_NAME;

    console.log('\n--- ALL HTTP ENDPOINT TESTS PASSED SUCCESSFULLY ---');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
