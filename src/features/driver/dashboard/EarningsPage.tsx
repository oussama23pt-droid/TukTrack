import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Wallet, TrendingUp, Calendar, ChevronRight, DollarSign } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';

interface Trip {
  id: string;
  driverUid: string;
  amount: number;
  status: string;
  createdAt: string;
  description?: string;
}

export default function EarningsPage() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!user) return;

    // Get last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    threeMonthsAgo.setHours(0, 0, 0, 0);

    const tripsQuery = query(
      collection(db, 'trips'),
      where('driverUid', '==', user.uid),
      where('status', '==', 'completed'),
      where('createdAt', '>=', threeMonthsAgo.toISOString()),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(tripsQuery, (snapshot) => {
      const allTrips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trip));
      setTrips(allTrips);
      
      // Default weekly total calculation (hardcoded to last 7 days from now)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekly = allTrips
        .filter(t => t.createdAt >= sevenDaysAgo.toISOString())
        .reduce((acc, curr) => acc + (curr.amount || 0), 0);
      setWeeklyTotal(weekly);

      const today = new Date().toISOString().split('T')[0];
      const todaySum = allTrips
        .filter(t => t.createdAt?.startsWith(today))
        .reduce((acc, curr) => acc + (curr.amount || 0), 0);
      setTodayTotal(todaySum);

      // Group by day for chart (last 7 days)
      const days: Record<string, number> = {};
      const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        days[dateStr] = 0;
      }

      allTrips.forEach(t => {
        const dateStr = t.createdAt?.split('T')[0];
        if (dateStr && days[dateStr] !== undefined) {
          days[dateStr] += t.amount || 0;
        }
      });

      const formattedData = Object.entries(days).map(([date, amount]) => ({
        name: dayNames[new Date(date).getDay()],
        amount,
        rawDate: date
      })).reverse();

      setChartData(formattedData);
    });

    return () => unsub();
  }, [user]);

  // Apply filters
  useEffect(() => {
    const filtered = trips.filter(t => {
      const tripDate = t.createdAt?.split('T')[0];
      return tripDate >= startDate && tripDate <= endDate;
    });
    setFilteredTrips(filtered);
    setFilteredTotal(filtered.reduce((acc, curr) => acc + (curr.amount || 0), 0));
  }, [trips, startDate, endDate]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header Summary */}
      <div className="relative">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-navy border border-white/10 rounded-[2.5rem] p-8 text-center shadow-2xl shadow-navy/20 relative overflow-hidden"
        >
          <div className="absolute -right-10 -top-10 w-48 h-48 bg-amber/20 rounded-full blur-3xl" />
          <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-navy-lighter/20 rounded-full blur-3xl" />
          
          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3 relative z-10">Total Filtrado</p>
          <p className="text-5xl font-black text-white mb-3 relative z-10 italic tracking-tighter">
            {(filteredTotal || 0).toFixed(2)}€
          </p>
          
          <div className="flex items-center justify-center space-x-3 relative z-10">
            <span className="bg-amber/10 text-amber px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber/10">
              {filteredTrips.length} Viagens
            </span>
          </div>
        </motion.div>
      </div>

      {/* Date Filters */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center space-x-2 mb-4">
          <Calendar size={16} className="text-amber" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Filtrar por Período</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Início</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-12 bg-slate-50 border border-slate-200 rounded-[1.25rem] px-4 text-xs font-bold text-navy focus:border-amber outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Fim</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-12 bg-slate-50 border border-slate-200 rounded-[1.25rem] px-4 text-xs font-bold text-navy focus:border-amber outline-none transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-black text-slate-900 mb-6 tracking-tight">Desempenho (Últimos 7d)</h3>
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} stroke="#94a3b8" fontSize={10} fontWeight="bold" />
              <Tooltip 
                cursor={{ fill: 'rgba(241,245,249,0.5)' }}
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                itemStyle={{ color: '#f59e0b', fontWeight: 'bold' }}
                labelStyle={{ color: '#64748b', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              />
              <Bar dataKey="amount" fill="#f59e0b" radius={[6, 6, 0, 0]} barSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* History List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Histórico de Viagens</h3>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">3 meses</span>
        </div>
        
        <div className="space-y-3">
          {filteredTrips.map((trip, i) => (
            <motion.div
              key={trip.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.05, 0.5) }}
              className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm group hover:border-amber/20 transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber/5 flex items-center justify-center text-amber">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-navy uppercase tracking-tight">Viagem #...{trip.id.slice(-4)}</h4>
                    <span className="text-[10px] font-bold text-slate-400">
                      {trip.createdAt ? new Date(trip.createdAt).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '---'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-navy italic tracking-tight">{trip.amount?.toFixed(2)}€</p>
                  <span className="text-[8px] font-black text-green-500 uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded-md border border-green-100/50">Concluída</span>
                </div>
              </div>
              
              {trip.description && (
                <div className="mt-3 pt-3 border-t border-slate-50">
                  <p className="text-[10px] font-bold text-slate-500 italic leading-relaxed">
                    "{trip.description}"
                  </p>
                </div>
              )}
            </motion.div>
          ))}

          {filteredTrips.length === 0 && (
            <div className="py-20 text-center bg-slate-50/50 rounded-[2.5rem] border-2 border-dashed border-slate-200">
              <TrendingUp className="mx-auto text-slate-300 mb-4" size={40} />
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nenhuma viagem encontrada</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
