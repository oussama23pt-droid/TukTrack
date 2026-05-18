import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Search, Plus, Phone, Mail, MapPin, CheckCircle2, X, Shield, Palette, Settings, Trash2, Edit2, Briefcase, CreditCard, ChevronRight, Activity, Lock, Clock, Timer, Loader2, ExternalLink, Trophy } from 'lucide-react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, addDoc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { handleFirestoreError, sanitizeData } from '../../../lib/firestore-utils';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../../lib/utils';
import { GradientButton } from '../../../components/GradientButton';
import ConfirmationModal from '../../../components/ConfirmationModal';
import { subscriptionService, ManagerSubscription } from '../../../services/subscriptionService';
import { SubscriptionTimer } from '../../../components/SubscriptionTimer';
import { SuccessCelebrationModal } from '../../../components/SuccessCelebrationModal';

const PLAN_CAPACITIES: Record<string, number> = {
  'starter': 3,
  'basic': 5,
  'pro': 10,
  'fleet': 15,
  'enterprise': 25,
  'free': 1
};

const PLANS = [
  { name: 'Free', vehicles: 1, monthlyPrice: 0, annualPrice: 0, discount: 0, id: 'free', desc: 'Ideal para começar a sua frota.', monthlyPriceId: '', annualPriceId: '' },
  { name: 'Starter', vehicles: 3, monthlyPrice: 29.97, annualPrice: 323.64, discount: 0.1, id: 'starter', desc: 'Pequena frota em crescimento.', monthlyPriceId: 'price_1TUw4t4AQRE1mTJuirk75raX', annualPriceId: 'price_1TUwD74AQRE1mTJuL66kN1Bw' },
  { name: 'Basic', vehicles: 5, monthlyPrice: 49.95, annualPrice: 539.46, discount: 0.1, id: 'basic', desc: 'Controle essencial para o dia-a-dia.', monthlyPriceId: 'price_1TUwL54AQRE1mTJuQObyjZzM', annualPriceId: 'price_1TV9fK4AQRE1mTJuJ2velDjY' },
  { name: 'Pro', vehicles: 10, monthlyPrice: 99.90, annualPrice: 1078.92, discount: 0.1, id: 'pro', desc: 'Gestão completa e profissional.', monthlyPriceId: 'price_1TV9oI4AQRE1mTJu2W83NWTA', annualPriceId: 'price_1TV9rP4AQRE1mTJurAq4W5Z5' },
  { name: 'Fleet', vehicles: 15, monthlyPrice: 148.85, annualPrice: 1518.27, discount: 0.15, id: 'fleet', desc: 'Solução máxima para grandes frotas.', monthlyPriceId: 'price_1TV9xD4AQRE1mTJuyjd2qHDM', annualPriceId: 'price_1TVA0Y4AQRE1mTJuIzKN9UVw' },
  { name: 'Enterprise', vehicles: 25, monthlyPrice: 249.75, annualPrice: 2547.45, discount: 0.15, id: 'enterprise', desc: 'Escalabilidade máxima para operações corporativas.', monthlyPriceId: 'price_1TVA3Y4AQRE1mTJuqzUVqnDI', annualPriceId: 'price_1TVA6U4AQRE1mTJudYbe4xV0' },
];

type Tab = 'drivers' | 'vehicles' | 'subscriptions';

export default function DriversManagement({ initialTab, hideTabs = false }: { initialTab?: Tab, hideTabs?: boolean }) {
  const { userData } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'drivers');
  const [activePlanId, setActivePlanId] = useState<string>(userData?.planId || '');

  useEffect(() => {
    if (userData?.planId) {
      setActivePlanId(userData.planId);
    }
  }, [userData?.planId]);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [searchTerm, setSearchTerm] = useState('');
  const [usersDrivers, setUsersDrivers] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);
  const [manualDrivers, setManualDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const slotsBeforePolling = React.useRef(userData?.vehicleSlots || 1);
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; type: 'driver' | 'vehicle'; id: string; name: string; data?: any } | null>(null);

  useEffect(() => {
    if (!userData?.uid) return;

    // Real-time Drivers
    const usersDriversQuery = query(
      collection(db, 'users'),
      where('managerId', '==', userData.uid),
      where('role', '==', 'driver')
    );

    const unsubUsersDrivers = onSnapshot(usersDriversQuery, (snapshot) => {
      setUsersDrivers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'user' })));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, 'list', 'users');
    });

    // Real-time Vehicles
    const vehiclesQuery = query(
      collection(db, 'vehicles'),
      where('managerId', '==', userData.uid)
    );

    const unsubVehicles = onSnapshot(vehiclesQuery, (snapshot) => {
      setVehicles(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, 'list', 'vehicles');
    });

    const activeTripsQuery = query(
      collection(db, 'trips'),
      where('managerId', '==', userData.uid),
      where('status', '==', 'active')
    );

    const unsubTrips = onSnapshot(activeTripsQuery, (snapshot) => {
      setActiveTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsersDrivers();
      unsubVehicles();
      unsubTrips();
    };
  }, [userData?.uid]);

  const allDrivers = [...usersDrivers, ...manualDrivers];
  const effectivePlanId = userData?.planId || activePlanId || 'free';
  const currentPlanLimit = userData?.vehicleSlots || PLAN_CAPACITIES[effectivePlanId] || 1;
  const isVehicleLimitReached = vehicles.length >= currentPlanLimit;

  const filteredDrivers = allDrivers.filter(driver => 
    driver.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.phoneNumber?.includes(searchTerm)
  );

  const filteredVehicles = vehicles.filter(v => 
    v.plateNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.color?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isOwner = userData?.role === 'owner' || userData?.role === 'manager';

  return (
    <div className="space-y-6">
      {/* Header Info with Plan & Timer */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-navy rounded-3xl p-6 text-white overflow-hidden relative shadow-xl shadow-navy/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber/10 blur-3xl -mr-16 -mt-16" />
        <div className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
            <div className="flex items-center space-x-2 text-amber">
              <Shield size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">{effectivePlanId} Plan</span>
            </div>
            {userData?.uid && (
              <>
                <span className="hidden sm:inline text-slate-600 font-bold">•</span>
                <div className="flex items-center space-x-1.5 active:scale-95 transition-transform cursor-pointer" onClick={() => {
                  navigator.clipboard.writeText(userData.uid);
                  alert('ID de Frota copiado!');
                }}>
                  <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">ID:</span>
                  <span className="text-[10px] font-black text-amber bg-amber/10 px-2 py-0.5 rounded-lg border border-amber/20 tracking-widest">{userData.uid.substring(0, 4).toUpperCase()}</span>
                </div>
              </>
            )}
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight italic">
            Gestão de Frota
          </h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
            {vehicles.length} / {currentPlanLimit} Veículos em uso
          </p>
        </div>
        
        {userData?.currentPeriodEnd && userData?.planId !== 'free' && (
          <div className="relative z-10">
            <SubscriptionTimer 
              currentPeriodEnd={userData.currentPeriodEnd} 
              className="bg-white/5 border-white/10"
            />
          </div>
        )}
      </div>

      {/* Tabs */}
      {!hideTabs && (
        <div className="flex flex-wrap gap-2 bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setActiveTab('drivers')}
            className={cn(
              "flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-bold transition-all min-w-0 sm:min-w-[120px]",
              activeTab === 'drivers' ? "bg-white text-navy shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Users size={18} />
            <span className="hidden sm:inline">Motoristas</span>
          </button>
          <button
            onClick={() => setActiveTab('vehicles')}
            className={cn(
              "flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl font-bold transition-all min-w-0 sm:min-w-[120px]",
              activeTab === 'vehicles' ? "bg-white text-navy shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Shield size={18} />
            <span className="hidden sm:inline">Veículos</span>
          </button>
        </div>
      )}

      {activeTab !== 'subscriptions' && (
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={20} />
            </span>
            <input
              type="text"
              placeholder={
                activeTab === 'drivers' ? "Pesquisar por nome ou telefone..." : 
                "Pesquisar por matrícula ou cor..."
              }
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 focus:border-amber focus:ring-1 focus:ring-amber outline-none transition-all shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-3">
            {activeTab === 'drivers' && (
              <button 
                onClick={() => setIsAddDriverOpen(true)}
                className="flex items-center space-x-2 bg-amber hover:bg-amber/90 text-navy font-bold py-2 px-6 rounded-2xl transition-all h-[58px] shadow-lg shadow-amber/10"
              >
                <Plus size={20} />
                <span>Novo Motorista</span>
              </button>
            )}
            {activeTab === 'vehicles' && (
              <button 
                onClick={() => !isVehicleLimitReached && setIsAddVehicleOpen(true)}
                disabled={isVehicleLimitReached}
                className={cn(
                  "flex items-center space-x-3 font-black py-2 px-8 rounded-2xl transition-all h-[58px] shadow-lg outline-none group",
                  isVehicleLimitReached 
                    ? "bg-slate-50 text-slate-300 cursor-not-allowed border-2 border-dashed border-slate-200 shadow-none" 
                    : "bg-gradient-to-r from-amber to-amber-600 text-navy hover:scale-[1.02] active:scale-[0.98] shadow-amber/20"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-colors",
                  isVehicleLimitReached ? "bg-slate-100" : "bg-white/20 group-hover:bg-white/40"
                )}>
                  {isVehicleLimitReached ? <Lock size={16} /> : <Plus size={20} />}
                </div>
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] uppercase tracking-widest opacity-70">Ação da Frota</span>
                  <span className="text-sm uppercase tracking-tight">{isVehicleLimitReached ? 'Limite Excedido' : 'Adicionar Veículo'}</span>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {activeTab === 'subscriptions' ? (
          <SubscriptionManagement 
            vehicleCount={vehicles.length} 
            activePlanId={activePlanId}
            onPlanChange={setActivePlanId}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeTab === 'drivers' ? (
              filteredDrivers.map((driver) => (
                <DriverCard 
                  key={driver.id} 
                  driver={driver} 
                  vehicles={vehicles} 
                  allDrivers={allDrivers}
                  isActiveTrip={activeTrips.some(t => t.driverUid === driver.uid)}
                  onEdit={() => setEditingDriver(driver)}
                  onDelete={() => setDeleteConfirm({ open: true, type: 'driver', id: driver.id, name: driver.name, data: driver })}
                />
              ))
            ) : (
              <>
                {filteredVehicles.map((vehicle) => (
                  <VehicleCard 
                    key={vehicle.id} 
                    vehicle={vehicle} 
                    onEdit={() => setEditingVehicle(vehicle)}
                    onDelete={() => setDeleteConfirm({ open: true, type: 'vehicle', id: vehicle.id, name: vehicle.plateNumber })}
                  />
                ))}
                
                {/* Dynamic Slots for Vehicle Registration based on Plan */}
                {!searchTerm && Array.from({ length: Math.max(0, 100 - vehicles.length) }).map((_, i) => {
                  const globalSlotIndex = vehicles.length + i + 1; // 1-indexed
                  const isLocked = globalSlotIndex > currentPlanLimit;
                  
                  // Hide slots way beyond the current limit to keep UI clean, but show at least 5 locked ones
                  if (globalSlotIndex > currentPlanLimit + 5 && globalSlotIndex > 10) return null;

                  return (
                    <button
                      key={`slot-${globalSlotIndex}`}
                      onClick={() => !isLocked && setIsAddVehicleOpen(true)}
                      className={cn(
                        "group h-[180px] border-2 border-dashed rounded-[2.5rem] flex flex-col items-center justify-center p-6 transition-all",
                        isLocked 
                          ? "bg-slate-50/50 border-slate-100 cursor-not-allowed opacity-60" 
                          : "bg-white/40 border-slate-200 hover:bg-white hover:border-amber hover:shadow-xl hover:shadow-amber/10 text-slate-300 hover:text-amber"
                      )}
                    >
                      <div className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors shadow-sm",
                        isLocked ? "bg-slate-100 text-slate-300" : "bg-white group-hover:bg-amber/10"
                      )}>
                        {isLocked ? <Lock size={20} /> : <Plus size={24} className="group-hover:scale-110 transition-transform" />}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                        {isLocked ? 'Slot Bloqueado' : 'Slot Vazio'}
                      </span>
                      {isLocked && (
                        <span className="text-[8px] font-bold text-slate-400 mt-1">Requer Upgrade</span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
            
            {((activeTab === 'drivers' && filteredDrivers.length === 0) || 
               (activeTab === 'vehicles' && filteredVehicles.length === 0 && searchTerm)) && !isLoading && (
              <div className="col-span-full py-20 text-center bg-white/5 border border-dashed border-white/10 rounded-3xl">
                <Search className="mx-auto text-gray-500 mb-4" size={48} />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Nenhum resultado encontrado.</p>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      <UpsertDriverModal 
        isOpen={isAddDriverOpen || !!editingDriver} 
        onClose={() => {
          setIsAddDriverOpen(false);
          setEditingDriver(null);
        }} 
        managerId={userData?.uid || ''}
        initialData={editingDriver}
        onDelete={(data) => {
          setIsAddDriverOpen(false);
          setEditingDriver(null);
          setDeleteConfirm({ open: true, type: 'driver', id: data.id, name: data.name, data: data });
        }}
      />
      <UpsertVehicleModal 
        isOpen={isAddVehicleOpen || !!editingVehicle} 
        onClose={() => {
          setIsAddVehicleOpen(false);
          setEditingVehicle(null);
        }} 
        managerId={userData?.uid || ''}
        initialData={editingVehicle}
        onDelete={(data) => {
          setIsAddVehicleOpen(false);
          setEditingVehicle(null);
          setDeleteConfirm({ open: true, type: 'vehicle', id: data.id, name: data.plateNumber });
        }}
        vehicleCount={vehicles.length}
        vehicleSlots={currentPlanLimit}
      />

      <ConfirmationModal 
        isOpen={!!deleteConfirm?.open}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          if (!deleteConfirm) return;
          const { type, id } = deleteConfirm;
          try {
            if (type === 'driver') {
              const docRef = doc(db, 'users', id);
              if (deleteConfirm.data?.email) {
                try {
                  await deleteDoc(doc(db, 'drivers_init', deleteConfirm.data.email.toLowerCase()));
                } catch (e) {}
              }
              await deleteDoc(docRef);
            } else if (type === 'vehicle') {
              await deleteDoc(doc(db, 'vehicles', id));
            }
            setDeleteConfirm(null);
          } catch (err) {
            handleFirestoreError(err, 'delete', type === 'vehicle' ? `vehicles/${id}` : `users/${id}`);
          }
        }}
        title={deleteConfirm?.type === 'driver' ? 'Eliminar Motorista?' : 'Eliminar Veículo?'}
        message={deleteConfirm?.type === 'driver' 
          ? `Tem a certeza que deseja remover o motorista ${deleteConfirm?.name}? Esta ação é irreversível.` 
          : `Tem a certeza que deseja remover o veículo ${deleteConfirm?.name}? Esta ação é irreversível.`}
        confirmLabel="SIM, ELIMINAR"
      />
    </div>
  );
}

function SubscriptionManagement({ 
  vehicleCount, 
  activePlanId: propPlanId, 
  onPlanChange 
}: { 
  vehicleCount: number, 
  activePlanId: string, 
  onPlanChange: (planId: string) => void 
}) {
  const { userData, user: authUser, isPro } = useAuth();
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(userData?.billingCycle || 'monthly');

  useEffect(() => {
    if (userData?.billingCycle) {
      setBillingCycle(userData.billingCycle);
    }
  }, [userData?.billingCycle]);
  const [selectedPlanForUpgrade, setSelectedPlanForUpgrade] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000); 
    return () => clearInterval(interval);
  }, []);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const initialSlotsRef = React.useRef(userData?.vehicleSlots || 1);

  useEffect(() => {
    if (!userData?.uid) return;

    const unsubTransactions = onSnapshot(query(
      collection(db, `users/${userData.uid}/transactions`),
      where('createdAt', '!=', ''),
    ), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setTransactions(data.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
        return dateB - dateA;
      }));
    });

    const unsubInvoices = onSnapshot(collection(db, `users/${userData.uid}/invoices`), (snapshot) => {
      setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubTransactions();
      unsubInvoices();
    };
  }, [userData?.uid]);

  const plans = [
    { name: 'Free', vehicles: 1, monthlyPrice: 0, annualPrice: 0, discount: 0, id: 'free', desc: 'Ideal para começar a sua frota.', monthlyPriceId: '', annualPriceId: '' },
    { name: 'Starter', vehicles: 3, monthlyPrice: 29.97, annualPrice: 323.64, discount: 0.1, id: 'starter', desc: 'Pequena frota em crescimento.', monthlyPriceId: 'price_1TUw4t4AQRE1mTJuirk75raX', annualPriceId: 'price_1TUwD74AQRE1mTJuL66kN1Bw' },
    { name: 'Basic', vehicles: 5, monthlyPrice: 49.95, annualPrice: 539.46, discount: 0.1, id: 'basic', desc: 'Controle essencial para o dia-a-dia.', monthlyPriceId: 'price_1TUwL54AQRE1mTJuQObyjZzM', annualPriceId: 'price_1TV9fK4AQRE1mTJuJ2velDjY' },
    { name: 'Pro', vehicles: 10, monthlyPrice: 99.90, annualPrice: 1078.92, discount: 0.1, id: 'pro', desc: 'Gestão completa e profissional.', monthlyPriceId: 'price_1TV9oI4AQRE1mTJu2W83NWTA', annualPriceId: 'price_1TV9rP4AQRE1mTJurAq4W5Z5' },
    { name: 'Fleet', vehicles: 15, monthlyPrice: 148.85, annualPrice: 1518.27, discount: 0.15, id: 'fleet', desc: 'Solução máxima para grandes frotas.', monthlyPriceId: 'price_1TV9xD4AQRE1mTJuyjd2qHDM', annualPriceId: 'price_1TVA0Y4AQRE1mTJuIzKN9UVw' },
    { name: 'Enterprise', vehicles: 25, monthlyPrice: 249.75, annualPrice: 2547.45, discount: 0.15, id: 'enterprise', desc: 'Escalabilidade máxima para operações corporativas.', monthlyPriceId: 'price_1TVA3Y4AQRE1mTJuqzUVqnDI', annualPriceId: 'price_1TVA6U4AQRE1mTJudYbe4xV0' },
  ];

  const timeLeft = userData?.currentPeriodEnd ? (() => {
    const endDate = userData.currentPeriodEnd.toDate ? userData.currentPeriodEnd.toDate() : new Date(userData.currentPeriodEnd);
    const total = endDate.getTime() - now;
    if (total <= 0) return null;
    const days = Math.floor(total / (1000 * 60 * 60 * 24));
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const seconds = Math.floor((total / 1000) % 60);
    return { days, hours, minutes, seconds };
  })() : null;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success')) {
      const isAlreadyUpdated = (userData as any)?.isOptimistic || (userData?.planId && userData.planId !== 'free' && userData.subscriptionStatus === 'active');
      
      if (isAlreadyUpdated) {
        setShowSuccessModal(true);
        setStatusMessage({ 
          type: 'success', 
          text: `Sucesso! O seu plano ${userData?.planId?.toUpperCase()} já está ativo e pronto a usar.` 
        });
        // Clear param
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      setStatusMessage({ type: 'info', text: 'Pagamento confirmado! A processar novos benefícios...' });
      
      let updateFound = false;
      const initialSlots = initialSlotsRef.current;

      const checkUpdate = () => {
        if (userData?.vehicleSlots && userData.vehicleSlots > initialSlots) {
          const newPlan = PLANS.find(p => p.vehicles === userData.vehicleSlots);
          setStatusMessage({ 
            type: 'success', 
            text: `Sucesso! O seu plano foi atualizado para ${newPlan?.name || activePlanId} e agora tem ${userData.vehicleSlots} slots de veículos desbloqueados.` 
          });
          setShowSuccessModal(true);
          updateFound = true;
          window.history.replaceState({}, document.title, window.location.pathname);
          return true;
        }
        return false;
      };

      const interval = setInterval(() => {
        if (checkUpdate()) clearInterval(interval);
      }, 1000);
      
      setTimeout(() => {
        clearInterval(interval);
      }, 30000); 

      return () => clearInterval(interval);
    } else if (urlParams.get('canceled')) {
      setStatusMessage({ type: 'info', text: 'O processo de subscrição foi cancelado.' });
    }
  }, [userData?.vehicleSlots, userData?.planId, userData?.subscriptionStatus]);

  const handleSubscribe = async (plan: any, forceCycle?: 'monthly' | 'annual') => {
    if (!userData?.uid || !authUser?.uid) return;
    
    const cycleToUse = forceCycle || billingCycle;
    setIsSubscribing(plan.id);
    setSelectedPlanForUpgrade(null);
    
    try {
      const priceId = cycleToUse === 'monthly' ? plan.monthlyPriceId : plan.annualPriceId;
      await subscriptionService.startSubscription(
        priceId,
        userData.uid,
        authUser.uid,
        cycleToUse,
        plan.id,
        plan.vehicles
      );
    } catch (err: any) {
      console.error('Subscription error:', err);
      setStatusMessage({ type: 'error', text: 'Erro ao iniciar subscrição: ' + err.message });
      setIsSubscribing(null);
    }
  };

  const handleOpenPortal = async () => {
    if (!authUser?.uid) return;
    setIsOpeningPortal(true);
    setStatusMessage(null);
    try {
      await subscriptionService.openBillingPortal(authUser.uid);
    } catch (err: any) {
      console.error('Portal error:', err);
      setStatusMessage({ type: 'error', text: 'Erro ao abrir portal: ' + err.message });
      setIsOpeningPortal(false);
    }
  };
  
  const activePlanId = userData?.planId || propPlanId || 'free';
  const subPlanLimit = userData?.vehicleSlots || PLAN_CAPACITIES[activePlanId] || 1;
  const subVehicleLimitReached = vehicleCount >= subPlanLimit;

  return (
    <div className="space-y-8">
      {statusMessage && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-2xl flex items-center space-x-3 border",
            statusMessage.type === 'success' ? "bg-green-500/10 border-green-500/50 text-green-500" :
            statusMessage.type === 'error' ? "bg-red-500/10 border-red-500/50 text-red-500" :
            "bg-blue-500/10 border-blue-500/50 text-blue-500"
          )}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={20} /> : <X size={20} />}
          <p className="text-sm font-bold">{statusMessage.text}</p>
          <button onClick={() => setStatusMessage(null)} className="ml-auto opacity-50 hover:opacity-100">
            <X size={16} />
          </button>
        </motion.div>
      )}

      {/* Header Info */}
      <div className="bg-navy rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber/20 blur-[100px] -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <h3 className="text-3xl font-black mb-2 tracking-tight">Faturação e Planos</h3>
            <p className="text-slate-400 font-bold max-w-md">
              Atualmente tem <span className="text-amber">{vehicleCount}</span> veículos na sua conta. Escolha o plano que melhor se adapta às suas necessidades.
            </p>
          </div>
          
          <div className="flex flex-col gap-3 items-end">
            <div className="bg-white/10 backdrop-blur-xl p-4 rounded-2xl border border-white/20 text-center min-w-[200px] relative">
              {isPro ? (
                  <div className="absolute -top-2 -right-2 bg-amber text-navy text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-xl ring-2 ring-navy">PRO EDITION</div>
                ) : (
                  <div className="absolute -top-2 -right-2 bg-slate-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">FREE ACCESS</div>
                )}
                <p className="text-[10px] font-black uppercase tracking-widest text-amber mb-1 opacity-80">Nível da Conta</p>
                <div className="flex items-center justify-center space-x-2">
                  {isPro && <Trophy size={16} className="text-amber" />}
                  <p className="text-2xl font-black uppercase tracking-tight">{activePlanId || 'Free'}</p>
                </div>
            </div>
            
            {isPro && userData?.currentPeriodEnd && (
              <SubscriptionTimer currentPeriodEnd={userData.currentPeriodEnd} className="bg-white/5 border-white/10" />
            )}

            {isPro && (
              <button
                onClick={handleOpenPortal}
                disabled={isOpeningPortal}
                className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2.5 rounded-xl border border-white/10 transition-all backdrop-blur-sm shadow-lg shadow-navy/50"
              >
                {isOpeningPortal ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                <span>Portal de Faturação</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <SuccessCelebrationModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)}
        planName={PLANS.find(p => p.id === userData?.planId)?.name || 'Pro'}
        slots={userData?.vehicleSlots || 0}
      />

      {/* Cycle Toggle */}
      <div className="flex justify-center mb-8">
        <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center shadow-inner">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={cn(
              "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
              billingCycle === 'monthly' 
                ? "bg-white text-navy shadow-md" 
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            Faturação Mensal
          </button>
          <button
            onClick={() => setBillingCycle('annual')}
            className={cn(
              "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all relative flex items-center space-x-2",
              billingCycle === 'annual' 
                ? "bg-white text-navy shadow-md" 
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <span>Faturação Anual</span>
            <span className="bg-green-500 text-white text-[8px] px-2 py-0.5 rounded-full">OFERTA</span>
          </button>
        </div>
      </div>


      {/* Subscription Status Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "p-8 rounded-[2.5rem] relative overflow-hidden transition-all",
          activePlanId 
            ? "bg-white border-2 border-amber/20 shadow-xl shadow-amber/5" 
            : "bg-slate-50 border-2 border-slate-100 shadow-sm"
        )}
      >
        {activePlanId && activePlanId !== 'free' && userData?.currentPeriodEnd && (
          <div className="absolute top-0 right-0 p-6">
            <SubscriptionTimer 
              currentPeriodEnd={userData.currentPeriodEnd} 
              className="bg-amber/10 border-amber/20 shadow-none"
            />
          </div>
        )}

        <div className="flex items-center space-x-6">
          <div className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-all relative",
            activePlanId ? "bg-navy text-amber shadow-navy/20" : "bg-white text-slate-300 shadow-sm"
          )}>
            {activePlanId ? <Timer size={32} /> : <Lock size={32} />}
            {activePlanId && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center border-4 border-white">
                <CheckCircle2 size={10} className="text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Subscrição Ativa</p>
            <h3 className="text-2xl font-black text-navy uppercase tracking-tight italic flex items-center space-x-3 flex-wrap gap-2">
              <span className="bg-navy text-white px-4 py-1 rounded-xl shadow-lg shadow-navy/20">
                {activePlanId ? `Plano ${activePlanId.toUpperCase()}` : 'Nenhum Plano'}
              </span>
              {userData?.billingCycle && activePlanId !== 'free' && (
                <span className="bg-amber text-navy text-[10px] px-3 py-1.5 rounded-full not-italic tracking-widest font-black shadow-md border border-navy/10 overflow-hidden relative group">
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  {userData.billingCycle === 'annual' ? 'FATURAÇÃO ANUAL' : 'FATURAÇÃO MENSAL'}
                </span>
              )}
              {activePlanId === 'free' && (
                <span className="bg-green-100 text-green-600 text-[10px] px-3 py-1 rounded-full not-italic tracking-widest uppercase">GRÁTIS</span>
              )}
              {userData?.subscriptionStatus === 'cancelling' && (
                <span className="bg-rose-100 text-rose-600 text-[10px] px-3 py-1 rounded-full not-italic tracking-widest">CANCELANDO</span>
              )}
              {userData?.subscriptionStatus === 'active' && activePlanId !== 'free' && (
                <span className="bg-green-100 text-green-600 text-[10px] px-3 py-1 rounded-full not-italic tracking-widest uppercase">{userData?.subscriptionStatus}</span>
              )}
              {!activePlanId && (
                <span className="bg-slate-200 text-slate-500 text-[10px] px-3 py-1 rounded-full not-italic tracking-widest">INATIVO</span>
              )}
            </h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
              {activePlanId ? (
                <>Estado: <span className={cn(
                  "font-black uppercase",
                  (userData?.subscriptionStatus === 'active' || activePlanId === 'free') ? "text-green-600" :
                  userData?.subscriptionStatus === 'payment_failed' ? "text-rose-600" :
                  "text-slate-500"
                )}>{activePlanId === 'free' ? 'Vitalício' : userData?.subscriptionStatus}</span></>
              ) : (
                <>Selecione um plano abaixo para ativar a sua conta</>
              )}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-8">
        {PLANS.map((plan) => {
          const isCurrentPlan = activePlanId === plan.id;
          const isCurrentCycle = userData?.billingCycle === billingCycle;
          const canUpgrade = isCurrentPlan && !isCurrentCycle && billingCycle === 'annual';
          const monthlyPrice = billingCycle === 'monthly' ? plan.monthlyPrice : plan.monthlyPrice * (1 - (plan.discount || 0));
          const annualSavings = (plan.monthlyPrice * 12) - plan.annualPrice;

          return (
            <motion.div
              key={plan.id}
              whileHover={{ y: -10 }}
              className={cn(
                "p-10 rounded-[3rem] border transition-all flex flex-col items-center text-center relative overflow-hidden",
                isCurrentPlan 
                  ? "bg-white border-amber ring-8 ring-amber/5 shadow-2xl shadow-amber/10" 
                  : "bg-white border-slate-100 hover:border-amber/30 shadow-sm"
              )}
            >
              {isCurrentPlan && (
                <div className="absolute top-0 inset-x-0">
                  <div className={cn(
                    "w-full py-2 text-[9px] font-black uppercase tracking-[0.3em] shadow-sm",
                    userData?.billingCycle === billingCycle ? "bg-amber text-navy" : "bg-white text-slate-400 border-b border-slate-100"
                  )}>
                    {userData?.billingCycle === billingCycle ? 'É ESTE O SEU PLANO ATUAL' : 'PLANO ATIVO (OUTRO CICLO)'}
                  </div>
                </div>
              )}

              {billingCycle === 'annual' && plan.discount > 0 && (
                <div className="absolute top-0 left-0 p-4">
                  <div className="bg-green-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-sm">
                    -{plan.discount * 100}% DESCONTO
                  </div>
                </div>
              )}
              
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-colors shadow-sm",
                isCurrentPlan ? "bg-amber text-navy" : "bg-slate-50 text-slate-400"
              )}>
                <CreditCard size={32} />
              </div>

              <h4 className="text-xl font-black text-navy uppercase tracking-tight mb-2">{plan.name}</h4>
              
              <div className="flex flex-col items-center mb-6">
                {plan.id === 'free' ? (
                  <div className="flex items-baseline space-x-1">
                    <span className="text-4xl font-black text-navy uppercase italic">Grátis</span>
                  </div>
                ) : (
                  <>
                    {billingCycle === 'annual' && plan.monthlyPrice > 0 && (
                      <span className="text-xs font-bold text-slate-300 line-through mb-1">
                        {plan.monthlyPrice.toFixed(2)}€
                      </span>
                    )}
                    <div className="flex items-baseline space-x-1">
                      <span className="text-4xl font-black text-navy">
                        {monthlyPrice.toFixed(2)}€
                      </span>
                      <span className="text-xs font-bold text-slate-400 uppercase">
                        /{billingCycle === 'monthly' ? 'mês' : 'mês*'}
                      </span>
                    </div>
                  </>
                )}
                {billingCycle === 'annual' && plan.monthlyPrice > 0 && (
                  <div className="mt-2 text-center bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                    <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">
                      Economize {annualSavings.toFixed(2)}€ / Ano
                    </p>
                    <p className="text-[9px] font-bold text-green-700 uppercase tracking-tighter mt-0.5">
                      Faturado anualmente: {plan.annualPrice.toFixed(2)}€
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-slate-50/50 rounded-2xl p-4 w-full mb-6 border border-slate-100/50">
                <p className="text-sm font-black text-navy uppercase tracking-tight">{plan.vehicles} {plan.vehicles === 1 ? 'Veículo' : 'Veículos'}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Capacidade</p>
              </div>

              <p className="text-xs text-slate-500 font-medium mb-8 leading-relaxed italic px-4">
                {plan.desc}
              </p>

              {(
                <button
                  onClick={() => {
                    if (isCurrentPlan && (plan.id === 'free' || userData?.billingCycle === billingCycle)) return;
                    if (plan.id === 'free') {
                      handleSubscribe(plan, 'monthly');
                    } else {
                      setSelectedPlanForUpgrade(plan);
                    }
                  }}
                  disabled={isSubscribing === plan.id || (isCurrentPlan && (plan.id === 'free' || userData?.billingCycle === billingCycle))}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all mt-auto shadow-lg shadow-navy/5 flex items-center justify-center",
                    (isCurrentPlan && (plan.id === 'free' || userData?.billingCycle === billingCycle))
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-navy text-white hover:bg-navy-lighter"
                  )}
                >
                  {isSubscribing === plan.id 
                    ? <Loader2 size={16} className="animate-spin" /> 
                    : (isCurrentPlan && (plan.id === 'free' || userData?.billingCycle === billingCycle)) 
                      ? 'Plano Atual' 
                      : 'Selecionar Plano'}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[
          { title: 'Conta Grátis', desc: 'Todas as novas contas começam com 1 slot de veículo gratuito para sempre.' },
          { title: 'Suporte 24/7', desc: 'Temos uma equipa pronta para ajudar a gerir o seu negócio.' },
        ].map((info, i) => (
          <div key={i} className="bg-slate-100/50 p-6 rounded-2xl border border-slate-100">
            <h5 className="text-[10px] font-black uppercase tracking-widest text-navy mb-2">{info.title}</h5>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{info.desc}</p>
          </div>
        ))}
      </div>

      {transactions.length > 0 && (
        <div className="mt-12 bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <h4 className="text-xl font-black text-navy uppercase tracking-tight">Histórico de Transações</h4>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Registos de subscrição e pagamentos</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 italic">
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Data</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Plano</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Valor</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <p className="text-sm font-bold text-navy">
                        {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString() : new Date(t.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase font-black">{t.createdAt?.toDate ? t.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td className="px-8 py-4">
                      <span className="text-xs font-black uppercase tracking-tight bg-slate-100 px-3 py-1 rounded-full">
                        {t.planId}
                      </span>
                    </td>
                    <td className="px-8 py-4 text-sm font-black text-navy">
                      {t.amount.toFixed(2)}€
                    </td>
                    <td className="px-8 py-4">
                      <span className="inline-flex items-center space-x-1.5 text-green-500">
                        <CheckCircle2 size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Confirmado</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="mt-8 bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <h4 className="text-xl font-black text-navy uppercase tracking-tight">Faturas</h4>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Documentos de pagamento e recibos</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 italic">
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Data</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Items</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Total</th>
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Documento</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4">
                      <p className="text-sm font-bold text-navy">
                        {inv.date?.toDate ? inv.date.toDate().toLocaleDateString() : new Date(inv.date).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-8 py-4">
                      <p className="text-[10px] text-slate-500 font-bold uppercase max-w-[200px] truncate">
                        {inv.items?.join(', ') || 'Subscrição'}
                      </p>
                    </td>
                    <td className="px-8 py-4 text-sm font-black text-navy">
                      {inv.amount.toFixed(2)}€
                    </td>
                    <td className="px-8 py-4">
                      {inv.pdf && (
                        <a 
                          href={inv.pdf} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1.5 text-amber hover:text-amber/80 transition-colors"
                        >
                          <ExternalLink size={14} />
                          <span className="text-[10px] font-black uppercase tracking-widest">Ver PDF</span>
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPlanForUpgrade && (
        <CycleChoiceModal 
          plan={selectedPlanForUpgrade} 
          onClose={() => setSelectedPlanForUpgrade(null)} 
          onSelect={(cycle) => handleSubscribe(selectedPlanForUpgrade, cycle)} 
        />
      )}

    </div>
  );
}

function CycleChoiceModal({ plan, onClose, onSelect }: { plan: any, onClose: () => void, onSelect: (cycle: 'monthly' | 'annual') => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-navy/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100"
      >
        <div className="p-8 text-center border-b border-slate-50 bg-slate-50/50">
          <h3 className="text-xl font-black text-navy uppercase tracking-tight">Escolha o seu ciclo</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Plano {plan.name}</p>
        </div>
        
        <div className="p-6 space-y-3">
          <button
            onClick={() => onSelect('monthly')}
            className="w-full group flex items-center justify-between p-6 bg-slate-50 hover:bg-navy text-navy hover:text-white rounded-3xl transition-all border border-slate-100"
          >
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-tight">Mensal</p>
              <p className="text-[9px] opacity-60 font-bold">Cobrado todos os meses</p>
            </div>
            <p className="text-md font-black italic">{plan.monthlyPrice.toFixed(2)}€</p>
          </button>

          <button
            onClick={() => onSelect('annual')}
            className="w-full group flex items-center justify-between p-6 bg-amber/5 hover:bg-amber text-navy rounded-3xl transition-all border border-amber/20"
          >
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-tight">Anual</p>
              <p className="text-[9px] text-amber-700 group-hover:text-amber-900 font-black uppercase tracking-widest">Poupe {(plan.discount * 100).toFixed(0)}%</p>
            </div>
            <div className="text-right">
              <p className="text-md font-black italic">{plan.annualPrice.toFixed(2)}€</p>
              <p className="text-[8px] font-bold opacity-60 italic uppercase">/ ano</p>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-6 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-navy border-t border-slate-50 transition-colors bg-white hover:bg-slate-50"
        >
          Fechar
        </button>
      </motion.div>
    </div>
  );
}

function DriverCard({ driver, vehicles, allDrivers, isActiveTrip, onEdit, onDelete }: { driver: any, vehicles: any[], allDrivers: any[], isActiveTrip: boolean, onEdit: () => void, onDelete: () => void, key?: any }) {
  const { userData } = useAuth();
  
  const handleVehicleChange = async (vehicleId: string) => {
    try {
      // If assigning a vehicle, check if it's already assigned to someone else
      if (vehicleId) {
        const otherDriver = allDrivers.find(d => d.vehicleId === vehicleId && d.id !== driver.id);
        if (otherDriver) {
          // Unassign the other driver
          await updateDoc(doc(db, 'users', otherDriver.id), {
            vehicleId: null
          });
          
          if (otherDriver.email) {
            try {
              await updateDoc(doc(db, 'drivers_init', otherDriver.email.toLowerCase()), {
                vehicleId: null
              });
            } catch (e) {}
          }
        }
      }

      // Update current driver
      await updateDoc(doc(db, 'users', driver.id), {
        vehicleId: vehicleId || null
      });

      // Sync with drivers_init for potential auto-login migration
      if (driver.role === 'driver' && driver.email && (!driver.uid || driver.uid === '')) {
        try {
          await updateDoc(doc(db, 'drivers_init', driver.email.toLowerCase()), {
            vehicleId: vehicleId || null
          });
        } catch (e) {}
      }
    } catch (err) {
      handleFirestoreError(err, 'update', `users/${driver.id}`);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "bg-white/5 border rounded-3xl p-6 transition-all group relative overflow-hidden",
        isActiveTrip 
          ? "border-amber/50 bg-amber/[0.03] shadow-[0_0_30px_rgba(245,166,35,0.1)] animate-pulse" 
          : "border-white/10 hover:bg-white/10"
      )}
    >
      {(driver.isOnline || isActiveTrip) && (
        <div className={cn(
          "absolute top-0 right-0 p-1.5 rounded-bl-xl",
          isActiveTrip ? "bg-amber" : "bg-green-500"
        )}>
          {isActiveTrip ? <Activity size={10} className="text-navy" /> : <CheckCircle2 size={10} className="text-white" />}
        </div>
      )}
      
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center space-x-4">
          <div className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black border transition-colors",
            isActiveTrip 
              ? "bg-amber text-navy border-amber/20 shadow-lg shadow-amber/20" 
              : "bg-amber/10 text-amber border-amber/20"
          )}>
            {driver.name?.charAt(0)}
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">{driver.name}</h3>
            <div className="flex items-center space-x-2">
              <span className={cn(
                "w-2 h-2 rounded-full",
                isActiveTrip ? "bg-amber animate-ping" : driver.isOnline ? "bg-green-500" : "bg-slate-300"
              )} />
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                {isActiveTrip ? 'Em Viagem' : driver.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center space-x-1">
            <button 
              onClick={onEdit}
              className="p-2 text-slate-300 hover:text-amber transition-colors"
              title="Editar Motorista"
            >
              <Edit2 size={18} />
            </button>
            <button 
              onClick={onDelete}
              className="p-2 text-slate-300 hover:text-red-500 transition-colors"
              title="Remover Motorista"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div className="space-y-1 group">
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest px-1">Atribuir Veículo</p>
          <div className="relative">
            <select
              value={driver.vehicleId || ''}
              onChange={(e) => handleVehicleChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 font-bold focus:border-amber focus:ring-1 focus:ring-amber outline-none appearance-none cursor-pointer transition-all"
            >
              <option value="">Sem veículo</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plateNumber} ({v.color})</option>
              ))}
            </select>
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none" size={16} />
          </div>
        </div>

        <div className="flex items-center space-x-3 text-sm text-slate-500 font-medium">
          <Phone size={16} />
          <span>{driver.phoneNumber || 'Sem telefone'}</span>
        </div>
        <div className="flex items-center space-x-3 text-sm text-slate-500 font-medium">
          <Mail size={16} />
          <span className="truncate">{driver.email || 'Manual'}</span>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Registado em</p>
          <p className="text-sm font-bold text-slate-700">
            {driver.createdAt ? new Date(driver.createdAt).toLocaleDateString() : '---'}
          </p>
        </div>
        <span className="text-[10px] text-slate-400 uppercase font-black px-3 py-1 bg-slate-100 rounded-full">
          {driver.type === 'user' ? 'Conta' : 'Manual'}
        </span>
      </div>
    </motion.div>
  );
}

function VehicleCard({ vehicle, onEdit, onDelete }: { vehicle: any, onEdit: () => void, onDelete: () => void, key?: any }) {
  const { userData } = useAuth();

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateDoc(doc(db, 'vehicles', vehicle.id), {
        status: newStatus
      });
    } catch (err) {
      console.error('Error updating vehicle status:', err);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "bg-white border border-slate-200 rounded-3xl p-6 hover:bg-slate-50 transition-all group relative overflow-hidden shadow-sm"
      )}
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-[1.25rem] bg-amber/10 flex items-center justify-center text-amber border border-amber/20 shadow-sm transition-transform group-hover:scale-110">
            <Shield size={24} />
          </div>
          <div>
            <h3 className="font-black text-xl text-slate-900 uppercase tracking-tight italic">{vehicle.plateNumber}</h3>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  vehicle.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]' : 
                  vehicle.status === 'maintenance' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]' : 'bg-amber shadow-[0_0_8px_rgba(245,166,35,0.4)]'
                )} />
                <select 
                  value={vehicle.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className="bg-transparent text-[10px] text-slate-400 uppercase tracking-widest font-black outline-none border-none cursor-pointer hover:text-slate-900 transition-colors"
                >
                  <option value="active">Ativo</option>
                  <option value="maintenance">Manutenção</option>
                  <option value="service">Em Serviço</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button 
            onClick={onEdit}
            className="p-2.5 text-slate-400 hover:text-amber hover:bg-amber/10 rounded-xl transition-all"
            title="Editar Veículo"
          >
            <Edit2 size={18} />
          </button>
        </div>
      </div>

      <div className="space-y-4 mt-4">
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Cor</p>
            <p className="text-slate-700 font-bold capitalize">{vehicle.color || '---'}</p>
          </div>
          <Palette className="text-slate-200" size={24} />
        </div>
        
        <button
          onClick={onDelete}
          className="w-full py-3 rounded-2xl border border-red-100 text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-50 transition-all flex items-center justify-center space-x-2"
        >
          <Trash2 size={14} />
          <span>Remover Veículo</span>
        </button>
      </div>
    </motion.div>
  );
}

function UpsertDriverModal({ isOpen, onClose, managerId, initialData, onDelete }: { isOpen: boolean, onClose: () => void, managerId: string, initialData?: any, onDelete?: (data: any) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setPhone(initialData.phoneNumber || '');
      setEmail(initialData.email || '');
      setPin(initialData.pin || '');
    } else {
      setName('');
      setPhone('');
      setEmail('');
      // Auto-generate a 6-digit PIN for new drivers
      setPin(Math.floor(100000 + Math.random() * 900000).toString());
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initialData && pin.length !== 6) {
      alert('O PIN deve ter exatamente 6 algarismos.');
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const finalPin = (pin || '').toString().trim() || (initialData?.pin || '').toString();

    setIsSubmitting(true);
    try {
      if (initialData) {
        const updateData: any = sanitizeData({
          name: name.trim(),
          email: cleanEmail,
          phoneNumber: cleanPhone,
          updatedAt: new Date().toISOString()
        });
        
        if (finalPin) {
          updateData.pin = finalPin;
        }

        try {
          await updateDoc(doc(db, 'users', initialData.id), updateData);
        } catch (err) {
          handleFirestoreError(err, 'update', `users/${initialData.id}`);
          setIsSubmitting(false);
          return;
        }
        
        // Also update drivers_init to ensure automatic access works if they haven't logged in yet
        if (initialData.role === 'driver') {
          // If email changed, remove the old drivers_init entry
          if (initialData.email && initialData.email.toLowerCase() !== cleanEmail) {
            try {
              await deleteDoc(doc(db, 'drivers_init', initialData.email.toLowerCase()));
            } catch (e) {}
          }

          try {
            await setDoc(doc(db, 'drivers_init', cleanEmail), {
              ...updateData,
              id: initialData.id,
              role: 'driver',
              managerId,
              pin: finalPin,
              createdAt: initialData.createdAt || new Date().toISOString()
            }, { merge: true });
          } catch (err) {
            handleFirestoreError(err, 'write', `drivers_init/${cleanEmail}`);
            setIsSubmitting(false);
            return;
          }
        }
      } else {
        // --- DUPLICATE CHECK ---
        const duplicateQuery = query(
          collection(db, 'users'), 
          where('email', '==', cleanEmail)
        );
        
        try {
          const querySnapshot = await getDocs(duplicateQuery);
          if (!querySnapshot.empty) {
            alert('Este e-mail já está registado na plataforma. Por favor, utilize um e-mail diferente.');
            setIsSubmitting(false);
            return;
          }
        } catch (err: any) {
          // If we can't query it due to permissions, it's likely someone else's account
          // which effectively means it's a duplicate for this manager's purposes
          if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
            alert('Este e-mail já está em uso por outro utilizador. Por favor, utilize um e-mail diferente.');
            setIsSubmitting(false);
            return;
          }
          throw err;
        }

        const newDriverRef = doc(collection(db, 'users'));
        const driverData = sanitizeData({
          id: newDriverRef.id,
          uid: '', 
          managerId,
          name: name.trim(),
          email: cleanEmail,
          phoneNumber: cleanPhone,
          pin: finalPin,
          role: 'driver',
          status: 'active',
          isOnline: false,
          createdAt: new Date().toISOString()
        });
        
        try {
          await setDoc(newDriverRef, driverData);
        } catch (err) {
          handleFirestoreError(err, 'create', `users/${newDriverRef.id}`);
          return;
        }

        try {
          await setDoc(doc(db, 'drivers_init', cleanEmail), driverData);
        } catch (err) {
          handleFirestoreError(err, 'create', `drivers_init/${cleanEmail}`);
          return;
        }
      }
      onClose();
    } catch (err: any) {
      // General error fallback
      console.error('Driver submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Tem a certeza que deseja remover este motorista?')) return;
    setIsSubmitting(true);
    try {
      if (initialData?.id) {
        await deleteDoc(doc(db, 'users', initialData.id));
        if (initialData.email) {
          try {
            await deleteDoc(doc(db, 'drivers_init', initialData.email.toLowerCase()));
          } catch (e) {
            // Ignore
          }
        }
        onClose();
      }
    } catch (err) {
      handleFirestoreError(err, 'delete', `users/${initialData?.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
            <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-900 transition-colors">
              <X size={24} />
            </button>
            
            <h2 className="text-2xl font-bold text-slate-900 mb-6 font-display tracking-tight">
              {initialData ? 'Editar Motorista' : 'Adicionar Motorista'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">Nome Completo</label>
                  <input 
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-900 focus:border-amber outline-none transition-all shadow-sm"
                    placeholder="João Silva"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">Email</label>
                  <input 
                    required
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-900 focus:border-amber outline-none transition-all shadow-sm"
                    placeholder="motorista@email.com"
                  />
                </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">PIN de Acesso (6 algarismos)</label>
                    <input 
                      required
                      type="text"
                      maxLength={6}
                      pattern="\d{6}"
                      value={pin}
                      onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-900 focus:border-amber outline-none transition-all shadow-sm font-mono tracking-widest"
                      placeholder="123456"
                    />
                    <p className="text-[10px] text-slate-400 px-1 mt-1">Este PIN será a palavra-passe do motorista.</p>
                  </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">Telemóvel</label>
                  <input 
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-900 focus:border-amber outline-none transition-all shadow-sm"
                    placeholder="+351 912 345 678"
                  />
                </div>
              </div>
              
              <div className="flex gap-3">
                <GradientButton label={initialData ? "GUARDAR ALTERAÇÕES" : "ADICIONAR MOTORISTA"} type="submit" isLoading={isSubmitting} />
                {initialData && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(initialData)}
                    disabled={isSubmitting}
                    className="p-4 rounded-2xl border border-red-100 text-red-500 hover:bg-red-50 transition-all"
                    title="Remover Motorista"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function UpsertVehicleModal({ isOpen, onClose, managerId, initialData, onDelete, vehicleCount, vehicleSlots }: { isOpen: boolean, onClose: () => void, managerId: string, initialData?: any, onDelete?: (data: any) => void, vehicleCount: number, vehicleSlots: number }) {
  const [plate, setPlate] = useState('');
  const [color, setColor] = useState('');
  const [status, setStatus] = useState<'active' | 'maintenance' | 'service'>('active');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAtLimit = !initialData && vehicleCount >= vehicleSlots;

  useEffect(() => {
    if (initialData) {
      setPlate(initialData.plateNumber || '');
      setColor(initialData.color || '');
      setStatus(initialData.status || 'active');
    } else {
      setPlate('');
      setColor('');
      setStatus('active');
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAtLimit) return;
    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateDoc(doc(db, 'vehicles', initialData.id), sanitizeData({
          plateNumber: plate.toUpperCase(),
          color,
          status
        }));
      } else {
        const newVehicleRef = doc(collection(db, 'vehicles'));
        await setDoc(newVehicleRef, sanitizeData({
          id: newVehicleRef.id,
          managerId,
          plateNumber: plate.toUpperCase(),
          color,
          status,
          createdAt: new Date().toISOString()
        }));
      }
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, initialData ? 'update' : 'create', `vehicles/${initialData?.id || 'new_vehicle'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
          >
            <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-300 hover:text-slate-900 transition-colors">
              <X size={24} />
            </button>
            
            <h2 className="text-2xl font-bold text-slate-900 mb-6 font-display tracking-tight">
              {initialData ? 'Editar Veículo' : 'Adicionar Veículo'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {isAtLimit && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <p className="text-[11px] text-rose-600 font-bold leading-relaxed text-center">
                    Atingiu o limite de veículos do seu plano ({vehicleSlots || 0}).<br/>
                    Faça upgrade em "Assinaturas" para adicionar mais.
                  </p>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">Matrícula</label>
                  <input 
                    required
                    value={plate}
                    onChange={e => setPlate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-900 focus:border-amber outline-none transition-all shadow-sm uppercase font-black tracking-widest"
                    placeholder="AA-00-BB"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">Cor</label>
                  <input 
                    required
                    value={color}
                    onChange={e => setColor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-slate-900 focus:border-amber outline-none transition-all shadow-sm"
                    placeholder="Amarelo / Branco"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-amber font-black uppercase tracking-widest px-1">Estado</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['active', 'maintenance', 'service'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={cn(
                          "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          status === s 
                            ? "bg-amber border-amber text-navy shadow-lg shadow-amber/20" 
                            : "bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                      >
                        {s === 'active' ? 'Ativo' : s === 'maintenance' ? 'Manut.' : 'Serviço'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <GradientButton label={initialData ? "GUARDAR ALTERAÇÕES" : "ADICIONAR VEÍCULO"} type="submit" isLoading={isSubmitting} />
                {initialData && onDelete && (
                  <button
                    type="button"
                    onClick={() => onDelete(initialData)}
                    disabled={isSubmitting}
                    className="p-4 rounded-2xl border border-red-100 text-red-500 hover:bg-red-50 transition-all"
                    title="Remover Veículo"
                  >
                    <Trash2 size={24} />
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}


