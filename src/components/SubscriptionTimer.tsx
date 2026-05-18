import React, { useState, useEffect } from 'react';
import { Clock, Loader2, Timer } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface SubscriptionTimerProps {
  currentPeriodEnd: any;
  className?: string;
}

export const SubscriptionTimer: React.FC<SubscriptionTimerProps> = ({ currentPeriodEnd, className }) => {
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!currentPeriodEnd) return;

    const interval = setInterval(() => {
      // Handle Firestore Timestamp vs Date string vs JSON Object
      const endDate = currentPeriodEnd.toDate ? 
        currentPeriodEnd.toDate() : 
        (currentPeriodEnd.seconds ? new Date(currentPeriodEnd.seconds * 1000) : new Date(currentPeriodEnd));
      
      const total = endDate.getTime() - Date.now();

      if (total <= 0) {
        setTimeLeft(null);
        clearInterval(interval);
        return;
      }

      const days = Math.floor(total / (1000 * 60 * 60 * 24));
      const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((total / 1000 / 60) % 60);
      const seconds = Math.floor((total / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds });
    }, 1000);

    return () => clearInterval(interval);
  }, [currentPeriodEnd]);

  if (!timeLeft) return null;

  const isUrgent = timeLeft.days < 2;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "flex items-center space-x-3 px-4 py-2 bg-navy border border-amber/30 rounded-2xl shadow-xl shadow-amber/5 relative overflow-hidden group",
        isUrgent && "border-amber/60 animate-pulse",
        className
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-amber/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className={cn(
        "w-8 h-8 rounded-xl bg-amber/10 flex items-center justify-center text-amber relative z-10",
        isUrgent && "bg-amber/20"
      )}>
        <Timer size={16} className={isUrgent ? "animate-pulse" : ""} />
      </div>
      
      <div className="flex items-center space-x-1 relative z-10">
        <TimeUnit value={timeLeft.days} label="D" />
        <span className="text-amber/30 font-black">:</span>
        <TimeUnit value={timeLeft.hours} label="H" />
        <span className="text-amber/30 font-black">:</span>
        <TimeUnit value={timeLeft.minutes} label="M" />
        {isUrgent && (
          <>
            <span className="text-amber/30 font-black">:</span>
            <div className="flex flex-col items-center bg-amber/5 px-2 py-0.5 rounded-lg border border-amber/10">
              <span className="text-sm font-black text-amber w-6 text-center tabular-nums leading-none mb-0.5">
                {timeLeft.seconds.toString().padStart(2, '0')}
              </span>
              <span className="text-[7px] font-black text-amber/60 uppercase leading-none tracking-widest">SEC</span>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
};

const TimeUnit = ({ value, label }: { value: number; label: string }) => (
  <div className="flex flex-col items-center min-w-[24px]">
    <span className="text-sm font-black text-white text-center tabular-nums leading-none mb-0.5">
      {value.toString().padStart(2, '0')}
    </span>
    <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">{label}</span>
  </div>
);
