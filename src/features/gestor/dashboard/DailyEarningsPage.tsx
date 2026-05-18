import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, DollarSign, Calendar, Clock, ChevronRight, X, TrendingUp, Search, ArrowLeft, MapPin } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';
import { GlassCard } from '../../../components/GlassCard';
import { cn } from '../../../lib/utils';
import { useNavigate } from 'react-router-dom';

interface TripData {
  id: string;
  amount: number;
  passengers: number;
  duration?: number;
  createdAt: string;
  driverUid: string;
  description: string;
  status: string;
}

export default function DailyEarningsPage() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<TripData[]>([]);
  const [drivers, setDrivers] = useState<Record<string, any>>({});
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!userData?.uid) return;

    // Fetch Drivers linked to this manager
    const driversQuery = query(
      collection(db, 'users'),
      where('managerId', '==', userData.uid),
      where('role', '==', 'driver')
    );

    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      const driversMap: Record<string, any> = {};
      snapshot.forEach(doc => {
        driversMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setDrivers(driversMap);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tripsQuery = query(
      collection(db, 'trips'),
      where('managerId', '==', userData.uid),
      where('status', '==', 'completed'),
      where('createdAt', '>=', today.toISOString()),
      orderBy('createdAt', 'desc')
    );

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TripData));
      setTrips(tripsData);
    });

    return () => {
      unsubDrivers();
      unsubTrips();
    };
  }, [userData?.uid]);

  const todayStats = useMemo(() => {
    const revenue = trips.reduce((acc, t) => acc + (t.amount || 0), 0);
    
    const driverStatsMap: Record<string, { id: string, trips: number, revenue: number, name: string }> = {};
    
    trips.forEach(t => {
      const driverId = t.driverUid;
      if (!driverId) return;
      if (!driverStatsMap[driverId]) {
        driverStatsMap[driverId] = { 
          id: driverId, 
          trips: 0, 
          revenue: 0, 
          name: drivers[driverId]?.name || 'Motorista' 
        };
      }
      driverStatsMap[driverId].trips += 1;
      driverStatsMap[driverId].revenue += (t.amount || 0);
    });

    const driverList = Object.values(driverStatsMap)
      .filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      revenue,
      tripsCount: trips.length,
      drivers: driverList
    };
  }, [trips, drivers, searchTerm]);

  const selectedDriverTrips = useMemo(() => {
    if (!selectedDriverId) return [];
    return trips.filter(t => t.driverUid === selectedDriverId);
  }, [selectedDriverId, trips]);

  const selectedDriver = selectedDriverId ? drivers[selectedDriverId] : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 lg:pb-0">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => selectedDriverId ? setSelectedDriverId(null) : navigate(-1)}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-black font-display text-slate-900 tracking-tight">
              {selectedDriverId ? `Viagens: ${selectedDriver?.name}` : 'Ganhos Hoje'}
            </h1>
            <p className="text-slate-500">
              {selectedDriverId 
                ? `Detalhes das ${selectedDriverTrips.length} viagens feitas hoje.`
                : `Resumo de faturação por condutor para ${new Date().toLocaleDateString('pt-PT')}.`}
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!selectedDriverId ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            {/* Summary Card */}
            <GlassCard className="p-8 bg-gradient-to-br from-navy to-slate-800 text-white border-none shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 right-0 w-64 h-64 bg-amber/10 blur-3xl -mr-20 -mt-20" />
               <div className="relative z-10">
                 <div className="flex items-center justify-between mb-8">
                   <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md">
                     <DollarSign size={24} className="text-amber" />
                   </div>
                   <div className="flex items-center space-x-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                     <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                     <span className="text-[10px] font-black uppercase tracking-widest text-white">Live</span>
                   </div>
                 </div>
                 <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Faturação Total Hoje</p>
                 <h3 className="text-6xl font-black tracking-tighter mb-4">
                   {todayStats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
                 </h3>
                 <div className="flex items-center space-x-6 text-slate-300 font-bold text-sm tracking-tight border-t border-white/5 pt-6 mt-6">
                   <div className="flex items-center">
                     <TrendingUp size={16} className="text-green-400 mr-2" />
                     <span>{todayStats.tripsCount} Viagens Concluídas</span>
                   </div>
                   <div className="flex items-center">
                     <Users size={16} className="text-blue-400 mr-2" />
                     <span>{todayStats.drivers.length} Motoristas com Receita</span>
                   </div>
                 </div>
               </div>
            </GlassCard>

            {/* Drivers List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-navy uppercase tracking-widest">Condutores em Atividade</h3>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="text"
                    placeholder="Procurar motorista..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-white border border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-amber transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayStats.drivers.map((driver, index) => (
                  <button 
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.id)}
                    className="group"
                  >
                    <GlassCard className="p-6 transition-all group-hover:scale-[1.02] group-hover:border-amber group-active:scale-[0.98] h-full">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg transition-all",
                            index === 0 ? "bg-amber text-navy shadow-lg shadow-amber/20" : "bg-slate-50 text-slate-400"
                          )}>
                            {driver.name.charAt(0)}
                          </div>
                          <div className="text-left">
                            <p className="font-black text-navy text-lg tracking-tight group-hover:text-amber transition-colors">{driver.name}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{driver.trips} Viagens Realizadas</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-navy">{(driver.revenue || 0).toFixed(2)}€</p>
                          <ChevronRight size={18} className="text-slate-300 ml-auto mt-1 group-hover:text-amber group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    </GlassCard>
                  </button>
                ))}
                {todayStats.drivers.length === 0 && (
                  <div className="col-span-full py-20 text-center">
                    <Users size={48} className="mx-auto text-slate-200 mb-4 opacity-20" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Nenhum motorista com faturação hoje</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Driver Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <GlassCard className="p-6 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-amber/10 rounded-full flex items-center justify-center mb-4">
                  <Users size={32} className="text-amber" />
                </div>
                <h2 className="text-xl font-black text-navy">{selectedDriver?.name}</h2>
                <div className="flex items-center text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mr-2" />
                  Ativo hoje
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total de Viagens</p>
                <div className="flex items-end space-x-2">
                  <h4 className="text-4xl font-black text-navy">{selectedDriverTrips.length}</h4>
                  <span className="text-xs font-bold text-slate-400 mb-1.5">Viagens</span>
                </div>
              </GlassCard>

              <GlassCard className="p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Receita Acumulada</p>
                <div className="flex items-end space-x-2">
                  <h4 className="text-4xl font-black text-emerald-600">
                    {selectedDriverTrips.reduce((acc, t) => acc + (t.amount || 0), 0).toFixed(2)}€
                  </h4>
                  <span className="text-xs font-bold text-slate-400 mb-1.5">EUR</span>
                </div>
              </GlassCard>
            </div>

            {/* Trips List */}
            <GlassCard className="p-0 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-sm font-black text-navy uppercase tracking-widest">Viagens do Dia</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {selectedDriverTrips.map((trip) => (
                  <button 
                    key={trip.id} 
                    onClick={() => navigate('/manager/map', { state: { playbackTripId: trip.id } })}
                    className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-colors text-left group"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:bg-amber group-hover:text-navy transition-all">
                        <Clock size={18} className="text-slate-400 group-hover:text-navy" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-navy group-hover:text-amber transition-colors">{trip.description || 'Rota Manual'}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                          {new Date(trip.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                          <span className="mx-2">•</span>
                          {trip.passengers || 1} Passageiros
                          {trip.duration && (
                            <>
                              <span className="mx-2">•</span>
                              {trip.duration} min
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-2xl font-black text-navy group-hover:text-amber transition-colors">{(trip.amount || 0).toFixed(2)}€</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl text-slate-300 group-hover:bg-amber/10 group-hover:text-amber transition-all">
                        <MapPin size={20} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
