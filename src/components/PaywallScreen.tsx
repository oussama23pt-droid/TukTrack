import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Info, Rocket, Shield, Zap, Database, Crown, ArrowRight, RefreshCcw } from 'lucide-react';
import { subscriptionService } from '../services/subscriptionService';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';

interface Plan {
  id: string;
  name: string;
  slots: number;
  monthlyPriceId: string;
  annualPriceId: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  popular?: boolean;
  color: string;
  icon: React.ElementType;
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    slots: 1,
    monthlyPriceId: '',
    annualPriceId: '',
    monthlyPrice: 0,
    annualPrice: 0,
    color: 'bg-slate-400',
    icon: Info,
    features: [
      '1 slot de veículo',
      'Rastreamento básico',
      'Histórico diário',
      'Acesso padrão'
    ]
  },
  {
    id: 'starter',
    name: 'Starter',
    slots: 3,
    monthlyPriceId: 'price_1TUw4t4AQRE1mTJuirk75raX',
    annualPriceId: 'price_1TUwD74AQRE1mTJuL66kN1Bw',
    monthlyPrice: 29.97,
    annualPrice: 323.64,
    color: 'bg-blue-500',
    icon: Rocket,
    features: [
      'Até 3 veículos',
      'Rastreamento em tempo real',
      'Histórico de rotas',
      'App para motoristas'
    ]
  },
  {
    id: 'basic',
    name: 'Basic',
    slots: 5,
    monthlyPriceId: 'price_1TUwL54AQRE1mTJuQObyjZzM',
    annualPriceId: 'price_1TV9fK4AQRE1mTJuJ2velDjY',
    monthlyPrice: 49.95,
    annualPrice: 539.46,
    color: 'bg-indigo-500',
    icon: Shield,
    features: [
      'Até 5 veículos',
      'Histórico completo',
      'Análise de motoristas',
      'Registos de manutenção',
      'Suporte padrão'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    slots: 10,
    monthlyPriceId: 'price_1TV9oI4AQRE1mTJu2W83NWTA',
    annualPriceId: 'price_1TV9rP4AQRE1mTJurAq4W5Z5',
    monthlyPrice: 99.90,
    annualPrice: 1078.92,
    color: 'bg-purple-600',
    popular: true,
    icon: Zap,
    features: [
      'Até 10 veículos',
      'Relatórios avançados',
      'Alertas de Geofencing',
      'Cargos personalizados',
      'Suporte prioritário'
    ]
  },
  {
    id: 'fleet',
    name: 'Fleet',
    slots: 15,
    monthlyPriceId: 'price_1TV9xD4AQRE1mTJuyjd2qHDM',
    annualPriceId: 'price_1TVA0Y4AQRE1mTJuIzKN9UVw',
    monthlyPrice: 148.85,
    annualPrice: 1518.27,
    color: 'bg-emerald-600',
    icon: Database,
    features: [
      'Até 15 veículos',
      'Acesso à API',
      'Otimização de rotas',
      'Gestão de combustível',
      'Gestor dedicado'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    slots: 25,
    monthlyPriceId: 'price_1TVA3Y4AQRE1mTJuqzUVqnDI',
    annualPriceId: 'price_1TVA6U4AQRE1mTJudYbe4xV0',
    monthlyPrice: 249.75,
    annualPrice: 2547.45,
    color: 'bg-amber-600',
    icon: Crown,
    features: [
      'Até 25 veículos',
      'Opções White-label',
      'Integrações customizadas',
      'Suporte 24/7',
      'Garantia de SLA'
    ]
  }
];

export const PaywallScreen: React.FC<{ managerId: string }> = ({ managerId }) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleSubscribe = async (plan: Plan) => {
    const user = auth.currentUser;
    if (!user) return;

    setLoadingPlan(plan.id);
    try {
      const priceId = billingCycle === 'monthly' ? plan.monthlyPriceId : plan.annualPriceId;
      await subscriptionService.startSubscription(
        priceId,
        managerId,
        user.uid,
        billingCycle,
        plan.id,
        plan.slots
      );
    } catch (error) {
      console.error('Subscription failed:', error);
    } finally {
      setLoadingPlan(null);
    }
  };

  const calculateSavings = (plan: Plan) => {
    const annualCostAtMonthlyRate = plan.monthlyPrice * 12;
    const savings = annualCostAtMonthlyRate - plan.annualPrice;
    const percentage = (savings / annualCostAtMonthlyRate) * 100;
    return {
      amount: savings.toFixed(2),
      percentage: Math.round(percentage)
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold text-slate-900 sm:text-5xl"
          >
            Escolha a sua Capacidade
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-xl text-slate-600"
          >
            Escala a sua operação de TukTuks com o plano ideal para o seu negócio.
          </motion.p>

          {/* Toggle */}
          <div className="mt-10 flex flex-col items-center">
            <div className="flex items-center space-x-4">
              <span className={cn("text-sm font-medium", billingCycle === 'monthly' ? "text-slate-900" : "text-slate-500")}>Monthly</span>
              <button
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
                className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none bg-indigo-600"
              >
                <div 
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    billingCycle === 'annual' ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
              <div className="flex items-center space-x-2">
                <span className={cn("text-sm font-medium", billingCycle === 'annual' ? "text-slate-900" : "text-slate-500")}>Annual</span>
                <AnimatePresence>
                  {billingCycle === 'annual' && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800"
                    >
                      Save up to 10%
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Grids */}
        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PLANS.map((plan, idx) => {
            const savings = calculateSavings(plan);
            const isAnnual = billingCycle === 'annual';
            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
            const pricePerMonth = isAnnual ? (plan.annualPrice / 12).toFixed(2) : plan.monthlyPrice;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "relative flex flex-col rounded-3xl border bg-white p-6 shadow-sm overflow-hidden",
                  plan.popular ? "border-indigo-500 ring-2 ring-indigo-500 scale-105 z-10" : "border-slate-200"
                )}
              >
                {plan.popular && (
                  <div className="absolute top-0 right-0 bg-indigo-500 text-white px-3 py-1 text-xs font-bold rounded-bl-xl">
                    Most Popular
                  </div>
                )}

                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-2 rounded-xl text-white", plan.color)}>
                    <plan.icon size={24} />
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-slate-500">{plan.slots} Slots</span>
                  </div>
                </div>

                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                
                <div className="mt-4 flex items-baseline">
                  <span className="text-3xl font-bold tracking-tight text-slate-900">€{isAnnual ? pricePerMonth : price}</span>
                  <span className="ml-1 text-sm font-medium text-slate-500">/mo</span>
                </div>
                {isAnnual && (
                  <p className="mt-1 text-xs text-slate-500">Billed €{price} annually</p>
                )}

                {/* Slot dots visualization */}
                <div className="mt-4 flex flex-wrap gap-1">
                  {Array.from({ length: plan.slots }).map((_, i) => (
                    <div key={i} className={cn("w-2 h-2 rounded-full", plan.color)} />
                  ))}
                  {plan.slots < 25 && Array.from({ length: 25 - plan.slots }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-slate-100" />
                  ))}
                </div>

                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start text-sm text-slate-600">
                      <Check className="h-4 w-4 text-green-500 mr-2 shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={loadingPlan !== null || plan.id === 'free'}
                  className={cn(
                    "mt-8 w-full flex items-center justify-center rounded-xl py-3 px-4 text-sm font-semibold transition-all",
                    plan.popular
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
                      : plan.id === 'free' ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-900 text-white hover:bg-slate-800",
                    loadingPlan === plan.id && "opacity-75 cursor-wait"
                  )}
                >
                  {loadingPlan === plan.id ? (
                    <RefreshCcw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    plan.id === 'free' ? "Default Plan" : "Upgrade Plan"
                  )}
                  {loadingPlan !== plan.id && plan.id !== 'free' && <ArrowRight className="h-4 w-4 ml-2" />}
                </button>

                {isAnnual && (
                  <p className="mt-3 text-center text-xs font-semibold text-green-600">
                    Save €{savings.amount} yearly
                  </p>
                )}
              </motion.div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <button 
            className="text-sm font-medium text-slate-500 hover:text-indigo-600 underline flex items-center justify-center mx-auto"
            onClick={() => {}} // Integration for restore purchase if needed
          >
            Restore purchase
          </button>
          
          <div className="mt-6 flex items-center justify-center space-x-6 text-slate-400">
            <div className="flex items-center text-xs">
              <Shield className="h-3 w-3 mr-1" /> Secure Payment
            </div>
            <div className="flex items-center text-xs">
              <Info className="h-3 w-3 mr-1" /> Mais de 500+ Gestores Satisfeitos
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
