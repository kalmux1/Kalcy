'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
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
  
  const authInProgress = useRef(false);

  const authenticate = useCallback(
    async (useBiometric: boolean) => {
      if (authInProgress.current) return;
      
      authInProgress.current = true;
      setIsAuthenticating(true);
      setError(null);
      
      try {
        if (Capacitor.isNativePlatform()) {
          await BiometricAuth.authenticate({
            reason: 'Unlock Kalcy',
            cancelTitle: 'Cancel',
            allowDeviceCredential: true, 
            iosFallbackTitle: useBiometric ? 'Use Passcode' : 'Use Biometrics',
            androidTitle: 'Unlock Kalcy',
            androidSubtitle: useBiometric
              ? 'Place your finger on the sensor'
              : 'Enter your PIN, pattern, or password',
            androidConfirmationRequired: false,
          });
          onUnlock();
        } else {
          onUnlock();
        }
      } catch (e) {
        const err = e as BiometryError;
        
        // 1. Handle explicit user cancellation (Clicking [X])
        if (err.code === BiometryErrorType.userCancel) {
          if (Capacitor.isNativePlatform()) {
            // Reset state so it isn't stuck if the user immediately reopens
            authInProgress.current = false;
            setIsAuthenticating(false);
            
            // minimizeApp safely pauses the WebView. Using exitApp() here destroys
            // the WebView surface while the native prompt is animating out, which
            // causes the "black screen" on subsequent launches.
            await App.minimizeApp();
          }
          return;
        }

        // 2. Ignore background/app cancellations (e.g., incoming phone call)
        if (err.code === BiometryErrorType.appCancel) {
          return;
        }

        // 3. Handle specific configuration errors
        if (err.code === BiometryErrorType.passcodeNotSet) {
          setError('No device PIN, pattern, or password is set. Please configure it in your device settings.');
        } else if (err.code === BiometryErrorType.authenticationFailed) {
          setError('Authentication failed. Please try again.');
        } else if (err.code === BiometryErrorType.biometryNotAvailable) {
          setError('Biometrics are not available on this device.');
        } else if (err.code === BiometryErrorType.biometryNotEnrolled) {
          setError('No biometrics enrolled. Please set up a fingerprint or face unlock in your device settings.');
        } else {
          setError(`Error (${err.code}): ${err.message || 'Unknown error'}`);
        }
      } finally {
        authInProgress.current = false;
        setIsAuthenticating(false);
      }
    },
    [onUnlock]
  );

  // Auto-trigger the prompt on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      authenticate(mode === 'biometric');
    }, 500);
    
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