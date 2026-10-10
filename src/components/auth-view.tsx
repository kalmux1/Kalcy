import React, { useState } from 'react';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wallet, Mail, Lock, Sparkles, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function AuthView() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
      toast.success('Signed in successfully');
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    try {
      setLoading(true);
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success('Account created');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Signed in successfully');
      }
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col justify-center min-h-[100dvh] px-6 max-w-sm mx-auto">
      <div className="text-center mb-8">
        <div className="mx-auto h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary mb-4 shadow-inner">
          <Wallet className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Kalcy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cloud-synced money manager & expense tracker
        </p>
      </div>

      <div className="bg-card border border-border/40 rounded-3xl p-6 shadow-sm">
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full rounded-2xl h-11 text-sm font-medium gap-2 mb-4"
        >
          <Sparkles className="h-4 w-4 text-amber-500" />
          Continue with Google
        </Button>

        <div className="relative my-4 text-center">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <span className="relative bg-card px-2 text-xs uppercase text-muted-foreground">
            Or with email
          </span>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Email</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
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
            {isRegister ? 'Create Account' : 'Sign In'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
          >
            {isRegister
              ? 'Already have an account? Sign in'
              : "Don't have an account? Register"}
          </button>
        </div>
      </div>
    </div>
  );
}