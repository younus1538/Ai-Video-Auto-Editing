import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Lock, Phone } from 'lucide-react';

interface LicenseActivationProps {
  onActivated: () => void;
}

const LicenseActivation: React.FC<LicenseActivationProps> = ({ onActivated }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');

  const [packages, setPackages] = useState<any[]>([]);

  useEffect(() => {
    // Pre-fill key if available
    const storedKey = localStorage.getItem('license_key');
    if (storedKey) setKey(storedKey);

    // Generate or retrieve a persistent device ID
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('device_id', id);
    }
    setDeviceId(id);

    // Fetch packages
    fetch('/api/licenses/packages')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPackages(data);
        }
      })
      .catch(err => console.error("Failed to fetch packages:", err));
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/licenses/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, deviceId, activate: true }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse verify response:", text);
        throw new Error(`Server returned invalid response: ${text.substring(0, 50)}...`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      if (data.success) {
        localStorage.setItem('license_key', key);
        localStorage.setItem('license_expiry', data.expiresAt);
        if (data.maxVideoDuration !== undefined) {
          localStorage.setItem('max_video_duration', data.maxVideoDuration.toString());
        }
        onActivated();
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 z-10" />
        
        <div className="overflow-y-auto p-6 sm:p-8 custom-scrollbar">
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
              <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-indigo-400" />
            </div>
          </div>
          
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center mb-2">Activation Required</h2>
          <p className="text-zinc-400 text-center mb-6 sm:mb-8 text-sm sm:text-base">Please enter your license key to continue using the application.</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-6 text-sm text-center flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">License Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full bg-black/50 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-mono text-center tracking-widest uppercase text-sm sm:text-base"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
            >
              {loading ? 'Verifying...' : 'Activate License'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-800">
            <h3 className="text-zinc-400 text-sm font-medium text-center mb-4">Available Packages</h3>
            <div className="space-y-2 mb-6">
              {packages.map((pkg) => (
                <div key={pkg.id} className="flex flex-col bg-zinc-800/30 p-3 rounded-lg border border-zinc-700/30 hover:border-indigo-500/30 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-zinc-300 text-sm font-medium">{pkg.name}</span>
                    <span className="text-indigo-400 font-mono font-bold">
                      {pkg.price.toLocaleString()} {pkg.currency}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-zinc-500">
                    <span>{pkg.duration_days} Days</span>
                    <span>{pkg.max_video_duration ? `Max ${pkg.max_video_duration} Mins/Video` : 'Unlimited Video Duration'}</span>
                  </div>
                </div>
              ))}
              {packages.length === 0 && (
                 <div className="text-center text-zinc-500 text-sm py-2">Loading packages...</div>
              )}
            </div>

            <div className="text-center">
              <p className="text-zinc-500 text-xs mb-2 uppercase tracking-wider font-semibold">To Purchase Contact</p>
              <a href="tel:01717775962" className="flex items-center justify-center gap-2 text-indigo-400 font-bold bg-indigo-500/10 py-3 rounded-xl border border-indigo-500/20 hover:bg-indigo-500/20 transition-all group">
                <Phone className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="tracking-wide">01717775962</span>
              </a>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LicenseActivation;
