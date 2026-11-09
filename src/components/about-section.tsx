'use client';

import {
  Info,
  ExternalLink,
  Mail,
  Github,
  Heart,
  Code2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const CREATOR = {
  name: 'Kalmux',
  role: 'Creator & Maintainer',
  email: '',
  github: 'https://github.com/kalmux1',
};

const APP_VERSION = '1.3';

export function AboutSection() {
  return (
    <div className="space-y-3 bg-card border border-border/40 rounded-3xl p-4 md:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <Info className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">About Kalcy</h2>
      </div>

      {/* App identity */}
      <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/40">
        <img
          src="/kalcy-logo.svg"
          alt="Kalcy"
          className="h-16 w-auto shrink-0"
          draggable={false}
        />
        <div className="min-w-0">
          <h3 className="font-bold text-lg leading-tight">Kalcy</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Version {APP_VERSION}
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Track expenses, manage budgets, and visualize your financial life.
          </p>
        </div>
      </div>

      {/* Creator */}
      <div className="p-4 rounded-2xl border border-border/40">
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2 tracking-wide">
          Created by
        </h4>
        
        {/* Avatar removed here */}
        <div className="min-w-0 mb-3">
          <p className="font-semibold text-sm truncate">{CREATOR.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {CREATOR.role}
          </p>
        </div>

        {(CREATOR.email || CREATOR.github) && (
          <div className="flex flex-wrap gap-2">
            {CREATOR.email && (
              <a
                href={`mailto:${CREATOR.email}`}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                {CREATOR.email}
              </a>
            )}
            {CREATOR.github && (
              <a
                href={CREATOR.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
              >
                <Github className="h-3.5 w-3.5" />
                Source
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* App details */}
      <div className="grid grid-cols-2 gap-2">
        <DetailTile icon={<Sparkles className="h-3 w-3" />} label="Version" value={APP_VERSION} />
        <DetailTile icon={<ShieldCheck className="h-3 w-3" />} label="License" value="MIT" />
        <DetailTile
          icon={<Code2 className="h-3 w-3" />}
          label="Platform"
          value="Webapp"
        />
        <DetailTile label="Storage" value="Firebase" />
      </div>

      {/* Privacy note */}
      <div className="p-3 rounded-xl bg-income/5 border border-income/20">
        <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1.5">
          <Heart className="h-3.5 w-3.5 text-income" />
          Your data stays yours
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          All your data lives in your private Firestore scope and IndexedDB
          cache. No analytics, no tracking, no third-party access. Everything
          syncs end-to-end over Firebase.
        </p>
      </div>

      {/* Footer */}
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        Made By{' '}
        <a
          href="https://github.com/kalmux1"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary transition-colors font-medium"
        >
          Kalmux
        </a>{' '}
        © 2026
      </p>
    </div>
  );
}

function DetailTile({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-muted/30">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-xs font-semibold mt-0.5 truncate">{value}</p>
    </div>
  );
}