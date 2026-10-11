import assert from 'assert';
import {
  validateAwsConfig,
  validateImage,
  generateS3Key,
  isS3Configured,
  MAX_FILE_SIZE_BYTES
} from '../server/services/s3Service.js';
import { initDatabase, db } from '../server/db.js';
import { MenuService } from '../server/services/menuService.js';
import { OfferService } from '../server/services/offerService.js';

console.log('--- Starting AWS S3 Integration Unit & Logic Tests ---');

// Test 1: Missing AWS Config Validation
console.log('Test 1: Validating missing AWS environment variables detection...');
const oldKey = process.env.AWS_ACCESS_KEY_ID;
const oldSecret = process.env.AWS_SECRET_ACCESS_KEY;
const oldRegion = process.env.AWS_REGION;
const oldBucket = process.env.S3_BUCKET_NAME;

delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;
delete process.env.AWS_REGION;
delete process.env.S3_BUCKET_NAME;

let caughtError = null;
try {
  validateAwsConfig();
} catch (e) {
  caughtError = e;
}
assert(caughtError !== null, 'Should throw error when AWS env vars are missing');
assert(caughtError.code === 'MISSING_AWS_ENV_VARS', 'Error code should be MISSING_AWS_ENV_VARS');
assert(caughtError.missingVars.includes('AWS_ACCESS_KEY_ID'), 'Missing vars should include AWS_ACCESS_KEY_ID');
assert(caughtError.missingVars.includes('AWS_SECRET_ACCESS_KEY'), 'Missing vars should include AWS_SECRET_ACCESS_KEY');
assert(caughtError.missingVars.includes('AWS_REGION'), 'Missing vars should include AWS_REGION');
assert(caughtError.missingVars.includes('S3_BUCKET_NAME'), 'Missing vars should include S3_BUCKET_NAME');
console.log('✓ Test 1 Passed: Correctly identified all missing AWS variables.');

// Test 2: File Validation - Invalid File Type
console.log('Test 2: Validating invalid file type rejection...');
let invalidTypeErr = null;
try {
  const dummyBuffer = Buffer.from('console.log("hello");');
  validateImage(dummyBuffer, 'malicious.js', 'application/javascript');
} catch (e) {
  invalidTypeErr = e;
}
assert(invalidTypeErr !== null, 'Should reject invalid file type');
assert(invalidTypeErr.code === 'INVALID_FILE_TYPE', `Error code should be INVALID_FILE_TYPE, got ${invalidTypeErr.code}`);
console.log('✓ Test 2 Passed: Rejected invalid file types.');

// Test 3: File Validation - File Too Large (>10MB)
console.log('Test 3: Validating file size limit enforcement...');
let tooLargeErr = null;
try {
  const largeBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024);
  validateImage(largeBuffer, 'large_photo.jpg', 'image/jpeg');
} catch (e) {
  tooLargeErr = e;
}
assert(tooLargeErr !== null, 'Should reject file larger than 10MB');
assert(tooLargeErr.code === 'FILE_TOO_LARGE', `Error code should be FILE_TOO_LARGE, got ${tooLargeErr.code}`);
console.log('✓ Test 3 Passed: Rejected files exceeding max size limit.');

// Test 4: File Validation - Valid Image
console.log('Test 4: Validating accepted image types (JPEG, PNG, WebP)...');
const validJpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
assert.doesNotThrow(() => validateImage(validJpg, 'dish.jpg', 'image/jpeg'));
assert.doesNotThrow(() => validateImage(validJpg, 'dish.png', 'image/png'));
assert.doesNotThrow(() => validateImage(validJpg, 'dish.webp', 'image/webp'));
console.log('✓ Test 4 Passed: Successfully validated valid images.');

// Test 5: Unique S3 Object Key Generation
console.log('Test 5: Validating unique S3 object key generation and collision prevention...');
const keys = new Set();
for (let i = 0; i < 100; i++) {
  const key = generateS3Key('my_special_dish.png', 'image/png');
  assert(key.startsWith('uploads/img_'), 'Key should start with uploads/img_');
  assert(key.endsWith('.png'), 'Key should end with .png');
  assert(!keys.has(key), 'Key collision detected!');
  keys.add(key);
}
console.log('✓ Test 5 Passed: 100 collision-free unique S3 object keys generated.');

// Test 6: Database Storage & Retrieval of S3 Object Key in Existing Database Structure
console.log('Test 6: Validating database storage and retrieval with S3 key...');
await initDatabase();
const sampleS3Key = generateS3Key('butter_chicken.jpg', 'image/jpeg');
const sampleS3Path = `/${sampleS3Key}`;

// Create menu item with S3 key path
const menuItem = MenuService.createMenuItem({
  name: 'Test S3 Butter Chicken',
  category: 'Main Course',
  price: 320,
  isVeg: 0,
  description: 'Rich creamy butter chicken',
  imageUrl: sampleS3Path
});

assert.strictEqual(menuItem.image_url, sampleS3Path, 'Database should store S3 object key path in image_url');

// Query directly from SQLite
const queriedItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(menuItem.id);
assert.strictEqual(queriedItem.image_url, sampleS3Path, 'Direct DB query should match S3 object key path');

// Clean up test menu item
db.prepare('DELETE FROM menu_items WHERE id = ?').run(menuItem.id);
console.log('✓ Test 6 Passed: Database correctly stores and returns S3 object key path.');

// Restore env vars
if (oldKey) process.env.AWS_ACCESS_KEY_ID = oldKey;
if (oldSecret) process.env.AWS_SECRET_ACCESS_KEY = oldSecret;
if (oldRegion) process.env.AWS_REGION = oldRegion;
if (oldBucket) process.env.S3_BUCKET_NAME = oldBucket;

console.log('\n--- ALL UNIT TESTS PASSED SUCCESSFULLY ---');
