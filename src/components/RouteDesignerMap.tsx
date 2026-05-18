import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore
import Map, { Marker, Source, Layer, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, X, PlusCircle, Trash2, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

// @ts-ignore
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

interface Point {
  lng: number;
  lat: number;
  name?: string;
  note?: string;
  type: 'start' | 'stop' | 'end';
}

interface RouteDesignerMapProps {
  onRouteUpdate: (routeData: {
    startPoint: string;
    endPoint: string;
    startLocation?: { lat: number; lng: number } | null;
    endLocation?: { lat: number; lng: number } | null;
    stopsLocation?: { lat: number; lng: number }[];
    stops: { name: string; note: string }[];
    coordinates: { lng: number; lat: number; type: string; name?: string; note?: string }[];
    geometry?: any;
    color: string;
  }) => void;
  existingRoutes?: any[];
  onSelectRoute?: (route: any) => void;
  onDeleteRoute?: (id: string) => void;
  onEditRoute?: (route: any) => void;
  onAddRoute?: () => void;
  onConfirmDraw?: () => void;
  initialColor?: string;
  selectedRouteId?: string | null;
}

export default function RouteDesignerMap({ 
  onRouteUpdate, 
  existingRoutes = [], 
  onSelectRoute,
  onDeleteRoute,
  onEditRoute,
  onAddRoute,
  onConfirmDraw,
  initialColor = '#f59e0b',
  selectedRouteId = null
}: RouteDesignerMapProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [lineColor, setLineColor] = useState(initialColor);
  const [isCreating, setIsCreating] = useState(false);
  const [drawingMode, setDrawingMode] = useState<'start' | 'stop' | 'end'>('start');
  const [viewState, setViewState] = useState({
    latitude: 38.7223,
    longitude: -9.1393,
    zoom: 12
  });

  // Reset drawing mode when starting new route
  useEffect(() => {
    if (isCreating && points.length === 0) {
      setDrawingMode('start');
    }
  }, [isCreating, points.length]);

  // Handle selected route update
  useEffect(() => {
    if (selectedRouteId && !isCreating) {
      const route = existingRoutes.find(r => r.id === selectedRouteId);
      if (route) {
        setPoints(route.coordinates || []);
        setRouteGeometry(route.geometry);
        setLineColor(route.color || '#f59e0b');
      }
    }
  }, [selectedRouteId, existingRoutes, isCreating]);

  const fetchDirections = async (currentPoints: Point[]) => {
    if (currentPoints.length < 2) {
      setRouteGeometry(null);
      return;
    }

    const coords = currentPoints.map(p => `${p.lng},${p.lat}`).join(';');
    try {
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
      );
      const data = await response.json();
      if (data.routes && data.routes[0]) {
        setRouteGeometry(data.routes[0].geometry);
      }
    } catch (err) {
      console.error('Error fetching directions:', err);
    }
  };

  const handleMapClick = (evt: any) => {
    if (!isCreating) return;
    const { lng, lat } = evt.lngLat;
    
    setPoints(prev => {
      let newPoints: Point[] = [...prev];
      
      if (drawingMode === 'start') {
        const startIdx = prev.findIndex(p => p.type === 'start');
        if (startIdx !== -1) {
          newPoints[startIdx] = { lng, lat, type: 'start', name: 'Ponto de Partida' };
        } else {
          newPoints = [{ lng, lat, type: 'start', name: 'Ponto de Partida' }, ...prev];
        }
        setDrawingMode('stop');
      } else if (drawingMode === 'end') {
        const endIdx = prev.findIndex(p => p.type === 'end');
        if (endIdx !== -1) {
          newPoints[endIdx] = { lng, lat, type: 'end', name: 'Ponto de Chegada' };
        } else {
          newPoints = [...prev, { lng, lat, type: 'end', name: 'Ponto de Chegada' }];
        }
      } else {
        // Stop mode
        const endPoint = prev.find(p => p.type === 'end');
        const withoutEnd = prev.filter(p => p.type !== 'end');
        const newStop: Point = { lng, lat, type: 'stop', name: `Paragem ${withoutEnd.length}` };
        
        if (endPoint) {
          newPoints = [...withoutEnd, newStop, endPoint];
        } else {
          newPoints = [...withoutEnd, newStop];
        }
      }
      return newPoints;
    });
  };

  useEffect(() => {
    if (isCreating) {
      fetchDirections(points);
      
      const start = points.find(p => p.type === 'start');
      const end = points.find(p => p.type === 'end');
      const stops = points.filter(p => p.type === 'stop');

      onRouteUpdate({
        startPoint: start?.name || (start ? `${start.lat.toFixed(4)}, ${start.lng.toFixed(4)}` : ''),
        endPoint: end?.name || (end ? `${end.lat.toFixed(4)}, ${end.lng.toFixed(4)}` : ''),
        startLocation: start ? { lat: start.lat, lng: start.lng } : null,
        endLocation: end ? { lat: end.lat, lng: end.lng } : null,
        stopsLocation: stops.map(s => ({ lat: s.lat, lng: s.lng })),
        stops: stops.map(s => ({ name: s.name || `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`, note: s.note || '' })),
        coordinates: points.map(p => ({ lng: p.lng, lat: p.lat, type: p.type, name: p.name, note: p.note })),
        geometry: routeGeometry,
        color: lineColor
      });
    }
  }, [points, lineColor, routeGeometry, isCreating]);

  const removePoint = (idx: number) => {
    setPoints(prev => prev.filter((_, i) => i !== idx));
  };

  const startNewRoute = () => {
    setIsCreating(true);
    setPoints([]);
    setRouteGeometry(null);
    onAddRoute?.();
  };


  return (
    <div className="relative w-full h-full bg-slate-100 rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200">
      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-sm p-8 text-center">
          <div className="max-w-xs">
            <div className="w-16 h-16 bg-amber/10 rounded-2full mx-auto mb-4 flex items-center justify-center text-amber">
              <MapPin size={32} />
            </div>
            <p className="text-slate-600 font-bold uppercase tracking-widest text-[10px] leading-relaxed">
              Configuração Necessária: Insira o VITE_MAPBOX_ACCESS_TOKEN nas definições para ativar o mapa de desenho de rotas.
            </p>
          </div>
        </div>
      )}
      {/* Top Route Selection Strip */}
      {!isCreating && existingRoutes.length > 0 && (
        <div className="absolute top-4 left-4 right-4 md:top-6 md:left-6 md:right-16 z-20 flex items-center space-x-2 md:space-x-3 overflow-x-auto pb-4 no-scrollbar">
          {existingRoutes.map(route => (
            <div
              key={route.id}
              onClick={() => onSelectRoute?.(route)}
              className={cn(
                "flex-shrink-0 flex items-center space-x-2 md:space-x-3 px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden relative group",
                selectedRouteId === route.id 
                  ? "bg-white/40 backdrop-blur-xl border-white/50 shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] ring-1 ring-white/20 scale-105" 
                  : "bg-white/80 backdrop-blur-sm text-slate-700 border-slate-100 hover:border-slate-300 hover:bg-white"
              )}
            >
              {selectedRouteId === route.id && (
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent pointer-events-none opacity-50" 
                  style={{ backgroundColor: `${route.color}10` }}
                />
              )}
              <div 
                className={cn(
                  "w-2.5 h-2.5 md:w-3 md:h-3 rounded-full relative z-10 transition-transform duration-300",
                  selectedRouteId === route.id && "scale-125 shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                )} 
                style={{ backgroundColor: route.color || '#f59e0b' }} 
              />
              <span className={cn(
                "text-[10px] md:text-[11px] font-black uppercase tracking-tight truncate max-w-[80px] md:max-w-[120px] relative z-10",
                selectedRouteId === route.id ? "text-navy" : "text-slate-600"
              )}>
                {route.name}
              </span>
              {selectedRouteId === route.id && (
                <div className="flex items-center space-x-1 md:space-x-2 relative z-10">
                  <button 
                    onClick={(e) => { e.stopPropagation(); onEditRoute?.(route); setIsCreating(true); }}
                    className="p-1 hover:text-amber transition-colors text-slate-400"
                    title="Modificar rota"
                  >
                    <Plus size={14} className="md:w-4 md:h-4" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteRoute?.(route.id);}}
                    className="p-1 hover:text-red-400 text-slate-400"
                  >
                    <Trash2 size={10} className="md:w-3 md:h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Map Content */}
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        mapboxAccessToken={MAPBOX_TOKEN}
        onClick={handleMapClick}
        cursor={isCreating ? "crosshair" : "grab"}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="bottom-right" />
        
        {/* Draw selected route */}
        {selectedRouteId && !isCreating && routeGeometry && (
          <Source type="geojson" data={{ type: 'Feature', properties: {}, geometry: routeGeometry }}>
            <Layer
              id="selected-route"
              type="line"
              paint={{
                'line-color': lineColor,
                'line-width': 6,
                'line-opacity': 0.9,
                'line-blur': 1
              }}
            />
          </Source>
        )}

        {isCreating && routeGeometry && (
          <Source type="geojson" data={{ type: 'Feature', properties: {}, geometry: routeGeometry }}>
            <Layer
              id="new-route"
              type="line"
              paint={{
                'line-color': lineColor,
                'line-width': 5,
                'line-opacity': 0.8,
                'line-dasharray': [2, 1]
              }}
            />
          </Source>
        )}

        {/* Selected or New Route Markers */}
        {(selectedRouteId || isCreating) && points.map((p, idx) => (
          <Marker key={idx} longitude={p.lng} latitude={p.lat} anchor="bottom">
            <div className="flex flex-col items-center group">
              <AnimatePresence>
                {(selectedRouteId || isCreating) && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "mb-2 px-3 py-1.5 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-2xl whitespace-nowrap border border-white/20 relative cursor-default",
                        p.type === 'start' ? "bg-green-600" : p.type === 'end' ? "bg-red-600" : "bg-navy"
                      )}
                    >
                      {p.name || (p.type === 'start' ? 'Partida' : p.type === 'end' ? 'Chegada' : `Ponto ${idx}`)}
                      {/* Arrow */}
                      <div className={cn(
                        "absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b border-white/20",
                        p.type === 'start' ? "bg-green-600" : p.type === 'end' ? "bg-red-600" : "bg-navy"
                      )} />
                    </motion.div>
                )}
              </AnimatePresence>
              <div className={cn(
                "w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white font-black text-xs transition-transform duration-300",
                p.type === 'start' ? "bg-green-500 scale-110" : p.type === 'end' ? "bg-red-500 scale-110" : "bg-amber",
                "hover:scale-125"
              )}>
                {p.type === 'start' ? 'S' : p.type === 'end' ? 'F' : idx}
              </div>
            </div>
          </Marker>
        ))}
      </Map>

      {/* Add Route Button (FAB) */}
      {!isCreating && (
        <button
          onClick={startNewRoute}
          className="absolute bottom-4 left-4 md:bottom-8 md:left-8 z-20 w-12 h-12 md:w-16 md:h-16 bg-amber text-navy rounded-2xl md:rounded-3xl shadow-2xl shadow-amber/40 flex items-center justify-center transition-all hover:scale-110 active:scale-95"
          title="Nova Rota"
        >
          <Plus size={24} className="md:w-8 md:h-8" />
        </button>
      )}

      {/* Creation Controls Overlay */}
      {isCreating && (
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="absolute bottom-0 left-0 right-0 z-30 p-4 md:p-8 bg-gradient-to-t from-white via-white to-transparent"
        >
          <div className="max-w-4xl mx-auto bg-white rounded-3xl md:rounded-[2rem] border border-slate-200 shadow-2xl p-4 md:p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
              <div className="flex items-center space-x-4 md:space-x-6 w-full justify-between md:justify-start">
                <div className="flex flex-col">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Passo</span>
                  <div className="flex items-center bg-slate-100 p-0.5 md:p-1 rounded-lg md:rounded-xl">
                    <button
                      onClick={() => setDrawingMode('start')}
                      className={cn(
                        "px-2 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[9px] md:text-[10px] font-black transition-all",
                        drawingMode === 'start' ? "bg-green-600 text-white shadow-md scale-105" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      INI
                    </button>
                    <button
                      onClick={() => setDrawingMode('stop')}
                      className={cn(
                        "px-2 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[9px] md:text-[10px] font-black transition-all",
                        drawingMode === 'stop' ? "bg-amber text-navy shadow-md scale-105" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      PAR
                    </button>
                    <button
                      onClick={() => setDrawingMode('end')}
                      className={cn(
                        "px-2 md:px-4 py-1.5 md:py-2 rounded-md md:rounded-lg text-[9px] md:text-[10px] font-black transition-all",
                        drawingMode === 'end' ? "bg-red-600 text-white shadow-md scale-105" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      FIM
                    </button>
                  </div>
                </div>
                <div className="h-8 md:h-10 w-px bg-slate-100" />
                <div className="flex flex-col">
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Pontos</span>
                  <span className="text-base md:text-xl font-black text-navy">{points.length} <span className="hidden md:inline text-sm font-bold text-slate-400">Total</span></span>
                </div>
              </div>

              <div className="flex items-center space-x-3 md:space-x-4 w-full md:w-auto">
                <button
                  onClick={() => { setIsCreating(false); setPoints([]); setRouteGeometry(null); }}
                  className="flex-1 md:flex-none px-4 md:px-8 py-3 md:py-4 bg-slate-100 text-slate-500 text-xs md:text-sm font-black rounded-xl md:rounded-2xl hover:bg-slate-200 transition-all"
                >
                  CANCELAR
                </button>
                <button
                  onClick={() => {
                    setIsCreating(false);
                    onConfirmDraw?.();
                  }}
                  className="flex-1 md:flex-none px-6 md:px-12 py-3 md:py-4 bg-navy text-white text-xs md:text-sm font-black rounded-xl md:rounded-2xl hover:bg-navy/90 transition-all shadow-xl shadow-navy/20"
                >
                  CONCLUIR
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Floating Instructions */}
      {isCreating && (
        <div className="absolute top-6 left-6 z-20">
          <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber mb-2">Modo Desenho</p>
            <div className="space-y-2">
              <div className="flex items-center space-x-3 text-[11px] font-bold text-slate-600">
                <div className={cn("w-2 h-2 rounded-full", drawingMode === 'start' ? "bg-green-500 animate-pulse" : "bg-green-200")} />
                <span className={drawingMode === 'start' ? "text-navy font-black" : ""}>1º: Defina Partida</span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] font-bold text-slate-600">
                <div className={cn("w-2 h-2 rounded-full", drawingMode === 'stop' ? "bg-amber animate-pulse" : "bg-amber/20")} />
                <span className={drawingMode === 'stop' ? "text-navy font-black" : ""}>2º: Adicione Paragens</span>
              </div>
              <div className="flex items-center space-x-3 text-[11px] font-bold text-slate-600">
                <div className={cn("w-2 h-2 rounded-full", drawingMode === 'end' ? "bg-red-500 animate-pulse" : "bg-red-200")} />
                <span className={drawingMode === 'end' ? "text-navy font-black" : ""}>3º: Marque Chegada</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
