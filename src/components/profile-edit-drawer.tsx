'use client';

import { useEffect, useState } from 'react';
import {
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Check, Mail, Lock, User, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';

interface ProfileEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileEditDrawer({ open, onOpenChange }: ProfileEditDrawerProps) {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);

  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // Sync inputs with the current user whenever the drawer opens.
  useEffect(() => {
    if (open) {
      setName(user?.displayName ?? '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, user?.displayName]);

  const handleSendResetEmail = async () => {
    if (!auth.currentUser?.email) {
      toast.error('No email address on this account');
      return;
    }
    try {
      setSendingReset(true);
      await sendPasswordResetEmail(auth, auth.currentUser.email);
      toast.success(`Password reset email sent to ${auth.currentUser.email}`);
    } catch (err) {
      const error = err as { message?: string };
      toast.error(error.message ?? 'Could not send reset email');
    } finally {
      setSendingReset(false);
    }
  };

  const handleSave = async () => {
    if (!auth.currentUser || !user) return;

    const trimmedName = name.trim();
    const wantsPasswordChange =
      currentPassword.length > 0 ||
      newPassword.length > 0 ||
      confirmPassword.length > 0;

    // -------------------------------------------------------------
    // Validate
    // -------------------------------------------------------------
    if (!trimmedName && !wantsPasswordChange) {
      toast.error('Nothing to update');
      return;
    }

    if (wantsPasswordChange) {
      if (!currentPassword) {
        toast.error('Enter your current password');
        return;
      }
      if (newPassword.length < 6) {
        toast.error('New password must be at least 6 characters');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('New passwords do not match');
        return;
      }
      if (newPassword === currentPassword) {
        toast.error('New password must be different from the current one');
        return;
      }
    }

    // -------------------------------------------------------------
    // Save
    // -------------------------------------------------------------
    setSaving(true);
    let nameUpdated = false;
    let passwordUpdated = false;

    try {
      // Update display name (independent of password change).
      if (trimmedName && trimmedName !== user.displayName) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
        setUser({ ...user, displayName: trimmedName });
        nameUpdated = true;
      }

      // Update password (needs re-authentication).
      if (wantsPasswordChange) {
        const email = auth.currentUser.email;
        if (!email) {
          toast.error('No email on this account — cannot change password');
          setSaving(false);
          return;
        }

        const credential = EmailAuthProvider.credential(email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
        await updatePassword(auth.currentUser, newPassword);
        passwordUpdated = true;
      }

      // -----------------------------------------------------------
      // Feedback
      // -----------------------------------------------------------
      if (nameUpdated && passwordUpdated) {
        toast.success('Name and password updated');
      } else if (nameUpdated) {
        toast.success('Name updated');
      } else if (passwordUpdated) {
        toast.success('Password updated');
      }

      onOpenChange(false);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      const code = error?.code ?? '';

      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        toast.error('Current password is incorrect');
      } else if (code === 'auth/requires-recent-login') {
        toast.error(
          'Session expired. Please sign out and sign back in, then try again.'
        );
      } else if (code === 'auth/weak-password') {
        toast.error('New password is too weak');
      } else if (code === 'auth/email-already-in-use') {
        toast.error('That email is already in use');
      } else {
        toast.error(error?.message ?? 'Failed to update profile');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs>
      <DrawerContent className="rounded-t-[2rem] flex flex-col max-h-[90dvh] overflow-hidden">
        {/* Fixed header */}
        <div className="shrink-0 px-4 pt-2 pb-3">
          <h2 className="text-xl font-bold">Edit Profile</h2>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 scroll-pt-4">
          <div className="flex flex-col gap-5 pb-4">
            {/* Avatar preview */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-muted/40">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="text-lg font-bold text-primary">
                  {(name.trim() || user.email || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  {name.trim() || 'Unnamed user'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email ?? 'No email'}
                </p>
              </div>
            </div>

            {/* Name */}
            <div>
              <Label className="text-xs text-muted-foreground">Display Name</Label>
              <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  autoComplete="name"
                  className="rounded-xl pl-9"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Shown across the app and in greetings.
              </p>
            </div>

            {/* Email (read-only) */}
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={user.email ?? ''}
                  readOnly
                  disabled
                  className="rounded-xl pl-9 bg-muted/50 cursor-not-allowed"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Email is fixed. Contact the administrator to change it.
              </p>
            </div>

            {/* Password change */}
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Change Password</h3>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Leave these blank to keep your current password.
              </p>

              <div className="flex flex-col gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Current Password
                  </Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    New Password
                  </Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="mt-1 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">
                    Confirm New Password
                  </Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="mt-1 rounded-xl"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendResetEmail}
                  disabled={sendingReset}
                  className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50 mt-1"
                >
                  <Send className="h-3 w-3" />
                  {sendingReset
                    ? 'Sending…'
                    : "Forgot current password? Send reset email"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="shrink-0 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background border-t flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            type="button"
            className="flex-1 rounded-xl"
            onClick={handleSave}
            disabled={saving}
          >
            <Check className="h-4 w-4 mr-1" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}