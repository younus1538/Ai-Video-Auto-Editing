import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ToggleLeft, ToggleRight, Save, ShieldAlert, Settings as SettingsIcon } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, doc, setDoc, onSnapshot, query } from 'firebase/firestore';

interface SettingsManagerProps {
  token: string;
  onLogout: () => void;
}

const SettingsManager: React.FC<SettingsManagerProps> = ({ token, onLogout }) => {
  const [settings, setSettings] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    // Listen to settings in real-time from Firestore
    const q = query(collection(db, 'settings'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newSettings: { [key: string]: string } = {};
      snapshot.forEach((doc) => {
        newSettings[doc.id] = doc.data().value;
      });
      setSettings(newSettings);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'settings');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSaveSetting = async (key: string, value: string) => {
    setSaving({ ...saving, [key]: true });
    try {
      await setDoc(doc(db, 'settings', key), {
        key,
        value,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `settings/${key}`);
    } finally {
      setSaving({ ...saving, [key]: false });
    }
  };

  const handleToggle = async (key: string) => {
    const currentValue = settings[key] === 'true';
    const newValue = !currentValue;
    await handleSaveSetting(key, newValue ? 'true' : 'false');
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-indigo-400" />
          App Configuration (Firebase Controlled)
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-400 block mb-2">App Name</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={settings['app_name'] || ''} 
                onChange={(e) => setSettings({ ...settings, app_name: e.target.value })}
                className="flex-1 bg-black/50 border border-zinc-800 rounded-lg p-3 text-white"
              />
              <button 
                onClick={() => handleSaveSetting('app_name', settings['app_name'])}
                disabled={saving['app_name']}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving['app_name'] ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 block mb-2">Gemini API Key (Global)</label>
            <div className="flex gap-2">
              <input 
                type="password" 
                value={settings['gemini_api_key'] || ''} 
                onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                placeholder="Enter global API key"
                className="flex-1 bg-black/50 border border-zinc-800 rounded-lg p-3 text-white"
              />
              <button 
                onClick={() => handleSaveSetting('gemini_api_key', settings['gemini_api_key'])}
                disabled={saving['gemini_api_key']}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving['gemini_api_key'] ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-1">If set, this key will be used by all users who haven't provided their own key.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 block mb-2">Support Contact Number</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={settings['support_number'] || ''} 
                onChange={(e) => setSettings({ ...settings, support_number: e.target.value })}
                className="flex-1 bg-black/50 border border-zinc-800 rounded-lg p-3 text-white"
              />
              <button 
                onClick={() => handleSaveSetting('support_number', settings['support_number'])}
                disabled={saving['support_number']}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving['support_number'] ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

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
        <h3 className="text-xl font-bold text-white mb-6">License Deactivation Notification</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl border border-zinc-800">
            <h4 className="text-white font-medium">Enable Notification</h4>
            <button
              onClick={() => handleToggle('notification_enabled')}
              className={`transition-colors ${settings['notification_enabled'] === 'true' ? 'text-indigo-500' : 'text-zinc-600'}`}
            >
              {settings['notification_enabled'] === 'true' ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
            </button>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-400 block mb-2">Notification Message (Markdown supported)</label>
            <textarea 
              value={settings['notification_message'] || ''}
              onChange={(e) => setSettings({ ...settings, notification_message: e.target.value })}
              className="w-full bg-black/50 border border-zinc-800 rounded-lg p-3 text-white"
              rows={4}
            />
            <button 
              onClick={() => handleSaveSetting('notification_message', settings['notification_message'])}
              disabled={saving['notification_message']}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving['notification_message'] ? 'Saving...' : 'Save Notification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsManager;
