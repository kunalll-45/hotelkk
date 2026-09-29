import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export default function createUploadRouter() {
  const router = express.Router();

  // POST /api/upload (Upload image as base64 DataURL or binary)
  router.post('/', (req, res) => {
    try {
      const { image, filename = 'image.jpg' } = req.body;

      if (!image) {
        return res.status(400).json({ error: 'Image data is required.' });
      }

      // Check if data URL
      let buffer;
      let ext = path.extname(filename) || '.jpg';

      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const mimeType = matches[1];
          if (mimeType.includes('png')) ext = '.png';
          else if (mimeType.includes('webp')) ext = '.webp';
          else if (mimeType.includes('gif')) ext = '.gif';
          else ext = '.jpg';

          buffer = Buffer.from(matches[2], 'base64');
        } else {
          return res.status(400).json({ error: 'Invalid base64 data URL format.' });
        }
      } else {
        buffer = Buffer.from(image, 'base64');
      }

      // Generate unique safe filename
      const safeName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
      const targetPath = path.join(uploadsDir, safeName);

      fs.writeFileSync(targetPath, buffer);

      const fileUrl = `/uploads/${safeName}`;
      res.json({
        success: true,
        url: fileUrl,
        filename: safeName,
        size: buffer.length
      });
    } catch (err) {
      console.error('Upload failed:', err);
      res.status(500).json({ error: err.message || 'File upload failed.' });
    }
  });

  return router;
}
