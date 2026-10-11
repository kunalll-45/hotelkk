import assert from 'assert';
import 'dotenv/config';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

console.log('====================================================');
console.log('  Real AWS S3 Dish Photo End-to-End Workflow Test   ');
console.log('====================================================');

const BASE_URL = 'http://localhost:3000';
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION;

assert(BUCKET_NAME, 'S3_BUCKET_NAME must be configured in .env');
assert(REGION, 'AWS_REGION must be configured in .env');

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Create a realistic sample 1x1 JPEG image buffer
const sampleJpegBase64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

async function runTest() {
  // Step 1: Upload Dish Photo via POST /api/upload
  console.log('\n[Step 1] Uploading dish photo via POST /api/upload...');
  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/jpeg;base64,${sampleJpegBase64}`,
      filename: 'paneer-butter-masala.jpg',
      dishName: 'Paneer Butter Masala',
      prefix: ''
    })
  });

  assert.strictEqual(uploadRes.status, 200, `Upload returned status ${uploadRes.status}`);
  const uploadData = await uploadRes.json();
  console.log('✓ Upload API Response (Direct Bucket Root):', {
    success: uploadData.success,
    url: uploadData.url,
    key: uploadData.key,
    bucket: uploadData.bucket,
    contentType: uploadData.contentType
  });

  assert(!uploadData.key.includes('/'), `Key "${uploadData.key}" must not have any folder prefix; must be directly in bucket root`);
  assert(uploadData.key.startsWith('paneer-butter-masala-'), 'Key must start with dish name slug directly');
  assert.strictEqual(uploadData.bucket, BUCKET_NAME, 'Bucket must match configured S3 bucket');

  // Step 2: Verify Object Exists on AWS S3 via HeadObject
  console.log('\n[Step 2] Verifying object directly on AWS S3 with HeadObject...');
  const headResult = await s3.send(new HeadObjectCommand({
    Bucket: BUCKET_NAME,
    Key: uploadData.key
  }));
  console.log('✓ AWS S3 HeadObject verified:', {
    bucket: BUCKET_NAME,
    key: uploadData.key,
    contentType: headResult.ContentType,
    contentLength: headResult.ContentLength,
    etag: headResult.ETag
  });
  assert.strictEqual(headResult.ContentType, 'image/jpeg');

  // Step 3: Create Dish in Database with S3 Image URL
  console.log('\n[Step 3] Creating new dish record in menu with S3 image reference...');
  const createDishRes = await fetch(`${BASE_URL}/api/menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Paneer Butter Masala Special',
      category: 'Main Course',
      price: 320,
      isVeg: 1,
      description: 'Rich cottage cheese in creamy tomato gravy with butter',
      imageUrl: uploadData.url,
      isFeatured: 1
    })
  });
  assert.strictEqual(createDishRes.status, 201, `Create dish returned status ${createDishRes.status}`);
  const createdDish = await createDishRes.json();
  console.log('✓ Dish created in database:', {
    id: createdDish.id,
    name: createdDish.name,
    image_url: createdDish.image_url
  });
  assert.strictEqual(createdDish.image_url, uploadData.url, 'Database must store exact image URL reference');

  // Step 4: Customer Menu Fetches Dish & Image Streams from S3
  console.log('\n[Step 4] Fetching customer menu and verifying image stream from S3...');
  const menuRes = await fetch(`${BASE_URL}/api/menu?available=true`);
  assert.strictEqual(menuRes.status, 200);
  const menuItems = await menuRes.json();
  const foundDish = menuItems.find(d => d.id === createdDish.id);
  assert(foundDish, 'Created dish must be present in customer menu');
  console.log('✓ Dish present in customer menu:', foundDish.name, 'with image:', foundDish.image_url);

  // Fetch image through delivery route
  const imageFetchRes = await fetch(`${BASE_URL}${foundDish.image_url}`);
  assert.strictEqual(imageFetchRes.status, 200, `Image fetch returned status ${imageFetchRes.status}`);
  const imageContentType = imageFetchRes.headers.get('content-type');
  const cacheControl = imageFetchRes.headers.get('cache-control');
  console.log('✓ Image delivery route verified:', {
    status: imageFetchRes.status,
    contentType: imageContentType,
    cacheControl
  });
  assert.strictEqual(imageContentType, 'image/jpeg');
  assert(cacheControl && cacheControl.includes('public'), 'Cache-Control header should be set');

  // Step 5: Update Dish Photo & Verify Old S3 Image Cleanup
  console.log('\n[Step 5] Updating dish with a new photo and verifying cleanup of old S3 object...');
  const uploadRes2 = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: `data:image/jpeg;base64,${sampleJpegBase64}`,
      filename: 'paneer-butter-masala-v2.jpg',
      dishName: 'Paneer Butter Masala',
      prefix: ''
    })
  });
  const uploadData2 = await uploadRes2.json();
  assert(!uploadData2.key.includes('/'), `Key "${uploadData2.key}" must not contain any folder prefix`);
  console.log('✓ Uploaded new photo directly to S3 root:', uploadData2.key);

  // Update dish
  const updateDishRes = await fetch(`${BASE_URL}/api/menu/${createdDish.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageUrl: uploadData2.url
    })
  });
  assert.strictEqual(updateDishRes.status, 200);
  console.log('✓ Dish updated in database with new image:', uploadData2.url);

  // Allow short async cleanup time
  await new Promise(r => setTimeout(r, 1000));

  // Verify new image exists in S3
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: uploadData2.key }));
  console.log('✓ New image verified in S3');

  // Verify old image was removed from S3
  let oldExists = true;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: uploadData.key }));
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      oldExists = false;
    }
  }
  assert.strictEqual(oldExists, false, 'Old S3 image should have been cleaned up after replacement');
  console.log('✓ Old S3 image was safely deleted after replacement!');

  // Step 6: Delete Dish & Verify Cleanup of S3 Image
  console.log('\n[Step 6] Deleting dish and verifying S3 image cleanup...');
  const deleteRes = await fetch(`${BASE_URL}/api/menu/${createdDish.id}`, {
    method: 'DELETE'
  });
  assert.strictEqual(deleteRes.status, 200);
  console.log('✓ Dish deleted from database');

  await new Promise(r => setTimeout(r, 1000));
  let newExists = true;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: uploadData2.key }));
  } catch (e) {
    if (e.name === 'NotFound' || e.$metadata?.httpStatusCode === 404) {
      newExists = false;
    }
  }
  assert.strictEqual(newExists, false, 'S3 image should have been deleted when dish was deleted');
  console.log('✓ S3 image deleted when dish was deleted!');

  console.log('\n====================================================');
  console.log('  🎉 ALL 6 END-TO-END S3 WORKFLOW TESTS PASSED!      ');
  console.log('====================================================\n');
}

runTest().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
