import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Clock } from 'lucide-react';
import { GradientButton } from '../../../components/GradientButton';
import { doc, setDoc, updateDoc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { handleFirestoreError, sanitizeData } from '../../../lib/firestore-utils';
import { useAuth } from '../../auth/AuthContext';
import { cn } from '../../../lib/utils';

interface RegisterTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTripStarted: (tripId: string) => void;
}

export default function RegisterTripModal({ isOpen, onClose, onTripStarted }: RegisterTripModalProps) {
  const { user, userData } = useAuth();
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<any | null>(null);
  const [amount, setAmount] = useState('0');
  const [passengers, setPassengers] = useState('1');
  const [duration, setDuration] = useState('15');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(true);

  useEffect(() => {
    if (!isOpen || !userData?.managerId) return;

    setIsLoadingRoutes(true);
    const routesQuery = query(
      collection(db, 'routes'),
      where('managerId', '==', userData.managerId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(routesQuery, (snapshot) => {
      const fetchedRoutes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setRoutes(fetchedRoutes);
      if (fetchedRoutes.length > 0 && !selectedRoute) {
        setSelectedRoute(fetchedRoutes[0]);
        setDescription(fetchedRoutes[0].name);
      }
      setIsLoadingRoutes(false);
    }, (err) => {
      handleFirestoreError(err, 'list', 'routes');
      setIsLoadingRoutes(false);
    });

    return () => unsub();
  }, [isOpen, userData?.managerId]);

  const handleRouteChange = (route: any) => {
    setSelectedRoute(route);
    setDescription(route ? route.name : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !userData) return;

    if (!userData.vehicleId) {
      alert('Não tens um veículo atribuído. Por favor, contacta o teu gestor para te associar um TukTuk.');
      return;
    }

    setIsSubmitting(true);

    const tripId = `trip_${Date.now()}`;
    try {
      const tripData = sanitizeData({
        id: tripId,
        driverUid: user.uid,
        driverName: userData.name || '',
        managerId: userData.managerId || '',
        vehicleId: userData.vehicleId || '',
        amount: parseFloat(amount),
        passengers: parseInt(passengers),
        duration: parseInt(duration),
        description: selectedRoute ? selectedRoute.name : description,
        routeId: selectedRoute?.id || 'manual',
        status: 'active',
        createdAt: new Date().toISOString()
      });

      await setDoc(doc(db, 'trips', tripId), tripData);
      
      await updateDoc(doc(db, 'users', user.uid), {
        activeTripId: tripId
      });
      
      onTripStarted(tripId);
      onClose();
    } catch (err: any) {
      handleFirestoreError(err, 'create', `trips/${tripId}`);
      alert('Erro ao guardar viagem. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            className="relative w-full max-w-sm bg-white border border-slate-200 rounded-[3rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          >
            <div className="absolute top-6 right-6">
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors bg-slate-50 rounded-xl">
                <X size={20} />
              </button>
            </div>

            <div className="mb-8">
              <h2 className="text-3xl font-black font-display text-slate-800 tracking-tight italic">GO! VIAGEM</h2>
              {userData?.vehicleId ? (
                <p className="text-slate-500 font-medium italic">Preparado para a próxima rota?</p>
              ) : (
                <div className="mt-2 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center space-x-3">
                  <AlertTriangle className="text-red-500 shrink-0" size={20} />
                  <p className="text-xs text-red-600 font-bold leading-tight">
                    NENHUM VEÍCULO ATRIBUÍDO.<br/>
                    Contacta o gestor para continuares.
                  </p>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-6">
                <div className="text-left space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Selecione a Rota</label>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {isLoadingRoutes ? (
                      <div className="p-4 text-center text-slate-400 text-sm">A carregar rotas...</div>
                    ) : (
                      <>
                        {routes.map((route) => (
                          <button
                            key={route.id}
                            type="button"
                            onClick={() => handleRouteChange(route)}
                            className={cn(
                              "w-full p-4 rounded-2xl border-2 text-left transition-all",
                              selectedRoute?.id === route.id 
                                ? "bg-amber/5 border-amber text-slate-800 shadow-sm" 
                                : "bg-slate-50 border-transparent text-slate-500 hover:border-slate-100"
                            )}
                          >
                            <div className="flex justify-between items-center">
                              <p className="font-bold">{route.name}</p>
                            </div>
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleRouteChange(null)}
                          className={cn(
                            "w-full p-4 rounded-2xl border-2 text-left transition-all",
                            selectedRoute === null 
                              ? "bg-amber/5 border-amber text-slate-800 shadow-sm" 
                              : "bg-slate-50 border-transparent text-slate-500 hover:border-slate-100"
                          )}
                        >
                          <p className="font-bold">Rota Personalizada</p>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-left space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Valor Recebido</label>
                    <div className="relative group">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-black group-focus-within:text-amber">€</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        className="w-full h-16 bg-slate-50 border-2 border-transparent rounded-2xl pl-10 pr-4 text-slate-800 focus:border-amber focus:bg-white transition-all outline-none text-xl font-black"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="text-left space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Passageiros</label>
                    <select
                      value={passengers}
                      onChange={(e) => setPassengers(e.target.value)}
                      className="w-full h-16 bg-slate-50 border-2 border-transparent rounded-2xl px-5 text-slate-800 focus:border-amber focus:bg-white transition-all outline-none text-xl font-black appearance-none"
                    >
                      {['1', '2', '3', '4', '5', '6'].map(n => (
                        <option key={n} value={n}>{n} {parseInt(n) === 1 ? 'Pessoa' : 'Pessoas'}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="text-left space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Duração Estimada (Minutos)</label>
                  <div className="relative group">
                    <Clock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-black group-focus-within:text-amber" size={18} />
                    <input
                      type="number"
                      placeholder="15"
                      className="w-full h-16 bg-slate-50 border-2 border-transparent rounded-2xl pl-12 pr-4 text-slate-800 focus:border-amber focus:bg-white transition-all outline-none text-xl font-black"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {selectedRoute === null && (
                  <div className="text-left space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Descrição</label>
                    <textarea
                      placeholder="Para onde vamos?"
                      className="w-full bg-slate-50 border-2 border-transparent rounded-2xl p-5 text-slate-800 focus:border-amber focus:bg-white transition-all outline-none min-h-[120px] resize-none font-medium"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <GradientButton 
                  label="VIAGEM! GO" 
                  type="submit" 
                  className="h-20 text-3xl font-black rounded-[2rem] shadow-2xl shadow-amber/20 italic"
                  isLoading={isSubmitting} 
                />
              </motion.div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
