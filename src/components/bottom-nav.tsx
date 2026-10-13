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
          <div className="flex items-center rounded-3xl border border-border/60 bg-card/95 backdrop-blur-xl shadow-lg shadow-black/5 h-16 px-2">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.key;
              const Icon = item.icon;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onTabChange(item.key)}
                  className="relative flex flex-1 items-center justify-center h-full touch-manipulation"
                  aria-label={item.label}
                >
                  {/*
                    The pill wraps THIS inner wrapper, which has symmetric
                    padding on both sides. That keeps the highlight centered
                    around the icon+label instead of stretching to fill the
                    whole button.
                  */}
                  <div
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-1 rounded-2xl px-4 py-1.5',
                      'transition-colors duration-200',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-2xl bg-primary/10 will-change-transform"
                        transition={{
                          type: 'spring',
                          stiffness: 380,
                          damping: 30,
                          mass: 0.8,
                        }}
                      />
                    )}
                    <Icon
                      className="h-5 w-5 relative z-10"
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                    <span
                      className={cn(
                        'text-[10px] font-medium relative z-10 leading-none',
                        isActive && 'font-semibold'
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/*
        FAB — centered horizontally above the nav bar.
        Uses a single -translate-x-1/2 on the wrapper so the inner button's
        active:scale-90 works without fighting the positioning transform.
      */}
      <div
        className="fixed left-1/2 z-50 -translate-x-1/2"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 4rem)' }}
      >
        <button
          type="button"
          onClick={onAddClick}
          aria-label="Add transaction"
          className="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center transition-transform duration-100 ease-out active:scale-90 touch-manipulation"
        >
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}