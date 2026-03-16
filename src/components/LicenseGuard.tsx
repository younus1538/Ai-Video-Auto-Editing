import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import LicenseActivation from './LicenseActivation';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, limit, doc, getDoc, onSnapshot } from 'firebase/firestore';

interface LicenseGuardProps {
  children: React.ReactNode;
}

const LicenseGuard: React.FC<LicenseGuardProps> = ({ children }) => {
  const [isLicenseValid, setIsLicenseValid] = useState(false); 
  const [isLicenseSystemEnabled, setIsLicenseSystemEnabled] = useState<boolean | null>(true); // Default to true (Strict Mode)
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
    
    let unsubSettings: () => void;
    let unsubLicense: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        setError(null);
        
        // Listen to license system setting
        const settingsRef = doc(db, 'settings', 'license_system_enabled');
        unsubSettings = onSnapshot(settingsRef, (docSnap) => {
          let systemEnabled = true;
          if (docSnap.exists()) {
            systemEnabled = docSnap.data().value === 'true';
          }
          setIsLicenseSystemEnabled(systemEnabled);
          
          if (!systemEnabled) {
            setIsLicenseValid(true);
            setCheckingLicense(false);
          } else {
            // If system is enabled, check local key
            const key = localStorage.getItem('license_key');
            const deviceId = localStorage.getItem('device_id');
            
            if (!key || !deviceId) {
              setIsLicenseValid(false);
              setCheckingLicense(false);
              return;
            }

            // Listen to the specific license
            if (!unsubLicense) {
              const q = query(collection(db, 'licenses'), where('key', '==', key), limit(1));
              unsubLicense = onSnapshot(q, (querySnapshot) => {
                if (querySnapshot.empty) {
                  console.warn("License key not found in Firestore");
                  setIsLicenseValid(false);
                  localStorage.removeItem('license_key');
                  localStorage.removeItem('license_expiry');
                  localStorage.removeItem('max_video_duration');
                  localStorage.removeItem('device_id');
                } else {
                  const licenseDoc = querySnapshot.docs[0];
                  const licenseData = licenseDoc.data();

                  if (licenseData.status === 'active' && licenseData.device_id === deviceId) {
                    if (licenseData.expires_at) {
                      const expiryDate = new Date(licenseData.expires_at);
                      if (expiryDate < new Date()) {
                        console.warn("License expired");
                        setIsLicenseValid(false);
                      } else {
                        setIsLicenseValid(true);
                        localStorage.setItem('license_expiry', licenseData.expires_at);
                        if (licenseData.max_video_duration !== undefined) {
                          localStorage.setItem('max_video_duration', licenseData.max_video_duration.toString());
                        }
                      }
                    } else {
                      setIsLicenseValid(true);
                    }
                  } else {
                    console.warn("License status invalid or device ID mismatch");
                    setIsLicenseValid(false);
                    if (licenseData.device_id !== deviceId) {
                      // It was activated on another device, so clear local storage
                      localStorage.removeItem('license_key');
                      localStorage.removeItem('license_expiry');
                      localStorage.removeItem('max_video_duration');
                      // We don't remove device_id so this device keeps its identity
                    }
                  }
                }
                setCheckingLicense(false);
              }, (err) => {
                console.error("License snapshot error:", err);
                setError(`লাইসেন্স চেক করতে সমস্যা হয়েছে: ${err.message}`);
                setCheckingLicense(false);
              });
            }
          }
        }, (err) => {
          console.error("Settings snapshot error:", err);
          setError(`সেটিংস চেক করতে সমস্যা হয়েছে: ${err.message}`);
          setCheckingLicense(false);
        });

      } catch (e: any) {
        console.error("Setup listeners failed:", e);
        setError(`লাইসেন্স চেক করতে সমস্যা হয়েছে: ${e.message}`);
        setCheckingLicense(false);
      }
    };

    setupListeners();

    return () => {
      if (unsubSettings) unsubSettings();
      if (unsubLicense) unsubLicense();
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
