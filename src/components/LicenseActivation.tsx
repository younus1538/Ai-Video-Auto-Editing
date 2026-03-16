import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Lock, Phone, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, updateDoc, doc, onSnapshot } from 'firebase/firestore';

interface LicenseActivationProps {
  onActivated: () => void;
}

const LicenseActivation: React.FC<LicenseActivationProps> = ({ onActivated }) => {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [showTransferConfirm, setShowTransferConfirm] = useState<{id: string, key: string, data: any} | null>(null);

  const [packages, setPackages] = useState<any[]>([]);
  const [publicSettings, setPublicSettings] = useState({
    app_name: 'AI Video Creator',
    support_number: '01717775962'
  });

  useEffect(() => {
    // Generate or retrieve a persistent device ID
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('device_id', id);
    }
    setDeviceId(id);

    // Real-time settings from Firestore
    const settingsUnsubscribe = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const newSettings: any = { ...publicSettings };
      snapshot.forEach((doc) => {
        newSettings[doc.id] = doc.data().value;
      });
      setPublicSettings(newSettings);
    });

    // Real-time packages from Firestore
    const packagesQ = query(collection(db, 'packages'), where('active', '==', true));
    const packagesUnsubscribe = onSnapshot(packagesQ, (snapshot) => {
      const pkgList: any[] = [];
      snapshot.forEach((doc) => {
        pkgList.push({ id: doc.id, ...doc.data() });
      });
      setPackages(pkgList);
    });

    return () => {
      settingsUnsubscribe();
      packagesUnsubscribe();
    };
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const q = query(collection(db, 'licenses'), where('key', '==', key.trim().toUpperCase()), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('Invalid license key');
      }

      const licenseDoc = querySnapshot.docs[0];
      const licenseData = licenseDoc.data();

      if (licenseData.status === 'active') {
        // If already active on THIS device, just log in
        if (licenseData.device_id === deviceId) {
          localStorage.setItem('license_key', key.trim().toUpperCase());
          localStorage.setItem('license_expiry', licenseData.expires_at);
          if (licenseData.max_video_duration !== undefined) {
            localStorage.setItem('max_video_duration', licenseData.max_video_duration.toString());
          }
          onActivated();
          return;
        } else {
          // If active on ANOTHER device, ask for confirmation to transfer
          setShowTransferConfirm({ id: licenseDoc.id, key: key.trim().toUpperCase(), data: licenseData });
          setLoading(false);
          return;
        }
      }

      if (licenseData.status === 'expired') {
        throw new Error('This license has expired');
      }

      if (licenseData.status === 'suspended') {
        throw new Error('This license has been suspended');
      }

      // Activate license
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (licenseData.days * 24 * 60 * 60 * 1000));
      
      await updateDoc(doc(db, 'licenses', licenseDoc.id), {
        status: 'active',
        device_id: deviceId,
        activated_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      });

      localStorage.setItem('license_key', key.trim().toUpperCase());
      localStorage.setItem('license_expiry', expiresAt.toISOString());
      if (licenseData.max_video_duration !== undefined) {
        localStorage.setItem('max_video_duration', licenseData.max_video_duration.toString());
      }
      onActivated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const confirmTransfer = async () => {
    if (!showTransferConfirm) return;
    setLoading(true);
    setError('');

    try {
      await updateDoc(doc(db, 'licenses', showTransferConfirm.id), {
        device_id: deviceId,
        last_transferred_at: new Date().toISOString()
      });
      
      localStorage.setItem('license_key', showTransferConfirm.key);
      localStorage.setItem('license_expiry', showTransferConfirm.data.expires_at);
      if (showTransferConfirm.data.max_video_duration !== undefined) {
        localStorage.setItem('max_video_duration', showTransferConfirm.data.max_video_duration.toString());
      }
      onActivated();
    } catch (err: any) {
      setError('ট্রান্সফার করতে সমস্যা হয়েছে: ' + err.message);
    } finally {
      setLoading(false);
      setShowTransferConfirm(null);
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
              <a href={`tel:${publicSettings.support_number}`} className="flex items-center justify-center gap-2 text-indigo-400 font-bold bg-indigo-500/10 py-3 rounded-xl border border-indigo-500/20 hover:bg-indigo-500/20 transition-all group">
                <Phone className="w-4 h-4 group-hover:scale-110 transition-transform" />
                <span className="tracking-wide">{publicSettings.support_number}</span>
              </a>
            </div>

            <div className="mt-6 pt-4 border-t border-zinc-800/50 flex justify-center">
              <Link 
                to="/admin" 
                className="text-xs text-zinc-500 hover:text-indigo-400 transition-colors flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-white/5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                এডমিন লগইন
              </Link>
            </div>
          </div>
        </div>
      </motion.div>
      
      {showTransferConfirm && (
        <div className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl"
          >
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center border border-orange-500/20">
                <ShieldCheck className="w-6 h-6 text-orange-400" />
              </div>
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">লাইসেন্স ট্রান্সফার করুন</h3>
            <p className="text-zinc-400 text-center text-sm mb-6">
              এই লাইসেন্সটি অন্য একটি ডিভাইসে সক্রিয় আছে। আপনি কি এটি এই ডিভাইসে ট্রান্সফার করতে চান? 
              <br />
              <span className="text-orange-400 font-medium">(আগের ডিভাইস থেকে এটি ডিঅ্যাক্টিভেট হয়ে যাবে)</span>
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowTransferConfirm(null)}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-all"
              >
                বাতিল
              </button>
              <button 
                onClick={confirmTransfer}
                disabled={loading}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
              >
                {loading ? 'অপেক্ষা করুন...' : 'হ্যাঁ, ট্রান্সফার করুন'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default LicenseActivation;
