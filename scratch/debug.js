import { initDatabase, db } from '../server/db.js';
import { TableService } from '../server/services/tableService.js';

await initDatabase();

try {
  const today = new Date().toISOString().split('T')[0];
  console.log('Today:', today);
  const assignments = [
    { tableId: 1, waiterId: 1 },
    { tableId: 2, waiterId: 1 },
    { tableId: 3, waiterId: 1 }
  ];
  const res = TableService.assignTablesForToday(assignments, today);
  console.log('Assign result length:', res.length);
} catch (e) {
  console.error('Assign error:', e);
}
