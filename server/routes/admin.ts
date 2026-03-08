import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.ts';
import { authenticateToken } from '../middleware/auth.ts';

const router = express.Router();
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
  res.json({ token });
});

// Dashboard Stats (Protected)
router.get('/stats', authenticateToken, (req, res) => {
  // Count total licenses as "Total Users" since this is what the user expects
  const totalLicenses = db.prepare('SELECT COUNT(*) as count FROM licenses').get().count;
  const activeLicenses = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'active'").get().count;
  const expiredLicenses = db.prepare("SELECT COUNT(*) as count FROM licenses WHERE status = 'expired'").get().count;
  const totalPackages = db.prepare('SELECT COUNT(*) as count FROM packages').get().count;
  const revenue = db.prepare("SELECT SUM(price) as total FROM licenses WHERE status = 'active' OR status = 'expired'").get().total || 0;

  res.json({
    totalLicenses,
    activeLicenses,
    expiredLicenses,
    totalPackages,
    revenue
  });
});

// Settings (Protected)
router.get('/settings', authenticateToken, (req, res) => {
  const settings = db.prepare('SELECT * FROM settings').all();
  const settingsObj = settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  res.json(settingsObj);
});

router.post('/settings', authenticateToken, (req, res) => {
  const { key, value } = req.body;

  try {
    if (key === 'license_system_enabled') {
      if (value === 'false') {
        // System is being disabled. Record the timestamp.
        const now = new Date().toISOString();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_system_disabled_at', ?)").run(now);
      } else {
        // System is being enabled. Check if we have a disabled_at timestamp.
        const disabledAtRow = db.prepare("SELECT value FROM settings WHERE key = 'license_system_disabled_at'").get() as { value: string } | undefined;
        
        if (disabledAtRow) {
          const disabledAt = new Date(disabledAtRow.value);
          const now = new Date();
          const diffMs = now.getTime() - disabledAt.getTime();
          
          if (diffMs > 0) {
            const diffSeconds = Math.floor(diffMs / 1000);
            console.log(`Extending all active licenses by ${diffSeconds} seconds`);
            
            // SQLite datetime modifier
            // We assume expires_at is stored as ISO string. SQLite's datetime function can handle it.
            // However, to be safe with different formats, let's just update it.
            // Actually, let's use a safer approach: fetch, calc in JS, update.
            // But for bulk update, SQL is better.
            // SQLite datetime() returns 'YYYY-MM-DD HH:MM:SS'.
            // Our app uses ISO strings 'YYYY-MM-DDTHH:MM:SS.sssZ'.
            // If we update with datetime(), we lose the T and Z.
            // Let's try to keep the format consistent.
            
            // Alternative: Iterate and update (slower but safer for format)
            const activeLicenses = db.prepare("SELECT id, expires_at FROM licenses WHERE status = 'active'").all() as { id: string, expires_at: string }[];
            
            const updateStmt = db.prepare("UPDATE licenses SET expires_at = ? WHERE id = ?");
            
            db.transaction(() => {
              for (const license of activeLicenses) {
                if (license.expires_at) {
                  const newExpiry = new Date(new Date(license.expires_at).getTime() + diffMs).toISOString();
                  updateStmt.run(newExpiry, license.id);
                }
              }
            })();
          }
          
          // Clear the timestamp
          db.prepare("DELETE FROM settings WHERE key = 'license_system_disabled_at'").run();
        }
      }
    }

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// License Notification Settings
router.get('/license-notification', (req, res) => {
  const message = db.prepare("SELECT value FROM settings WHERE key = 'license_notification_message'").get() as { value: string } | undefined;
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'license_notification_enabled'").get() as { value: string } | undefined;
  res.json({ 
    message: message?.value || '',
    enabled: enabled ? enabled.value === 'true' : true // Default to true
  });
});

router.post('/license-notification', authenticateToken, (req, res) => {
  const { message, enabled } = req.body;
  
  if (message !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_notification_message', ?)").run(message);
  }
  
  if (enabled !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_notification_enabled', ?)").run(enabled.toString());
  }
  
  res.json({ success: true });
});

export default router;
