'use client';

import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Fingerprint, KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import { isSupported } from '@/lib/auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export function SecuritySettings() {
  const {
    authSettings,
    enableWebAuthn,
    disableWebAuthn,
    setPin,
    disablePin,
  } = useStore(
    useShallow((s) => ({
      authSettings: s.authSettings,
      enableWebAuthn: s.enableWebAuthn,
      disableWebAuthn: s.disableWebAuthn,
      setPin: s.setPin,
      disablePin: s.disablePin,
    }))
  );

  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pin, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pendingWebAuthn, setPendingWebAuthn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isSupported()
      .then((ok) => {
        if (!cancelled) setSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleWebAuthn = async (next: boolean) => {
    if (busy) return;
    if (next) {
      // STRICT SECURITY REQUIREMENT: Intercept toggle if PIN is missing
      if (!authSettings.pinEnabled) {
        toast.error('Please set up a 4-digit backup PIN before enabling biometric unlock.');
        setPendingWebAuthn(true);
        setShowPinSetup(true);
        return;
      }
      try {
        setBusy(true);
        await enableWebAuthn();
        toast.success('Biometric unlock enabled');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to enable biometrics');
      } finally {
        setBusy(false);
      }
    } else {
      await disableWebAuthn();
      toast.success('Biometric unlock disabled');
    }
  };

  const handleTogglePin = (next: boolean) => {
    if (busy) return;
    if (next) {
      setShowPinSetup(true);
    } else {
      setShowPinSetup(false);
      setPendingWebAuthn(false);
      disablePin();
      toast.success('Backup PIN removed');
    }
  };

  const handleSavePin = async () => {
    if (pin.length !== 4) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error('PIN must be exactly 4 digits');
      return;
    }
    if (pin !== pinConfirm) {
      toast.error('PINs do not match');
      return;
    }
    try {
      setBusy(true);
      await setPin(pin);
      toast.success('Backup PIN saved');
      setPinValue('');
      setPinConfirm('');
      setShowPinSetup(false);
      
      // Automatically proceed to WebAuthn if that was the original goal
      if (pendingWebAuthn) {
        setPendingWebAuthn(false);
        setTimeout(() => {
          handleToggleWebAuthn(true);
        }, 100);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Security</h2>
      </div>

      {/* WebAuthn */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5" />
            Biometric Unlock
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {supported === null
              ? 'Checking device support…'
              : supported
              ? 'Use fingerprint, face unlock, or Windows Hello to open Kalcy.'
              : 'Not available on this browser. WebAuthn requires HTTPS or localhost, and a platform authenticator.'}
          </p>
        </div>
        <Switch
          checked={authSettings.webauthnEnabled}
          onCheckedChange={handleToggleWebAuthn}
          disabled={busy || !supported || supported === null}
        />
      </div>

      {/* PIN */}
      <div className="flex items-start justify-between gap-3 pt-3 border-t border-border/40">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Backup PIN
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fallback code when biometrics aren't available. Required for
            recovery if biometrics stop working.
          </p>
        </div>
        <Switch
          checked={authSettings.pinEnabled || showPinSetup}
          onCheckedChange={handleTogglePin}
          disabled={busy}
        />
      </div>

      {showPinSetup && (
        <div className="rounded-xl bg-muted/40 p-3 space-y-2 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">New PIN</Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="4 digits"
              value={pin}
              onChange={(e) =>
                setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              className="mt-1 rounded-xl tracking-[0.4em] text-center"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Confirm PIN
            </Label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="Repeat"
              value={pinConfirm}
              onChange={(e) =>
                setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))
              }
              className="mt-1 rounded-xl tracking-[0.4em] text-center"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 rounded-xl"
              onClick={() => {
                setShowPinSetup(false);
                setPinValue('');
                setPinConfirm('');
                setPendingWebAuthn(false);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 rounded-xl"
              onClick={handleSavePin}
              disabled={busy}
            >
              Save PIN
            </Button>
          </div>
        </div>
      )}

      {!authSettings.webauthnEnabled && !authSettings.pinEnabled && (
        <div className="flex items-start gap-2 p-2.5 rounded-xl bg-warning/10 border border-warning/20 mt-2">
          <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-warning leading-relaxed">
            No lock is configured. Kalcy will open without asking for
            authentication. Enable biometrics and/or a PIN to protect the app.
          </p>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground pt-1">
        Auth settings stay on this device only. They are not synced to your
        Firestore account.
      </p>
    </div>
  );
}