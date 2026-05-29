import React, { useState, useEffect, useMemo } from 'react';
import { BarChart as BarChartIcon, TrendingUp, DollarSign, Calendar, Download, Users, X, ChevronRight, Loader2, ArrowLeft, MapPin, Clock, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GlassCard } from '../../../components/GlassCard';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, AreaChart, Area } from 'recharts';
import { cn } from '../../../lib/utils';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface TripData {
  id: string;
  amount: number;
  passengers: number;
  duration?: number;
  createdAt: string;
  status: string;
  managerId: string;
}

export default function ReportsPage() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [drivers, setDrivers] = useState<Record<string, any>>({});
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [trips, setTrips] = useState<TripData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

    const q = query(
      collection(db, 'trips'),
      where('managerId', '==', userData.uid),
      where('status', '==', 'completed')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TripData[];
      setTrips(data);
      setIsLoading(false);
    }, (err) => {
      console.error('Error fetching trips for reports:', err);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
      unsubDrivers();
    };
  }, [userData?.uid]);

  const filteredTrips = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000) - 1; // End of day

    return trips.filter(trip => {
      const tripTime = new Date(trip.createdAt).getTime();
      return tripTime >= start && tripTime <= end;
    });
  }, [trips, startDate, endDate]);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayTrips = trips.filter(t => t.createdAt.split('T')[0] === today);
    const revenue = todayTrips.reduce((acc, t) => acc + (t.amount || 0), 0);
    
    const driverStats: Record<string, { trips: number, revenue: number, name: string }> = {};
    
    todayTrips.forEach(t => {
      const driverId = (t as any).driverUid;
      if (!driverId) return;
      if (!driverStats[driverId]) {
        driverStats[driverId] = { trips: 0, revenue: 0, name: drivers[driverId]?.name || 'Motorista' };
      }
      driverStats[driverId].trips += 1;
      driverStats[driverId].revenue += (t.amount || 0);
    });

    return {
      revenue,
      trips: todayTrips.length,
      drivers: Object.entries(driverStats).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.revenue - a.revenue)
    };
  }, [trips, drivers]);

  const driverDetails = useMemo(() => {
    if (!selectedDriverId) return null;
    const driverTrips = filteredTrips.filter(t => (t as any).driverUid === selectedDriverId);
    const revenue = driverTrips.reduce((acc, t) => acc + (t.amount || 0), 0);
    
    // Group by date for chart
    const daily: Record<string, number> = {};
    driverTrips.forEach(t => {
      const date = t.createdAt.split('T')[0];
      daily[date] = (daily[date] || 0) + (t.amount || 0);
    });

    const chartData = Object.entries(daily).map(([date, revenue]) => ({
      name: new Date(date).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }),
      revenue
    })).sort((a, b) => new Date(a.name).getTime() - new Date(b.name).getTime());

    return {
      name: drivers[selectedDriverId]?.name || 'Motorista',
      trips: driverTrips,
      totalRevenue: revenue,
      chartData
    };
  }, [selectedDriverId, filteredTrips, drivers]);

  const prevFilteredTrips = useMemo(() => {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const duration = end - start;
    
    const prevStart = start - duration - (24 * 60 * 60 * 1000);
    const prevEnd = start - 1;

    return trips.filter(trip => {
      const tripTime = new Date(trip.createdAt).getTime();
      return tripTime >= prevStart && tripTime <= prevEnd;
    });
  }, [trips, startDate, endDate]);

  const stats = useMemo(() => {
    const totalEarnings = filteredTrips.reduce((acc, t) => acc + (t.amount || 0), 0);
    const totalTrips = filteredTrips.length;
    const avgPerTrip = totalTrips > 0 ? totalEarnings / totalTrips : 0;

    const prevEarnings = prevFilteredTrips.reduce((acc, t) => acc + (t.amount || 0), 0);
    const prevTrips = prevFilteredTrips.length;
    const prevAvg = prevTrips > 0 ? prevEarnings / prevTrips : 0;

    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      totalEarnings,
      totalTrips,
      avgPerTrip,
      earningsChange: calcChange(totalEarnings, prevEarnings),
      tripsChange: calcChange(totalTrips, prevTrips),
      avgChange: calcChange(avgPerTrip, prevAvg)
    };
  }, [filteredTrips, prevFilteredTrips]);

  const chartData = useMemo(() => {
    const days: Record<string, { name: string, earnings: number, count: number }> = {};
    
    // Initialize days based on range
    const start = new Date(startDate);
    const end = new Date(endDate);
    const current = new Date(start);
    
    while (current <= end) {
      const key = current.toISOString().split('T')[0];
      const dayName = current.toLocaleDateString('pt-PT', { weekday: 'short' });
      days[key] = { name: dayName.charAt(0).toUpperCase() + dayName.slice(1, 3), earnings: 0, count: 0 };
      current.setDate(current.getDate() + 1);
    }

    filteredTrips.forEach(trip => {
      const key = trip.createdAt.split('T')[0];
      if (days[key]) {
        days[key].earnings += (trip.amount || 0);
        days[key].count += 1;
      }
    });

    return Object.values(days);
  }, [filteredTrips, startDate, endDate]);

  const monthlyEvolution = useMemo(() => {
    // Show last 7 units of the range for the evolution chart
    const data = chartData.slice(-7);
    const maxEarnings = Math.max(...data.map(d => d.earnings), 1);
    const maxTrips = Math.max(...data.map(d => d.count), 1);

    return data.map(d => ({
      ...d,
      earningsHeight: (d.earnings / maxEarnings) * 100,
      tripsHeight: (d.count / maxTrips) * 100
    }));
  }, [chartData]);

  const periodStats = useMemo(() => {
    const driverStats: Record<string, { trips: number, revenue: number, name: string }> = {};
    
    filteredTrips.forEach(t => {
      const driverId = (t as any).driverUid;
      if (!driverId) return;
      if (!driverStats[driverId]) {
        driverStats[driverId] = { trips: 0, revenue: 0, name: drivers[driverId]?.name || 'Motorista' };
      }
      driverStats[driverId].trips += 1;
      driverStats[driverId].revenue += (t.amount || 0);
    });

    return {
      drivers: Object.entries(driverStats)
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
    };
  }, [filteredTrips, drivers]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
  };

  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const userName = userData?.name || 'Gestor';
      const period = `${formatDate(startDate)} - ${formatDate(endDate)}`;

      // Header
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59); // navy color
      doc.text('Relatório de Desempenho Operacional', 14, 22);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Gestor: ${userName}`, 14, 32);
      doc.text(`Período: ${period}`, 14, 38);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-PT')}`, 14, 44);

      // Summary
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Sumário Executivo', 14, 58);

      autoTable(doc, {
        startY: 64,
        head: [['Métrica', 'Valor', 'Evolução']],
        body: [
          ['Faturação Total', `${(stats.totalEarnings || 0).toFixed(2)}€`, `${stats.earningsChange >= 0 ? '+' : ''}${(stats.earningsChange || 0).toFixed(1)}%`],
          ['Total de Viagens', stats.totalTrips.toString(), `${stats.tripsChange >= 0 ? '+' : ''}${stats.tripsChange.toFixed(1)}%`],
          ['Média por Viagem', `${(stats.avgPerTrip || 0).toFixed(2)}€`, `${stats.avgChange >= 0 ? '+' : ''}${(stats.avgChange || 0).toFixed(1)}%`],
          ['Total Passageiros', filteredTrips.reduce((acc, t) => acc + (t.passengers || 1), 0).toString(), '-']
        ],
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });

      // Ranking
      doc.setFontSize(16);
      doc.text('Desempenho por Motorista', 14, (doc as any).lastAutoTable.finalY + 15);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Posição', 'Motorista', 'Viagens', 'Receita (€)', '% do Total']],
        body: periodStats.drivers.map((d, i) => [
          (i + 1).toString(),
          d.name,
          d.trips.toString(),
          d.revenue.toFixed(2),
          `${((d.revenue / (stats.totalEarnings || 1)) * 100).toFixed(1)}%`
        ]),
        headStyles: { fillColor: [245, 166, 35] }, // amber
      });

      // Daily Breakdown
      if ((doc as any).lastAutoTable.finalY > 200) doc.addPage();
      
      doc.setFontSize(16);
      doc.text('Detalhamento Diário', 14, (doc as any).lastAutoTable.finalY + 15);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Data', 'Dia', 'Viagens', 'Receita (€)']],
        body: chartData.filter(d => d.earnings > 0 || d.count > 0).map(d => [
          // We need the actual date string from the chartData calculation
          d.name, // This is current 'Seg', 'Ter' etc, maybe better to show actual date but we don't store it in chartData object
          '', 
          d.count.toString(),
          d.earnings.toFixed(2)
        ]),
        headStyles: { fillColor: [30, 41, 59] },
      });

      

      const blob = doc.output('blob');
      const filename = `Relatorio_Conta_${startDate}_${endDate}.pdf`;

      const isNative = !!(window as any).Capacitor?.isNativePlatform?.();

      if (isNative) {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          const result = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Cache,
          });
          await Share.share({
            title: filename,
            url: result.uri,
            dialogTitle: 'Guardar ou partilhar PDF',
          });
        };
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }, 300);
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          {selectedDriverId && (
            <button 
              onClick={() => setSelectedDriverId(null)}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
          )}
          <div>
            <h1 className="text-3xl font-black font-display text-slate-900 tracking-tight">
              {selectedDriverId ? `Perfil: ${driverDetails?.name}` : 'Relatórios'}
            </h1>
            <p className="text-slate-500">
              {selectedDriverId 
                ? 'Análise detalhada de viagens e ganhos.'
                : 'Análise de desempenho e faturação da frota.'}
            </p>
          </div>
        </div>
        
        {!selectedDriverId && (
          <div className="flex flex-wrap items-center gap-3 relative">
            <div className="relative flex-1 sm:flex-none">
              <button 
                onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                className={cn(
                  "w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2 bg-white border rounded-xl text-sm font-bold transition-all shadow-sm",
                  isDatePickerOpen ? "border-amber ring-2 ring-amber/10 text-amber" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <Calendar size={16} className={isDatePickerOpen ? "text-amber" : "text-slate-400"} />
                <span>{formatDate(startDate)} - {formatDate(endDate)}</span>
              </button>

              <AnimatePresence>
                {isDatePickerOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsDatePickerOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:translate-y-0 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 z-50 overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-6">
                        <h4 className="text-sm font-black uppercase tracking-widest text-navy">Filtrar por Data</h4>
                        <button 
                          onClick={() => setIsDatePickerOpen(false)}
                          className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Início</label>
                          <input 
                            type="date" 
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber/10 focus:border-amber outline-none transition-all"
                          />
                        </div>

                        <div className="flex justify-center text-slate-300 py-1">
                          <ChevronRight size={16} className="rotate-90" />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Fim</label>
                          <input 
                            type="date" 
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-amber/10 focus:border-amber outline-none transition-all"
                          />
                        </div>

                        <div className="pt-4 grid grid-cols-2 gap-3">
                          <button 
                            onClick={() => {
                              setStartDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                              setEndDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-amber bg-slate-50 rounded-lg transition-all"
                          >
                            7 Dias
                          </button>
                          <button 
                            onClick={() => {
                              setStartDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
                              setEndDate(new Date().toISOString().split('T')[0]);
                            }}
                            className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-amber bg-slate-50 rounded-lg transition-all"
                          >
                            30 Dias
                          </button>
                        </div>

                        <button 
                          onClick={() => setIsDatePickerOpen(false)}
                          className="w-full py-3 bg-navy text-white rounded-xl text-sm font-black hover:bg-slate-800 transition-all shadow-lg shadow-navy/10 mt-4"
                        >
                          Aplicar Filtro
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            <button 
              onClick={exportToPDF}
              disabled={isExporting}
              className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 bg-amber text-navy rounded-xl text-sm font-black hover:scale-105 transition-all shadow-lg shadow-amber/10 disabled:opacity-50"
            >
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              <span>{isExporting ? 'A Exportar...' : 'Exportar PDF'}</span>
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!selectedDriverId ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <DollarSign size={48} className="text-amber" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Receita Total</p>
                <div className="flex items-baseline space-x-1">
                   <h3 className="text-3xl font-black text-navy">{stats.totalEarnings.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</h3>
                   <span className="text-sm font-black text-slate-400">€</span>
                </div>
                <div className={cn(
                  "flex items-center mt-3 text-[10px] font-black uppercase tracking-wider",
                  stats.earningsChange >= 0 ? "text-emerald-500" : "text-rose-500"
                )}>
                  {stats.earningsChange >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1 rotate-180" />}
                  {Math.abs(stats.earningsChange || 0).toFixed(1)}% vs anterior
                </div>
              </GlassCard>

              <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <BarChartIcon size={48} className="text-blue-500" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total de Viagens</p>
                <h3 className="text-3xl font-black text-navy">{stats.totalTrips}</h3>
                <div className={cn(
                  "flex items-center mt-3 text-[10px] font-black uppercase tracking-wider",
                  stats.tripsChange >= 0 ? "text-emerald-500" : "text-rose-500"
                )}>
                  {stats.tripsChange >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1 rotate-180" />}
                  {Math.abs(stats.tripsChange || 0).toFixed(1)}% vs anterior
                </div>
              </GlassCard>

              <GlassCard className="p-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={48} className="text-purple-500" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Média por Viagem</p>
                <div className="flex items-baseline space-x-1">
                  <h3 className="text-3xl font-black text-navy">{stats.avgPerTrip.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}</h3>
                  <span className="text-sm font-black text-slate-400">€</span>
                </div>
                <div className={cn(
                  "flex items-center mt-3 text-[10px] font-black uppercase tracking-wider",
                  stats.avgChange >= 0 ? "text-emerald-500" : "text-rose-500"
                )}>
                  {stats.avgChange >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingUp size={12} className="mr-1 rotate-180" />}
                  {Math.abs(stats.avgChange || 0).toFixed(1)}% vs anterior
                </div>
              </GlassCard>

              <GlassCard className="p-6 relative overflow-hidden group bg-navy text-white border-none shadow-xl shadow-navy/20">
                <div className="absolute top-0 right-0 p-4 opacity-20">
                  <BarChartIcon size={48} className="text-amber" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Passageiros Totais</p>
                <h3 className="text-3xl font-black text-white">
                  {filteredTrips.reduce((acc, t) => acc + (t.passengers || 1), 0)}
                </h3>
                <div className="flex items-center mt-3 text-[10px] font-black uppercase tracking-widest text-amber">
                  Período selecionado
                </div>
              </GlassCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Revenue Chart */}
              <GlassCard className="lg:col-span-2 p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-black text-navy uppercase tracking-tight">Evolução Faturação</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ganhos diários na sua conta</p>
                  </div>
                  <div className="p-3 bg-amber/10 rounded-xl text-amber">
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div className="h-80 w-full">
                  {isLoading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="animate-spin text-amber" size={32} />
                    </div>
                  ) : chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F5A623" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#F5A623" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis 
                          dataKey="name" 
                          stroke="#6B7A99" 
                          fontSize={10} 
                          axisLine={false} 
                          tickLine={false}
                          dy={10}
                        />
                        <YAxis 
                          stroke="#6B7A99" 
                          fontSize={10} 
                          axisLine={false} 
                          tickLine={false} 
                          tickFormatter={(val) => `${val}€`} 
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1E1E2E', border: 'none', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)' }}
                          itemStyle={{ color: '#F5A623', fontWeight: 'black' }}
                          labelStyle={{ color: '#94A3B8', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}
                          cursor={{ stroke: '#F5A623', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="earnings" 
                          name="Receita" 
                          stroke="#F5A623" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorEarnings)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                      <BarChartIcon size={48} className="mb-2 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Sem dados para este período</p>
                    </div>
                  )}
                </div>
              </GlassCard>

              {/* Driver Ranking */}
              <GlassCard className="p-0 overflow-hidden flex flex-col">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-lg font-black text-navy uppercase tracking-tight">Ranking Motoristas</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Melhor desempenho no período</p>
                </div>
                <div className="flex-1 overflow-y-auto max-h-[400px] divide-y divide-slate-50">
                  {periodStats.drivers.length > 0 ? (
                    periodStats.drivers.map((driver, index) => (
                      <button 
                        key={driver.id} 
                        onClick={() => setSelectedDriverId(driver.id)}
                        className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-all group text-left"
                      >
                        <div className="flex items-center space-x-4">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shadow-sm transition-all",
                            index === 0 ? "bg-amber text-navy" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                          )}>
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-black text-navy tracking-tight group-hover:text-amber transition-colors">{driver.name}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{driver.trips} Viagens</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-navy">{driver.revenue.toFixed(2)}€</p>
                          <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div 
                              className="h-full bg-amber" 
                              style={{ width: `${(driver.revenue / (periodStats.drivers[0].revenue || 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-12 text-center text-slate-300">
                      <Users size={48} className="mx-auto mb-4 opacity-10" />
                      <p className="text-xs font-black uppercase tracking-widest">Sem registros</p>
                    </div>
                  )}
                </div>
                <div className="p-6 mt-auto border-t border-slate-50">
                   <button 
                    onClick={() => navigate('/manager/drivers')}
                    className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber/10 hover:text-amber transition-all"
                   >
                     Gerir Motoristas
                   </button>
                </div>
              </GlassCard>
            </div>

            {/* Daily Real-time Monitoring Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <GlassCard className="p-8 bg-gradient-to-br from-navy to-slate-800 text-white border-none shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Activity size={120} />
                </div>
                <div className="flex items-center justify-between mb-8 relative z-10">
                  <div className="p-3 bg-white/10 rounded-xl">
                    <DollarSign size={24} className="text-amber" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white px-3 py-1 rounded-full animate-pulse">Hoje em Direto</span>
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 relative z-10">Faturação HOJE</p>
                <h3 className="text-5xl font-black tracking-tight mb-2 relative z-10">{todayStats.revenue.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€</h3>
                <div className="flex items-center space-x-4 mt-6 pt-6 border-t border-white/5 relative z-10">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{todayStats.trips} Viagens concluídas desde as 00h</span>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-8 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-black text-navy uppercase tracking-tight">Performance diária</h3>
                  <Users size={20} className="text-slate-300" />
                </div>
                <div className="space-y-6">
                  {todayStats.drivers.length === 0 ? (
                    <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                      <Users size={48} className="mb-2 opacity-10" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sem atividade hoje</p>
                    </div>
                  ) : (
                    todayStats.drivers.slice(0, 4).map((driver, index) => (
                      <button 
                        key={driver.id} 
                        onClick={() => setSelectedDriverId(driver.id)}
                        className="w-full flex items-center justify-between group"
                      >
                        <div className="flex items-center space-x-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-all shadow-sm",
                            index === 0 ? "bg-amber text-navy" : "bg-slate-50 text-slate-400 group-hover:bg-slate-100"
                          )}>
                            {index + 1}
                          </div>
                          <div className="text-left">
                            <p className="font-black text-navy tracking-tight group-hover:text-amber transition-colors">{driver.name}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{driver.trips} Viagens</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-navy">{driver.revenue.toFixed(2)}€</p>
                        </div>
                      </button>
                    ))
                  )}
                  {todayStats.drivers.length > 4 && (
                    <button 
                      onClick={() => navigate('/manager/drivers')}
                      className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-amber transition-colors text-center"
                    >
                      Ver todos os +{todayStats.drivers.length - 4} motoristas
                    </button>
                  )}
                </div>
              </GlassCard>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="driver-details"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GlassCard className="p-8 flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-amber/10 rounded-full flex items-center justify-center mb-4">
                  <Users size={40} className="text-amber" />
                </div>
                <h2 className="text-2xl font-black text-navy">{driverDetails?.name}</h2>
                <div className="mt-6 grid grid-cols-2 gap-8 w-full border-t border-slate-100 pt-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Viagens</p>
                    <p className="text-2xl font-black text-navy">{driverDetails?.trips.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Receita</p>
                    <p className="text-2xl font-black text-emerald-600">{(driverDetails?.totalRevenue || 0).toFixed(2)}€</p>
                  </div>
                </div>
              </GlassCard>

              <GlassCard className="p-8">
                <h3 className="text-lg font-black text-navy uppercase tracking-widest mb-6">Ganhos por Período</h3>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={driverDetails?.chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                      <YAxis fontSize={10} axisLine={false} tickLine={false} hide />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontWeight: 'black', color: '#0f172a' }}
                      />
                      <Bar dataKey="revenue" fill="#F5A623" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </GlassCard>
            </div>

            <GlassCard className="p-0 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-black text-navy uppercase tracking-widest">Histórico de Viagens</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {driverDetails?.trips.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 font-bold">Nenhuma viagem encontrada no período.</div>
                ) : (
                  driverDetails?.trips.map((trip) => (
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
                          <p className="text-sm font-black text-navy group-hover:text-amber transition-colors">{new Date(trip.createdAt).toLocaleDateString('pt-PT')}</p>
                          <p className="text-xs text-slate-400 font-bold uppercase">{new Date(trip.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <div className="text-right">
                          <p className="text-lg font-black text-navy group-hover:text-amber transition-colors">{(trip.amount || 0).toFixed(2)}€</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {trip.passengers || 1} Passageiros
                            {(trip as any).duration && (
                              <>
                                <span className="mx-2">•</span>
                                {(trip as any).duration} min
                              </>
                            )}
                          </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl text-slate-300 group-hover:bg-amber/10 group-hover:text-amber transition-all">
                          <MapPin size={20} />
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
