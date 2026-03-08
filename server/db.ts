import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

// Ensure storage directory exists
const storageDir = path.resolve(process.cwd(), 'storage');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const dbPath = path.join(storageDir, 'app.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    days INTEGER NOT NULL,
    price REAL NOT NULL,
    status TEXT DEFAULT 'inactive', -- active, inactive, expired
    device_id TEXT,
    activated_at DATETIME,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'BDT',
    active BOOLEAN DEFAULT 1,
    max_video_duration INTEGER DEFAULT 0, -- 0 means unlimited
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add max_video_duration column to existing tables if they don't have it
try {
  db.exec('ALTER TABLE packages ADD COLUMN max_video_duration INTEGER DEFAULT 0');
} catch (e) {
  // Column might already exist
}

try {
  db.exec('ALTER TABLE licenses ADD COLUMN max_video_duration INTEGER DEFAULT 0');
} catch (e) {
  // Column might already exist
}

// Insert default packages if none exist
const packageCount = db.prepare('SELECT COUNT(*) as count FROM packages').get() as { count: number };
if (packageCount.count === 0) {
  const insertPackage = db.prepare('INSERT INTO packages (name, duration_days, price) VALUES (?, ?, ?)');
  insertPackage.run('Monthly', 30, 500);
  insertPackage.run('Quarterly (3 Months)', 90, 1200);
  insertPackage.run('Yearly', 365, 4000);
  console.log('Default packages created');
}

// Insert or update default admin
const adminUsername = 'Younus691';
const adminPassword = '586983294153885';
const hashedPassword = bcrypt.hashSync(adminPassword, 10);

const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get(adminUsername);

if (existingAdmin) {
  // Update password if user exists
  const updateAdmin = db.prepare('UPDATE users SET password = ? WHERE username = ?');
  updateAdmin.run(hashedPassword, adminUsername);
  console.log('Admin password updated');
} else {
  // Insert new admin if not exists
  const insertAdmin = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
  insertAdmin.run(adminUsername, hashedPassword);
  console.log('Admin user created');
}

// Set default settings if not exists
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
insertSetting.run('license_system_enabled', 'true');

export default db;
