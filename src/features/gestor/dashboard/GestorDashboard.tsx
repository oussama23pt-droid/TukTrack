import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '../../../components/GlassCard';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Users, CreditCard, Clock, Activity, AlertTriangle, CheckCircle2, Trophy, TrendingUp, Medal, Play, Square, Timer, Loader2, Target, Calendar, Bell, Shield, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../auth/AuthContext';
import { collection, query, where, onSnapshot, orderBy, limit, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../../../lib/firestore-utils';
import FleetMap from '../../shared/FleetMap';
import { SubscriptionTimer } from '../../../components/SubscriptionTimer';
import { TukTukLogo } from '../../../components/TukTukLogo';
import { SuccessCelebrationModal } from '../../../components/SuccessCelebrationModal';

const mockData = [
  { name: 'Seg', earnings: 400 },
  { name: 'Ter', earnings: 300 },
  { name: 'Qua', earnings: 500 },
  { name: 'Qui', earnings: 280 },
  { name: 'Sex', earnings: 590 },
  { name: 'Sáb', earnings: 800 },
  { name: 'Dom', earnings: 700 },
];

export default function GestorDashboard() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [onlineDrivers, setOnlineDrivers] = useState<any[]>([]);
  const [allDrivers, setAllDrivers] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);
  const [sosAlerts, setSosAlerts] = useState<any[]>([]);
  const [todayTrips, setTodayTrips] = useState<any[]>([]);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [recentSOS, setRecentSOS] = useState<any[]>([]);
  const [chartData, setChartData] = useState(mockData);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [isStartingShift, setIsStartingShift] = useState(false);
  const [isEndingShift, setIsEndingShift] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success')) {
      const isAlreadyUpdated = (userData as any)?.isOptimistic || (userData?.planId && userData.planId !== 'free' && userData.subscriptionStatus === 'active');
      if (isAlreadyUpdated) {
        setShowSuccessModal(true);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [userData]);

  useEffect(() => {
    if (!userData?.uid) return;

    // Listen for notifications
    const notifyQuery = query(
      collection(db, 'notifications'),
      where('managerId', '==', userData.uid),
      where('read', '==', false),
      where('isForDrivers', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubNotify = onSnapshot(notifyQuery, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    // Listen for active shift
    const shiftQuery = query(
      collection(db, 'shifts'),
      where('managerId', '==', userData.uid),
      where('status', '==', 'active'),
      limit(1)
    );

    const unsubShift = onSnapshot(shiftQuery, (snapshot) => {
      if (!snapshot.empty) {
        setActiveShift({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
      } else {
        setActiveShift(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'shifts');
    });

    // Listen for drivers linked to this manager
    const driversQuery = query(
      collection(db, 'users'),
      where('managerId', '==', userData.uid),
      where('role', '==', 'driver')
    );

    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      const drivers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllDrivers(drivers);
      setOnlineDrivers(drivers.filter((d: any) => d.isOnline));
      setDataLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Listen for active SOS alerts
    const sosQuery = query(
      collection(db, 'sos_alerts'),
      where('managerId', '==', userData.uid),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubSOS = onSnapshot(sosQuery, (snapshot) => {
      setSosAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sos_alerts');
    });

    // Listen for today's trips
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tripsQuery = query(
      collection(db, 'trips'),
      where('managerId', '==', userData.uid),
      where('createdAt', '>=', today.toISOString())
    );

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      const trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setTodayTrips(trips.filter(t => t.status === 'completed'));
      setActiveTrips(trips.filter(t => t.status === 'active'));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    // Listen for recent activities (Trips & SOS)
    const recentTripsQuery = query(
      collection(db, 'trips'),
      where('managerId', '==', userData.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const recentSOSQuery = query(
      collection(db, 'sos_alerts'),
      where('managerId', '==', userData.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubRecentTrips = onSnapshot(recentTripsQuery, (snapshot) => {
      setRecentTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    const unsubRecentSOS = onSnapshot(recentSOSQuery, (snapshot) => {
      setRecentSOS(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sos_alerts');
    });

    return () => {
      unsubNotify();
      unsubShift();
      unsubDrivers();
      unsubSOS();
      unsubTrips();
      unsubRecentTrips();
      unsubRecentSOS();
    };
  }, [userData?.uid, allDrivers.length]);

  const recentActivity = useMemo(() => {
    return [
      ...recentTrips.map(t => ({
        id: t.id,
        type: 'trip',
        msg: t.status === 'completed' 
          ? `${allDrivers.find(d => d.uid === t.driverUid)?.name || 'Motorista'} terminou viagem de ${t.amount || 0}€`
          : t.status === 'cancelled'
          ? `${allDrivers.find(d => d.uid === t.driverUid)?.name || 'Motorista'} cancelou viagem`
          : `${allDrivers.find(d => d.uid === t.driverUid)?.name || 'Motorista'} iniciou viagem`,
        time: t.createdAt,
        danger: t.status === 'cancelled'
      })),
      ...recentSOS.map(s => ({
        id: s.id,
        type: 'sos',
        msg: `Alerta SOS: ${s.driverName || 'Motorista'}`,
        time: s.createdAt,
        danger: s.status === 'active'
      }))
    ].sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
     .slice(0, 8);
  }, [recentTrips, recentSOS, allDrivers]);

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffInSeconds < 60) return `agora`;
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return `${diffInMinutes}m atrás`;
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return `${diffInHours}h atrás`;
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d atrás`;
    } catch (e) {
      return '';
    }
  };

  const todayEarnings = todayTrips.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const driverRanking = useMemo(() => {
    const ranking: Record<string, { earnings: number; trips: number; name: string }> = {};
    
    // Initialize with all drivers
    allDrivers.forEach(d => {
      if (d.uid) {
        ranking[d.uid] = { earnings: 0, trips: 0, name: d.name || 'Motorista' };
      }
    });

    // Sum earnings and trips for today
    todayTrips.forEach(trip => {
      if (trip.driverUid && ranking[trip.driverUid]) {
        ranking[trip.driverUid].earnings += (trip.amount || 0);
        ranking[trip.driverUid].trips += 1;
      }
    });

    return Object.entries(ranking)
      .map(([uid, stats]) => ({ uid, ...stats }))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 3); // Get top 3
  }, [allDrivers, todayTrips]);



  const startShift = async () => {
    if (!userData?.uid) return;
    setIsStartingShift(true);
    try {
      const shiftStartTime = new Date().toISOString();
      await addDoc(collection(db, 'shifts'), {
        managerId: userData.uid,
        startedAt: shiftStartTime,
        startedBy: userData.uid,
        startedByName: userData.name,
        status: 'active',
        endedAt: null
      });

      // Notify all drivers linked to this manager
      await addDoc(collection(db, 'notifications'), {
        managerId: userData.uid,
        type: 'info',
        title: 'Turno Iniciado',
        message: 'O gestor iniciou o turno de operações. Por favor, fiquem atentos às rotas e comunicações.',
        createdAt: shiftStartTime,
        read: false,
        isForDrivers: true
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'shifts');
    } finally {
      setIsStartingShift(false);
    }
  };

  const endShift = async () => {
    if (!activeShift?.id) return;
    setIsEndingShift(true);
    try {
      await updateDoc(doc(db, 'shifts', activeShift.id), {
        status: 'ended',
        endedAt: new Date().toISOString(),
        endedBy: userData?.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `shifts/${activeShift.id}`);
    } finally {
      setIsEndingShift(false);
    }
  };

  const [shiftDuration, setShiftDuration] = useState('00:00:00');

  useEffect(() => {
    if (!activeShift?.startedAt) {
      setShiftDuration('00:00:00');
      return;
    }

    const interval = setInterval(() => {
      const start = new Date(activeShift.startedAt).getTime();
      const now = new Date().getTime();
      const diff = now - start;
      const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      setShiftDuration(`${h}:${m}:${s}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [activeShift?.startedAt]);

  const resolveSOS = async (sosId: string) => {
    try {
      await updateDoc(doc(db, 'sos_alerts', sosId), {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedBy: userData?.uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sos_alerts/${sosId}`);
    }
  };

  return (
    <div className={cn("space-y-6 pb-20 lg:pb-0 relative", userData?.planId && userData?.planId !== 'free' && "pro-dashboard")}>
      {/* Premium Background Elements for Pro */}
      {userData?.planId && userData?.planId !== 'free' && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-[-1]">
          <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-amber/5 blur-[120px] rounded-full animate-pulse" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-navy/5 blur-[120px] rounded-full" />
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <div className={cn(
              "w-12 h-12 rounded-2xl bg-amber flex items-center justify-center text-navy font-black text-xl shadow-lg hidden md:flex",
              userData?.planId && userData?.planId !== 'free' ? "shadow-amber/40 ring-4 ring-amber/10" : "shadow-amber/20"
            )}>
              {userData?.name?.charAt(0) || 'G'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl md:text-3xl font-black text-navy font-display tracking-tight leading-tight">
                  Olá, <span className="text-amber">{userData?.name?.split(' ')[0] || 'Gestor'}</span>
                </h1>
                {userData?.planId && userData?.planId !== 'free' && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <motion.div 
                      initial={{ opacity: 0, x: -10, scale: 0.8 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      className="flex items-center space-x-2 px-4 py-1.5 bg-gradient-to-r from-navy to-navy-lighter text-white rounded-full border border-amber/40 shadow-xl shadow-navy/20"
                    >
                      <Trophy size={14} className="text-amber" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{userData.planId} Edition</span>
                    </motion.div>
                    
                    <SubscriptionTimer currentPeriodEnd={userData.currentPeriodEnd} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Operational Alerts Section */}
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center space-x-4">
                <div className="p-2 bg-rose-500 text-white rounded-xl shadow-lg shadow-rose-500/20">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-rose-900 uppercase tracking-tight">{notif.title}</h4>
                  <p className="text-xs text-rose-600 font-medium">{notif.message}</p>
                </div>
              </div>
              <button 
                onClick={async () => {
                  try {
                    await updateDoc(doc(db, 'notifications', notif.id), { read: true });
                  } catch (err) {
                    handleFirestoreError(err, 'update' as any, `notifications/${notif.id}`);
                  }
                }}
                className="p-2 hover:bg-rose-100 text-rose-400 hover:text-rose-600 rounded-xl transition-colors"
              >
                <CheckCircle2 size={20} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Shift Management Component */}
      <GlassCard className="border-none shadow-amber-500/[0.05] p-5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-5">
            <div className={cn(
              "w-16 h-16 rounded-[2rem] flex items-center justify-center transition-all shadow-lg",
              activeShift 
                ? "bg-green-500 text-white shadow-green-500/20 animate-pulse" 
                : "bg-slate-100 text-slate-400 shadow-slate-200/50"
            )}>
              {activeShift ? <Timer size={32} /> : <Clock size={32} />}
            </div>
            <div>
              <h2 className="text-xl font-black text-navy uppercase tracking-tight">Turno de Operações</h2>
              <div className="flex items-center space-x-2 mt-1">
                <div className={cn("w-2 h-2 rounded-full", activeShift ? "bg-green-500" : "bg-slate-300")} />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Estado: <span className={activeShift ? "text-green-500" : "text-slate-500"}>
                    {activeShift ? 'EM CURSO' : 'TERMINADO / PAUSADO'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {activeShift && (
              <div className="px-6 py-3 bg-navy/5 rounded-2xl border border-navy/10 text-center sm:text-left">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Duração do Turno</p>
                <p className="text-2xl font-black text-navy font-mono">{shiftDuration}</p>
              </div>
            )}
            
            {!activeShift ? (
              <button
                onClick={startShift}
                disabled={isStartingShift}
                className="w-full sm:w-auto px-8 py-4 bg-navy text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-navy/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                {isStartingShift ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    <span>Iniciar Turno Equipa</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={endShift}
                disabled={isEndingShift}
                className="w-full sm:w-auto px-8 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-red-500/20 hover:scale-105 active:scale-95 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                {isEndingShift ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <Square size={18} fill="currentColor" />
                    <span>Finalizar Turno</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </GlassCard>

      {sosAlerts.length > 0 && (
        <div className="space-y-3">
          {sosAlerts.map(alert => (
            <motion.div 
              key={alert.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-600 border border-red-500 rounded-3xl p-5 flex items-center justify-between shadow-2xl shadow-red-500/20"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-white text-red-600 rounded-2xl flex items-center justify-center shadow-lg animate-pulse">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h4 className="text-white font-black uppercase tracking-tight">ALERTA SOS ATIVO</h4>
                  <p className="text-red-100 text-xs font-bold">{alert.driverName || 'Motorista'} precisa de ajuda!</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => setSelectedDriverId(alert.driverUid)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-[10px] font-black uppercase rounded-xl transition-all border border-white/20"
                >
                  Ver no Mapa
                </button>
                <button 
                  onClick={() => resolveSOS(alert.id)}
                  className="px-4 py-2 bg-white text-red-600 text-[10px] font-black uppercase rounded-xl transition-all shadow-lg hover:scale-105 active:scale-95"
                >
                  Resolver
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Ranking and Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <GlassCard className="border-none shadow-amber/[0.03] p-0 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber text-navy rounded-xl shadow-lg shadow-amber/20">
                <Trophy size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black text-navy uppercase tracking-tight">Ranking de Performance (Hoje)</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Líderes de faturamento na equipa</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right hidden sm:block">
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Total Equipa</p>
                <p className="text-xl font-black text-navy">{(todayEarnings || 0).toFixed(2)}€</p>
              </div>
              <button 
                onClick={() => navigate('/manager/daily-earnings')}
                className="px-4 py-2 bg-navy text-white text-[10px] font-black uppercase rounded-xl tracking-widest hover:bg-navy/90 transition-all shadow-lg shadow-navy/10"
              >
                Ver Tudo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {dataLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <Skeleton className="w-20 h-8 rounded-lg" />
                  </div>
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-12 h-12 rounded-2xl" />
                    <div className="space-y-2">
                      <Skeleton className="w-24 h-4 rounded" />
                      <Skeleton className="w-16 h-3 rounded" />
                    </div>
                  </div>
                </div>
              ))
            ) : driverRanking.length > 0 ? (
              driverRanking.map((driver, index) => (
                <div key={driver.uid} className="p-6 group hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shadow-md",
                      index === 0 ? "bg-amber text-navy shadow-amber/20" :
                      index === 1 ? "bg-slate-200 text-slate-600" :
                      "bg-amber/10 text-amber shadow-none"
                    )}>
                      {index + 1}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Faturado</p>
                      <p className="text-2xl font-black text-navy group-hover:text-amber transition-colors">{(driver.earnings || 0).toFixed(2)}€</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-navy font-black text-xl shadow-sm">
                      {driver.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-black text-navy truncate max-w-[120px]">{driver.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center">
                        <TrendingUp size={10} className="mr-1 text-green-500" />
                        {driver.trips} Viagens
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-12 text-center">
                <Medal size={48} className="mx-auto text-slate-100 mb-3" />
                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Dados de performance ainda não disponíveis hoje</p>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <GlassCard className="border-none shadow-amber-500/[0.03]">
            <h3 className="text-lg font-black mb-6 text-slate-900 flex items-center space-x-2">
              <TukTukLogo variant="icon" className="w-5 h-5 text-green-500" />
              <span>Condutores no Terreno</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dataLoading ? (
                [1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-3 rounded-2xl border border-slate-50 bg-slate-50/50 flex items-center space-x-2.5">
                    <Skeleton className="w-9 h-9 rounded-xl" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="w-2/3 h-3.5 rounded" />
                      <Skeleton className="w-1/3 h-2.5 rounded" />
                    </div>
                  </div>
                ))
              ) : onlineDrivers.map(driver => {
                const activeTrip = activeTrips.find(t => t.driverUid === driver.uid);
                const isSelected = selectedDriverId === driver.uid;
                return (
                  <button 
                    key={driver.id} 
                    onClick={() => setSelectedDriverId(prev => prev === driver.uid ? null : driver.uid)}
                    className={cn(
                      "p-3 rounded-2xl border transition-all relative overflow-hidden text-left w-full",
                      isSelected ? "bg-navy border-navy ring-4 ring-navy/10 z-10" :
                      activeTrip 
                        ? "bg-amber/5 border-amber/30 shadow-[0_0_20px_rgba(245,166,35,0.15)] shadow-amber/20" 
                        : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                    )}
                  >
                    {activeTrip && !isSelected && (
                      <div className="absolute top-0 right-0 w-1.5 h-full bg-amber animate-pulse" />
                    )}
                    <div className="flex items-center space-x-2.5">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs transition-all",
                        isSelected ? "bg-white text-navy" :
                        activeTrip ? "bg-amber text-navy" : "bg-white text-slate-400 border border-slate-200"
                      )}>
                        {driver.name?.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[13px] font-bold truncate leading-tight", isSelected ? "text-white" : "text-slate-900")}>
                          {driver.name}
                        </p>
                        <p className={cn(
                          "text-[9px] font-black uppercase tracking-widest",
                          isSelected ? "text-amber" :
                          activeTrip ? "text-amber" : "text-green-500"
                        )}>
                          {activeTrip ? (isSelected ? 'Viendo...' : 'Viagem') : 'Online'}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {onlineDrivers.length === 0 && (
                <div className="col-span-full py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Sem condutores online</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {selectedDriverId ? (
              <motion.div
                key="live-map"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full min-h-[500px] flex flex-col"
              >
                <GlassCard className="flex-1 flex flex-col p-0 overflow-hidden border-navy/20 shadow-xl shadow-navy/5">
                  <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-md">
                    <div className="flex items-center space-x-2.5 md:space-x-3">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-navy text-white flex items-center justify-center text-xs md:text-sm font-black">
                        {onlineDrivers.find(d => d.uid === selectedDriverId)?.name?.charAt(0)}
                      </div>
                      <div>
                        <h3 className="text-[10px] md:text-sm font-black text-navy uppercase tracking-tight">Seguimento Direto</h3>
                        <p className="text-[9px] md:text-xs text-slate-500 font-bold leading-tight">{onlineDrivers.find(d => d.uid === selectedDriverId)?.name}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedDriverId(null)}
                      className="p-1.5 md:p-2 rounded-lg md:rounded-xl bg-slate-100 text-slate-400 hover:text-navy hover:bg-slate-200 transition-all font-black text-[10px]"
                    >
                      SAIR
                    </button>
                  </div>
                  <div className="flex-1 relative">
                    <FleetMap 
                      initialSelectedDriverId={selectedDriverId} 
                      onSelectDriver={(id) => setSelectedDriverId(id)}
                    />
                  </div>
                </GlassCard>
              </motion.div>
            ) : (
              <motion.div
                key="activity-feed"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col space-y-6"
              >
                <GlassCard className="border-none shadow-blue-500/[0.03]">
                  <h3 className="text-lg font-black mb-6 text-slate-900 flex items-center space-x-2">
                    <TukTukLogo variant="icon" className="w-5 h-5 text-amber" />
                    <span>Atividade Recente</span>
                  </h3>
                  <div className="space-y-4">
                    {recentActivity.length > 0 ? (
                      recentActivity.map((item) => (
                        <div key={item.id} className={cn("flex justify-between items-center p-4 rounded-2xl border transition-all", item.danger ? "bg-red-50 border-red-100 shadow-sm shadow-red-500/10" : "bg-slate-50/50 border-slate-100")}>
                          <div className="flex items-center space-x-3">
                            <div className={cn(
                              "p-2 rounded-lg",
                              item.type === 'sos' ? "bg-red-100 text-red-500" : "bg-slate-100 text-slate-500"
                            )}>
                              {item.type === 'sos' ? <AlertTriangle size={14} /> : <Activity size={14} />}
                            </div>
                            <span className={cn("text-sm font-medium", item.danger ? "text-red-500 font-bold" : "text-slate-700")}>{item.msg}</span>
                          </div>
                          <span className="text-xs text-slate-400 font-bold">{formatTimeAgo(item.time)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="py-12 text-center">
                        <Clock className="mx-auto text-slate-200 mb-2" size={32} />
                        <p className="text-slate-400 font-bold">Sem atividade recente</p>
                      </div>
                    )}
                  </div>
                </GlassCard>
                
                <GlassCard className="hidden lg:block">
                  <h3 className="text-lg font-bold mb-6 text-amber">Tendência Semanal</h3>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mockData}>
                        <XAxis dataKey="name" stroke="#6B7A99" fontSize={10} axisLine={false} tickLine={false} />
                        <Bar dataKey="earnings" fill="#F5A623" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <SuccessCelebrationModal 
        isOpen={showSuccessModal} 
        onClose={() => setShowSuccessModal(false)}
        planName={userData?.planId || 'Pro'}
        slots={userData?.vehicleSlots || 1}
      />
    </div>
  );
}
