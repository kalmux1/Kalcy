'use client';

import * as React from 'react';

export function OpenEyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M7 4.5L5.5 2" />
      <path d="M12 4V1.5" />
      <path d="M17 4.5L18.5 2" />
      <path d="M3 7L1 5" />
      <path d="M21 7L23 5" />
    </svg>
  );
}

export function ClosedEyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 10c4 4 16 4 20 0" />
      <path d="M4 12L2 14" />
      <path d="M8 14L7 17" />
      <path d="M12 15V18" />
      <path d="M16 14L17 17" />
      <path d="M20 12L22 14" />
    </svg>
  );
}