import React, { useState, useEffect } from 'react';
import { AdminLogin } from './components/admin/AdminLogin';
import { 
  LayoutDashboard, 
  Package, 
  Key, 
  Settings, 
  LogOut, 
  Menu, 
  ShieldCheck,
  Users
} from 'lucide-react';
import { DashboardStats } from './components/admin/DashboardStats';
import PackagesManager from './components/admin/PackagesManager';
import LicenseManager from './components/admin/LicenseManager';
import SettingsManager from './components/admin/SettingsManager';
import { auth, onAuthStateChanged, signOut } from './firebase';

export const AdminApp: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email === 'bdyounus691@gmail.com') {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <AdminLogin onLogin={() => {}} />;
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'packages', label: 'Packages', icon: Package },
    { id: 'licenses', label: 'License Keys', icon: Key },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const renderContent = () => {
    const token = 'firebase-auth-active'; // Placeholder for components that still expect a token
    switch (activeTab) {
      case 'dashboard': return <DashboardStats token={token} onNavigate={setActiveTab} />;
      case 'packages': return <PackagesManager />;
      case 'licenses': return <LicenseManager token={token} onLogout={handleLogout} />;
      case 'settings': return <SettingsManager token={token} onLogout={handleLogout} />;
      default: return <DashboardStats token={token} onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-64 bg-zinc-900 border-r border-zinc-800 z-50 transition-transform duration-300 lg:translate-x-0 lg:static
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">AdminPanel</h2>
              <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider">Management</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium
                  ${activeTab === item.id 
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}
                `}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          <button
            onClick={handleLogout}
            className="mt-auto flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-all font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold text-white capitalize">
              {activeTab.replace('-', ' ')}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-white">Younus691</span>
              <span className="text-xs text-zinc-500">Super Admin</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
              <Users className="w-5 h-5 text-zinc-400" />
            </div>
          </div>
        </header>

        <div className="p-6 overflow-y-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
