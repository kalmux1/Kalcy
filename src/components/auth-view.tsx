import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function AuthView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      const code = error?.code ?? '';

      // Map Firebase auth error codes to friendly, non-leaking messages.
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        toast.error('Incorrect email or password');
      } else if (code === 'auth/invalid-email') {
        toast.error('Please enter a valid email address');
      } else if (code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please try again later.');
      } else if (code === 'auth/user-disabled') {
        toast.error('This account has been disabled.');
      } else if (code === 'auth/network-request-failed') {
        toast.error('Network error. Check your connection and try again.');
      } else {
        toast.error(error?.message ?? 'Sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center min-h-[100dvh] px-6 max-w-sm mx-auto">
      <div className="text-center mb-8">
        <img
          src="/kalcy-logo.svg"
          alt="Kalcy"
          className="mx-auto h-28 w-auto"
          draggable={false}
        />
      </div>

      <div className="bg-card border border-border/40 rounded-3xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4 text-center">Sign In</h2>

        <form onSubmit={handleEmailSignIn} className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="rounded-xl pl-9"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Password</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-xl pl-9"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl h-11 mt-2 text-sm font-semibold gap-1.5"
          >
            {loading ? 'Signing in…' : 'Sign In'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}