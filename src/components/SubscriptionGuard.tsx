import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CreditCard, Loader2 } from 'lucide-react';
import { subscriptionService, ManagerSubscription } from '../services/subscriptionService';
import { PaywallScreen } from './PaywallScreen';
import { useAuth } from '../features/auth/AuthContext';

interface SubscriptionGuardProps {
  managerId: string | undefined;
  children: React.ReactNode;
}

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({ managerId, children }) => {
  const navigate = useNavigate();
  const { userData, loading: authLoading, isPro } = useAuth();
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const isSuccessRedirect = window.location.search.includes('success=true');
  const isSyncing = isSuccessRedirect && (!userData || (userData.subscriptionStatus !== 'active' && userData.subscriptionStatus !== 'trial'));

  if (authLoading || isSyncing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-12 text-center">
        <div className="relative mb-8">
          <Loader2 className="w-16 h-16 animate-spin text-navy opacity-20" />
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 180, 360]
            }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <CreditCard className="w-6 h-6 text-navy" />
          </motion.div>
        </div>
        <h2 className="text-xl font-black text-navy uppercase tracking-tight mb-2">A Sincronizar Pagamento</h2>
        <p className="text-slate-500 font-bold max-w-xs mx-auto text-sm leading-relaxed">
          Recebemos a confirmação do Stripe. Estamos a atualizar a sua conta com os novos benefícios...
        </p>
      </div>
    );
  }

  if (!managerId) {
    return (
      <div className="p-8 text-center bg-amber-50 rounded-2xl border border-amber-200">
        <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-amber-900">Nenhum Gestor Selecionado</h3>
        <p className="text-amber-700 mt-2">Por favor, selecione uma conta para gerir.</p>
      </div>
    );
  }

  const status = userData?.subscriptionStatus || 'none';
  const now = new Date();
  const periodEnd = userData?.currentPeriodEnd ? new Date(userData.currentPeriodEnd) : null;
  const isExpired = periodEnd ? now > periodEnd : false;

  // If expired and not a free plan
  if (isExpired && userData?.planId && userData.planId !== 'free') {
    return (
      <div className="space-y-6">
        <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 shadow-sm max-w-2xl mx-auto mt-20">
          <div className="w-20 h-20 bg-amber/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-amber" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">O Período da Subscrição Terminou</h2>
          <p className="text-slate-600 mb-8 font-medium">
            A sua subscrição do plano <span className="text-navy font-bold">{userData.planId.toUpperCase()}</span> expirou. 
            A sua conta foi colocada em pausa até que o pagamento da renovação seja processado.
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                setIsOpeningPortal(true);
                try {
                  await subscriptionService.openBillingPortal(managerId);
                } finally {
                  setIsOpeningPortal(false);
                }
              }}
              disabled={isOpeningPortal}
              className="w-full flex items-center justify-center bg-navy text-white rounded-2xl py-4 font-bold hover:bg-slate-800 transition-colors shadow-lg"
            >
              {isOpeningPortal ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <CreditCard className="w-5 h-5 mr-2" />
              )}
              Renovar Agora
            </button>
            <button
              onClick={() => navigate('/manager/billing')}
              className="w-full flex items-center justify-center bg-white text-slate-600 border border-slate-200 rounded-2xl py-4 font-bold hover:bg-slate-50 transition-colors"
            >
              Ver Outros Planos
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active or Trial: Full access
  if (isPro || status === 'active' || status === 'trial' || status === 'cancelling' || status === 'none') {
    return (
      <>
        {status === 'past_due' && (
          <PaymentFailedBanner 
            managerId={managerId} 
            isOpeningPortal={isOpeningPortal}
            setOpeningPortal={setIsOpeningPortal}
          />
        )}
        {status === 'none' && (
          <NoSubscriptionBanner />
        )}
        {children}
      </>
    );
  }

  // Payment Failed: Show banner but maybe limited access? 
  // User request: "If 'payment_failed': show payment failed banner with 'Update Payment' button"
  if (status === 'payment_failed' || status === 'past_due' || status === 'unpaid') {
    return (
      <div className="space-y-6">
        <PaymentFailedBanner 
          managerId={managerId} 
          isOpeningPortal={isOpeningPortal}
          setOpeningPortal={setIsOpeningPortal}
        />
        {/* We can still show children OR show paywall depending on severity. */}
        <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 shadow-sm max-w-2xl mx-auto mt-20">
          <AlertCircle className="w-16 h-16 text-rose-600 mx-auto mb-6" />
          <h2 className="text-2xl font-black text-slate-900 mb-2">Subscrição Suspensa</h2>
          <p className="text-slate-600 mb-8">
            O seu pagamento recente falhou. Por favor, atualize os seus dados de pagamento para restaurar o acesso às ferramentas de gestão.
          </p>
          <button
            onClick={async () => {
              setIsOpeningPortal(true);
              try {
                await subscriptionService.openBillingPortal(managerId);
              } finally {
                setIsOpeningPortal(false);
              }
            }}
            disabled={isOpeningPortal}
            className="w-full flex items-center justify-center bg-rose-600 text-white rounded-2xl py-4 font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200"
          >
            {isOpeningPortal ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <CreditCard className="w-5 h-5 mr-2" />
            )}
            Atualizar Método de Pagamento
          </button>
        </div>
      </div>
    );
  }

  // Expired, Cancelled, or None: Show Paywall
  return <PaywallScreen managerId={managerId} />;
};

const PaymentFailedBanner: React.FC<{ 
  managerId: string; 
  isOpeningPortal: boolean;
  setOpeningPortal: (val: boolean) => void;
}> = ({ managerId, isOpeningPortal, setOpeningPortal }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-rose-600 text-white px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-0 z-50 shadow-xl"
    >
      <div className="flex items-center space-x-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div>
          <p className="font-bold">Payment Action Required</p>
          <p className="text-sm text-rose-100">Your subscription is at risk. Please update your card details.</p>
        </div>
      </div>
      <button
        onClick={async () => {
          setOpeningPortal(true);
          try {
            await subscriptionService.openBillingPortal(managerId);
          } finally {
            setOpeningPortal(false);
          }
        }}
        disabled={isOpeningPortal}
        className="bg-white text-rose-600 px-6 py-2 rounded-xl text-sm font-black hover:bg-slate-100 transition-all shadow-md flex items-center shrink-0"
      >
        {isOpeningPortal ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CreditCard className="w-4 h-4 mr-2" />}
        Update Payment
      </button>
    </motion.div>
  );
};

const NoSubscriptionBanner: React.FC = () => {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-amber-500 text-navy px-6 py-3 flex items-center justify-center gap-3 sticky top-0 z-50 shadow-md"
    >
      <AlertCircle className="h-5 w-5 shrink-0" />
      <p className="font-bold text-sm text-center">
        A sua conta está em Modo Grátis. <span className="hidden sm:inline">Subscreva um plano para começar a adicionar veículos.</span>
      </p>
      <button 
        onClick={() => navigate('/manager/billing')}
        className="bg-navy text-white px-4 py-1.5 rounded-xl text-xs font-black hover:bg-slate-800 transition-all shadow-lg shrink-0"
      >
        ESCOLHER PLANO
      </button>
    </motion.div>
  );
};
