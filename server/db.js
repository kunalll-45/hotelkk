import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'data');
const dbFilePath = path.join(dataDir, 'kks_food_house.sqlite');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let sqlJsDb = null;

export function saveDatabase() {
  if (sqlJsDb) {
    const data = sqlJsDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbFilePath, buffer);
  }
}

// Universal SQLite wrapper providing intuitive better-sqlite3 style API over sql.js
export const db = {
  exec(sql) {
    if (!sqlJsDb) throw new Error('Database not initialized');
    sqlJsDb.exec(sql);
    saveDatabase();
  },

  prepare(sql) {
    if (!sqlJsDb) throw new Error('Database not initialized');

    return {
      get(...params) {
        let stmt;
        try {
          stmt = sqlJsDb.prepare(sql);
          stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
          if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return row;
          }
          stmt.free();
          return undefined;
        } catch (err) {
          if (stmt) stmt.free();
          throw err;
        }
      },

      all(...params) {
        let stmt;
        try {
          stmt = sqlJsDb.prepare(sql);
          stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
          const results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        } catch (err) {
          if (stmt) stmt.free();
          throw err;
        }
      },

      run(...params) {
        let stmt;
        try {
          stmt = sqlJsDb.prepare(sql);
          const boundParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          stmt.run(boundParams);
          stmt.free();

          // Get last insert rowid and changes
          const lastIdRes = sqlJsDb.exec('SELECT last_insert_rowid() as id');
          const lastInsertRowid = lastIdRes[0]?.values[0]?.[0] || 0;
          const changesRes = sqlJsDb.exec('SELECT changes() as changes');
          const changes = changesRes[0]?.values[0]?.[0] || 0;

          saveDatabase();
          return { lastInsertRowid, changes };
        } catch (err) {
          if (stmt) stmt.free();
          throw err;
        }
      }
    };
  },

  transaction(fn) {
    return (...args) => {
      try {
        this.exec('BEGIN TRANSACTION');
        const result = fn(...args);
        this.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          this.exec('ROLLBACK');
        } catch (rbErr) {
          // ignore rollback if already closed
        }
        throw err;
      }
    };
  }
};

export async function initDatabase() {
  const SQL = await initSqlJs();

  if (fs.existsSync(dbFilePath)) {
    const fileBuffer = fs.readFileSync(dbFilePath);
    sqlJsDb = new SQL.Database(fileBuffer);
  } else {
    sqlJsDb = new SQL.Database();
  }

  // 1. Managers table (Rule: Max 2 active managers)
  db.exec(`
    CREATE TABLE IF NOT EXISTS managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role_title TEXT NOT NULL DEFAULT 'Working Manager',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Staff table (Waiters, Cooks, Helpers, Other)
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('Waiter', 'Cook', 'Helper', 'Other')),
      phone TEXT,
      joining_date DATE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Waiter credentials (Only Waiters get login accounts created by Manager)
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiter_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
    );
  `);

  // 4. Daily Attendance (Spreadsheet grid, from joining date)
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      date DATE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PRESENT', 'ABSENT')),
      marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      marked_by TEXT DEFAULT 'Manager',
      UNIQUE(staff_id, date),
      FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
    );
  `);

  // 5. Tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_number INTEGER UNIQUE NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 4,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  // 6. Table Assignments for today (Only PRESENT waiters)
  db.exec(`
    CREATE TABLE IF NOT EXISTS table_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      table_id INTEGER NOT NULL,
      waiter_id INTEGER NOT NULL,
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, table_id),
      FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
      FOREIGN KEY (waiter_id) REFERENCES staff(id) ON DELETE CASCADE
    );
  `);

  // 7. Menu Items (Sequential Food Item ID 1, 2, 3...)
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_veg INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      image_url TEXT,
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 8. Table Sessions (Remains ACTIVE until Manager confirms Payment Successful)
  db.exec(`
    CREATE TABLE IF NOT EXISTS table_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      session_code TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      waiter_id INTEGER,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'CLOSED')) DEFAULT 'ACTIVE',
      subtotal REAL NOT NULL DEFAULT 0.0,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('NONE', 'PERCENTAGE', 'FIXED')) DEFAULT 'NONE',
      discount_value REAL NOT NULL DEFAULT 0.0,
      final_total REAL NOT NULL DEFAULT 0.0,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      paid_at DATETIME,
      payment_method TEXT DEFAULT 'Cash',
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (waiter_id) REFERENCES staff(id)
    );
  `);

  // 9. Orders (Belong to a table session; placed by family members)
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      placed_by_name TEXT NOT NULL,
      waiter_id INTEGER,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'CONFIRMED', 'SERVED')) DEFAULT 'PENDING',
      total_amount REAL NOT NULL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      served_at DATETIME,
      FOREIGN KEY (session_id) REFERENCES table_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (waiter_id) REFERENCES staff(id)
    );
  `);

  // 10. Order Items (Includes manual/off-app items added by Manager)
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      session_id INTEGER NOT NULL,
      menu_item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      subtotal REAL NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0,
      added_by TEXT DEFAULT 'Customer',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES table_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
    );
  `);

  // 11. Customer Service Requests (Bell Calls with 30s cooldown)
  db.exec(`
    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      waiter_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'RESOLVED')) DEFAULT 'PENDING',
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (session_id) REFERENCES table_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (waiter_id) REFERENCES staff(id)
    );
  `);

  // 12. Daily Tip Tracking (Today's total and Previous day's total)
  db.exec(`
    CREATE TABLE IF NOT EXISTS waiter_tips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      waiter_id INTEGER NOT NULL,
      date DATE NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      recorded_by TEXT DEFAULT 'Manager',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (waiter_id) REFERENCES staff(id) ON DELETE CASCADE
    );
  `);

  // 13. Restaurant Settings (Open/Closed status, operating hours)
  db.exec(`
    CREATE TABLE IF NOT EXISTS restaurant_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      is_open INTEGER NOT NULL DEFAULT 1,
      opening_time TEXT NOT NULL DEFAULT '12:00 PM',
      closing_time TEXT NOT NULL DEFAULT '12:00 AM',
      announcement TEXT DEFAULT 'Welcome to K K''s Food House! Freshly prepared royal delicacies.',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 14. Customer Table Reservations / Bookings
  db.exec(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      booking_date DATE NOT NULL,
      booking_time TEXT NOT NULL,
      guests_count INTEGER NOT NULL DEFAULT 2,
      seating_preference TEXT DEFAULT 'Indoor Dining',
      special_requests TEXT,
      table_id INTEGER,
      status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK(status IN ('CONFIRMED', 'CANCELLED', 'SEATED', 'COMPLETED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );
  `);

  // 15. Real-time Hotel Activity & Reaction Logs
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK(category IN ('BOOKING', 'ORDER', 'SERVICE', 'BILLING', 'STAFF', 'ATTENDANCE', 'TABLE', 'MENU', 'SYSTEM')),
      action TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      table_number INTEGER,
      actor_name TEXT,
      actor_role TEXT CHECK(actor_role IN ('CUSTOMER', 'WAITER', 'MANAGER', 'SYSTEM')),
      severity TEXT NOT NULL CHECK(severity IN ('INFO', 'SUCCESS', 'WARNING', 'URGENT')) DEFAULT 'INFO',
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_table ON activity_logs(table_number);
  `);

  // 16. Temporary Table Holds (Atomic reservation locks during payment)
  db.exec(`
    CREATE TABLE IF NOT EXISTS temporary_holds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hold_token TEXT UNIQUE NOT NULL,
      table_id INTEGER NOT NULL,
      booking_date DATE NOT NULL,
      booking_time TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      guests_count INTEGER DEFAULT 2,
      fee_amount REAL DEFAULT 2.50,
      payment_status TEXT DEFAULT 'PENDING' CHECK(payment_status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
      payment_id TEXT,
      purpose TEXT DEFAULT 'NEW_BOOKING' CHECK(purpose IN ('NEW_BOOKING', 'CHANGE_BOOKING')),
      original_booking_id INTEGER,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (original_booking_id) REFERENCES reservations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_temporary_holds_expires_at ON temporary_holds(expires_at);
    CREATE INDEX IF NOT EXISTS idx_temporary_holds_token ON temporary_holds(hold_token);
  `);

  // 17. OTP Verifications (Strict server-side validation with attempt limit)
  db.exec(`
    CREATE TABLE IF NOT EXISTS otp_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK(purpose IN ('NEW_BOOKING', 'MANAGE_BOOKING', 'CHANGE_BOOKING', 'TABLE_ACTIVATION')),
      reference_id TEXT,
      attempts_left INTEGER NOT NULL DEFAULT 4,
      is_verified INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_otp_verifications_phone ON otp_verifications(phone);
    CREATE INDEX IF NOT EXISTS idx_otp_verifications_ref ON otp_verifications(reference_id);
  `);

  // 18. Booking Cancellation Requests & Automatic Refund Tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS cancellation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL UNIQUE,
      booking_code TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      table_number INTEGER,
      booking_date DATE NOT NULL,
      booking_time TEXT NOT NULL,
      cancellation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      remaining_hours REAL NOT NULL,
      original_amount REAL NOT NULL DEFAULT 100.00,
      refund_percentage REAL NOT NULL,
      refund_amount REAL NOT NULL,
      customer_upi_id TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED')),
      processed_at DATETIME,
      processed_by TEXT,
      refund_transaction_id TEXT,
      gateway_response TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cancellation_requests_res_id ON cancellation_requests(reservation_id);
    CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status);
  `);

  // 19. Promotional & Menu Offers
  db.exec(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      offer_type TEXT NOT NULL CHECK(offer_type IN ('PERCENTAGE', 'FLAT', 'FREE_ITEM', 'SPECIAL_PRICE', 'BOGO')),
      discount_value REAL NOT NULL DEFAULT 0.0,
      target_menu_item_id INTEGER,
      free_menu_item_id INTEGER,
      buy_qty INTEGER DEFAULT 1,
      get_qty INTEGER DEFAULT 1,
      min_order_amount REAL DEFAULT 0.0,
      start_datetime DATETIME NOT NULL,
      end_datetime DATETIME NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      banner_tag TEXT DEFAULT 'Special Offer',
      created_by TEXT DEFAULT 'Manager',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (target_menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (free_menu_item_id) REFERENCES menu_items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active);
    CREATE INDEX IF NOT EXISTS idx_offers_dates ON offers(start_datetime, end_datetime);
  `);

  // Ensure reservation table schema migrations for payment and change tracking
  try {
    const pragma = db.prepare('PRAGMA table_info(reservations)').all();
    const colNames = pragma.map(c => c.name);
    if (!colNames.includes('payment_status')) {
      db.exec("ALTER TABLE reservations ADD COLUMN payment_status TEXT DEFAULT 'PAID'");
    }
    if (!colNames.includes('payment_amount')) {
      db.exec("ALTER TABLE reservations ADD COLUMN payment_amount REAL DEFAULT 2.50");
    }
    if (!colNames.includes('payment_transaction_id')) {
      db.exec("ALTER TABLE reservations ADD COLUMN payment_transaction_id TEXT");
    }
    if (!colNames.includes('change_history')) {
      db.exec("ALTER TABLE reservations ADD COLUMN change_history TEXT");
    }
  } catch (e) {
    console.warn('Reservation schema migration notice:', e.message);
  }

  // Ensure menu_items schema migration for Top Dish / Featured flag
  try {
    const menuPragma = db.prepare('PRAGMA table_info(menu_items)').all();
    const menuColNames = menuPragma.map(c => c.name);
    if (!menuColNames.includes('is_featured')) {
      db.exec("ALTER TABLE menu_items ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0");
    }

    // Ensure initial ~5 signature dishes are flagged as featured if none currently flagged
    const featuredCheck = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE is_featured = 1').get();
    if (!featuredCheck || featuredCheck.count === 0) {
      db.exec(`
        UPDATE menu_items 
        SET is_featured = 1 
        WHERE id IN (1, 6, 8, 15, 23)
      `);
    }
  } catch (e) {
    console.warn('Menu schema migration notice:', e.message);
  }

  // 20. Payments & Cash Ledger table (Tracks cash vs digital, staff attribution, pending cash status)
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'UPI', 'Card', 'Net Banking', 'Other')),
      payment_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(payment_status IN ('PENDING_CASH', 'COMPLETED', 'FAILED')),
      collected_by_role TEXT NOT NULL CHECK(collected_by_role IN ('WAITER', 'MANAGER')),
      collected_by_id INTEGER,
      collected_by_name TEXT NOT NULL,
      is_pending_cash INTEGER NOT NULL DEFAULT 0,
      cash_settled_at DATETIME,
      transaction_ref TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES table_sessions(id),
      FOREIGN KEY (table_id) REFERENCES tables(id)
    );
    CREATE INDEX IF NOT EXISTS idx_payments_pending ON payments(is_pending_cash);
    CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id);
  `);

  // Ensure menu_items send_to_kitchen migration (Requirement 7)
  try {
    const menuPragma = db.prepare('PRAGMA table_info(menu_items)').all();
    const menuColNames = menuPragma.map(c => c.name);
    if (!menuColNames.includes('send_to_kitchen')) {
      db.exec("ALTER TABLE menu_items ADD COLUMN send_to_kitchen INTEGER NOT NULL DEFAULT 1");
    }
    // Packaged Mineral Water does not require kitchen preparation
    db.exec(`
      UPDATE menu_items
      SET send_to_kitchen = 0
      WHERE name LIKE '%Mineral Water%' OR name LIKE '%Water Bottle%'
    `);
  } catch (e) {
    console.warn('menu_items send_to_kitchen migration notice:', e.message);
  }

  // Ensure orders table schema supports new status progression ('RECEIVED', 'READY_TO_COOK', 'COOKING', 'READY_TO_SERVE', 'SERVED')
  try {
    const orderPragma = db.prepare('PRAGMA table_info(orders)').all();
    const orderCols = orderPragma.map(c => c.name);
    if (!orderCols.includes('cooking_at')) {
      db.exec("ALTER TABLE orders ADD COLUMN cooking_at DATETIME");
    }
    if (!orderCols.includes('ready_at')) {
      db.exec("ALTER TABLE orders ADD COLUMN ready_at DATETIME");
    }

    const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get()?.sql || '';
    if (tableSql && !tableSql.includes('RECEIVED') && tableSql.includes('CHECK')) {
      db.exec(`
        CREATE TABLE orders_temp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          table_id INTEGER NOT NULL,
          placed_by_name TEXT NOT NULL,
          waiter_id INTEGER,
          status TEXT NOT NULL DEFAULT 'RECEIVED',
          total_amount REAL NOT NULL DEFAULT 0.0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          confirmed_at DATETIME,
          cooking_at DATETIME,
          ready_at DATETIME,
          served_at DATETIME
        );
        INSERT INTO orders_temp (id, session_id, table_id, placed_by_name, waiter_id, status, total_amount, created_at, confirmed_at, served_at)
        SELECT id, session_id, table_id, placed_by_name, waiter_id, status, total_amount, created_at, confirmed_at, served_at FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_temp RENAME TO orders;
      `);
    }
  } catch (e) {
    console.warn('Orders schema migration notice:', e.message);
  }

  // 21. Processed Images Metadata (Image Processing Workflow & Amazon RDS MySQL / SQLite)
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_images (
      id TEXT PRIMARY KEY,
      original_filename TEXT NOT NULL,
      processed_filename TEXT,
      original_s3_key TEXT NOT NULL,
      processed_s3_key TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      mime_type TEXT,
      original_size INTEGER,
      compressed_size INTEGER,
      width INTEGER,
      height INTEGER,
      aspect_ratio TEXT DEFAULT '1:1',
      entity_type TEXT,
      entity_id TEXT,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed_at DATETIME,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_processed_images_status ON processed_images(status);
    CREATE INDEX IF NOT EXISTS idx_processed_images_orig_key ON processed_images(original_s3_key);
    CREATE INDEX IF NOT EXISTS idx_processed_images_proc_key ON processed_images(processed_s3_key);
  `);

  seedInitialData();
  saveDatabase();
}

function seedInitialData() {
  const managerRow = db.prepare('SELECT COUNT(*) as count FROM managers').get();
  if (!managerRow || managerRow.count === 0) {
    // Seed 3 Managers (Policy: Up to 3 active managers)
    const insertManager = db.prepare(`
      INSERT INTO managers (username, password, full_name, role_title, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    insertManager.run('kunal_owner', 'owner123', 'Kunal K.', 'Restaurant Owner');
    insertManager.run('manager_john', 'manager123', 'John D.', 'Working Manager');
    insertManager.run('manager_rajesh', 'rajesh123', 'Rajesh S.', 'Operations Manager');
  } else {
    // Ensure 3rd manager exists if only 2 were previously seeded
    const rajesh = db.prepare('SELECT id FROM managers WHERE username = ?').get('manager_rajesh');
    if (!rajesh) {
      db.prepare(`
        INSERT INTO managers (username, password, full_name, role_title, is_active)
        VALUES ('manager_rajesh', 'rajesh123', 'Rajesh S.', 'Operations Manager', 1)
      `).run();
    }
  }

  const settingsRow = db.prepare('SELECT COUNT(*) as count FROM restaurant_settings').get();
  if (!settingsRow || settingsRow.count === 0) {
    db.prepare(`
      INSERT INTO restaurant_settings (id, is_open, opening_time, closing_time, announcement)
      VALUES (1, 1, '12:00 PM', '12:00 AM', 'Welcome to K K''s Food House! Traditional Royal Flavors & Modern Hospitality.')
    `).run();
  } else {
    // Ensure hours are updated to 12:00 PM to 12:00 AM
    db.prepare(`
      UPDATE restaurant_settings
      SET opening_time = '12:00 PM', closing_time = '12:00 AM'
      WHERE id = 1
    `).run();
  }

  const tableRow = db.prepare('SELECT COUNT(*) as count FROM tables').get();
  if (!tableRow || tableRow.count === 0) {
    const insertTable = db.prepare('INSERT INTO tables (table_number, capacity) VALUES (?, ?)');
    for (let t = 1; t <= 12; t++) {
      const cap = t <= 4 ? 2 : t <= 8 ? 4 : 6;
      insertTable.run(t, cap);
    }
  }

  const staffRow = db.prepare('SELECT COUNT(*) as count FROM staff').get();
  if (!staffRow || staffRow.count === 0) {
    const insertStaff = db.prepare(`
      INSERT INTO staff (name, role, phone, joining_date, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    const s1 = insertStaff.run('Rahul Sharma', 'Waiter', '+91 98765 43210', '2026-07-01').lastInsertRowid;
    const s2 = insertStaff.run('Amit Patel', 'Waiter', '+91 98765 43211', '2026-07-15').lastInsertRowid;
    const s3 = insertStaff.run('Suresh Verma', 'Waiter', '+91 98765 43212', '2026-08-01').lastInsertRowid;
    insertStaff.run('Vikram Singh', 'Cook', '+91 98765 43213', '2026-06-01');
    insertStaff.run('Ramesh Kumar', 'Helper', '+91 98765 43214', '2026-06-15');
    insertStaff.run('Deepa Devi', 'Other', '+91 98765 43215', '2026-07-10');

    // Create Waiter login credentials (Only for Waiters)
    const insertCred = db.prepare(`
      INSERT INTO waiter_credentials (staff_id, username, password, is_active)
      VALUES (?, ?, ?, 1)
    `);
    insertCred.run(s1, 'rahul_w', 'waiter123');
    insertCred.run(s2, 'amit_w', 'waiter123');
    insertCred.run(s3, 'suresh_w', 'waiter123');

    // Seed Attendance history from joining dates
    seedAttendanceHistory([s1, s2, s3]);

    // Seed today's attendance: Rahul & Amit PRESENT, Suresh ABSENT (for demonstration of login restriction)
    const today = new Date().toISOString().split('T')[0];
    const insertAtt = db.prepare(`
      INSERT OR REPLACE INTO attendance (staff_id, date, status, marked_by)
      VALUES (?, ?, ?, 'Manager')
    `);
    insertAtt.run(s1, today, 'PRESENT');
    insertAtt.run(s2, today, 'PRESENT');
    insertAtt.run(s3, today, 'ABSENT');

    // Assign tables for today to Present Waiters (Rahul: Tables 1-6, Amit: Tables 7-12)
    const insertAssign = db.prepare(`
      INSERT OR REPLACE INTO table_assignments (date, table_id, waiter_id)
      VALUES (?, ?, ?)
    `);
    for (let t = 1; t <= 6; t++) {
      insertAssign.run(today, t, s1);
    }
    for (let t = 7; t <= 12; t++) {
      insertAssign.run(today, t, s2);
    }

    // Seed tips
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const insertTip = db.prepare(`
      INSERT INTO waiter_tips (waiter_id, date, amount, notes)
      VALUES (?, ?, ?, ?)
    `);
    insertTip.run(s1, today, 150, 'Table 3 family tip given to manager');
    insertTip.run(s1, yesterday, 200, 'Table 5 evening tip');
    insertTip.run(s2, today, 100, 'Table 8 tip');
    insertTip.run(s2, yesterday, 180, 'Table 10 tip');
  }

  ensureTodayData();

  const menuRow = db.prepare('SELECT COUNT(*) as count FROM menu_items').get();
  if (!menuRow || menuRow.count === 0) {
    const insertMenu = db.prepare(`
      INSERT INTO menu_items (id, name, category, price, is_available, is_veg, description, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const items = [
      // Starters
      [1, 'Paneer Tikka Royale', 'Starters', 280, 1, 1, 'Cottage cheese marinated in royal spices and charred in clay oven', 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=60'],
      [2, 'Chicken Seekh Kebab', 'Starters', 340, 1, 0, 'Minced spiced chicken skewers roasted over charcoal coals', 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500&auto=format&fit=crop&q=60'],
      [3, 'Crispy Spring Rolls', 'Starters', 220, 1, 1, 'Golden crisp rolls filled with stir-fried seasoned vegetables', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60'],
      [4, 'Tandoori Stuffed Mushroom', 'Starters', 260, 1, 1, 'Juicy button mushrooms filled with herb cheese and roasted', 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=60'],
      [5, 'Amritsari Fish Fry', 'Starters', 380, 1, 0, 'Carom-seed spiced crispy fish fillets served with mint dip', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=500&auto=format&fit=crop&q=60'],

      // Main Course
      [6, "K K's Butter Chicken", 'Main Course', 420, 1, 0, 'Tender tandoori chicken simmered in rich creamy tomato velvet gravy', 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=500&auto=format&fit=crop&q=60'],
      [7, 'Paneer Butter Masala', 'Main Course', 320, 1, 1, 'Fresh cottage cheese cubes in aromatic butter gravy with fenugreek', 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop&q=60'],
      [8, 'Dal Makhani Gold', 'Main Course', 260, 1, 1, 'Black lentils slow-cooked overnight with white butter and cream', 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=60'],
      [9, 'Mutton Rogan Josh', 'Main Course', 480, 1, 0, 'Kashmiri style slow braised tender lamb in rich spiced gravy', 'https://images.unsplash.com/photo-1545247181-516773cae7be?w=500&auto=format&fit=crop&q=60'],
      [10, 'Kadhai Paneer', 'Main Course', 310, 1, 1, 'Cottage cheese with bell peppers and freshly ground kadhai spices', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60'],

      // Breads
      [11, 'Butter Naan', 'Breads', 60, 1, 1, 'Soft leavened tandoor bread brushed with butter', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60'],
      [12, 'Garlic Coriander Naan', 'Breads', 75, 1, 1, 'Fluffy naan coated with roasted minced garlic and fresh cilantro', 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500&auto=format&fit=crop&q=60'],
      [13, 'Tandoori Roti', 'Breads', 35, 1, 1, 'Whole wheat flatbread baked crisp in clay oven', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=60'],
      [14, 'Laccha Paratha', 'Breads', 70, 1, 1, 'Multi-layered flaky whole wheat bread cooked in tandoor', 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=500&auto=format&fit=crop&q=60'],

      // Rice & Biryani
      [15, 'Royal Dum Chicken Biryani', 'Rice & Biryani', 390, 1, 0, 'Long grain basmati layered with marinated chicken, saffron and herbs', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60'],
      [16, 'Hyderabadi Veg Biryani', 'Rice & Biryani', 290, 1, 1, 'Aromatic garden vegetables layered with dum-cooked fragrant rice', 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=60'],
      [17, 'Jeera Basmati Rice', 'Rice & Biryani', 180, 1, 1, 'Steamed basmati tempered with toasted cumin seeds and pure ghee', 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=500&auto=format&fit=crop&q=60'],

      // Beverages & Water
      [18, 'Special Masala Chai', 'Beverages', 50, 1, 1, 'Brewed with cardamom, ginger, and aromatic house spices', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=60'],
      [19, 'Kesar Mango Lassi', 'Beverages', 120, 1, 1, 'Thick chilled yogurt blended with Alphonso mango pulp and saffron', 'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=500&auto=format&fit=crop&q=60'],
      [20, 'Fresh Lime Soda (Sweet/Salt)', 'Beverages', 80, 1, 1, 'Refreshing sparkling limeade tailored to your preference', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60'],
      [21, 'Packaged Mineral Water (1L)', 'Beverages', 30, 1, 1, 'Chilled sealed natural mineral water bottle', 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=500&auto=format&fit=crop&q=60'],

      // Desserts
      [22, 'Gulab Jamun with Rabri (2 pcs)', 'Desserts', 140, 1, 1, 'Hot golden milk dumplings served on a bed of chilled saffron rabri', 'https://images.unsplash.com/photo-1589119908995-c6837fa14d48?w=500&auto=format&fit=crop&q=60'],
      [23, 'Kolkata Rasmalai (2 pcs)', 'Desserts', 150, 1, 1, 'Soft spongy cottage cheese discs soaked in cardamom pistachio milk', 'https://images.unsplash.com/photo-1589119908995-c6837fa14d48?w=500&auto=format&fit=crop&q=60'],
      [24, 'Sizzling Chocolate Brownie', 'Desserts', 210, 1, 1, 'Warm fudge brownie topped with vanilla ice cream and hot chocolate sauce', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=60']
    ];

    for (const item of items) {
      insertMenu.run(...item);
    }
  }

  seedHistoricalSessions();
}

function seedAttendanceHistory(staffIds) {
  const insertAtt = db.prepare(`
    INSERT OR IGNORE INTO attendance (staff_id, date, status, marked_by)
    VALUES (?, ?, ?, 'Manager')
  `);

  const now = new Date();
  for (const staffId of staffIds) {
    const staff = db.prepare('SELECT joining_date FROM staff WHERE id = ?').get(staffId);
    if (!staff) continue;
    const start = new Date(staff.joining_date);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();
      const isAbsent = dayOfWeek === 0 || (d.getDate() % 11 === 0);
      insertAtt.run(staffId, dateStr, isAbsent ? 'ABSENT' : 'PRESENT');
    }
  }
}

function seedHistoricalSessions() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM table_sessions WHERE status = "CLOSED"').get();
  if (countRow && countRow.count > 0) return;

  const dates = [
    new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0]
  ];

  const waiters = db.prepare('SELECT id FROM staff WHERE role = "Waiter"').all();
  if (waiters.length === 0) return;

  const insertSession = db.prepare(`
    INSERT INTO table_sessions (table_id, session_code, customer_name, waiter_id, status, subtotal, discount_type, discount_value, final_total, opened_at, closed_at, paid_at, payment_method)
    VALUES (?, ?, ?, ?, 'CLOSED', ?, ?, ?, ?, ?, ?, ?, 'Cash')
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (session_id, table_id, placed_by_name, waiter_id, status, total_amount, created_at, confirmed_at, served_at)
    VALUES (?, ?, ?, ?, 'SERVED', ?, ?, ?, ?)
  `);

  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, session_id, menu_item_id, item_name, unit_price, quantity, subtotal, is_manual, added_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let codeCounter = 1001;

  dates.forEach((dateStr, dIdx) => {
    const sampleFamilies = [
      { name: 'Gupta Family', table: 2, waiter: waiters[0]?.id || 1, items: [[6, "K K's Butter Chicken", 420, 2], [11, 'Butter Naan', 60, 4], [15, 'Royal Dum Chicken Biryani', 390, 1]], discount: { type: 'NONE', val: 0 } },
      { name: 'Mehta Family', table: 4, waiter: waiters[1]?.id || 1, items: [[7, 'Paneer Butter Masala', 320, 2], [8, 'Dal Makhani Gold', 260, 1], [12, 'Garlic Coriander Naan', 75, 4], [19, 'Kesar Mango Lassi', 120, 3]], discount: { type: 'PERCENTAGE', val: 10 } },
      { name: 'Kapoor Group', table: 6, waiter: waiters[0]?.id || 1, items: [[1, 'Paneer Tikka Royale', 280, 2], [16, 'Hyderabadi Veg Biryani', 290, 2], [22, 'Gulab Jamun with Rabri (2 pcs)', 140, 2]], discount: { type: 'FIXED', val: 50 } }
    ];

    sampleFamilies.forEach((fam, sIdx) => {
      const timeBase = `${dateStr} ${13 + sIdx * 3}:15:00`;
      const closeTime = `${dateStr} ${14 + sIdx * 3}:30:00`;

      let subtotal = 0;
      fam.items.forEach(it => { subtotal += it[2] * it[3]; });

      let discountVal = 0;
      if (fam.discount.type === 'PERCENTAGE') {
        discountVal = Math.round((subtotal * fam.discount.val) / 100);
      } else if (fam.discount.type === 'FIXED') {
        discountVal = fam.discount.val;
      }
      const finalTotal = subtotal - discountVal;

      const sessionRes = insertSession.run(
        fam.table,
        `KK-${codeCounter++}`,
        fam.name,
        fam.waiter,
        subtotal,
        fam.discount.type,
        fam.discount.val,
        finalTotal,
        timeBase,
        closeTime,
        closeTime
      );
      const sessionId = sessionRes.lastInsertRowid;

      const orderRes = insertOrder.run(
        sessionId,
        fam.table,
        fam.name,
        fam.waiter,
        subtotal,
        timeBase,
        timeBase,
        closeTime
      );
      const orderId = orderRes.lastInsertRowid;

      fam.items.forEach(it => {
        insertOrderItem.run(
          orderId,
          sessionId,
          it[0],
          it[1],
          it[2],
          it[3],
          it[2] * it[3],
          0,
          'Customer'
        );
      });
    });
  });
}

function ensureTodayData() {
  const today = new Date().toISOString().split('T')[0];
  const waiters = db.prepare('SELECT id, name FROM staff WHERE role = "Waiter"').all();
  if (waiters.length === 0) return;

  const s1 = waiters[0]?.id; // Rahul
  const s2 = waiters[1]?.id; // Amit
  const s3 = waiters[2]?.id; // Suresh

  // Check if today's attendance exists
  const attCount = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE date = ?').get(today)?.count || 0;
  if (attCount === 0) {
    const insertAtt = db.prepare(`
      INSERT OR REPLACE INTO attendance (staff_id, date, status, marked_by)
      VALUES (?, ?, ?, 'Manager')
    `);
    if (s1) insertAtt.run(s1, today, 'PRESENT');
    if (s2) insertAtt.run(s2, today, 'PRESENT');
    if (s3) insertAtt.run(s3, today, 'ABSENT');
  }

  // Check if today's table assignments exist
  const assignCount = db.prepare('SELECT COUNT(*) as count FROM table_assignments WHERE date = ?').get(today)?.count || 0;
  if (assignCount === 0 && s1 && s2) {
    const insertAssign = db.prepare(`
      INSERT OR REPLACE INTO table_assignments (date, table_id, waiter_id)
      VALUES (?, ?, ?)
    `);
    for (let t = 1; t <= 6; t++) {
      insertAssign.run(today, t, s1);
    }
    for (let t = 7; t <= 12; t++) {
      insertAssign.run(today, t, s2);
    }
  }

  // Check if initial reservations exist
  const resCount = db.prepare('SELECT COUNT(*) as count FROM reservations').get()?.count || 0;
  if (resCount === 0) {
    const insertRes = db.prepare(`
      INSERT INTO reservations (booking_code, customer_name, customer_phone, customer_email, booking_date, booking_time, guests_count, seating_preference, special_requests, table_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertRes.run('KK-BK-8821', 'Aarav Malhotra', '+91 98234 56789', 'aarav.m@example.com', today, '07:30 PM', 4, 'Royal Heritage Booth', 'Anniversary celebration, window seating if possible', 5, 'CONFIRMED');
    insertRes.run('KK-BK-4102', 'Priya Deshmukh', '+91 97123 45678', 'priya.d@example.com', today, '08:30 PM', 2, 'Garden Terrace', 'Quiet corner table for dinner', 2, 'CONFIRMED');
    insertRes.run('KK-BK-7754', 'Vikramaditya Rao', '+91 99881 22334', 'vikram.rao@example.com', today, '01:30 PM', 6, 'VIP Private Lounge', 'Executive business lunch', 9, 'SEATED');
  }

  // Check if initial promotional offers exist
  const offerCount = db.prepare('SELECT COUNT(*) as count FROM offers').get()?.count || 0;
  if (offerCount === 0) {
    const insertOffer = db.prepare(`
      INSERT INTO offers (
        title, description, offer_type, discount_value, target_menu_item_id,
        min_order_amount, start_datetime, end_datetime, is_active, banner_tag, image_url, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'Kunal K.')
    `);

    // Offer 1: Active now (20% OFF on Royal Dum Chicken Biryani)
    const activeStart = new Date(Date.now() - 2 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const activeEnd = new Date(Date.now() + 5 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    insertOffer.run(
      '20% OFF on Royal Dum Biryani',
      'Enjoy 20% discount on our authentic Handi-cooked Royal Dum Chicken Biryani with royal spices.',
      'PERCENTAGE',
      20,
      15, // Royal Dum Chicken Biryani
      0,
      activeStart,
      activeEnd,
      '20% OFF',
      'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800&auto=format&fit=crop&q=80'
    );

    // Offer 2: Scheduled / Upcoming starting in 4 days ("Coming Soon" Pizza / Kebab Special)
    const upcomingStart = new Date(Date.now() + 4 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const upcomingEnd = new Date(Date.now() + 11 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    insertOffer.run(
      'Special Price ₹199 on Paneer Tikka Royale',
      'Coming Soon: Handcrafted cottage cheese skewers infused with royal Kashmiri spices at a special festive price.',
      'SPECIAL_PRICE',
      199,
      1, // Paneer Tikka Royale
      0,
      upcomingStart,
      upcomingEnd,
      'Coming Soon',
      'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=800&auto=format&fit=crop&q=80'
    );

    // Offer 3: Flat ₹100 OFF on Family Dinner
    const flatStart = new Date(Date.now() - 1 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const flatEnd = new Date(Date.now() + 8 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    insertOffer.run(
      'Flat ₹100 OFF on Family Orders above ₹800',
      'Celebrate dining together with an instant ₹100 deduction on all table orders exceeding ₹800.',
      'FLAT',
      100,
      null,
      800,
      flatStart,
      flatEnd,
      'Save ₹100',
      'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=800&auto=format&fit=crop&q=80'
    );
  }
}

