import React, { useState, useEffect } from 'react';
import { Lock, Loader2, ArrowLeft, LogIn } from 'lucide-react';
import { auth, googleProvider, signInWithPopup } from '../../firebase';

interface AdminLoginProps {
  onLogin: (token: string) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentDomain, setCurrentDomain] = useState('');
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    setCurrentDomain(window.location.hostname);
    setIsInIframe(window.self !== window.top);
  }, []);

  const handleGoogleLogin = async () => {
    if (isInIframe) {
      setError('নিরাপত্তার স্বার্থে অ্যাপের ভিতর থেকে এডমিন প্যানেল লগইন করা যাবে না। দয়া করে নতুন ট্যাবে অ্যাপটি ওপেন করে লগইন করুন।');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user is the authorized admin
      if (user.email === 'bdyounus691@gmail.com') {
        const token = await user.getIdToken();
        onLogin(token);
      } else {
        await auth.signOut();
        setError('Unauthorized access. Only the super admin can log in.');
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(`Login failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#111111] p-4 relative">
      <div className="absolute top-6 left-6 flex items-center gap-4">
        <button
          onClick={() => window.location.href = '/'}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-lg"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to App
        </button>
      </div>
      
      <div className="w-full max-w-md bg-[#1a1a1a] border border-zinc-800/50 rounded-3xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#132b20] rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/20">
            <Lock className="w-8 h-8 text-emerald-500" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Access</h1>
          <p className="text-zinc-400 text-sm text-center">Sign in with your authorized Google<br/>account</p>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm py-3 px-4 rounded-xl">
              {error}
            </div>
          )}

          <div className="bg-[#2a2211] border border-[#5c4315] rounded-2xl p-5">
            <h3 className="text-[#eab308] font-medium mb-3">আপনার বর্তমান ডোমেইন</h3>
            <div className="bg-[#1f1a10] rounded-xl p-4 mb-4 font-mono text-zinc-300 text-sm break-all">
              {currentDomain}
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">
              লগইন করতে গেলে auth/unauthorized-domain এলে এই ডোমেইনটা Firebase Console → Authentication → Settings → Authorized domains এ গিয়ে Add domain করে যোগ করুন (শুধু উপরের নাম, পোর্ট নয়)।
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white text-black hover:bg-zinc-200 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-lg"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                Sign in with Google
              </>
            )}
          </button>
          
          <p className="text-center text-sm text-zinc-500 mt-6">
            Authorized Email: bdyounus691@gmail.com
          </p>
        </div>
      </div>
    </div>
  );
};
