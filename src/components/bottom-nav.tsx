'use client';

import { ListChecks, BarChart3, Wallet, Settings, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type TabKey = 'transactions' | 'stats' | 'accounts' | 'more';

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onAddClick: () => void;
}

const NAV_ITEMS: { key: TabKey; label: string; icon: typeof ListChecks }[] = [
  { key: 'transactions', label: 'Trans', icon: ListChecks },
  { key: 'stats', label: 'Stats', icon: BarChart3 },
  { key: 'accounts', label: 'Accounts', icon: Wallet },
  { key: 'more', label: 'More', icon: Settings },
];

export function BottomNav({ activeTab, onTabChange, onAddClick }: BottomNavProps) {
  return (
    <>
      {/* Nav bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-md pointer-events-auto px-4 pb-[max(env(safe-area-inset-bottom),0.5rem)]">
          <div className="flex items-center justify-around rounded-3xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-lg shadow-black/5 h-16 px-2">
            {NAV_ITEMS.map((item, index) => {
              const isActive = activeTab === item.key;
              const Icon = item.icon;
              const isRightOfFAB = index >= 2;

              return (
                <button
                  key={item.key}
                  onClick={() => onTabChange(item.key)}
                  className={cn(
                    'relative flex flex-col items-center justify-center gap-1 rounded-2xl transition-all py-1.5 flex-1',
                    isRightOfFAB ? 'pl-5' : 'pr-5',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-2xl bg-primary/10"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon
                    className="h-5 w-5 relative z-10"
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span
                    className={cn(
                      'text-[10px] font-medium relative z-10',
                      isActive && 'font-semibold'
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/*
        FAB — its positioning lives on a static wrapper div, so framer-motion's
        `transform`-based `whileTap` animation on the inner button cannot
        clobber the `-translate-x-1/2` centering. Previously the button itself
        carried both `-translate-x-1/2` and `whileTap={{ scale: 0.9 }}`, which
        caused the tap target to jump sideways mid-tap and made the button
        appear unresponsive.
      */}
      <div
        className="fixed left-1/2 z-50 -translate-x-1/2"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }}
      >
        <motion.button
          type="button"
          onClick={onAddClick}
          whileTap={{ scale: 0.9 }}
          aria-label="Add transaction"
          className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center"
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </motion.button>
      </div>
    </>
  );
}