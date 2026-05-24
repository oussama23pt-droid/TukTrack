import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Users, Map as MapIcon, BarChart, Settings, LogOut, Shield, Briefcase, Activity, CreditCard, Menu, X, Lock, Timer as TimerIcon, Download, MessageCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';
import { useAuth } from '../features/auth/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { TukTukLogo } from '../components/TukTukLogo';
import { SubscriptionTimer } from './SubscriptionTimer';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

export default function DashboardLayout({ children, role }: { children: React.ReactNode, role: 'manager' | 'driver' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userData, loading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/');
      } else if (!userData) {
        // Only redirect to select if not already in auth flow (though DashboardLayout shouldn't be used there)
        if (!location.pathname.includes('/register/select')) {
          navigate('/register/select');
        }
      } else if (userData && userData.role) {
        const isManagerRoute = role === 'manager';
        const userIsManager = ['owner', 'manager'].includes(userData.role);
        const userIsDriver = userData.role === 'driver';

        if (isManagerRoute && !userIsManager) {
          navigate('/driver/dashboard');
        } else if (!isManagerRoute && !userIsDriver) {
          navigate('/manager/dashboard');
        }
      }
    }
  }, [user, userData, loading, navigate, role, location.pathname]);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/');
  };

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber border-t-transparent"></div>
      </div>
    );
  }

  if (!user) return null;

  const navItems = role === 'manager' ? [
    { icon: Lock, label: t('reservations'), path: '#', comingSoon: true },
    { icon: Home, label: t('dashboard'), path: '/manager/dashboard' },
    { icon: Shield, label: t('vehicles'), path: '/manager/vehicles' },
    { icon: Users, label: t('drivers'), path: '/manager/drivers' },
    { icon: Activity, label: t('trips_routes'), path: '/manager/trips' },
    { icon: MapIcon, label: t('map'), path: '/manager/map' },
    { icon: BarChart, label: t('reports'), path: '/manager/reports' },
    { icon: CreditCard, label: t('subscription'), path: '/manager/billing' },
    { icon: MessageCircle, label: 'Mensagens', path: '/manager/messages' },
    { icon: Settings, label: t('settings'), path: '/manager/settings' },
  ] : [
    { icon: Home, label: t('home'), path: '/driver/dashboard' },
    { icon: MapIcon, label: t('trips_routes'), path: '/driver/trips' },
    { icon: BarChart, label: t('earnings'), path: '/driver/earnings' },
    { icon: MessageCircle, label: 'Mensagens', path: '/driver/messages' },
    { icon: Settings, label: t('settings'), path: '/driver/settings' },
  ];

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500">
      {/* Background patterns for 3D effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-amber/10 blur-[120px] rounded-full" />
        <div className="absolute top-[60%] -right-[10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full" />
      </div>

      {/* Sidebar for desktop */}
      <aside className="hidden w-72 p-8 lg:flex flex-col border-r shadow-[20px_0_40px_rgba(0,0,0,0.02)] z-20 bg-white/40 backdrop-blur-3xl border-white/40 sticky top-0 h-screen">
        <div className="flex items-center space-x-3 mb-12">
          <TukTukLogo className="w-10 h-10" />
          <div>
            <h2 className="font-display text-2xl font-black text-navy italic tracking-tighter leading-none">TukTrack</h2>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{t('fleet_management')}</p>
          </div>
        </div>
        
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              disabled={item.comingSoon}
              onClick={() => !item.comingSoon && navigate(item.path)}
              className={cn(
                "flex w-full items-center justify-between px-5 py-3.5 rounded-2xl transition-all duration-300 font-display group relative",
                location.pathname === item.path 
                  ? "bg-navy text-white font-bold shadow-2xl shadow-navy/20 scale-[1.02] ring-1 ring-white/10" 
                  : item.comingSoon 
                    ? "opacity-40 cursor-not-allowed text-slate-400"
                    : "text-slate-500 hover:text-navy hover:bg-white/60 hover:shadow-sm"
              )}
            >
              <div className="flex items-center space-x-4">
                <item.icon size={18} className={cn(
                  "transition-all duration-300",
                  location.pathname === item.path ? "text-amber" : "text-slate-400 group-hover:text-amber group-hover:scale-110"
                )} />
                <span className="text-[13px] font-bold tracking-tight">{item.label}</span>
              </div>
              {item.comingSoon ? (
                <span className="text-[7px] font-black uppercase tracking-widest bg-slate-100 text-slate-400 px-2 py-0.5 rounded-lg">Soon</span>
              ) : location.pathname === item.path && (
                <motion.div layoutId="active-pill" className="w-1.5 h-1.5 rounded-full bg-amber shadow-[0_0_8px_rgba(245,158,11,1)]" />
              )}
            </button>
          ))}

          {deferredPrompt && !isStandalone && (
            <button
              onClick={handleInstallClick}
              className="flex w-full items-center space-x-4 px-5 py-3.5 rounded-2xl text-amber bg-amber/10 border border-amber/20 mt-4 animate-pulse group hover:bg-amber hover:text-navy transition-all duration-500"
            >
              <Download size={18} className="group-hover:scale-125 transition-transform" />
              <span className="text-[13px] font-black uppercase tracking-widest italic leading-none">Instalar App</span>
            </button>
          )}
        </nav>
        
          <div className="flex flex-col space-y-4 pt-8 border-t border-slate-100/50">
            <div className="flex items-center justify-between px-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('language')}</span>
              <LanguageSwitcher />
            </div>
            
            {userData?.planId && userData?.planId !== 'free' && userData?.currentPeriodEnd && (
              <div className="px-2">
                <SubscriptionTimer currentPeriodEnd={userData.currentPeriodEnd} className="w-full bg-navy/5 border-navy/10" />
              </div>
            )}
            <div className="p-4 rounded-2xl bg-navy/5 border border-navy/5">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy">
                <Users size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-navy truncate">{userData?.name}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{userData?.role}</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-5 py-3 text-slate-400 hover:text-red-500 transition-all font-bold text-sm w-full rounded-xl hover:bg-red-50/50"
          >
            <LogOut size={18} />
            <span>{t('logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto relative z-10">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between mb-6 h-12 bg-white/50 backdrop-blur-md px-4 rounded-2xl border border-white/20">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-amber hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">TukTrack</h2>
          </div>
          <div className="w-10"></div>
        </header>

        <AnimatePresence>
          {toast && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-navy text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-navy/60 backdrop-blur-md z-[60] lg:hidden"
              />
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 left-0 bottom-0 w-[300px] shadow-3xl z-[70] p-8 lg:hidden flex flex-col bg-white overflow-hidden"
              >
                {/* Decorative background for mobile sidebar */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber/5 rounded-full -translate-y-12 translate-x-12 blur-3xl" />
                
                <div className="flex items-center justify-between mb-12 relative z-10">
                  <div className="flex items-center space-x-3">
                    <TukTukLogo className="w-10 h-10" />
                    <h2 className="font-display text-2xl font-black text-navy italic tracking-tighter">TukTrack</h2>
                  </div>
                  <button 
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 text-slate-300 hover:text-navy transition-colors"
                  >
                    <X size={28} />
                  </button>
                </div>

                <nav className="flex-1 space-y-2 overflow-y-auto relative z-10">
                  {navItems.map((item) => (
                    <button
                      key={item.label}
                      disabled={item.comingSoon}
                      onClick={() => {
                        if (!item.comingSoon) {
                          navigate(item.path);
                          setIsMobileMenuOpen(false);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-6 py-4 rounded-[1.25rem] transition-all duration-300 font-display",
                        location.pathname === item.path 
                          ? "bg-navy shadow-2xl shadow-navy/20 text-white font-bold scale-[1.02]" 
                          : item.comingSoon
                            ? "opacity-40 cursor-not-allowed text-slate-400"
                            : "text-slate-500 hover:bg-slate-50 hover:text-navy"
                      )}
                    >
                      <div className="flex items-center space-x-4">
                        <item.icon size={20} className={cn(
                          "transition-all",
                          location.pathname === item.path ? "text-amber" : "text-amber/40"
                        )} />
                        <span className="text-[15px] font-bold tracking-tight">{item.label}</span>
                      </div>
                      {item.comingSoon ? (
                        <span className="text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-400 px-2.5 py-1 rounded-lg">Soon</span>
                      ) : location.pathname === item.path && (
                        <div className="w-2 h-2 rounded-full bg-amber shadow-[0_0_10px_rgba(245,158,11,1)]" />
                      )}
                    </button>
                  ))}

                  {deferredPrompt && !isStandalone && (
                    <button
                      onClick={handleInstallClick}
                      className="flex w-full items-center space-x-4 px-6 py-4 rounded-[1.25rem] text-amber bg-amber/10 border border-amber/20 mt-4 animate-pulse group active:scale-95"
                    >
                      <Download size={20} />
                      <span className="text-[15px] font-black uppercase tracking-widest italic leading-none">Instalar App</span>
                    </button>
                  )}
                </nav>

                <div className="mt-auto pt-8 border-t border-slate-100 relative z-10">
                  <div className="flex items-center justify-between px-2 mb-6">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('language')}</span>
                    <LanguageSwitcher />
                  </div>

                  <div className="flex items-center space-x-4 mb-8 bg-slate-50 p-4 rounded-2xl">
                    <div className="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center text-navy ring-4 ring-navy/5">
                      <Users size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-black text-navy">{userData?.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{userData?.role}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center space-x-4 px-6 py-4 text-slate-400 hover:text-red-500 w-full rounded-2xl transition-all hover:bg-red-50"
                  >
                    <LogOut size={20} />
                    <span className="font-display font-black text-xs uppercase tracking-[0.2em]">{t('logout')}</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <div className="flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
