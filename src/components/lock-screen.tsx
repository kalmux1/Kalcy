'use client';

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  BiometricAuth,
  BiometryError,
  BiometryErrorType,
} from '@aparajita/capacitor-biometric-auth';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Fingerprint, Lock, ShieldCheck, AlertCircle } from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const biometricEnabled = useStore((s) => s.preferences.biometricEnabled);
  const [mode, setMode] = useState<'biometric' | 'deviceCredential'>(
    biometricEnabled ? 'biometric' : 'deviceCredential'
  );
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const authenticate = useCallback(
    async (useBiometric: boolean) => {
      if (isAuthenticating) return;
      
      setIsAuthenticating(true);
      setError(null);
      
      try {
        if (Capacitor.isNativePlatform()) {
          await BiometricAuth.authenticate({
            reason: 'Unlock Kalcy',
            cancelTitle: 'Cancel',
            allowDeviceCredential: true, // Crucial for PIN/Pattern fallback
            iosFallbackTitle: useBiometric ? 'Use Passcode' : 'Use Biometrics',
            androidTitle: 'Unlock Kalcy',
            androidSubtitle: useBiometric
              ? 'Place your finger on the sensor'
              : 'Enter your PIN, pattern, or password',
            androidConfirmationRequired: false,
          });
          // If successful, unlock the app
          onUnlock();
        } else {
          // Web fallback
          console.warn('Biometric auth is simulated on web.');
          onUnlock();
        }
      } catch (e) {
        const err = e as BiometryError;
        
        // 1. Ignore cancellations. 
        // React StrictMode or the OS might cancel the first prompt on launch.
        // We don't want to show a scary red error for a simple cancellation.
        if (
          err.code === BiometryErrorType.userCancel ||
          err.code === BiometryErrorType.appCancel
        ) {
          // Just return silently, the user can tap the button to try again.
          return;
        }

        // 2. Handle specific configuration errors
        if (err.code === BiometryErrorType.passcodeNotSet) {
          setError('No device PIN, pattern, or password is set. Please configure it in your device settings.');
        } else if (err.code === BiometryErrorType.authenticationFailed) {
          setError('Authentication failed. Please try again.');
        } else if (err.code === BiometryErrorType.biometryNotAvailable) {
          setError('Biometrics are not available on this device.');
        } else if (err.code === BiometryErrorType.biometryNotEnrolled) {
          setError('No biometrics enrolled. Please set up a fingerprint or face unlock in your device settings.');
        } else {
          // Show the raw error code if it's something unexpected
          setError(`Error (${err.code}): ${err.message || 'Unknown error'}`);
        }
      } finally {
        setIsAuthenticating(false);
      }
    },
    [onUnlock, isAuthenticating]
  );

  // Auto-trigger the prompt on mount, but wait 400ms to let the Activity fully focus
  useEffect(() => {
    const timer = setTimeout(() => {
      authenticate(mode === 'biometric');
    }, 400);
    
    return () => clearTimeout(timer);
  }, [mode, authenticate]);

  const toggleMode = () => {
    setMode((prev) => (prev === 'biometric' ? 'deviceCredential' : 'biometric'));
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          {mode === 'biometric' ? (
            <Fingerprint className="h-10 w-10 text-primary" />
          ) : (
            <Lock className="h-10 w-10 text-primary" />
          )}
        </div>

        <h1 className="text-2xl font-bold">Unlock Kalcy</h1>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm text-center">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <p className="text-sm text-muted-foreground text-center">
          {mode === 'biometric'
            ? 'Use your fingerprint or face to unlock'
            : 'Enter your device PIN, pattern, or password'}
        </p>

        <Button
          onClick={() => authenticate(mode === 'biometric')}
          disabled={isAuthenticating}
          className="w-full rounded-2xl h-12 text-base font-semibold gap-2"
        >
          {isAuthenticating ? (
            'Authenticating…'
          ) : mode === 'biometric' ? (
            <>
              Authenticate <Fingerprint className="h-5 w-5" />
            </>
          ) : (
            <>
              Unlock <ShieldCheck className="h-5 w-5" />
            </>
          )}
        </Button>

        <button
          onClick={toggleMode}
          disabled={isAuthenticating}
          className="text-sm text-primary font-medium hover:underline disabled:opacity-50"
        >
          {mode === 'biometric' ? 'Use PIN / Pattern' : 'Use Biometrics'}
        </button>
      </div>
    </div>
  );
}