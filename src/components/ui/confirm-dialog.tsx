'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useBackButton } from '@/lib/back-button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  isDestructive?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  isDestructive = true,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  useBackButton(() => {
    if (!open) return false;
    if (!loading) onOpenChange(false);
    return true;
  }, open);

  const handleConfirm = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      console.error('Confirm action failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[2rem] p-6 gap-6">
        <DialogHeader className="gap-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 sm:mx-0">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-xl font-bold text-center sm:text-left">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-center sm:text-left">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-xl flex-1 h-11"
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-xl flex-1 h-11"
          >
            {loading ? 'Working…' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}