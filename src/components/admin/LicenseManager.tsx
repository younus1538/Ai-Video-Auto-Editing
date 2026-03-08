import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, XCircle, Search, RefreshCw, Clock, Video } from 'lucide-react';
import { motion } from 'framer-motion';

interface License {
  id: number;
  key: string;
  days: number;
  price: number;
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  device_id?: string;
  activated_at?: string;
  expires_at?: string;
  created_at: string;
  max_video_duration: number;
}

interface LicenseManagerProps {
  token: string;
  onLogout: () => void;
}

export const LicenseManager: React.FC<LicenseManagerProps> = ({ token, onLogout }) => {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateConfig, setGenerateConfig] = useState({ days: 7, price: 20, count: 1, max_video_duration: 0 });
  const [customPackage, setCustomPackage] = useState(false);

  const fetchLicenses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/licenses', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.status === 401) {
        onLogout();
        throw new Error("Unauthorized");
      }
      const data = await res.json();
      setLicenses(data);
    } catch (err) {
      console.error("Failed to fetch licenses", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenses();
  }, []);

  const handleGenerate = async () => {
    try {
      const res = await fetch('/api/licenses/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(generateConfig),
      });
      if (res.ok) {
        fetchLicenses();
        setShowGenerateModal(false);
      }
    } catch (err) {
      console.error("Failed to generate license", err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this license?')) return;
    try {
      await fetch(`/api/licenses/${id}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setLicenses(licenses.filter(l => l.id !== id));
    } catch (err) {
      console.error("Failed to delete license", err);
    }
  };

  const handleStatusChange = async (id: number, action: 'activate' | 'deactivate') => {
    try {
      await fetch(`/api/licenses/${id}/${action}`, { 
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchLicenses();
    } catch (err) {
      console.error(`Failed to ${action} license`, err);
    }
  };

  const handleUpdateMaxDuration = async (id: number, currentDuration: number) => {
    const duration = prompt("Enter max video duration in minutes (0 for unlimited):", currentDuration.toString());
    if (duration === null) return;
    try {
      await fetch(`/api/licenses/${id}/max_video_duration`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ max_video_duration: parseInt(duration) || 0 }),
      });
      fetchLicenses();
    } catch (err) {
      console.error("Failed to update max video duration", err);
    }
  };

  const handleExtend = async (id: number) => {
    const days = prompt("Enter days to extend:");
    if (!days) return;
    try {
      await fetch(`/api/licenses/${id}/extend`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ days: parseInt(days) }),
      });
      fetchLicenses();
    } catch (err) {
      console.error("Failed to extend license", err);
    }
  };

  const filteredLicenses = licenses.filter(l => {
    const matchesSearch = l.key.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (l.device_id && l.device_id.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || l.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
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
          Generate Key
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
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    {license.status === 'active' ? (
                      <button 
                        onClick={() => handleStatusChange(license.id, 'deactivate')}
                        title="Deactivate"
                        className="p-2 hover:bg-yellow-500/10 text-yellow-400 rounded-lg transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleStatusChange(license.id, 'activate')}
                        title="Activate"
                        className="p-2 hover:bg-green-500/10 text-green-400 rounded-lg transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => handleUpdateMaxDuration(license.id, license.max_video_duration)}
                      title="Update Max Video Duration"
                      className="p-2 hover:bg-purple-500/10 text-purple-400 rounded-lg transition-colors"
                    >
                      <Video className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleExtend(license.id)}
                      title="Extend"
                      className="p-2 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(license.id)}
                      title="Delete"
                      className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
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
