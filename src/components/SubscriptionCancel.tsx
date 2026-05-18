import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { XCircle, ArrowLeft } from 'lucide-react';

export const SubscriptionCancel: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center"
      >
        <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-rose-600" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 mb-2">Checkout Cancelled</h1>
        <p className="text-slate-600 mb-8">
          The subscription process was cancelled. No charges were made to your account.
        </p>

        <button
          onClick={() => navigate('/manager/billing')}
          className="w-full flex items-center justify-center bg-slate-100 text-slate-700 rounded-2xl py-4 font-bold hover:bg-slate-200 transition-all"
        >
          <ArrowLeft className="mr-2 w-5 h-5" />
          Back to Plans
        </button>
      </motion.div>
    </div>
  );
};
