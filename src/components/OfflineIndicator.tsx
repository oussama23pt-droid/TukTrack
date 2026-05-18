import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-4 left-0 right-0 z-[9999] flex justify-center px-4 pointer-events-none"
        >
          <div className="bg-red-500 text-white px-6 py-3 rounded-2xl shadow-xl flex items-center space-x-3 border border-red-400/50 backdrop-blur-md">
            <WifiOff size={20} className="animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest">Sem Ligação</span>
              <span className="text-[10px] font-bold opacity-80 uppercase tracking-tighter italic">Verifique o seu sinal GPS/Internet</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
