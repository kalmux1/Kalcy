'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useStore } from '@/lib/store';
import {
  authenticateCredential,
  clearAuthSettings,
  isSupported,
} from '@/lib/auth-service';
import { Button } from '@/components/ui/button';
import {
  Fingerprint,
  KeyRound,
  ShieldCheck,
  AlertCircle,
  LogOut,
  Delete,
} from 'lucide-react';

interface LockScreenProps {
  onUnlock: () => void;
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const { user, authSettings, authLoaded, verifyPin } = useStore(
    useShallow((s) => ({
      user: s.user,
      authSettings: s.authSettings,
      authLoaded: s.authLoaded,
      verifyPin: s.verifyPin,
    }))
  );

  const [supported, setSupported] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'biometric' | 'pin'>(() =>
    authSettings.pinEnabled && !authSettings.webauthnEnabled ? 'pin' : 'biometric'
  );
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  const authInProgress = useRef(false);
  const hasAutoTriggered = useRef(false);

  // Detect WebAuthn support once.
  useEffect(() => {
    isSupported()
      .then(setSupported)
      .catch(() => setSupported(false));
  }, []);

  // Auto-unlock when no lock is configured.
  useEffect(() => {
    if (!authLoaded) return;
    if (!authSettings.webauthnEnabled && !authSettings.pinEnabled) {
      onUnlock();
    }
  }, [
    authLoaded,
    authSettings.webauthnEnabled,
    authSettings.pinEnabled,
    onUnlock,
  ]);

  const handleBiometric = useCallback(async () => {
    if (authInProgress.current) return;
    if (!authSettings.webauthnCredentialId) {
      setError('No biometric credential stored. Please re-enable in Settings.');
      return;
    }
    authInProgress.current = true;
    setBusy(true);
    setError(null);
    try {
      const ok = await authenticateCredential(
        authSettings.webauthnCredentialId
      );
      if (ok) {
        onUnlock();
      } else {
        setError('Authentication cancelled. Try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      authInProgress.current = false;
      setBusy(false);
    }
  }, [authSettings.webauthnCredentialId, onUnlock]);

  const isBioMode = mode === 'biometric' && authSettings.webauthnEnabled;
  const isPinMode = mode === 'pin' && authSettings.pinEnabled;

  // STRICT UX REQUIREMENT: Auto-trigger biometrics on mount if configured
  useEffect(() => {
    if (!authLoaded || !isBioMode || !supported) return;
    if (hasAutoTriggered.current) return;

    hasAutoTriggered.current = true;
    
    // Slight delay to allow UI to paint before the native prompt appears
    const timer = setTimeout(() => {
      handleBiometric();
    }, 400);

    return () => clearTimeout(timer);
  }, [authLoaded, isBioMode, supported, handleBiometric]);

  const handlePinSubmit = async () => {
    if (pin.length < 4) {
      setError('Enter your PIN');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ok = await verifyPin(pin);
      if (ok) {
        onUnlock();
      } else {
        setError('Incorrect PIN');
        setPin('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PIN verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handlePinKey = (digit: string) => {
    if (busy) return;
    setError(null);
    if (digit === 'back') {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < 4) {
      setPin((p) => p + digit);
    }
  };

  const handleSwitchToPin = () => {
    setMode('pin');
    setError(null);
    // Reset the auto-trigger so if they switch back to biometrics, it prompts again
    hasAutoTriggered.current = false;
  };

  const handleSwitchToBio = () => {
    setMode('biometric');
    setError(null);
    // We don't reset hasAutoTriggered here, so it won't immediately re-prompt
    // unless they explicitly click the "Authenticate" button.
  };

  const handleSignOut = async () => {
    try {
      if (user) clearAuthSettings(user.uid);
      await signOut(auth);
    } catch (err) {
      console.error('Sign out failed', err);
    }
  };

  const hasAnyAuth =
    authSettings.webauthnEnabled || authSettings.pinEnabled;

  if (!authLoaded) {
    return (
      <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hasAnyAuth) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full">
        {/* Icon */}
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          {isPinMode ? (
            <KeyRound className="h-10 w-10 text-primary" />
          ) : (
            <Fingerprint className="h-10 w-10 text-primary" />
          )}
        </div>

        <h1 className="text-2xl font-bold">Unlock Kalcy</h1>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm text-center max-w-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Biometric mode */}
        {isBioMode && (
          <>
            <p className="text-sm text-muted-foreground text-center">
              {supported
                ? 'Use your fingerprint, face, or Windows Hello to unlock.'
                : 'Biometrics are not supported on this browser.'}
            </p>

            <Button
              type="button"
              onClick={handleBiometric}
              disabled={busy || !supported}
              className="w-full rounded-2xl h-12 text-base font-semibold gap-2 mt-2"
            >
              {busy ? (
                'Waiting for device…'
              ) : (
                <>
                  <span>Authenticate</span>
                  <Fingerprint className="h-5 w-5" />
                </>
              )}
            </Button>

            {authSettings.pinEnabled && (
              <button
                type="button"
                onClick={handleSwitchToPin}
                disabled={busy}
                className="text-sm text-primary font-medium hover:underline disabled:opacity-50"
              >
                Use PIN instead
              </button>
            )}
          </>
        )}

        {/* PIN mode */}
        {isPinMode && (
          <>
            <p className="text-sm text-muted-foreground text-center">
              Enter your PIN to unlock.
            </p>

            {/* PIN dots - exactly 4 */}
            <div className="w-full flex justify-center gap-3 h-6 items-center">
              {Array.from({ length: 4 }).map((_, i) => {
                const filled = i < pin.length;
                return (
                  <div
                    key={i}
                    className={
                      'h-3 w-3 rounded-full transition-all duration-200 ' +
                      (filled ? 'bg-primary scale-110' : 'bg-muted')
                    }
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mx-auto mt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handlePinKey(d)}
                  disabled={busy}
                  className="h-14 rounded-2xl bg-muted hover:bg-muted/70 active:scale-95 text-xl font-semibold transition-all touch-manipulation disabled:opacity-50"
                >
                  {d}
                </button>
              ))}
              {authSettings.webauthnEnabled ? (
                <button
                  type="button"
                  onClick={handleSwitchToBio}
                  disabled={busy}
                  className="h-14 rounded-2xl bg-muted hover:bg-muted/70 flex items-center justify-center transition-all touch-manipulation disabled:opacity-50"
                  aria-label="Use biometrics instead"
                >
                  <Fingerprint className="h-5 w-5" />
                </button>
              ) : (
                <div className="h-14" />
              )}
              <button
                type="button"
                onClick={() => handlePinKey('0')}
                disabled={busy}
                className="h-14 rounded-2xl bg-muted hover:bg-muted/70 active:scale-95 text-xl font-semibold transition-all touch-manipulation disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => handlePinKey('back')}
                disabled={busy}
                className="h-14 rounded-2xl bg-muted hover:bg-muted/70 active:scale-95 flex items-center justify-center transition-all touch-manipulation disabled:opacity-50"
                aria-label="Delete last digit"
              >
                <Delete className="h-5 w-5" />
              </button>
            </div>

            <Button
              type="button"
              onClick={handlePinSubmit}
              disabled={busy || pin.length < 4}
              className="w-full rounded-2xl h-12 text-base font-semibold gap-2 mt-4"
            >
              {busy ? (
                'Verifying…'
              ) : (
                <>
                  <span>Unlock</span>
                  <ShieldCheck className="h-5 w-5" />
                </>
              )}
            </Button>
          </>
        )}

        {/* Recovery / sign-out */}
        {!showRecovery ? (
          <button
            type="button"
            onClick={() => setShowRecovery(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline mt-4"
          >
            Trouble unlocking?
          </button>
        ) : (
          <div className="w-full p-3 rounded-2xl border border-border/40 bg-muted/30 flex flex-col gap-2 mt-2">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If biometrics and PIN both fail, you can sign out to reset all
              security settings. You&apos;ll need your Firebase email and
              password to sign back in.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out &amp; reset
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}