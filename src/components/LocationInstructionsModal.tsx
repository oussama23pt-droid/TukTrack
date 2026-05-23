import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Settings, RefreshCw, X } from 'lucide-react';
import { GradientButton } from './GradientButton';

interface LocationInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
}

// Wait for AndroidBridge to be injected by MainActivity (fires after page load)
function waitForBridge(cb: () => void, maxMs = 4000) {
  if ((window as any).AndroidBridge) { cb(); return; }
  const start = Date.now();
  const id = setInterval(() => {
    if ((window as any).AndroidBridge || Date.now() - start > maxMs) {
      clearInterval(id);
      if ((window as any).AndroidBridge) cb();
    }
  }, 100);
}

export function LocationInstructionsModal({
  isOpen,
  onClose,
  onRetry,
}: LocationInstructionsModalProps) {
  const [bridgeReady, setBridgeReady] = useState(
    !!(window as any).AndroidBridge
  );

  useEffect(() => {
    if (bridgeReady) return;
    // Listen for the event fired by MainActivity's onPageFinished injection
    const handler = () => setBridgeReady(true);
    window.addEventListener('androidBridgeReady', handler);
    waitForBridge(() => setBridgeReady(true));
    return () => window.removeEventListener('androidBridgeReady', handler);
  }, [bridgeReady]);

  const openSettings = () => {
    const bridge = (window as any).AndroidBridge;
    if (bridge) {
      // Prefer the direct location-settings shortcut added in the fixed MainActivity
      if (typeof bridge.openLocationSettings === 'function') {
        bridge.openLocationSettings();
      } else {
        bridge.openAppSettings();
      }
    } else {
      // Fallback for web / non-Android
      alert(
        'Vá a: Definições → Aplicações → TukTrack → Permissões → Localização → Permitir sempre'
      );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-navy/95 backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-navy border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
            <div className="relative flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-[2rem] flex items-center justify-center mb-6 border border-red-500/30">
                <MapPin size={40} className="text-red-500" />
              </div>

              <h3 className="text-2xl font-black text-white mb-4 leading-tight italic">
                📍 Localização Necessária
              </h3>

              <div className="text-slate-400 text-sm font-medium leading-relaxed mb-8 text-left bg-white/5 p-6 rounded-3xl border border-white/5 w-full">
                <p className="mb-4">
                  O TukTrack precisa de acesso à localização para rastrear o
                  seu tuktuk em tempo real.
                </p>
                <p className="font-black text-[10px] uppercase tracking-widest text-amber mb-3">
                  Para corrigir isto:
                </p>
                <ol className="space-y-2 text-xs">
                  <li>
                    1. Prima{' '}
                    <span className="text-white font-bold">
                      "Abrir Definições"
                    </span>{' '}
                    abaixo
                  </li>
                  <li>
                    2. Toque em{' '}
                    <span className="text-white font-bold">Permissões</span>
                  </li>
                  <li>
                    3. Toque em{' '}
                    <span className="text-white font-bold">Localização</span>
                  </li>
                  <li>
                    4. Selecione{' '}
                    <span className="text-amber font-bold">
                      "Permitir sempre"
                    </span>
                  </li>
                  <li>5. Volte ao TukTrack e prima Tentar Novamente</li>
                </ol>
              </div>

              <div className="w-full space-y-3">
                <GradientButton
                  label="ABRIR DEFINIÇÕES"
                  onClick={openSettings}
                  icon={<Settings size={18} />}
                  className="w-full h-14 rounded-2xl shadow-lg shadow-amber/20 font-black text-xs tracking-widest uppercase"
                />
                <button
                  onClick={onRetry}
                  className="w-full h-14 bg-white/5 border border-white/10 text-white font-black text-xs tracking-widest uppercase rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center space-x-2"
                >
                  <RefreshCw size={18} />
                  <span>Tentar Novamente</span>
                </button>
              </div>

              <button
                onClick={onClose}
                className="mt-6 text-slate-500 hover:text-white transition-colors p-2"
              >
                <X size={24} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
