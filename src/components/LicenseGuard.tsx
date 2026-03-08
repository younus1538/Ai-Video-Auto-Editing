import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import LicenseActivation from './LicenseActivation';

interface LicenseGuardProps {
  children: React.ReactNode;
}

const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
  const [isLicenseValid, setIsLicenseValid] = useState(false); 
  const [isLicenseSystemEnabled, setIsLicenseSystemEnabled] = useState<boolean | null>(null);
  const [checkingLicense, setCheckingLicense] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Debug: Reset license if URL parameter is present
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_license') === 'true') {
      console.log("Resetting license via URL parameter...");
      localStorage.removeItem('license_key');
      localStorage.removeItem('license_expiry');
      localStorage.removeItem('max_video_duration');
      localStorage.removeItem('device_id');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    console.log("LicenseGuard mounted - checking license...");
    
    const checkLicense = async (isBackgroundCheck = false) => {
      try {
        setError(null);
        // 1. Check if system is enabled
        const statusRes = await fetch(`/api/licenses/status?t=${Date.now()}`);
        if (!statusRes.ok) {
          throw new Error(`Status check failed: ${statusRes.status}`);
        }
        
        const statusData = await statusRes.json();
        const systemEnabled = statusData.enabled !== false;
        setIsLicenseSystemEnabled(systemEnabled);
        
        if (!systemEnabled) {
          setIsLicenseValid(true);
          localStorage.removeItem('license_expiry');
          localStorage.removeItem('max_video_duration');
          if (!isBackgroundCheck) setCheckingLicense(false);
          return;
        }

        // 2. Check local license
        const key = localStorage.getItem('license_key');
        const deviceId = localStorage.getItem('device_id');

        if (!key || !deviceId) {
          console.log("No local license found - showing activation screen");
          setIsLicenseValid(false);
          if (!isBackgroundCheck) setCheckingLicense(false);
          return;
        }

        // 3. Verify with server
        const verifyRes = await fetch('/api/licenses/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, deviceId, activate: false })
        });

        if (!verifyRes.ok && verifyRes.status !== 404 && verifyRes.status !== 403) {
           throw new Error(`Verification request failed: ${verifyRes.status}`);
        }

        const verifyData = await verifyRes.json();

        if (verifyData.success) {
          console.log("License verified successfully");
          setIsLicenseValid(true);
          if (verifyData.expiresAt) {
            localStorage.setItem('license_expiry', verifyData.expiresAt);
          }
          if (verifyData.maxVideoDuration !== undefined) {
            localStorage.setItem('max_video_duration', verifyData.maxVideoDuration.toString());
          }
        } else {
          console.warn("License check failed:", verifyData.error);
          setIsLicenseValid(false);
          
          if (verifyRes.status === 404) {
            localStorage.removeItem('license_key');
            localStorage.removeItem('license_expiry');
            localStorage.removeItem('max_video_duration');
            localStorage.removeItem('device_id');
          }
        }
      } catch (e: any) {
        console.error("License check failed", e);
        setError(`লাইসেন্স চেক করতে সমস্যা হয়েছে: ${e.message}`);
        // On network error during background check, keep current state
        if (!isBackgroundCheck) {
             setIsLicenseValid(false); 
        }
      } finally {
        if (!isBackgroundCheck) setCheckingLicense(false);
      }
    };

    // Initial check
    checkLicense().catch(err => console.error("Initial license check failed:", err));

    // Periodic check (every 10 seconds)
    const intervalId = setInterval(() => {
        checkLicense(true).catch(err => console.error("Background license check failed:", err));
    }, 10000);

    // Check on window focus
    const handleFocus = () => {
        checkLicense(true).catch(err => console.error("Focus license check failed:", err));
    };
    window.addEventListener('focus', handleFocus);

    return () => {
        clearInterval(intervalId);
        window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (checkingLicense || isLicenseSystemEnabled === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-zinc-500 text-sm">Verifying license...</p>
          {error && (
            <div className="flex flex-col items-center gap-2 mt-4">
              <p className="text-red-500 text-xs text-center max-w-xs">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="text-indigo-400 text-xs underline hover:text-indigo-300"
              >
                আবার চেষ্টা করুন
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLicenseSystemEnabled && !isLicenseValid) {
    return <LicenseActivation onActivated={() => setIsLicenseValid(true)} />;
  }

  return <>{children}</>;
};

export default LicenseGuard;
