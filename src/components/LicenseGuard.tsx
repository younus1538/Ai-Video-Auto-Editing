import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import LicenseActivation from './LicenseActivation';

interface LicenseGuardProps {
  children: React.ReactNode;
}

const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
  const [isLicenseValid, setIsLicenseValid] = useState(true); 
  // Default to TRUE (secure by default). Only set to false if server explicitly says so.
  const [isLicenseSystemEnabled, setIsLicenseSystemEnabled] = useState(true);
  const [checkingLicense, setCheckingLicense] = useState(true);

  useEffect(() => {
    console.log("LicenseGuard mounted - checking license...");
    
    const checkLicense = async (isBackgroundCheck = false) => {
      try {
        // 1. Check if system is enabled
        const statusRes = await fetch(`/api/licenses/status?t=${Date.now()}`);
        const statusText = await statusRes.text();
        
        let statusData;
        try {
            statusData = JSON.parse(statusText);
        } catch (e) {
            console.error("Failed to parse status response:", statusText);
            // Don't throw here on background check, just return
            if (isBackgroundCheck) return;
            throw new Error(`Invalid JSON from /status: ${statusText.substring(0, 100)}...`);
        }
        
        // console.log("License system status:", statusData);

        if (!statusData.enabled) {
          setIsLicenseSystemEnabled(false);
          setIsLicenseValid(true);
          
          // We DO NOT clear the license key or device ID here anymore.
          // This ensures that if the system is re-enabled later, users who already 
          // had a key will stay logged in, while new users (who have no key) will be prompted.
          
          // We only clear the expiry/duration info to avoid UI confusion while disabled
          localStorage.removeItem('license_expiry');
          localStorage.removeItem('max_video_duration');
          
          if (!isBackgroundCheck) setCheckingLicense(false);
          return;
        }

        setIsLicenseSystemEnabled(true);

        // 2. Check local license
        const key = localStorage.getItem('license_key');
        const deviceId = localStorage.getItem('device_id');

        if (!key || !deviceId) {
          console.log("No local license found");
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

        const verifyText = await verifyRes.text();
        let verifyData;
        try {
            verifyData = JSON.parse(verifyText);
        } catch (e) {
            console.error("Failed to parse verify response:", verifyText);
            if (isBackgroundCheck) return;
            throw new Error(`Invalid JSON from /verify: ${verifyText.substring(0, 100)}...`);
        }

        // console.log("License verification result:", verifyData);

        if (verifyData.success) {
          setIsLicenseValid(true);
          // Update expiry if needed
          if (verifyData.expiresAt) {
            localStorage.setItem('license_expiry', verifyData.expiresAt);
          }
          if (verifyData.maxVideoDuration !== undefined) {
            localStorage.setItem('max_video_duration', verifyData.maxVideoDuration.toString());
          }
        } else {
          console.warn("License check failed:", verifyData.error);
          setIsLicenseValid(false);
          
          // Only clear ALL license related data if the license is explicitly NOT FOUND (deleted)
          // For suspended or expired licenses, we keep the data so the periodic check can 
          // auto-recover if the admin reactivates it.
          if (verifyRes.status === 404) {
            localStorage.removeItem('license_key');
            localStorage.removeItem('license_expiry');
            localStorage.removeItem('max_video_duration');
            localStorage.removeItem('device_id');
          }
        }
      } catch (e) {
        console.error("License check failed", e);
        // On network error during background check, do nothing (assume valid to prevent flicker)
        if (!isBackgroundCheck) {
             setIsLicenseValid(false); 
        }
      } finally {
        if (!isBackgroundCheck) setCheckingLicense(false);
      }
    };

    // Initial check
    checkLicense();

    // Periodic check (every 10 seconds)
    const intervalId = setInterval(() => {
        checkLicense(true);
    }, 10000);

    // Check on window focus
    const handleFocus = () => {
        checkLicense(true);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
        clearInterval(intervalId);
        window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (checkingLicense) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
          <p className="text-zinc-500 text-sm">Verifying license...</p>
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
