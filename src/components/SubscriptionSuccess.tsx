import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cn } from '../lib/utils';

export const SubscriptionSuccess: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const managerId = searchParams.get('managerId');
  const [slots, setSlots] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!managerId) {
      setLoading(false);
      return;
    }

    const fetchSlots = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', managerId));
        if (userDoc.exists()) {
          setSlots(userDoc.data().vehicleSlots || 0);
        }
      } catch (error) {
        console.error("Error fetching account slots:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [managerId]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 p-8 text-center relative overflow-hidden"
      >
        {/* Celebration Background Elements */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 via-indigo-500 to-purple-500" />
        
        <div className="relative z-10">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.2 }}
            className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative"
          >
            <CheckCircle2 className="w-12 h-12 text-emerald-600" />
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-2 border-emerald-500 border-dashed rounded-full opacity-20"
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-black text-slate-900 mb-2"
          >
            Subscription Secured!
          </motion.h1>

          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center py-4"
              >
                <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
                <span className="text-slate-500 text-sm">Configuring your fleet...</span>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <div className="bg-emerald-50 rounded-2xl p-4 mb-8">
                  <div className="flex items-center justify-center mb-1">
                    <Sparkles className="w-4 h-4 text-emerald-600 mr-2" />
                    <span className="text-emerald-900 font-bold text-lg">
                      {slots !== null ? `${slots} vehicle slots unlocked!` : "Plan activated!"}
                    </span>
                  </div>
                  <p className="text-emerald-700 text-sm">
                    You can now add more vehicles and scale your operations.
                  </p>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={() => navigate('/manager/dashboard')}
                    className="w-full flex items-center justify-center bg-slate-900 text-white rounded-2xl py-4 font-bold hover:bg-slate-800 transition-all shadow-lg hover:shadow-indigo-100 group"
                  >
                    Go to Dashboard
                    <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>
                  
                  <p className="text-slate-400 text-xs">
                    Confirmation email sent to your inbox.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-emerald-50 rounded-full blur-3xl" />
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-indigo-50 rounded-full blur-3xl" />
      </motion.div>
    </div>
  );
};
