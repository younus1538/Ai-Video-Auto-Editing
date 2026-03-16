import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, XCircle, Search, Clock, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface License {
  id: string;
  key: string;
  days: number;
  price: number;
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  device_id?: string;
  activated_at?: string;
  expires_at?: string;
  created_at: any;
  max_video_duration: number;
}

interface LicenseManagerProps {
  token?: string; // Kept for compatibility but not used for Firestore
  onLogout: () => void;
}

const LicenseManager: React.FC<LicenseManagerProps> = ({ onLogout }) => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateConfig, setGenerateConfig] = useState({ days: 7, price: 20, count: 1, max_video_duration: 0 });
  const [customPackage, setCustomPackage] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'licenses'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const licenseList: License[] = [];
      snapshot.forEach((doc) => {
        licenseList.push({ id: doc.id, ...doc.data() } as License);
      });
      // Sort by created_at descending
      licenseList.sort((a, b) => {
        const dateA = a.created_at?.seconds || 0;
        const dateB = b.created_at?.seconds || 0;
        return dateB - dateA;
      });
      setLicenses(licenseList);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'licenses');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const generateKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) key += '-';
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleGenerate = async () => {
    try {
      for (let i = 0; i < generateConfig.count; i++) {
        const key = generateKey();
        await addDoc(collection(db, 'licenses'), {
          key,
          days: generateConfig.days,
          price: generateConfig.price,
          status: 'inactive',
          max_video_duration: generateConfig.max_video_duration,
          created_at: serverTimestamp()
        });
      }
      setShowGenerateModal(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'licenses');
    }
  };

  const [error, setError] = useState<string | null>(null);

  const handleStatusChange = async (id: string, action: 'activate' | 'deactivate') => {
    try {
      await updateDoc(doc(db, 'licenses', id), {
        status: action === 'activate' ? 'active' : 'inactive'
      });
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
      handleFirestoreError(err, OperationType.UPDATE, `licenses/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this license?')) return;
    try {
      await deleteDoc(doc(db, 'licenses', id));
    } catch (err: any) {
      let message = err.message || 'Failed to delete license';
      try {
        const parsed = JSON.parse(message);
        message = parsed.error || message;
      } catch (e) {}
      setError(message);
      handleFirestoreError(err, OperationType.DELETE, `licenses/${id}`);
    }
  };

  const handleUpdateMaxDuration = async (id: string, currentDuration: number) => {
    const duration = window.prompt("Enter max video duration in minutes (0 for unlimited):", currentDuration.toString());
    if (duration === null) return;
    try {
      await updateDoc(doc(db, 'licenses', id), {
        max_video_duration: parseInt(duration) || 0
      });
    } catch (err: any) {
      let message = err.message || 'Failed to update duration';
      try {
        const parsed = JSON.parse(message);
        message = parsed.error || message;
      } catch (e) {}
      setError(message);
      handleFirestoreError(err, OperationType.UPDATE, `licenses/${id}`);
    }
  };

  const handleExtend = async (id: string) => {
    const daysStr = window.prompt("Enter days to extend:");
    if (!daysStr) return;
    const days = parseInt(daysStr);
    if (isNaN(days)) return;

    try {
      const license = licenses.find(l => l.id === id);
      if (!license) return;

      const updates: any = {
        days: (license.days || 0) + days
      };

      if (license.expires_at) {
        const currentExpire = new Date(license.expires_at);
        currentExpire.setDate(currentExpire.getDate() + days);
        updates.expires_at = currentExpire.toISOString();
      }

      await updateDoc(doc(db, 'licenses', id), updates);
    } catch (err: any) {
      let message = err.message || 'Failed to extend license';
      try {
        const parsed = JSON.parse(message);
        message = parsed.error || message;
      } catch (e) {}
      setError(message);
      handleFirestoreError(err, OperationType.UPDATE, `licenses/${id}`);
    }
  };

  const filteredLicenses = licenses.filter(l => {
    const matchesSearch = l.key.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (l.device_id && l.device_id.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || l.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-4 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">X</button>
        </div>
      )}

      <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-800">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search keys..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-black/50 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none w-64"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-black/50 border border-zinc-800 rounded-lg py-2 px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <button
          onClick={() => setShowGenerateModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
        >
          <Plus className="w-4 h-4" />
          Generate Key (Firebase)
        </button>
      </div>

      {showGenerateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-900 p-6 rounded-2xl w-full max-w-md border border-zinc-800"
          >
            <h3 className="text-xl font-bold text-white mb-4">Generate License Key</h3>
            
            <div className="space-y-4">
              {!customPackage ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { days: 7, price: 20 },
                    { days: 15, price: 35 },
                    { days: 30, price: 60 }
                  ].map((pkg) => (
                    <button
                      key={pkg.days}
                      onClick={() => setGenerateConfig({ ...generateConfig, days: pkg.days, price: pkg.price })}
                      className={`p-3 rounded-xl border ${
                        generateConfig.days === pkg.days 
                          ? 'bg-indigo-600 border-indigo-500 text-white' 
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      <div className="font-bold">{pkg.days} Days</div>
                      <div className="text-xs opacity-70">{pkg.price} BDT</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-zinc-400">Days</label>
                    <input 
                      type="number" 
                      value={generateConfig.days}
                      onChange={(e) => setGenerateConfig({ ...generateConfig, days: parseInt(e.target.value) })}
                      className="w-full bg-black/50 border border-zinc-800 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400">Price (BDT)</label>
                    <input 
                      type="number" 
                      value={generateConfig.price}
                      onChange={(e) => setGenerateConfig({ ...generateConfig, price: parseInt(e.target.value) })}
                      className="w-full bg-black/50 border border-zinc-800 rounded-lg p-2 text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm text-zinc-400">Max Video Duration (Minutes)</label>
                <input 
                  type="number" 
                  value={generateConfig.max_video_duration}
                  onChange={(e) => setGenerateConfig({ ...generateConfig, max_video_duration: parseInt(e.target.value) || 0 })}
                  className="w-full bg-black/50 border border-zinc-800 rounded-lg p-2 text-white"
                  placeholder="0 for unlimited"
                />
                <p className="text-xs text-zinc-500 mt-1">0 means unlimited duration</p>
              </div>

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={customPackage} 
                  onChange={(e) => setCustomPackage(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-indigo-600"
                />
                <label className="text-sm text-zinc-400">Custom Package</label>
              </div>

              <div>
                <label className="text-sm text-zinc-400">Quantity</label>
                <input 
                  type="number" 
                  min="1"
                  max="50"
                  value={generateConfig.count}
                  onChange={(e) => setGenerateConfig({ ...generateConfig, count: parseInt(e.target.value) })}
                  className="w-full bg-black/50 border border-zinc-800 rounded-lg p-2 text-white"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button 
                  onClick={() => setShowGenerateModal(false)}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleGenerate}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg"
                >
                  Generate
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-400 min-w-[800px]">
            <thead className="bg-zinc-950 text-zinc-200 uppercase font-medium">
              <tr>
                <th className="px-6 py-4">Key</th>
                <th className="px-6 py-4">Package</th>
                <th className="px-6 py-4">Max Video</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Device ID</th>
                <th className="px-6 py-4">Expires</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredLicenses.map((license) => (
                <tr key={license.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-white select-all">{license.key}</td>
                  <td className="px-6 py-4">
                    <span className="bg-zinc-800 px-2 py-1 rounded text-xs text-white border border-zinc-700">
                      {license.days} Days
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">{license.price} BDT</span>
                  </td>
                  <td className="px-6 py-4 text-zinc-300 text-sm">
                    {license.max_video_duration ? `${license.max_video_duration} mins` : 'Unlimited'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                      license.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      license.status === 'expired' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      license.status === 'suspended' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                      'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}>
                      {license.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{license.device_id || '-'}</td>
                  <td className="px-6 py-4 text-xs">
                    {license.expires_at ? new Date(license.expires_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1 sm:gap-2">
                      {license.status === 'active' ? (
                        <button 
                          onClick={() => handleStatusChange(license.id, 'deactivate')}
                          title="Deactivate"
                          className="p-2 sm:p-2.5 hover:bg-yellow-500/10 text-yellow-500 rounded-lg transition-colors"
                        >
                          <XCircle className="w-5 h-5 sm:w-4 sm:h-4" />
                        </button>
                      ) : (
                        <button 
                          onClick={() => handleStatusChange(license.id, 'activate')}
                          title="Activate"
                          className="p-2 sm:p-2.5 hover:bg-green-500/10 text-green-500 rounded-lg transition-colors"
                        >
                          <CheckCircle className="w-5 h-5 sm:w-4 sm:h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleUpdateMaxDuration(license.id, license.max_video_duration)}
                        title="Update Max Video Duration"
                        className="p-2 sm:p-2.5 hover:bg-purple-500/10 text-purple-500 rounded-lg transition-colors"
                      >
                        <Video className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>
                      <button 
                        onClick={() => handleExtend(license.id)}
                        title="Extend"
                        className="p-2 sm:p-2.5 hover:bg-blue-500/10 text-blue-500 rounded-lg transition-colors"
                      >
                        <Clock className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(license.id)}
                        title="Delete"
                        className="p-2 sm:p-2.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLicenses.length === 0 && (
          <div className="p-8 text-center text-zinc-500">No licenses found matching your criteria.</div>
        )}
      </div>
    </div>
  );
};

export default LicenseManager;
