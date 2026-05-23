/**
 * OverlayPermissionModal.tsx
 *
 * Replaces the inline overlay-permission block that was embedded in
 * DriverDashboard. Uses useAndroidPermissions so the bridge is always
 * ready before the button fires.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAndroidPermissions } from '../hooks/useAndroidPermissions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called when the driver grants or skips the permission */
  onDone: () => void;
}

export function OverlayPermissionModal({ isOpen, onClose, onDone }: Props) {
  const { requestOverlay } = useAndroidPermissions();

  const handleOpenSettings = () => {
    onClose(); // close modal first so it doesn't overlay the Settings screen
    requestOverlay(onDone);
    // If user skips / returns without granting we still call onDone after a delay
    setTimeout(onDone, 1500);
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
          className="fixed inset-0 z-[350] bg-navy/95 backdrop-blur-xl flex items-end justify-center p-6"
        >
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="bg-navy border border-white/10 rounded-[2rem] p-8 w-full max-w-md shadow-2xl"
          >
            <div className="w-20 h-20 bg-amber/10 rounded-[2rem] flex items-center justify-center mx-auto mb-5 border border-amber/20">
              <div className="text-4xl">📱</div>
            </div>

            <div className="flex items-center justify-center space-x-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber">
                Permissão Necessária
              </span>
            </div>

            <h3 className="text-2xl font-black text-white text-center mb-4 leading-tight italic">
              Manter App Visível
            </h3>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
              <p className="text-slate-300 text-sm font-medium leading-relaxed mb-4">
                Para que o TukTrack continue a funcionar enquanto usa outras
                aplicações, precisamos da permissão{' '}
                <strong className="text-amber">
                  "Superposição sobre outras apps"
                </strong>
                .
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber mb-2">
                No próximo ecrã:
              </p>
              <ol className="space-y-2">
                {[
                  <>Encontre <strong className="text-white">TukTrack</strong> na lista — toque nele</>,
                  <>Ative <strong className="text-amber">"Autorizar superposição"</strong></>,
                  <>Volte ao TukTrack e prima <strong className="text-white">GO!</strong></>,
                ].map((step, i) => (
                  <li key={i} className="flex items-start space-x-2">
                    <span className="text-amber font-black text-sm">{i + 1}.</span>
                    <span className="text-slate-300 text-xs font-medium">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-col space-y-3">
              <button
                onClick={handleOpenSettings}
                className="w-full h-14 bg-amber text-navy font-black rounded-2xl shadow-lg shadow-amber/30 uppercase tracking-widest text-sm"
              >
                Abrir Definições de Permissão
              </button>
              <button
                onClick={handleSkip}
                className="w-full h-12 text-slate-400 font-bold text-sm hover:text-slate-200 transition-colors"
              >
                Continuar sem esta permissão
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
