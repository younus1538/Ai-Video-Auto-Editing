import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const storageDir = path.resolve(process.cwd(), 'storage');
if (!fs.existsSync(storageDir)) {
  fs.mkdirSync(storageDir, { recursive: true });
}

const dbPath = path.join(storageDir, 'app.db');
console.log(`Checking DB at: ${dbPath}`);

try {
  const db = new Database(dbPath);
  console.log('Database connected successfully.');
  
  const row = db.prepare('SELECT 1 as val').get() as { val: number };
  console.log('Query result:', row);
  
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables);
  
  const settings = db.prepare("SELECT * FROM settings").all();
  console.log('Settings:', settings);

} catch (error) {
  console.error('Database check failed:', error);
  process.exit(1);
}
