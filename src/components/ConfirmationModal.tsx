import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  isLoading = false
}: ConfirmationModalProps) {
  const colors = {
    danger: {
      bg: 'bg-red-50',
      icon: 'text-red-500',
      button: 'bg-red-500 hover:bg-red-600 shadow-red-200'
    },
    warning: {
      bg: 'bg-amber-50',
      icon: 'text-amber-500',
      button: 'bg-amber hover:bg-amber/90 shadow-amber/20'
    },
    info: {
      bg: 'bg-blue-50',
      icon: 'text-blue-500',
      button: 'bg-navy hover:bg-navy/90 shadow-navy/20'
    }
  }[variant];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl text-center overflow-hidden"
          >
            <div className={cn("w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6", colors.bg, colors.icon)}>
              <AlertTriangle size={40} />
            </div>
            
            <h2 className="text-2xl font-black text-navy mb-4 tracking-tighter italic uppercase">{title}</h2>
            <p className="text-slate-500 font-medium mb-8 text-sm leading-relaxed">{message}</p>
            
            <div className="flex flex-col space-y-3">
              <button
                disabled={isLoading}
                onClick={() => {
                  onConfirm();
                  if (!isLoading) onClose();
                }}
                className={cn(
                  "w-full text-white font-black py-4 rounded-2xl transition-all shadow-xl disabled:opacity-50 uppercase tracking-widest text-[10px]",
                  colors.button
                )}
              >
                {isLoading ? 'A processar...' : confirmLabel}
              </button>
              <button
                disabled={isLoading}
                onClick={onClose}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-400 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px]"
              >
                {cancelLabel}
              </button>
            </div>

            <button 
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-slate-300 hover:text-navy transition-colors"
            >
              <X size={20} />
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
