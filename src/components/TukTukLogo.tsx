import React from 'react';
import { cn } from '../lib/utils';

interface TukTukLogoProps {
  className?: string;
  variant?: 'full' | 'icon' | 'white';
}

export const TukTukLogo: React.FC<TukTukLogoProps> = ({ className, variant = 'full' }) => {
  if (variant === 'icon') {
    return (
      <svg 
        viewBox="0 0 512 512" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={cn("w-12 h-12", className)}
      >
        <path d="M120 370 V230 C120 160 180 150 256 150 C332 150 392 160 392 230 V370 H120Z" fill="currentColor" />
        <path d="M150 190 H362 V290 C362 315 320 325 256 325 C192 325 150 315 150 290 V190Z" className="opacity-80" fill="currentColor" />
        <rect x="251" y="190" width="10" height="135" fill="black" opacity="0.2" />
        <circle cx="185" cy="400" r="45" fill="currentColor" />
        <circle cx="327" cy="400" r="45" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg 
      viewBox="0 0 512 512" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-12 h-12", className)}
    >
      <defs>
        <linearGradient id="logo-bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="128" fill="url(#logo-bg-grad)"/>
      <path d="M120 370 V230 C120 160 180 150 256 150 C332 150 392 160 392 230 V370 H120Z" fill="#0F172A"/>
      <path d="M150 190 H362 V290 C362 315 320 325 256 325 C192 325 150 315 150 290 V190Z" fill="#FBBF24"/>
      <rect x="251" y="190" width="10" height="135" fill="#0F172A" opacity="0.8"/>
      <circle cx="185" cy="400" r="45" fill="#0F172A"/>
      <circle cx="185" cy="400" r="14" fill="#F59E0B"/>
      <circle cx="327" cy="400" r="45" fill="#0F172A"/>
      <circle cx="327" cy="400" r="14" fill="#F59E0B"/>
      <circle cx="155" cy="335" r="10" fill="#FDE047" opacity="0.9"/>
      <circle cx="357" cy="335" r="10" fill="#FDE047" opacity="0.9"/>
    </svg>
  );
};
