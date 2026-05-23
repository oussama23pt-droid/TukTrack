/**
 * BackgroundLocationModal.tsx
 *
 * Replaces the inline background-location permission block in DriverDashboard.
 * Uses useAndroidPermissions so the native two-step flow is handled correctly.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin } from 'lucide-react';
import { useAndroidPermissions } from '../hooks/useAndroidPermissions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function BackgroundLocationModal({ isOpen, onClose, onDone }: Props) {
  const { requestBackgroundLocation } = useAndroidPermissions();

  const handleAllow = () => {
    onClose();
    requestBackgroundLocation(onDone);
    // If user takes > 20 s we still move on
    setTimeout(onDone, 20000);
  };

  const handleSkip = () => {
    onClose();
    onDone();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end justify-center p-6"
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl"
          >
            <div className="w-16 h-16 bg-amber/10 rounded-full flex items-center justify-center mx-auto mb-5 text-amber">
              <MapPin size={32} />
            </div>

            <h3 className="text-xl font-black text-navy text-center mb-2">
              Localização em Segundo Plano
            </h3>

            <p className="text-sm text-slate-500 text-center font-medium mb-6 leading-relaxed">
              Para partilhar a sua localização enquanto usa outras aplicações,
              o TukTrack precisa de acesso à localização em segundo plano.
              <br />
              <br />
              No próximo ecrã, selecione{' '}
              <strong className="text-navy">"Permitir sempre"</strong>.
            </p>

            <div className="bg-amber/5 border border-amber/20 rounded-2xl p-4 mb-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber mb-2">
                Passos:
              </p>
              <ol className="space-y-1.5 text-xs text-slate-600 font-medium">
                <li>1. Prima o botão abaixo — aparece um diálogo do sistema</li>
                <li>
                  2. Escolha{' '}
                  <strong className="text-navy">"Permitir sempre"</strong>
                </li>
                <li>3. Volte ao TukTrack — já está!</li>
              </ol>
            </div>

            <div className="flex flex-col space-y-3">
              <button
                onClick={handleAllow}
                className="w-full h-14 bg-amber text-navy font-black rounded-2xl shadow-lg shadow-amber/20 uppercase tracking-widest text-sm"
              >
                Permitir Localização em Segundo Plano
              </button>
              <button
                onClick={handleSkip}
                className="w-full h-12 text-slate-400 font-bold text-sm"
              >
                Continuar sem segundo plano
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
