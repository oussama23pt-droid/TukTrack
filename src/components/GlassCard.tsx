import React from 'react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export interface GlassCardProps {
  children: React.ReactNode;
  onTap?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export function GlassCard({ children, className, onTap, ...props }: GlassCardProps) {
  return (
    <motion.div
      whileHover={onTap ? { scale: 1.01 } : undefined}
      whileTap={onTap ? { scale: 0.98 } : undefined}
      onClick={onTap}
      className={cn(
        "relative overflow-hidden rounded-card border border-white/40 bg-white/60 p-4 backdrop-blur-xl transition-all shadow-sm hover:shadow-xl hover:shadow-amber/5 group",
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
