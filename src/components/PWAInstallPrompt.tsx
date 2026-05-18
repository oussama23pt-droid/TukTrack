import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { useInstall } from '../features/auth/InstallContext';

export function PWAInstallPrompt() {
  const { deferredPrompt, isIOS, isStandalone, handleInstallClick } = useInstall();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (isStandalone) return;

    // Delay showing the prompt to not annoy the user immediately
    const timer = setTimeout(() => {
      if (deferredPrompt || isIOS) {
        setShowPrompt(true);
      }
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [deferredPrompt, isIOS, isStandalone]);

  if (!showPrompt || isStandalone) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-4 right-4 z-50 md:left-auto md:right-6 md:w-96"
      >
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 text-white overflow-hidden relative">
          {/* Background Highlight */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl -mr-16 -mt-16 rounded-full" />
          
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
              <Download className="w-6 h-6 text-slate-900" />
            </div>
            
            <div className="flex-1">
              <h3 className="font-bold text-lg leading-tight">Instalar TukTrack</h3>
              <p className="text-slate-400 text-sm mt-1">
                Instale a aplicação para uma experiência mais rápida e acesso offline.
              </p>
              
              {isIOS ? (
                <div className="mt-3 text-xs text-slate-300 bg-slate-800/50 p-2 rounded-lg">
                  Toque em <span className="font-bold">Partilhar</span> e depois em <span className="font-bold">Ecrã Principal</span>.
                </div>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      handleInstallClick();
                      setShowPrompt(false);
                    }}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold py-2 px-4 rounded-xl transition-colors text-sm"
                  >
                    Instalar Agora
                  </button>
                  <button
                    onClick={() => setShowPrompt(false)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-4 rounded-xl transition-colors text-sm"
                  >
                    Depois
                  </button>
                </div>
              )}
            </div>
            
            {isIOS && (
              <button 
                onClick={() => setShowPrompt(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
