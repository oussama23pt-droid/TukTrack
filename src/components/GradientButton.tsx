import React from 'react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export interface GradientButtonProps {
  label?: string;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  isLoading?: boolean;
  isDestructive?: boolean;
  isSecondary?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
}

export function GradientButton({
  label,
  children,
  icon,
  isLoading,
  isDestructive,
  isSecondary,
  className,
  type = 'button',
  ...props
}: GradientButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.01, translateY: -1 }}
      whileTap={{ scale: 0.98 }}
      type={type}
      className={cn(
        "flex h-14 w-full items-center justify-center rounded-2xl font-display font-black text-[10px] uppercase tracking-[0.2em] transition-all disabled:opacity-50 space-x-2 border-b-4 active:border-b-0",
        isDestructive
          ? "bg-red-600 border-red-800 text-white shadow-lg shadow-red-600/20"
          : isSecondary
            ? "bg-white border-slate-200 text-slate-900 shadow-sm hover:border-amber/50"
            : "bg-amber border-amber-600 text-navy shadow-xl shadow-amber/20 hover:shadow-amber/30",
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <>
          {icon && <span>{icon}</span>}
          {children || label}
        </>
      )}
    </motion.button>
  );
}
