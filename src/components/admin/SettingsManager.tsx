import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ToggleLeft, ToggleRight, Save, ShieldAlert } from 'lucide-react';

interface SettingsManagerProps {
  token: string;
  onLogout: () => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({ token, onLogout }) => {
  const [settings, setSettings] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [savingNotification, setSavingNotification] = useState(false);

  useEffect(() => {
    fetch('/api/admin/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401) {
          onLogout();
          throw new Error("Unauthorized");
        }
        return res.json();
      })
      .then(data => {
        setSettings(data);
        setLoading(false);
      })
      .catch(err => console.error("Failed to fetch settings", err));

    fetch('/api/admin/license-notification')
      .then(res => res.json())
      .then(data => {
        setNotificationMessage(data.message);
        setNotificationEnabled(data.enabled);
      })
      .catch(err => console.error("Failed to fetch notification", err));
  }, []);

  const handleSaveNotification = async () => {
    setSavingNotification(true);
    try {
      await fetch('/api/admin/license-notification', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: notificationMessage }),
      });
      alert('Notification saved successfully!');
    } catch (err) {
      console.error("Failed to save notification", err);
      alert('Failed to save notification');
    } finally {
      setSavingNotification(false);
    }
  };

  const handleToggleNotification = async () => {
    const newValue = !notificationEnabled;
    setNotificationEnabled(newValue);
    try {
      await fetch('/api/admin/license-notification', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: newValue }),
      });
    } catch (err) {
      console.error("Failed to toggle notification", err);
      setNotificationEnabled(!newValue); // Revert
    }
  };

  const handleToggle = async (key: string) => {
    const newValue = settings[key] === 'true' ? 'false' : 'true';
    setSettings({ ...settings, [key]: newValue });
    
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ key, value: newValue }),
      });
    } catch (err) {
      console.error("Failed to save setting", err);
      // Revert on error
      setSettings({ ...settings, [key]: settings[key] });
    }
  };

  if (loading) return <div className="text-white">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-indigo-400" />
          System Controls
        </h3>
        
        <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl border border-zinc-800">
          <div>
            <h4 className="text-white font-medium">License System</h4>
            <p className="text-sm text-zinc-400 mt-1">
              {settings['license_system_enabled'] === 'true' 
                ? 'System is ACTIVE. Users require a valid license key to use the app.' 
                : 'System is DISABLED. The app is free for all users.'}
            </p>
          </div>
          <button
            onClick={() => handleToggle('license_system_enabled')}
            className={`transition-colors ${
              settings['license_system_enabled'] === 'true' ? 'text-indigo-500' : 'text-zinc-600'
            }`}
          >
            {settings['license_system_enabled'] === 'true' ? (
              <ToggleRight className="w-10 h-10" />
            ) : (
              <ToggleLeft className="w-10 h-10" />
            )}
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white">License Deactivation Notification</h3>
          <button
            onClick={handleToggleNotification}
            className={`transition-colors ${
              notificationEnabled ? 'text-indigo-500' : 'text-zinc-600'
            }`}
          >
            {notificationEnabled ? (
              <ToggleRight className="w-10 h-10" />
            ) : (
              <ToggleLeft className="w-10 h-10" />
            )}
          </button>
        </div>
        <div className={`space-y-4 transition-opacity ${notificationEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <div>
            <label className="text-sm font-medium text-zinc-400 block mb-2">Notification Message (Markdown supported)</label>
            <textarea 
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg p-3 text-white"
              rows={4}
            />
            <button 
              onClick={handleSaveNotification}
              disabled={savingNotification}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {savingNotification ? 'Saving...' : 'Save Notification'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-6">Support Contact</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-400 block mb-2">Contact Number</label>
            <input 
              type="text" 
              value="01717775962" 
              readOnly 
              className="w-full bg-black/50 border border-zinc-800 rounded-lg p-3 text-zinc-500 cursor-not-allowed"
            />
            <p className="text-xs text-zinc-600 mt-2">
              This number is hardcoded in the application. To change it, please contact the developer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsManager;
