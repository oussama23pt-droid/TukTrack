import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Clock, CreditCard, ChevronRight, Calendar, Search } from 'lucide-react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';

export default function TripsHistory() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const tripsQuery = query(
      collection(db, 'trips'),
      where('driverUid', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(tripsQuery, (snapshot) => {
      setTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });

    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-6 pb-20">
      <div className="space-y-4">
        {trips.map((trip, i) => (
          <motion.div
            key={trip.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white border border-slate-200 rounded-3xl p-5 hover:bg-slate-50 transition-all shadow-sm group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center space-x-2 text-[10px] text-slate-400 uppercase font-black tracking-widest">
                <Clock size={14} />
                <span>{trip.createdAt ? new Date(trip.createdAt).toLocaleString() : '---'}</span>
              </div>
              <span className="text-xl font-black text-amber italic tracking-tight">{trip.amount?.toFixed(2)}€</span>
            </div>

            {trip.description && (
              <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-4 rounded-2xl italic border border-slate-100">
                "{trip.description}"
              </p>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <CreditCard size={14} className="text-slate-400" />
                  <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                    {trip.passengers || 1} Passageiro(s)
                  </span>
                </div>
                {trip.duration && (
                  <div className="flex items-center space-x-2">
                    <Clock size={14} className="text-slate-400" />
                    <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                      {trip.duration} min
                    </span>
                  </div>
                )}
              </div>
              <span className="text-[10px] bg-green-50 text-green-600 px-3 py-1 rounded-full uppercase font-black tracking-widest border border-green-100">
                Concluído
              </span>
            </div>
          </motion.div>
        ))}

        {trips.length === 0 && !isLoading && (
          <div className="py-20 text-center bg-white rounded-3xl border border-dashed border-slate-200 shadow-sm">
            <Search className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-bold">Nenhuma viagem registada ainda.</p>
            <p className="text-[10px] text-slate-400 mt-2 uppercase font-black tracking-widest">As tuas viagens aparecerão aqui assim que as registares.</p>
          </div>
        )}
      </div>
    </div>
  );
}
