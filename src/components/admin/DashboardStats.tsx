import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Key, 
  Package, 
  AlertCircle,
  TrendingUp,
  Activity,
  Shield,
  Clock
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

interface Stats {
  totalLicenses: number;
  activeLicenses: number;
  expiredLicenses: number;
  totalPackages: number;
}

export const DashboardStats: React.FC<{ token: string; onNavigate: (tab: string) => void }> = ({ onNavigate }) => {
  const [stats, setStats] = useState<Stats>({
    totalLicenses: 0,
    activeLicenses: 0,
    expiredLicenses: 0,
    totalPackages: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Real-time licenses stats
    const licensesUnsubscribe = onSnapshot(collection(db, 'licenses'), (snapshot) => {
      const licenses = snapshot.docs.map(doc => doc.data());
      setStats(prev => ({
        ...prev,
        totalLicenses: licenses.length,
        activeLicenses: licenses.filter(l => l.status === 'active').length,
        expiredLicenses: licenses.filter(l => l.status === 'expired').length
      }));
      setLoading(false);
    });

    // Real-time packages stats
    const packagesUnsubscribe = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setStats(prev => ({
        ...prev,
        totalPackages: snapshot.size
      }));
    });

    return () => {
      licensesUnsubscribe();
      packagesUnsubscribe();
    };
  }, []);

  if (loading) return <div className="animate-pulse space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-zinc-900 rounded-2xl border border-zinc-800" />)}
    </div>
  </div>;

  const cards = [
    { label: 'Total Licenses', value: stats.totalLicenses, icon: Key, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Active Devices', value: stats.activeLicenses, icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Expired Keys', value: stats.expiredLicenses, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
    { label: 'Total Packages', value: stats.totalPackages, icon: Package, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl hover:border-zinc-700 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-xl ${card.bg} ${card.color} transition-transform group-hover:scale-110`}>
                <card.icon className="w-6 h-6" />
              </div>
              <TrendingUp className="w-4 h-4 text-zinc-600" />
            </div>
            <div>
              <p className="text-zinc-500 text-sm font-medium">{card.label}</p>
              <h3 className="text-3xl font-bold text-white mt-1">{card.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              System Status
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium">License Verification API</span>
              </div>
              <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-xs font-bold rounded-lg uppercase">Online</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-medium">Auto-Expiry Worker</span>
              </div>
              <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-xs font-bold rounded-lg uppercase">Active</span>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl">
          <h3 className="font-bold text-lg mb-6">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => onNavigate('licenses')}
              className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all text-center"
            >
              Generate Keys
            </button>
            <button 
              onClick={() => onNavigate('packages')}
              className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all text-center"
            >
              New Package
            </button>
            <button 
              onClick={() => onNavigate('settings')}
              className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all text-center"
            >
              Settings
            </button>
            <button 
              onClick={() => onNavigate('users')}
              className="p-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm font-medium transition-all text-center"
            >
              User Monitoring
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
