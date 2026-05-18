import React, { useState, useEffect, useRef } from 'react';
// @ts-ignore
import Map, { Marker, NavigationControl, Source, Layer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation, AlertTriangle, Activity, Play, Pause, RotateCcw, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { handleFirestoreError, OperationType } from '../../lib/firestore-utils';
import { useAuth } from '../auth/AuthContext';
import { useLocation } from 'react-router-dom';

// @ts-ignore
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

export default function FleetMap({ 
  initialSelectedDriverId, 
  onSelectDriver 
}: { 
  initialSelectedDriverId?: string | null,
  onSelectDriver?: (id: string | null) => void 
}) {
  const { userData } = useAuth();
  const location = useLocation();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [activeTrips, setActiveTrips] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [sosAlerts, setSosAlerts] = useState<any[]>([]);
  const [internalSelectedDriverId, setInternalSelectedDriverId] = useState<string | null>(null);
  
  // Playback state
  const [playbackTrip, setPlaybackTrip] = useState<any | null>(null);
  const [playbackRoute, setPlaybackRoute] = useState<any | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0 to 100
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false);
  const playbackIntervalRef = useRef<any>(null);

  const [viewState, setViewState] = useState({
    latitude: 38.7223,
    longitude: -9.1393,
    zoom: 13
  });

  const selectedDriverId = initialSelectedDriverId !== undefined ? initialSelectedDriverId : internalSelectedDriverId;

  // Handle Playback State from Navigation
  useEffect(() => {
    const state = location.state as any;
    if (state?.playbackTripId) {
      fetchPlaybackTrip(state.playbackTripId);
    }
  }, [location.state]);

  const fetchPlaybackTrip = async (tripId: string) => {
    try {
      const tripDoc = await getDoc(doc(db, 'trips', tripId));
      if (tripDoc.exists()) {
        const tripData = { id: tripDoc.id, ...tripDoc.data() } as any;
        setPlaybackTrip(tripData);
        
        if (tripData.routeId) {
          const routeDoc = await getDoc(doc(db, 'routes', tripData.routeId));
          if (routeDoc.exists()) {
            const data = routeDoc.data() as any;
            let geometry = data.geometry;
            if (geometry && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && typeof geometry.coordinates[0] === 'object') {
              geometry = {
                ...geometry,
                coordinates: geometry.coordinates.map((c: any) => [c.lng, c.lat])
              };
            }
            setPlaybackRoute({ id: routeDoc.id, ...data, geometry });
            
            // Focus on start of route
            if (geometry?.coordinates?.[0]) {
              setViewState(prev => ({
                ...prev,
                latitude: geometry.coordinates[0][1],
                longitude: geometry.coordinates[0][0],
                zoom: 14
              }));
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading playback trip:', error);
    }
  };

  useEffect(() => {
    if (isPlaybackPlaying) {
      playbackIntervalRef.current = setInterval(() => {
        setPlaybackProgress(prev => {
          if (prev >= 100) {
            setIsPlaybackPlaying(false);
            return 100;
          }
          return prev + 0.5;
        });
      }, 50);
    } else {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    }
    return () => {
      if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
    };
  }, [isPlaybackPlaying]);

  const getPlaybackPosition = () => {
    if (!playbackRoute?.geometry?.coordinates) return null;
    const coords = playbackRoute.geometry.coordinates;
    if (coords.length === 0) return null;
    
    const index = Math.floor((playbackProgress / 100) * (coords.length - 1));
    const nextIndex = Math.min(index + 1, coords.length - 1);
    const weight = (playbackProgress / 100 * (coords.length - 1)) - index;
    
    const p1 = coords[index];
    const p2 = coords[nextIndex];
    
    return {
      lng: p1[0] + (p2[0] - p1[0]) * weight,
      lat: p1[1] + (p2[1] - p1[1]) * weight
    };
  };

  const playbackPos = getPlaybackPosition();

  const setSelectedDriverId = (id: string | null) => {
    if (onSelectDriver) {
      onSelectDriver(id);
    } else {
      setInternalSelectedDriverId(id);
    }
  };

  useEffect(() => {
    if (initialSelectedDriverId) {
      const driver = drivers.find(d => d.uid === initialSelectedDriverId);
      if (driver?.location) {
        setViewState(prev => ({
          ...prev,
          latitude: driver.location.lat,
          longitude: driver.location.lng,
          zoom: 15
        }));
      }
    }
  }, [initialSelectedDriverId, drivers]);

  useEffect(() => {
    if (!userData) return;
    const managerId = userData.role === 'manager' ? userData.uid : userData.managerId;
    if (!managerId) return;

    const driversQuery = query(
      collection(db, 'users'),
      where('managerId', '==', managerId),
      where('role', '==', 'driver'),
      where('isOnline', '==', true)
    );

    const unsubDrivers = onSnapshot(driversQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setDrivers(docs.filter((d: any) => d.location));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const sosQuery = query(
      collection(db, 'sos_alerts'),
      where('managerId', '==', managerId),
      where('status', '==', 'active')
    );

    const unsubSOS = onSnapshot(sosQuery, (snapshot) => {
      setSosAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sos_alerts');
    });

    const tripsQuery = query(
      collection(db, 'trips'),
      where('managerId', '==', managerId),
      where('status', '==', 'active')
    );

    const unsubTrips = onSnapshot(tripsQuery, (snapshot) => {
      setActiveTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    const routesQuery = query(
      collection(db, 'routes'),
      where('managerId', '==', managerId)
    );

    const unsubRoutes = onSnapshot(routesQuery, (snapshot) => {
      setRoutes(snapshot.docs.map(doc => {
        const data = doc.data();
        let geometry = data.geometry;
        if (geometry && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && typeof geometry.coordinates[0] === 'object') {
          geometry = {
            ...geometry,
            coordinates: geometry.coordinates.map((c: any) => [c.lng, c.lat])
          };
        }
        return { id: doc.id, ...data, geometry };
      }));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'routes');
    });

    return () => {
      unsubDrivers();
      unsubSOS();
      unsubTrips();
      unsubRoutes();
    };
  }, [userData?.uid, userData?.managerId]);

  const selectedDriverTrip = selectedDriverId ? activeTrips.find(t => t.driverUid === selectedDriverId) : null;
  const activeRoute = selectedDriverTrip ? routes.find(r => r.id === selectedDriverTrip.routeId) : null;
  const selectedDriver = selectedDriverId ? drivers.find(d => d.uid === selectedDriverId) : null;

  const handleDriverClick = (driverUid: string) => {
    setSelectedDriverId(selectedDriverId === driverUid ? null : driverUid);
  };

  return (
    <div className="h-full w-full relative rounded-[2.5rem] overflow-hidden border border-slate-200 shadow-xl shadow-slate-200/50">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={() => setSelectedDriverId(null)}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
      >
        <NavigationControl position="top-right" />
        
        {drivers.map(driver => {
          const hasActiveTrip = activeTrips.some(t => t.driverUid === driver.uid);
          const isSelected = selectedDriverId === driver.uid;
          return (
            <Marker 
              key={driver.id} 
              latitude={driver.location.lat} 
              longitude={driver.location.lng} 
              anchor="bottom"
              onClick={e => {
                e.originalEvent.stopPropagation();
                handleDriverClick(driver.uid);
              }}
            >
              <div className="relative group cursor-pointer">
                {hasActiveTrip && (
                  <div className={cn(
                    "absolute -inset-2 bg-amber-500/40 rounded-full animate-ping opacity-75",
                    isSelected && "bg-navy/40"
                  )} />
                )}
                <div className={cn(
                  "w-9 h-9 rounded-full border-2 border-white shadow-lg transition-all hover:scale-110 relative z-10 flex items-center justify-center text-lg leading-none",
                  isSelected
                    ? "bg-navy shadow-navy/40 scale-125"
                    : hasActiveTrip 
                      ? "bg-amber shadow-amber/40" 
                      : "bg-green-500 shadow-green-500/30"
                )}>
                  🛺
                </div>
                <div className={cn(
                  "absolute top-12 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full whitespace-nowrap font-black shadow-xl border uppercase tracking-widest text-[9px] transition-all z-20",
                  isSelected 
                    ? "bg-navy text-white border-navy scale-110" 
                    : "bg-white text-slate-800 border-slate-100"
                )}>
                  {driver.name}
                </div>
              </div>
            </Marker>
          );
        })}

        {/* Playback Route */}
        {playbackRoute && playbackRoute.geometry && (
          <>
            <Source type="geojson" data={{
              type: 'Feature',
              properties: {},
              geometry: playbackRoute.geometry
            }}>
              <Layer 
                id="playback-trip-route"
                type="line"
                paint={{
                  'line-color': '#0f172a',
                  'line-width': 6,
                  'line-opacity': 0.8
                }}
              />
            </Source>
            
            {playbackPos && (
              <Marker latitude={playbackPos.lat} longitude={playbackPos.lng} anchor="center">
                <div className="relative">
                  <div className="absolute -inset-4 bg-navy/20 rounded-full animate-ping" />
                  <div className="w-10 h-10 bg-navy text-white rounded-full flex items-center justify-center shadow-2xl border-2 border-white relative z-10 text-xl">
                    🛺
                  </div>
                </div>
              </Marker>
            )}

            {/* Start/End for playback */}
            {playbackRoute.startLocation && (
              <Marker latitude={playbackRoute.startLocation.lat} longitude={playbackRoute.startLocation.lng} anchor="bottom">
                <div className="w-4 h-4 bg-green-500 border-2 border-white rounded-full shadow-lg" />
              </Marker>
            )}
            {playbackRoute.endLocation && (
              <Marker latitude={playbackRoute.endLocation.lat} longitude={playbackRoute.endLocation.lng} anchor="bottom">
                <div className="w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-lg" />
              </Marker>
            )}
          </>
        )}

        {activeRoute && activeRoute.geometry && (
          <>
            <Source type="geojson" data={{
              type: 'Feature',
              properties: {},
              geometry: activeRoute.geometry
            }}>
              <Layer 
                id="active-trip-route"
                type="line"
                paint={{
                  'line-color': '#f59e0b',
                  'line-width': 6,
                  'line-opacity': 0.6
                }}
              />
              <Layer 
                id="active-trip-route-glow"
                type="line"
                paint={{
                  'line-color': '#f59e0b',
                  'line-width': 12,
                  'line-opacity': 0.15,
                  'line-blur': 8
                }}
              />
            </Source>

            {/* Start point marker */}
            {activeRoute.startLocation && (
              <Marker latitude={activeRoute.startLocation.lat} longitude={activeRoute.startLocation.lng} anchor="bottom">
                <div className="flex flex-col items-center">
                  <div className="mb-1 px-2 py-1 bg-green-500 text-white rounded-md text-[8px] font-black uppercase tracking-widest shadow-lg border border-white/20 whitespace-nowrap">
                    {activeRoute.startPoint || 'Partida'}
                  </div>
                  <div className="w-4 h-4 bg-green-500 border-2 border-white rounded-full shadow-lg" />
                </div>
              </Marker>
            )}

            {/* End point marker */}
            {activeRoute.endLocation && (
              <Marker latitude={activeRoute.endLocation.lat} longitude={activeRoute.endLocation.lng} anchor="bottom">
                <div className="flex flex-col items-center">
                  <div className="mb-1 px-2 py-1 bg-red-500 text-white rounded-md text-[8px] font-black uppercase tracking-widest shadow-lg border border-white/20 whitespace-nowrap">
                    {activeRoute.endPoint || 'Chegada'}
                  </div>
                  <div className="w-5 h-5 bg-red-500 border-2 border-white rounded-full shadow-lg flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                </div>
              </Marker>
            )}

            {/* Intermediate stops */}
            {activeRoute.stopsLocation?.map((stop: any, idx: number) => (
              <Marker key={idx} latitude={stop.lat} longitude={stop.lng} anchor="bottom">
                <div className="flex flex-col items-center">
                  {activeRoute.stops?.[idx] && (
                    <div className="mb-1 px-2 py-1 bg-amber text-navy rounded-md text-[8px] font-black uppercase tracking-widest shadow-lg border border-white/20 whitespace-nowrap">
                      {typeof activeRoute.stops[idx] === 'object' ? activeRoute.stops[idx].name : activeRoute.stops[idx]}
                    </div>
                  )}
                  <div className="w-3 h-3 bg-amber border-2 border-white rounded-full shadow-lg" />
                </div>
              </Marker>
            ))}
          </>
        )}

        {sosAlerts.map(alert => (
          <Marker 
            key={alert.id} 
            latitude={alert.location.lat} 
            longitude={alert.location.lng} 
            anchor="bottom"
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-red-500/30 rounded-full animate-ping" />
              <div className="p-3 rounded-full border-2 border-white shadow-2xl bg-red-600 relative">
                <AlertTriangle size={24} className="text-white animate-pulse" />
              </div>
            </div>
          </Marker>
        ))}
      </Map>

      {/* Info Overlay */}
      <AnimatePresence>
        {selectedDriver && selectedDriverTrip && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="absolute bottom-10 left-1/2 z-[100] w-full max-w-sm px-6"
          >
            <div className="bg-white rounded-[2.5rem] p-6 shadow-2xl border border-slate-100 flex items-center space-x-6">
              <div className="w-16 h-16 rounded-3xl bg-amber/10 flex items-center justify-center text-amber shrink-0">
                <Activity size={32} className="animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-amber uppercase tracking-[0.2em] mb-1">Viagem em Curso</p>
                <h4 className="text-lg font-black text-navy truncate tracking-tight">{selectedDriver.name}</h4>
                <div className="flex items-center space-x-3 mt-2">
                  <div className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-[9px] font-bold text-slate-500 uppercase">
                    {activeRoute?.name || 'Rota Ativa'}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400">
                    ID: {selectedDriverTrip.id.slice(0, 8)}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedDriverId(null)}
                className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition-all"
              >
                <Activity size={20} className="rotate-45" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm p-8 text-center">
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Insira o VITE_MAPBOX_ACCESS_TOKEN nas definições para visualizar o mapa.</p>
        </div>
      )}

      {/* Playback Controls */}
      <AnimatePresence>
        {playbackTrip && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-6"
          >
            <div className="bg-white/95 backdrop-blur-xl rounded-[2rem] p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-navy text-white flex items-center justify-center">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-navy leading-tight">Reprodução de Viagem</h4>
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                      {new Date(playbackTrip.createdAt).toLocaleDateString('pt-PT')} • {playbackTrip.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setPlaybackTrip(null);
                    setPlaybackRoute(null);
                    setPlaybackProgress(0);
                    setIsPlaybackPlaying(false);
                  }}
                  className="p-3 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={() => setIsPlaybackPlaying(!isPlaybackPlaying)}
                    className="w-12 h-12 flex items-center justify-center bg-amber text-navy rounded-full shadow-lg shadow-amber/20 hover:scale-105 active:scale-95 transition-all"
                  >
                    {isPlaybackPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                  </button>
                  
                  <button 
                    onClick={() => {
                      setPlaybackProgress(0);
                      setIsPlaybackPlaying(false);
                    }}
                    className="w-12 h-12 flex items-center justify-center bg-slate-100 text-slate-600 rounded-full hover:bg-slate-200 transition-all"
                  >
                    <RotateCcw size={20} />
                  </button>

                  <div className="flex-1 px-4">
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={playbackProgress}
                      onChange={(e) => setPlaybackProgress(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-navy"
                    />
                    <div className="flex justify-between mt-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Início</span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Fim</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
