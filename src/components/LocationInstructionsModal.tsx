import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Settings, RefreshCw, X } from 'lucide-react';
import { GradientButton } from './GradientButton';

interface LocationInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export function LocationInstructionsModal({ isOpen, onClose, onRetry }: LocationInstructionsModalProps) {
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
                📍 Location Access Required
              </h3>
              
              <div className="text-slate-400 text-sm font-medium leading-relaxed mb-8 text-left bg-white/5 p-6 rounded-3xl border border-white/5">
                <p className="mb-4">TukTrack needs your location to track your tuktuk in real time.</p>
                <p className="font-black text-[10px] uppercase tracking-widest text-amber mb-2">To fix this:</p>
                <ol className="space-y-1.5 text-xs">
                  <li>1. Close TukTrack</li>
                  <li>2. Open phone <span className="text-white">Settings</span></li>
                  <li>3. Tap <span className="text-white">Apps → TukTrack</span></li>
                  <li>4. Tap <span className="text-white">Permissions</span></li>
                  <li>5. Tap <span className="text-white">Location</span></li>
                  <li>6. Select <span className="text-amber">'Allow all the time'</span></li>
                  <li>7. Reopen TukTrack</li>
                </ol>
              </div>

              <div className="w-full space-y-3">
                <GradientButton 
                  label="OPEN SETTINGS" 
                  onClick={() => {
                    // This is a common pattern for opening app settings from webviews
                    window.location.href = 'app-settings:root=LOCATION';
                  }}
                  icon={<Settings size={18} />}
                  className="w-full h-14 rounded-2xl shadow-lg shadow-amber/20 font-black text-xs tracking-widest uppercase"
                />
                <button 
                  onClick={onRetry}
                  className="w-full h-14 bg-white/5 border border-white/10 text-white font-black text-xs tracking-widest uppercase rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center space-x-2"
                >
                  <RefreshCw size={18} />
                  <span>Try Again</span>
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
