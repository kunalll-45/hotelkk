import express from 'express';
import QRCode from 'qrcode';
import { TableService } from '../services/tableService.js';

const router = express.Router();

// Fallback host for QR codes — reads from .env (dotenv loaded in index.js)
const DEFAULT_HOST = `${process.env.PUBLIC_IP || '15.252.17.218'}:${process.env.PORT || 3000}`;

// Generate QR Code data URL for a specific table
router.get('/table/:tableNumber', async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber);
    const host = req.get('host') || DEFAULT_HOST;
    const protocol = req.protocol || 'http';
    const targetUrl = `${protocol}://${host}/?table=${tableNumber}`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff'
      }
    });

    res.json({
      tableNumber,
      targetUrl,
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate all table QR codes
router.get('/all-tables', async (req, res) => {
  try {
    const tables = TableService.getAllTables();
    const host = req.get('host') || DEFAULT_HOST;
    const protocol = req.protocol || 'http';

    const qrList = await Promise.all(
      tables.map(async (t) => {
        const targetUrl = `${protocol}://${host}/?table=${t.table_number}`;
        const qrDataUrl = await QRCode.toDataURL(targetUrl, {
          width: 350,
          margin: 2,
          color: {
            dark: '#1a1a1a',
            light: '#ffffff'
          }
        });

        return {
          tableId: t.id,
          tableNumber: t.table_number,
          capacity: t.capacity,
          targetUrl,
          qrDataUrl
        };
      })
    );

    res.json(qrList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
