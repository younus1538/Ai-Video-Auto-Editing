import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.ts';
import { authenticateToken } from '../middleware/auth.ts';

const router = express.Router();

// Public: Check if license system is enabled
router.get('/status', (req, res) => {
  try {
    console.log('Checking license system status...');
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('license_system_enabled') as { value: string } | undefined;
    console.log('License system status:', setting);
    
    // Default to TRUE (enabled) if setting is missing, unless explicitly set to 'false'
    const isEnabled = setting ? setting.value !== 'false' : true;
    
    res.json({ enabled: isEnabled });
  } catch (error: any) {
    console.error('Error checking license system status:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Public: Get available packages
router.get('/packages', (req, res) => {
  try {
    console.log('Fetching available packages...');
    const packages = db.prepare('SELECT * FROM packages WHERE active = 1 ORDER BY price ASC').all();
    console.log(`Found ${packages.length} active packages.`);
    res.json(packages);
  } catch (error: any) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin: Get all packages (including inactive)
router.get('/admin/packages', authenticateToken, (req, res) => {
  try {
    const packages = db.prepare('SELECT * FROM packages ORDER BY created_at DESC').all();
    res.json(packages);
  } catch (error: any) {
    console.error('Error fetching admin packages:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin: Create package
router.post('/admin/packages', authenticateToken, (req, res) => {
  try {
    const { name, duration_days, price, currency = 'BDT', max_video_duration = 0 } = req.body;
    db.prepare('INSERT INTO packages (name, duration_days, price, currency, max_video_duration) VALUES (?, ?, ?, ?, ?)').run(name, duration_days, price, currency, max_video_duration);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error creating package:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin: Update package
router.put('/admin/packages/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { name, duration_days, price, currency, active, max_video_duration = 0 } = req.body;
    db.prepare('UPDATE packages SET name = ?, duration_days = ?, price = ?, currency = ?, active = ?, max_video_duration = ? WHERE id = ?').run(name, duration_days, price, currency, active ? 1 : 0, max_video_duration, id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating package:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin: Delete package
router.delete('/admin/packages/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM packages WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting package:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Generate License (Admin)
router.post('/generate', authenticateToken, (req, res) => {
  try {
    const { days, price, count = 1, max_video_duration = 0 } = req.body;
    const keys = [];

    for (let i = 0; i < count; i++) {
      const key = uuidv4();
      db.prepare('INSERT INTO licenses (key, days, price, max_video_duration) VALUES (?, ?, ?, ?)').run(key, days, price, max_video_duration);
      keys.push(key);
    }

    res.json({ keys });
  } catch (error: any) {
    console.error('Error generating license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// List Licenses (Admin)
router.get('/', authenticateToken, (req, res) => {
  try {
    const licenses = db.prepare('SELECT * FROM licenses ORDER BY created_at DESC').all();
    res.json(licenses);
  } catch (error: any) {
    console.error('Error listing licenses:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete License (Admin)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM licenses WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Activate License (Admin)
router.post('/:id/activate', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE licenses SET status = 'active', activated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error activating license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Deactivate License (Admin)
router.post('/:id/deactivate', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    db.prepare("UPDATE licenses SET status = 'suspended', activated_at = NULL WHERE id = ?").run(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deactivating license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Extend License (Admin)
router.post('/:id/extend', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    
    const license = db.prepare('SELECT * FROM licenses WHERE id = ?').get(id) as any;
    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (license.status === 'active' || license.status === 'expired') {
      let newExpiresAt;
      if (license.status === 'expired' && (!license.expires_at || new Date(license.expires_at) < new Date())) {
         const d = new Date();
         d.setDate(d.getDate() + days);
         newExpiresAt = d.toISOString();
      } else {
         const d = new Date(license.expires_at);
         d.setDate(d.getDate() + days);
         newExpiresAt = d.toISOString();
      }
      
      db.prepare(`
        UPDATE licenses 
        SET days = days + ?, 
            expires_at = ?,
            status = CASE WHEN status = 'expired' THEN 'active' ELSE status END
        WHERE id = ?
      `).run(days, newExpiresAt, id);
    } else {
      db.prepare('UPDATE licenses SET days = days + ? WHERE id = ?').run(days, id);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error extending license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Update License Max Video Duration (Admin)
router.put('/:id/max_video_duration', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { max_video_duration } = req.body;
    db.prepare('UPDATE licenses SET max_video_duration = ? WHERE id = ?').run(max_video_duration, id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating max video duration:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Release License (App - Public)
router.post('/release', (req, res) => {
  try {
    const { key, deviceId } = req.body;
    console.log('Releasing license:', key, deviceId);

    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key) as any;

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (license.device_id !== deviceId) {
      return res.status(403).json({ error: 'Device ID mismatch' });
    }

    db.prepare("UPDATE licenses SET device_id = NULL WHERE id = ?").run(license.id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error releasing license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Verify License (App - Public)
router.post('/verify', (req, res) => {
  try {
    const { key, deviceId, activate } = req.body;
    console.log('Verifying license:', key, deviceId, activate ? '(Activation Mode)' : '(Check Mode)');
    
    // Check if system is enabled
    const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('license_system_enabled') as { value: string } | undefined;
    
    // Default to TRUE (enabled) if setting is missing, unless explicitly set to 'false'
    const isEnabled = setting ? setting.value !== 'false' : true;
    
    if (!isEnabled) {
      return res.json({ success: true, message: 'System disabled' });
    }

    const license = db.prepare('SELECT * FROM licenses WHERE key = ?').get(key);

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (license.status === 'suspended') {
      return res.json({ success: false, error: 'License has been suspended by admin' });
    }

    if (license.status === 'expired') {
      return res.json({ success: false, error: 'License expired' });
    }

    if (license.status === 'active') {
      if (license.device_id && license.device_id !== deviceId) {
        if (activate) {
           // Force activation: Steal the session from the old device
           console.log(`License ${key} stolen from ${license.device_id} to ${deviceId}`);
           db.prepare("UPDATE licenses SET device_id = ? WHERE id = ?").run(deviceId, license.id);
        } else {
           // Regular check: Fail if device mismatch
           return res.json({ success: false, error: 'License active on another device' });
        }
      }
      
      if (!license.device_id) {
         // Re-bind to new device
         db.prepare("UPDATE licenses SET device_id = ? WHERE id = ?").run(deviceId, license.id);
      }
    }

    if (license.status === 'inactive') {
      // Activate it
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + license.days);
      db.prepare("UPDATE licenses SET status = 'active', device_id = ?, activated_at = CURRENT_TIMESTAMP, expires_at = ? WHERE id = ?").run(deviceId, expiresAt.toISOString(), license.id);
      return res.json({ success: true, expiresAt: expiresAt.toISOString(), maxVideoDuration: license.max_video_duration });
    }

    // Already active and matching device
    // Check if expired based on date
    if (license.expires_at && new Date(license.expires_at) < new Date()) {
       db.prepare("UPDATE licenses SET status = 'expired' WHERE id = ?").run(license.id);
       return res.json({ success: false, error: 'License expired' });
    }

    res.json({ success: true, expiresAt: license.expires_at, maxVideoDuration: license.max_video_duration });
  } catch (error: any) {
    console.error('Error verifying license:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

export default router;
