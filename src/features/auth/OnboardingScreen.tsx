import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { GradientButton } from '../../components/GradientButton';
import { cn } from '../../lib/utils';
import { useAuth } from './AuthContext';
import { query, collection, where, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { TukTukLogo } from '../../components/TukTukLogo';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, userData, loading } = useAuth();
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    async function checkPendingDriver() {
      if (!loading && user && !userData && !isMigrating) {
        setIsMigrating(true);
        try {
          const q = query(collection(db, 'users'), where('email', '==', user.email?.toLowerCase()), where('role', '==', 'driver'), where('uid', '==', ''));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const placeholder = snap.docs[0];
            const pData = placeholder.data();
            
            await setDoc(doc(db, 'users', user.uid), {
              ...pData,
              uid: user.uid,
              id: user.uid,
              updatedAt: new Date().toISOString()
            });
            
            if (placeholder.id !== user.uid) {
              await deleteDoc(doc(db, 'users', placeholder.id));
            }
            // Navigate will happen automatically because AuthContext will update
          }
        } catch (err: any) {
          if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
            // For onboarding, if we can't see the placeholder, maybe it's not ours or already migrated
            console.warn('Onboarding migration check failed with permission error - likely no placeholder found or already migrated');
          } else {
            console.error('Migration error in onboarding:', err);
          }
        } finally {
          setIsMigrating(false);
        }
      }
    }
    checkPendingDriver();
  }, [user, userData, loading, navigate]);

  if (isMigrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-600 font-bold">{t('configuring_account')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 p-6 text-slate-800 text-center justify-center relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute top-3 right-3 sm:top-8 sm:right-8 z-50">
        <LanguageSwitcher />
      </div>

      <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber/10 blur-[100px] rounded-full" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/5 blur-[120px] rounded-full" />

      <header className="mb-12 relative z-10 flex flex-col items-center">
        <TukTukLogo className="w-20 h-20 mb-6" />
        <h1 className="font-display text-4xl font-black mb-2 text-slate-900 tracking-tighter italic">TukTrack</h1>
        <p className="text-slate-500 font-medium">{t('selecting_profile')}</p>
      </header>

      <div className="max-w-sm mx-auto w-full relative z-10">
        <div className="grid grid-cols-1 gap-6">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/auth/manager/register')}
            className="group flex flex-col items-center p-8 bg-white border border-slate-200 hover:border-amber rounded-[2.5rem] transition-all shadow-2xl shadow-slate-200/50"
          >
            <div className="text-4xl mb-4 p-5 bg-slate-50 rounded-3xl group-hover:bg-amber/10 transition-colors border border-slate-100 group-hover:border-amber/20">🏢</div>
            <span className="text-xl font-black text-slate-900 tracking-tight">{t('i_am_manager')}</span>
            <span className="text-xs text-slate-500 mt-2 font-bold uppercase tracking-widest px-4">{t('manager_description')}</span>
          </motion.button>
          
          <div className="p-8 bg-white border border-dashed border-slate-300 rounded-[2.5rem] relative overflow-hidden opacity-90 flex flex-col items-center">
            <TukTukLogo variant="icon" className="w-12 h-12 mb-4 text-slate-300 grayscale" />
            <span className="text-xl font-black text-slate-400 tracking-tight">{t('i_am_driver')}</span>
            <p className="text-[10px] text-slate-400 mt-3 mb-6 font-black uppercase tracking-[0.15em] leading-relaxed px-4">
              {t('driver_onboarding_note')}
            </p>
            <button 
              onClick={() => navigate('/')}
              className="inline-block py-3 px-8 bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-navy hover:text-white"
            >
              {t('go_to_login')}
            </button>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-200">
          <button 
            onClick={() => navigate('/')}
            className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-amber transition-colors"
          >
            {t('have_account')} <span className="text-navy">{t('do_login')}</span>
          </button>
          <div className="mt-4">
            <Link 
              to="/legal/privacy" 
              className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300 hover:text-amber transition-colors"
            >
              {t('privacy_and_data')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
