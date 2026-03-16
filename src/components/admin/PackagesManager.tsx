import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Package as PackageIcon, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query } from 'firebase/firestore';

interface Package {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  currency: string;
  active: boolean;
  max_video_duration: number;
}

export const PackagesManager: React.FC = () => {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    duration_days: 30,
    price: 0,
    currency: 'BDT',
    active: true,
    max_video_duration: 0
  });

  useEffect(() => {
    const q = query(collection(db, 'packages'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pkgList: Package[] = [];
      snapshot.forEach((doc) => {
        pkgList.push({ id: doc.id, ...doc.data() } as Package);
      });
      setPackages(pkgList);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'packages');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = editingId || Math.random().toString(36).substring(2) + Date.now().toString(36);
      await setDoc(doc(db, 'packages', id), {
        ...formData,
        updatedAt: new Date().toISOString()
      });
      resetForm();
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `packages/${editingId || 'new'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this package?')) return;
    try {
      await deleteDoc(doc(db, 'packages', id));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `packages/${id}`);
    }
  };

  const startEdit = (pkg: Package) => {
    setEditingId(pkg.id);
    setFormData({
      name: pkg.name,
      duration_days: pkg.duration_days,
      price: pkg.price,
      currency: pkg.currency,
      active: pkg.active,
      max_video_duration: pkg.max_video_duration || 0
    });
    setIsAdding(true);
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({
      name: '',
      duration_days: 30,
      price: 0,
      currency: 'BDT',
      active: true,
      max_video_duration: 0
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <PackageIcon className="w-6 h-6 text-indigo-400" />
          Package Management (Firebase)
        </h2>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {isAdding ? 'Cancel' : 'Add Package'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Package Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Duration (Days)</label>
              <input
                type="number"
                value={formData.duration_days}
                onChange={e => setFormData({ ...formData, duration_days: parseInt(e.target.value) })}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Price</label>
              <input
                type="number"
                value={formData.price}
                onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Currency</label>
              <input
                type="text"
                value={formData.currency}
                onChange={e => setFormData({ ...formData, currency: e.target.value })}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">Max Video Duration (Minutes)</label>
              <input
                type="number"
                value={formData.max_video_duration}
                onChange={e => setFormData({ ...formData, max_video_duration: parseInt(e.target.value) || 0 })}
                className="w-full bg-black/50 border border-zinc-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="0 for unlimited"
              />
              <p className="text-xs text-zinc-500 mt-1">0 means unlimited duration</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={e => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="active" className="text-sm text-zinc-300">Active (Visible to users)</label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              {editingId ? 'Update Package' : 'Create Package'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-950 text-zinc-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Duration</th>
                <th className="px-6 py-4 font-medium">Price</th>
                <th className="px-6 py-4 font-medium">Max Video</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {packages.map((pkg) => (
                <tr key={pkg.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{pkg.name}</td>
                  <td className="px-6 py-4 text-zinc-300">{pkg.duration_days} days</td>
                  <td className="px-6 py-4 text-indigo-400 font-mono">
                    {pkg.price.toLocaleString()} {pkg.currency}
                  </td>
                  <td className="px-6 py-4 text-zinc-300">
                    {pkg.max_video_duration ? `${pkg.max_video_duration} mins` : 'Unlimited'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      pkg.active 
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                        : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                    }`}>
                      {pkg.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => startEdit(pkg)}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(pkg.id)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {packages.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500">
                    No packages found. Create one to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PackagesManager;
