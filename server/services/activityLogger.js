import { db } from '../db.js';

export const ActivityLogger = {
  logActivity(
    {
      category,
      action,
      title,
      description,
      tableNumber = null,
      actorName = 'System',
      actorRole = 'SYSTEM',
      severity = 'INFO',
      metadata = null
    },
    io = null
  ) {
    try {
      const metaString = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

      const stmt = db.prepare(`
        INSERT INTO activity_logs (
          category, action, title, description,
          table_number, actor_name, actor_role, severity, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const result = stmt.run(
        category,
        action,
        title,
        description,
        tableNumber ? parseInt(tableNumber, 10) : null,
        actorName,
        actorRole,
        severity,
        metaString
      );

      const logId = result.lastInsertRowid;
      const logRecord = db.prepare('SELECT * FROM activity_logs WHERE id = ?').get(logId);

      if (logRecord) {
        if (logRecord.metadata) {
          try {
            logRecord.metadata = JSON.parse(logRecord.metadata);
          } catch (e) {
            // Keep as string if parsing fails
          }
        }

        // Broadcast to all sockets (Manager portal, waiter devices, admin room)
        if (io) {
          io.emit('activity:new_log', logRecord);
        }
      }

      return logRecord;
    } catch (err) {
      console.error('Failed to record activity log:', err);
      return null;
    }
  },

  getActivityLogs({
    category,
    tableNumber,
    severity,
    search,
    date,
    limit = 100,
    offset = 0
  } = {}) {
    const conditions = [];
    const params = [];

    if (category && category !== 'ALL') {
      conditions.push('category = ?');
      params.push(category);
    }

    if (tableNumber) {
      conditions.push('table_number = ?');
      params.push(parseInt(tableNumber, 10));
    }

    if (severity && severity !== 'ALL') {
      conditions.push('severity = ?');
      params.push(severity);
    }

    if (date) {
      conditions.push('DATE(created_at) = ?');
      params.push(date);
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(title LIKE ? OR description LIKE ? OR actor_name LIKE ?)');
      params.push(q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countSql = `SELECT COUNT(*) as total FROM activity_logs ${whereClause}`;
    const countRow = db.prepare(countSql).get(...params);
    const total = countRow ? countRow.total : 0;

    // Get paginated logs
    const logsSql = `
      SELECT * FROM activity_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;

    const rawLogs = db.prepare(logsSql).all(...params, parseInt(limit, 10), parseInt(offset, 10));

    const logs = rawLogs.map((log) => {
      let parsedMeta = null;
      if (log.metadata) {
        try {
          parsedMeta = JSON.parse(log.metadata);
        } catch (e) {
          parsedMeta = log.metadata;
        }
      }
      return {
        ...log,
        metadata: parsedMeta
      };
    });

    return {
      logs,
      total,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10)
    };
  },

  getActivitySummary(targetDate) {
    const date = targetDate || new Date().toISOString().split('T')[0];

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN action = 'CALL_WAITER' THEN 1 ELSE 0 END) as table_calls,
        SUM(CASE WHEN action = 'CALL_RESOLVED' THEN 1 ELSE 0 END) as calls_resolved,
        SUM(CASE WHEN action = 'ORDER_PLACED' THEN 1 ELSE 0 END) as orders_placed,
        SUM(CASE WHEN action = 'ORDER_SERVED' THEN 1 ELSE 0 END) as orders_served,
        SUM(CASE WHEN category = 'BOOKING' THEN 1 ELSE 0 END) as bookings_count,
        SUM(CASE WHEN action = 'PAYMENT_RECEIVED' THEN 1 ELSE 0 END) as bills_settled,
        SUM(CASE WHEN severity = 'URGENT' THEN 1 ELSE 0 END) as urgent_events
      FROM activity_logs
      WHERE DATE(created_at) = ?
    `).get(date) || {
      total_events: 0,
      table_calls: 0,
      calls_resolved: 0,
      orders_placed: 0,
      orders_served: 0,
      bookings_count: 0,
      bills_settled: 0,
      urgent_events: 0
    };

    return {
      date,
      ...stats
    };
  }
};
