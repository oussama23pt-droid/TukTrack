import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, CheckCircle2 } from 'lucide-react';

interface SuccessCelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  slots: number;
}

export function SuccessCelebrationModal({ isOpen, onClose, planName, slots }: SuccessCelebrationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-[2.5rem] overflow-hidden shadow-2xl"
          >
            <div className="bg-gradient-to-br from-amber to-amber-600 p-8 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -ml-16 -mt-16 blur-3xl animate-pulse" />
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-navy rounded-full -mr-16 -mb-16 blur-3xl" />
              </div>
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 12, delay: 0.2 }}
                className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/30"
              >
                <Trophy className="w-12 h-12 text-white" />
              </motion.div>
              <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Plano Ativado!</h2>
              <p className="text-white/80 font-bold uppercase tracking-widest text-[10px]">Parabéns pelo seu upgrade</p>
            </div>
            
            <div className="p-8 text-center">
              <p className="text-slate-600 font-medium mb-8 leading-relaxed">
                A sua conta agora está no nível <span className="text-navy font-black">{planName}</span>. 
                Desbloqueou <span className="text-amber font-black">{slots}</span> slots de veículos para levar a sua operação ao máximo!
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center space-x-2 text-amber mb-1">
                    <CheckCircle2 size={14} />
                    <span className="text-[10px] font-black uppercase">Vantagem</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">Slots: {slots}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center space-x-2 text-amber mb-1">
                    <CheckCircle2 size={14} />
                    <span className="text-[10px] font-black uppercase">Vantagem</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800">Suporte Pro</p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full bg-gradient-to-r from-navy to-navy-lighter text-white rounded-2xl py-4 font-black transition-all shadow-xl shadow-navy/20 hover:scale-[1.02] active:scale-[0.98]"
              >
                COMEÇAR A GERIR FROTA
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
