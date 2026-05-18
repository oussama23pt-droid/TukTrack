import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, X, ShieldCheck } from 'lucide-react';
import { GradientButton } from './GradientButton';

interface LocationPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAllow: () => void;
}

export function LocationPermissionModal({ isOpen, onClose, onAllow }: LocationPermissionModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6">
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
            className="relative w-full max-w-sm bg-navy border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
            {/* Background elements */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />

            <div className="relative flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-amber rounded-[2rem] flex items-center justify-center mb-6 shadow-xl shadow-amber/20">
                <MapPin size={40} className="text-navy" />
              </div>

              <div className="flex items-center space-x-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber">Permissão Necessária</span>
                <ShieldCheck size={12} className="text-amber" />
              </div>
              
              <h3 className="text-2xl font-black text-white mb-4 leading-tight italic">
                Rastreio em Tempo Real
              </h3>
              
              <p className="text-slate-400 text-sm font-medium leading-relaxed mb-8">
                O TukTrack necessita da sua localização para que o gestor possa acompanhar o seu tuktuk em tempo real no mapa e garantir a segurança da operação.
              </p>

              <div className="w-full space-y-3">
                <GradientButton 
                  label="PERMITIR LOCALIZAÇÃO" 
                  onClick={onAllow}
                  className="w-full h-14 rounded-2xl shadow-lg shadow-amber/20 font-black text-xs tracking-widest uppercase"
                />
                <button 
                  onClick={onClose}
                  className="w-full h-14 bg-white/5 border border-white/10 text-white font-black text-xs tracking-widest uppercase rounded-2xl hover:bg-white/10 transition-all"
                >
                  Agora Não
                </button>
              </div>
              
              <p className="mt-6 text-[9px] text-slate-500 font-bold uppercase tracking-widest leading-normal">
                Pode desativar isto a qualquer momento<br />nas definições do seu navegador.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
