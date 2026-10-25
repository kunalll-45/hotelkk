import express from 'express';
import QRCode from 'qrcode';
import { TableService } from '../services/tableService.js';

const router = express.Router();

/**
 * Resolves the public application base URL for QR codes.
 * Respects API_BASE_URL, AWS Load Balancer forwarded headers (x-forwarded-host, x-forwarded-proto),
 * and dynamic request headers without hardcoded IP addresses.
 */
function getAppTargetBase(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  if (forwardedHost) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    return `${proto}://${forwardedHost}`;
  }
  const rawPublic = (process.env.PUBLIC_IP || '').trim();
  if (rawPublic) {
    if (rawPublic.startsWith('http://') || rawPublic.startsWith('https://')) {
      return rawPublic.replace(/\/$/, '');
    }
    if (rawPublic.includes(':')) {
      return `http://${rawPublic}`;
    }
    return `http://${rawPublic}:${process.env.PORT || 3000}`;
  }
  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

// Generate QR Code data URL for a specific table
router.get('/table/:tableNumber', async (req, res) => {
  try {
    const tableNumber = parseInt(req.params.tableNumber, 10);
    const targetUrl = `${getAppTargetBase(req)}/?table=${tableNumber}`;

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
    const appBase = getAppTargetBase(req);

    const qrList = await Promise.all(
      tables.map(async (t) => {
        const targetUrl = `${appBase}/?table=${t.table_number}`;
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
