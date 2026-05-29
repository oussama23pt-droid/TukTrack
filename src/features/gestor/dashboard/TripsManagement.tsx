import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Filter, Download, User, Users, MapPin, Calendar, Clock, CreditCard, ChevronRight, Plus, Map as MapIcon, X, PlusCircle, Trash2, CheckCircle2, Activity, Loader2 } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../../lib/utils';
import { handleFirestoreError, sanitizeData } from '../../../lib/firestore-utils';
import RouteDesignerMap from '../../../components/RouteDesignerMap';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ConfirmationModal from '../../../components/ConfirmationModal';
import { useNavigate } from 'react-router-dom';

export default function TripsManagement() {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<Record<string, any>>({});
  const [routes, setRoutes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isAddRouteModalOpen, setIsAddRouteModalOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'trips' | 'routes'>('trips');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRoute, setNewRoute] = useState({
    name: '',
    startPoint: '',
    endPoint: '',
    startLocation: null as any,
    endLocation: null as any,
    stopsLocation: [] as any[],
    stops: [] as any[],
    coordinates: [] as any[],
    geometry: null as any,
    color: '#f59e0b'
  });
  const [currentStop, setCurrentStop] = useState('');

  useEffect(() => {
    if (!userData?.uid) return;

    // Listen for trips
    const tripsQuery = query(
      collection(db, 'trips'),
      where('managerId', '==', userData.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    }, (err) => {
      handleFirestoreError(err, 'list', 'trips');
      setIsLoading(false);
    });

    // Listen for routes
    const routesQuery = query(
      collection(db, 'routes'),
      where('managerId', '==', userData.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubRoutes = onSnapshot(routesQuery, (snapshot) => {
      setRoutes(snapshot.docs.map(doc => {
        const data = doc.data();
        let displayGeometry = data.geometry;
        
        // Reconstruct nested arrays for Mapbox from Firestore objects
        if (data.geometry && Array.isArray(data.geometry.coordinates) && data.geometry.coordinates.length > 0 && typeof data.geometry.coordinates[0] === 'object') {
          displayGeometry = {
            ...data.geometry,
            coordinates: data.geometry.coordinates.map((coord: any) => [coord.lng, coord.lat])
          };
        }
        
        return { 
          id: doc.id, 
          ...data,
          geometry: displayGeometry
        };
      }));
    }, (err) => {
      handleFirestoreError(err, 'list', 'routes');
    });

    // Listen for drivers linked to this manager
    const driversQuery = query(
      collection(db, 'users'),
      where('managerId', '==', userData.uid),
      where('role', '==', 'driver')
    );

    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      const driverMap: Record<string, any> = {};
      snapshot.docs.forEach(doc => {
        driverMap[doc.id] = doc.data();
      });
      setDrivers(driverMap);
    }, (err) => {
      handleFirestoreError(err, 'list', 'users');
    });

    return () => {
      unsubTrips();
      unsubRoutes();
      unsubDrivers();
    };
  }, [userData?.uid]);

  const handleAddStop = () => {
    if (currentStop.trim()) {
      setNewRoute(prev => ({
        ...prev,
        stops: [...prev.stops, { name: currentStop.trim(), note: '' }]
      }));
      setCurrentStop('');
    }
  };

  const removeStop = (index: number) => {
    setNewRoute(prev => ({
      ...prev,
      stops: prev.stops.filter((_, i) => i !== index)
    }));
  };

  const handleSaveRoute = async () => {
    if (!newRoute.name || !newRoute.startPoint || !newRoute.endPoint) {
      alert('Por favor preencha os campos obrigatórios.');
      return;
    }

    try {
      const routeId = selectedRouteId || Math.random().toString(36).substr(2, 9);
      
      // Transform geometry nested arrays into objects for Firestore compatibility
      let firestoreGeometry = newRoute.geometry;
      if (newRoute.geometry && Array.isArray(newRoute.geometry.coordinates)) {
        firestoreGeometry = {
          ...newRoute.geometry,
          coordinates: newRoute.geometry.coordinates.map((coord: any) => ({
            lng: coord[0],
            lat: coord[1]
          }))
        };
      }

      const dataToSave = sanitizeData({
        ...newRoute,
        geometry: firestoreGeometry,
        id: routeId,
        managerId: userData?.uid,
        updatedAt: new Date().toISOString(),
        createdAt: selectedRouteId ? routes.find(r => r.id === selectedRouteId)?.createdAt : new Date().toISOString()
      });

      await setDoc(doc(db, 'routes', routeId), dataToSave);
      setIsAddRouteModalOpen(false);
      setSelectedRouteId(null);
      setNewRoute({ 
        name: '', 
        startPoint: '', 
        endPoint: '', 
        startLocation: null,
        endLocation: null,
        stopsLocation: [],
        stops: [],
        coordinates: [],
        geometry: null,
        color: '#f59e0b'
      });
    } catch (err) {
      const routeId = selectedRouteId || 'new';
      handleFirestoreError(err, 'write', `routes/${routeId}`);
    }
  };

  const handleDeleteRoute = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'routes', id));
    } catch (err) {
      handleFirestoreError(err, 'delete', `routes/${id}`);
    }
  };

  const filteredTrips = trips.filter(trip => {
    const driverNameFromMap = drivers[trip.driverUid]?.name?.toLowerCase() || '';
    const driverNameFromTrip = trip.driverName?.toLowerCase() || '';
    const driverName = driverNameFromMap || driverNameFromTrip;
    
    const matchesSearch = driverName.includes(searchTerm.toLowerCase()) || 
           trip.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Use ISO date strings for comparison to avoid timezone issues
    let tripDay = '';
    if (trip.createdAt) {
      if (typeof trip.createdAt === 'string') {
        tripDay = trip.createdAt.split('T')[0];
      } else if (trip.createdAt.toDate) {
        // Firestore Timestamp
        tripDay = trip.createdAt.toDate().toISOString().split('T')[0];
      } else if (trip.createdAt instanceof Date) {
        tripDay = trip.createdAt.toISOString().split('T')[0];
      }
    }
    
    const matchesDate = !startDate || !endDate ? true : (tripDay >= startDate && tripDay <= endDate);
    
    return matchesSearch && matchesDate;
  });

  const exportToPDF = () => {
    if (filteredTrips.length === 0) return;
    setIsExporting(true);
    try {
      const doc = new jsPDF();
      const userName = userData?.name || 'O Meu Negócio';
      const period = `${new Date(startDate).toLocaleDateString('pt-PT')} - ${new Date(endDate).toLocaleDateString('pt-PT')}`;

      // Header
      doc.setFontSize(22);
      doc.setTextColor(30, 41, 59); // navy color
      doc.text('Relatório de Viagens', 14, 22);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Responsável: ${userName}`, 14, 32);
      doc.text(`Período: ${period}`, 14, 38);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-PT')}`, 14, 44);

      autoTable(doc, {
        startY: 55,
        head: [['ID', 'Data', 'Motorista', 'Rota', 'Pass', 'Duração', 'Valor/Estado']],
        body: filteredTrips.map(t => [
          t.id.slice(0, 8),
          new Date(t.createdAt).toLocaleDateString('pt-PT'),
          drivers[t.driverUid]?.name || 'N/A',
          t.description || 'Rota Manual',
          (t.passengers || 0).toString(),
          `${t.duration || 0} min`,
          t.status === 'cancelled'
            ? `Cancelado${t.cancelReason ? ` — ${t.cancelReason.substring(0, 40)}` : ''}`
            : `${(t.amount || 0).toFixed(2)}€`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
      });

      const totalRevenue = filteredTrips.filter(t => t.status !== 'cancelled').reduce((acc, t) => acc + (t.amount || 0), 0);
      doc.setFontSize(14);
      doc.setTextColor(30, 41, 59);
      doc.text(`Total de Viagens: ${filteredTrips.length}`, 14, (doc as any).lastAutoTable.finalY + 15);
      doc.text(`Faturação Total: ${totalRevenue.toFixed(2)}€`, 14, (doc as any).lastAutoTable.finalY + 22);

      const filename = `Relatorio_Viagens_${startDate}_${endDate}.pdf`;
      const blob = doc.output('blob');
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
} catch (error) {
  console.error('Error generating PDF:', error);
} finally {
  setIsExporting(false);
}
};

  return (
    <div className="space-y-12">
      {/* View Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-0">
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl self-start">
          <button 
            onClick={() => setSelectedTab('trips')}
            className={cn(
              "px-4 md:px-8 py-3 rounded-xl text-[10px] md:text-sm font-black transition-all flex items-center space-x-2",
              selectedTab === 'trips' ? "bg-white text-navy shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Activity size={16} />
            <span className="hidden sm:inline">VIAGENS</span>
          </button>
          <button 
            onClick={() => setSelectedTab('routes')}
            className={cn(
              "px-4 md:px-8 py-3 rounded-xl text-[10px] md:text-sm font-black transition-all flex items-center space-x-2",
              selectedTab === 'routes' ? "bg-white text-navy shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            <MapIcon size={16} />
            <span className="hidden sm:inline">ROTAS</span>
          </button>
        </div>

        {selectedTab === 'trips' && (
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full md:w-auto">
            <div className="relative group flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-amber transition-colors">
                <Search size={14} />
              </div>
              <input 
                type="text" 
                placeholder="Motorista ou ID..."
                className="w-full bg-white/80 border border-slate-100 rounded-xl md:rounded-2xl py-2.5 md:py-3.5 pl-10 pr-6 text-[11px] md:text-sm font-bold text-navy outline-none focus:border-amber/40 focus:ring-4 focus:ring-amber/5 placeholder:text-slate-300 transition-all shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 h-[42px] md:h-[52px]">
              <div className="relative h-full flex-1 md:flex-none">
                <button 
                  onClick={() => setIsFilterModalOpen(!isFilterModalOpen)}
                  className={cn(
                    "h-full px-4 flex items-center justify-center space-x-2 bg-white/80 border rounded-xl md:rounded-2xl font-bold transition-all whitespace-nowrap",
                    isFilterModalOpen ? "border-amber text-amber ring-2 ring-amber/5" : "border-slate-100 text-slate-500 hover:text-navy hover:border-navy"
                  )}
                >
                  <Calendar size={14} />
                  <span className="text-[9px] uppercase tracking-widest font-black">Datas</span>
                </button>

                <AnimatePresence>
                  {isFilterModalOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsFilterModalOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 z-50"
                      >
                         <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-navy">Filtrar por Data</h4>
                            <button onClick={() => setIsFilterModalOpen(false)} className="text-slate-300 hover:text-navy">
                               <X size={16} />
                            </button>
                         </div>
                         <div className="space-y-4">
                            <div>
                               <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Início</label>
                               <input 
                                 type="date" 
                                 className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-amber transition-all"
                                 value={startDate}
                                 onChange={(e) => setStartDate(e.target.value)}
                               />
                            </div>
                            <div>
                               <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Fim</label>
                               <input 
                                 type="date" 
                                 className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-amber transition-all"
                                 value={endDate}
                                 onChange={(e) => setEndDate(e.target.value)}
                               />
                            </div>
                            <button 
                              onClick={() => setIsFilterModalOpen(false)}
                              className="w-full bg-navy text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-navy/10 hover:bg-slate-800 transition-all"
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
                className="w-[42px] md:w-[52px] h-full flex items-center justify-center bg-navy text-white rounded-xl md:rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-navy/10 disabled:opacity-50"
              >
                {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedTab === 'trips' ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-40 space-y-4">
              <div className="w-12 h-12 border-[3px] border-slate-100 border-t-amber rounded-full animate-spin"></div>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">Sincronizando viagens...</p>
            </div>
          ) : filteredTrips.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredTrips.map((trip) => (
                <button 
                  key={trip.id} 
                  onClick={() => navigate('/manager/map', { state: { playbackTripId: trip.id } })}
                  className="w-full text-left group relative flex flex-col md:flex-row md:items-center bg-white border border-slate-100 rounded-3xl md:rounded-[2.5rem] p-4 md:p-5 hover:border-amber/30 transition-all shadow-sm hover:shadow-xl hover:shadow-amber/5 overflow-hidden"
                >
                  <div className={cn(
                    "absolute top-0 left-0 h-full w-1 md:w-2",
                    trip.status === 'completed' ? "bg-green-500" : trip.status === 'active' ? "bg-blue-500" : "bg-red-500"
                  )} />

                  <div className="flex items-center mb-4 md:mb-0">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-amber/10 group-hover:text-amber transition-all shrink-0">
                      <User size={20} className="md:size-[20px]" />
                    </div>
                    <div className="ml-3 md:hidden">
                       <h4 className="text-sm font-black text-navy leading-tight">{drivers[trip.driverUid]?.name || 'Não atribuído'}</h4>
                       <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">{trip.id.slice(0, 8)}</p>
                    </div>
                  </div>
                  
                  <div className="md:ml-6 grid grid-cols-2 md:grid-cols-5 flex-1 gap-4 md:gap-6 items-center">
                    <div className="col-span-1">
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Motorista</p>
                      <p className="text-slate-900 font-bold text-sm tracking-tight leading-none truncate group-hover:text-amber transition-colors">{drivers[trip.driverUid]?.name || trip.driverName || 'Não atribuído'}</p>
                    </div>

                    <div className="col-span-1 h-full flex flex-col justify-center">
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5">Rota / Info</p>
                      <div className="flex flex-col space-y-1">
                        <p className="text-slate-900 font-bold text-xs tracking-tight truncate max-w-[150px] group-hover:text-amber transition-colors">{trip.description || 'Rota Manual'}</p>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-bold">
                          <span className="flex items-center h-4"><Users size={10} className="mr-1" /> {trip.passengers || 0}</span>
                          <span className="flex items-center h-4"><Clock size={10} className="mr-1" /> {trip.duration || 0} min</span>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-1 hidden md:block">
                      <p className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 md:mb-1.5">Estado</p>
                      <div className={cn(
                        "px-2 md:px-3 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-wider inline-flex items-center",
                        trip.status === 'completed' ? "bg-green-50 text-green-600 border border-green-100" :
                        trip.status === 'active' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                        "bg-red-50 text-red-600 border border-red-100"
                      )}>
                        {trip.status === 'completed' ? 'Fim' : trip.status === 'active' ? 'Curso' : ('Canc' + (trip.cancelReason ? ' — ' + trip.cancelReason.substring(0,30) : ''))}
                      </div>
                    </div>

                    <div className="col-span-1 hidden md:block">
                       <p className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 md:mb-1.5">Início</p>
                       <div className="flex items-center text-slate-500 font-bold text-[9px] md:text-xs">
                         <Calendar size={10} className="mr-1" />
                         {new Date(trip.createdAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}
                         <span className="mx-1">•</span>
                         {new Date(trip.createdAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                       </div>
                    </div>

                    <div className="text-right flex items-center justify-end space-x-4">
                      <div className="text-right">
                        <p className="text-[8px] md:text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 md:mb-0.5">Receita</p>
                        {trip.status === 'cancelled' ? (
                          <div className="flex flex-col items-end">
                            <span className="text-base font-black text-red-500">🚫 Cancelado</span>
                            {trip.cancelReason && (
                              <span className="text-[9px] text-red-400 font-medium max-w-[120px] text-right leading-tight mt-0.5 italic">
                                {trip.cancelReason.substring(0, 50)}{trip.cancelReason.length > 50 ? '…' : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xl md:text-2xl font-black text-navy group-hover:text-amber transition-colors">{trip.amount?.toFixed(2)}<span className="text-[10px] ml-0.5 opacity-40">€</span></p>
                        )}
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl text-slate-300 group-hover:bg-amber/10 group-hover:text-amber transition-all hidden md:block">
                        <MapPin size={18} />
                      </div>
                    </div>
                  </div>
                  
                  {/* Action chevron for desktop */}
                  <div className="hidden md:flex ml-6 text-slate-200 group-hover:text-amber group-hover:translate-x-1 transition-all">
                    <ChevronRight size={24} />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-white border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center text-slate-300 mx-auto mb-6">
                <Search size={32} />
              </div>
              <h3 className="text-2xl font-black text-navy mb-2 tracking-tighter">Nenhuma viagem encontrada</h3>
              <p className="text-slate-500 font-medium max-w-sm mx-auto">Tente pesquisar por outro termo.</p>
            </div>
          )}
        </div>
      ) : (
        // Routes Content - INTEGRATED MAP VIEW
        <div className="h-[calc(100vh-250px)] w-full flex flex-col">
          <div className="flex-1 min-h-[600px]">
            <RouteDesignerMap 
              existingRoutes={routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={(route) => setSelectedRouteId(prev => prev === route.id ? null : route.id)}
              onDeleteRoute={(id) => setRouteToDelete(id)}
              onAddRoute={() => {
                setSelectedRouteId(null);
              }}
              onEditRoute={(route) => {
                setSelectedRouteId(route.id);
                setNewRoute({
                  name: route.name,
                  startPoint: route.startPoint,
                  endPoint: route.endPoint,
                  startLocation: route.startLocation || null,
                  endLocation: route.endLocation || null,
                  stopsLocation: route.stopsLocation || [],
                  stops: route.stops || [],
                  coordinates: route.coordinates || [],
                  geometry: route.geometry,
                  color: route.color || '#f59e0b'
                });
              }}
              onConfirmDraw={() => setIsAddRouteModalOpen(true)}
              onRouteUpdate={(data) => {
                setNewRoute(prev => ({
                  ...prev,
                  startPoint: data.startPoint,
                  endPoint: data.endPoint,
                  startLocation: data.startLocation,
                  endLocation: data.endLocation,
                  stopsLocation: data.stopsLocation,
                  stops: data.stops,
                  coordinates: data.coordinates,
                  geometry: data.geometry,
                  color: data.color
                }));
                // When geometry is ready and we have points, prompt to save
                if (data.geometry && data.coordinates.length >= 2 && !isAddRouteModalOpen) {
                   // Optional: auto-open or wait for "Concluir" in map? 
                   // The map now has its own "CONCLUIR" button logic, we should listen for it
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Simplified Add Route Modal (as overlay on integrated map) */}
      <AnimatePresence>
        {isAddRouteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-navy/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-black text-navy italic tracking-tighter">Guardar Nova Rota</h2>
                  <p className="text-slate-500 text-sm font-medium">Atribua um nome à trajetória desenhada</p>
                </div>
                <button onClick={() => { setIsAddRouteModalOpen(false); }} className="text-slate-400 hover:text-navy">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-amber tracking-[0.2em] ml-2">Nome da Rota</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: Tour Cascais Noturno"
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 px-6 text-navy font-bold focus:border-amber/50 focus:bg-white outline-none transition-all placeholder:text-slate-300 shadow-inner"
                    value={newRoute.name}
                    onChange={(e) => setNewRoute({ ...newRoute, name: e.target.value })}
                  />
                </div>

                <div className="flex flex-col space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-green-600 tracking-[0.2em] ml-2">Ponto de Partida</label>
                    <div className="flex items-center space-x-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-green-200 focus-within:bg-white transition-all">
                      <MapPin size={14} className="text-green-500 shrink-0" />
                      <input 
                        className="bg-transparent w-full text-slate-700 font-bold text-xs outline-none"
                        value={newRoute.startPoint}
                        onChange={(e) => setNewRoute({ ...newRoute, startPoint: e.target.value })}
                        placeholder="Nome do ponto inicial"
                      />
                    </div>
                  </div>

                  {newRoute.stops.length > 0 && (
                    <div className="space-y-4">
                       <label className="text-[9px] font-black uppercase text-amber tracking-[0.2em] ml-2">Paragens Intermédias</label>
                       <div className="max-h-60 overflow-y-auto space-y-4 pr-2 no-scrollbar">
                         {newRoute.stops.map((stop: any, idx: number) => (
                           <div key={idx} className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-amber/20 focus-within:bg-white transition-all">
                             <div className="flex items-center space-x-3">
                               <div className="w-6 h-6 rounded-lg bg-amber/10 flex items-center justify-center text-[10px] font-black text-amber shrink-0">{idx + 1}</div>
                               <input 
                                 className="bg-transparent w-full text-slate-800 font-bold text-sm outline-none"
                                 value={stop.name}
                                 onChange={(e) => {
                                   const updatedStops = [...newRoute.stops];
                                   updatedStops[idx] = { ...updatedStops[idx], name: e.target.value };
                                   setNewRoute({ ...newRoute, stops: updatedStops });
                                 }}
                                 placeholder="Nome da paragem"
                               />
                             </div>
                             <div className="flex items-start space-x-3 pt-2 border-t border-slate-200/50">
                               <Activity size={14} className="text-slate-300 mt-1 shrink-0" />
                               <textarea
                                 className="bg-transparent w-full text-slate-500 font-medium text-[11px] outline-none resize-none min-h-[40px]"
                                 value={stop.note || ''}
                                 onChange={(e) => {
                                   const updatedStops = [...newRoute.stops];
                                   updatedStops[idx] = { ...updatedStops[idx], note: e.target.value };
                                   
                                   // Also update coordinates if they correspond
                                   const updatedCoords = [...newRoute.coordinates];
                                   if (updatedCoords[idx + 1]) { // +1 because startPoint is at 0
                                      updatedCoords[idx + 1] = { ...updatedCoords[idx + 1], note: e.target.value };
                                   }

                                   setNewRoute({ ...newRoute, stops: updatedStops, coordinates: updatedCoords });
                                 }}
                                 placeholder="Nota para o motorista (ex: aguardar 5 min)"
                               />
                             </div>
                           </div>
                         ))}
                       </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-red-600 tracking-[0.2em] ml-2">Ponto de Chegada</label>
                    <div className="flex items-center space-x-3 bg-slate-50 p-4 rounded-2xl border border-slate-100 focus-within:border-red-200 focus-within:bg-white transition-all">
                      <MapPin size={14} className="text-red-500 shrink-0" />
                      <input 
                        className="bg-transparent w-full text-slate-700 font-bold text-xs outline-none"
                        value={newRoute.endPoint}
                        onChange={(e) => setNewRoute({ ...newRoute, endPoint: e.target.value })}
                        placeholder="Nome do ponto final"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveRoute}
                    disabled={!newRoute.name || !newRoute.startPoint || !newRoute.endPoint}
                    className="w-full bg-amber hover:bg-amber/90 disabled:opacity-50 disabled:cursor-not-allowed text-navy font-black py-4 rounded-2xl transition-all shadow-xl shadow-amber/10 group flex items-center justify-center space-x-3"
                  >
                    <CheckCircle2 size={18} className="text-navy/50 group-hover:text-navy transition-colors" />
                    <span>CONFIRMAR E GUARDAR</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={!!routeToDelete}
        onClose={() => setRouteToDelete(null)}
        onConfirm={async () => {
          if (routeToDelete) {
            await handleDeleteRoute(routeToDelete);
            if (selectedRouteId === routeToDelete) setSelectedRouteId(null);
          }
        }}
        title="Eliminar Rota?"
        message={`Tem a certeza que deseja eliminar a rota "${routes.find(r => r.id === routeToDelete)?.name || ''}"? Esta ação não pode ser revertida.`}
        confirmLabel="SIM, ELIMINAR"
      />
    </div>
  );
}


