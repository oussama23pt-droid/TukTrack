import React, { useState, useEffect } from 'react';
import { GlassCard } from '../../../components/GlassCard';
import { GradientButton } from '../../../components/GradientButton';
import { Play, Square, AlertTriangle, List, TrendingUp, DollarSign, Shield, Users, MapPin, Clock, Timer, Loader2, X, CheckCircle2, Activity, Navigation, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../auth/AuthContext';
import { doc, updateDoc, setDoc, collection, serverTimestamp, query, where, onSnapshot, getDocs, limit, addDoc, getDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '../../../lib/firebase';
import { handleFirestoreError, sanitizeData, OperationType } from '../../../lib/firestore-utils';
import RegisterTripModal from './RegisterTripModal';
import { TukTukLogo } from '../../../components/TukTukLogo';
import { LocationPermissionModal } from '../../../components/LocationPermissionModal';
import { LocationInstructionsModal } from '../../../components/LocationInstructionsModal';
import Map, { Marker, Source, Layer, NavigationControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// @ts-ignore
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

// ─── MODULE-LEVEL LOCATION STORE ─────────────────────────────────────────────
// Lives completely outside React so Android WebView never loses it on re-renders,
// background/foreground transitions, or hot reloads.
const _store = {
  isOnline: false,
  uid: null as string | null,
  lastFirestoreWrite: 0,
  latestCoords: null as { lat: number; lng: number } | null,
  onCoordsUpdate: null as ((coords: { lat: number; lng: number }) => void) | null,
};

// Register callback at module load time — Median calls this from native via evaluateJavascript
window.medianLocationUpdated = async (location: any) => {
  if (!location?.latitude || !location?.longitude) return;
  if (!_store.isOnline) return;
  if (!_store.uid) return;

  const lat = Number(location.latitude);
  const lng = Number(location.longitude);

  // Always push coords to React immediately via the registered callback
  _store.latestCoords = { lat, lng };
  if (_store.onCoordsUpdate) _store.onCoordsUpdate({ lat, lng });

  // Throttle Firestore writes to every 4 seconds
  const now = Date.now();
  if (now - _store.lastFirestoreWrite < 4000) return;
  _store.lastFirestoreWrite = now;

  try {
    await updateDoc(doc(db, 'users', _store.uid), {
      location: { lat, lng, updatedAt: new Date().toISOString() },
      currentLat: lat,
      currentLng: lng,
      locationAccuracy: location.accuracy ?? null,
      lastUpdated: serverTimestamp(),
    });
  } catch (err) {
    console.error('[Median] Firestore write error:', err);
  }
};
// ─────────────────────────────────────────────────────────────────────────────

export default function DriverDashboard() {
  const { user, userData } = useAuth();
  const [isOnline, setIsOnline] = useState(userData?.isOnline || false);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [isSOSLoading, setIsSOSLoading] = useState(false);
  const [locationWatchId, setLocationWatchId] = useState<number | null>(null);

  const locationWatchRef = React.useRef<number | null>(null);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const lastUpdateRef = React.useRef<number>(0);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [localActiveTripId, setLocalActiveTripId] = useState<string | null>(userData?.activeTripId || null);
  const [todayStats, setTodayStats] = useState({ count: 0, earnings: 0 });
  const [cancelTimer, setCancelTimer] = useState<number | null>(null);
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [activeTrip, setActiveTrip] = useState<any | null>(null);
  const [assignedVehicle, setAssignedVehicle] = useState<any | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [mapTripData, setMapTripData] = useState<any | null>(null);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [lastTrip, setLastTrip] = useState<any | null>(null);
  const wakeLockRef = React.useRef<any>(null);
  const [currentCoords, setCurrentCoords] = useState<{lat: number, lng: number} | null>(null);
  const [mapViewState, setMapViewState] = useState({
    latitude: 38.7223,
    longitude: -9.1393,
    zoom: 15
  });
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showLocationInstructions, setShowLocationInstructions] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'active' | 'disabled' | 'checking'>('checking');
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [lastCoords, setLastCoords] = useState<{lat: number, lng: number} | null>(null);
  const [managerInfo, setManagerInfo] = useState<any>(null);
  const gpsWarningSentRef = React.useRef<boolean>(false);
  const [showBackgroundPermissionModal, setShowBackgroundPermissionModal] = useState(false);
  const [showOverlayPermissionModal, setShowOverlayPermissionModal] = useState(false);
  const overlayPermissionGranted = React.useRef<boolean>(localStorage.getItem('tuktrack_overlay_granted') === 'true');
  const backgroundLocationGranted = React.useRef<boolean>(localStorage.getItem('tuktrack_bg_location_granted') === 'true');
  const [showShiftStartModal, setShowShiftStartModal] = useState(false);
  const prevActiveShiftRef = React.useRef<any>(null);


  // Fetch manager info
  useEffect(() => {
    if (!userData?.managerId) {
      setManagerInfo(null);
      return;
    }
    
    const fetchManager = async () => {
      const path = `users/${userData.managerId}`;
      try {
        const mDoc = await getDoc(doc(db, 'users', userData.managerId));
        if (mDoc.exists()) {
          setManagerInfo(mDoc.data());
        }
      } catch (err) {
        // Log the error but don't break the app
        console.warn('Could not fetch manager info:', err);
        // We still call handleFirestoreError for the system to catch and report it if needed
        try {
          handleFirestoreError(err, OperationType.GET, path);
        } catch (e) {
          // Ignore the re-thrown error as we handled it with console.warn
        }
      }
    };
    
    fetchManager();
  }, [userData?.managerId]);

  // Check location permission on mount
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationStatus('active');
        setCurrentCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocationStatus('disabled');
        if (err.code !== err.PERMISSION_DENIED) {
          setShowLocationModal(true);
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  }, []);

  const requestLocationPermission = () => {
    setShowLocationModal(false);
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocationStatus('active');
          setCurrentCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (error) => {
          console.error('Location request failed:', error);
          setLocationStatus('disabled');
          if (error.code === error.PERMISSION_DENIED) {
            alert('Permissão de localização negada. Por favor, ative a localização nas Definições do seu telemóvel:\n\nDefinições → Aplicações → TukTrack → Permissões → Localização');
          }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
  };

  useEffect(() => {
    if (!userData?.managerId) return;

    // Listen for notifications targeted at drivers in this team/manager
    const notifyQuery = query(
      collection(db, 'notifications'),
      where('managerId', '==', userData.managerId),
      where('isForDrivers', '==', true),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(3)
    );

    const pushedNotifIds = new Set<string>();
    const unsubNotify = onSnapshot(notifyQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      setNotifications(docs);

      // Push each NEW notification to the Android notification bar
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as any;
          const docId = change.doc.id;
          if (!pushedNotifIds.has(docId)) {
            pushedNotifIds.add(docId);
            const numId = 3000 + (Math.abs(
              docId.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)
            ) % 5000);
            try {
              const bridge = (window as any).AndroidBridge;
              if (bridge?.showAlertNotification) {
                bridge.showAlertNotification(
                  data.title || 'TukTrack',
                  data.message || data.body || '',
                  numId
                );
              }
            } catch (e) {}
          }
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });

    return () => unsubNotify();
  }, [userData?.managerId]);

  const [showStopsList, setShowStopsList] = useState(false);
  const [stopsListTrip, setStopsListTrip] = useState<any | null>(null);

  const openStopsList = async (trip: any) => {
    if (!trip) return;
    setIsMapLoading(true);
    try {
      let stops = [];
      if (trip.routeId && trip.routeId !== 'manual') {
        const routeDoc = await getDoc(doc(db, 'routes', trip.routeId));
        if (routeDoc.exists()) {
          const routeData = routeDoc.data();
          stops = routeData.coordinates || routeData.stops || [];
        }
      }
      setStopsListTrip({ ...trip, stops });
      setShowStopsList(true);
    } catch (err) {
      console.error('Error opening stops list:', err);
    } finally {
      setIsMapLoading(false);
    }
  };

  useEffect(() => {
    if (currentCoords && !isNaN(currentCoords.lat)) {
      // Always follow the driver on the map when coords update
      setMapViewState(prev => ({
        ...prev,
        latitude: currentCoords.lat,
        longitude: currentCoords.lng
      }));
    }
  }, [currentCoords]);

  // currentCoords is updated by startLocationTracking watchPosition - no duplicate needed

  useEffect(() => {
    if (!user) return;
    // Get last completed trip for the "no active trip" state
    const q = query(
      collection(db, 'trips'),
      where('driverUid', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        setLastTrip({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    });
    return () => unsub();
  }, [user]);

  // Screen Wake Lock to keep app active in background when online
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && isOnline) {
        try {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
          console.log('[GPS] Screen Wake Lock acquired');
          
          wakeLockRef.current.addEventListener('release', () => {
             console.log('[GPS] Screen Wake Lock released');
          });
        } catch (err: any) {
          console.warn('[GPS] Wake Lock failed:', err.name, err.message);
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible' && isOnline) {
        await requestWakeLock();
      }
    };

    if (isOnline) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, [isOnline]);

  // Keep an always-current ref of isOnline — initialized from userData AND kept in sync
  // This is critical: the Median callback runs in a stale closure and cannot read React state
  const isOnlineRef = React.useRef<boolean>(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
    _store.isOnline = isOnline; // keep module-level store in sync
  }, [isOnline]);

  // --- MEDIAN LOCATION CALLBACK ARCHITECTURE ---
  // The callback is registered ONCE on window at module level (outside React lifecycle)
  // so Android WebView never loses it when React re-renders or cleans up effects.
  // We use only refs inside the callback — no React state setters — to avoid stale closure issues.
  // A setInterval polls the ref every 2 seconds and pushes coords into React state safely.

  // Sync _store with current React state — keeps the module-level callback accurate
  useEffect(() => {
    _store.uid = user?.uid || null;
  }, [user?.uid]);

  useEffect(() => {
    _store.isOnline = isOnline;
  }, [isOnline]);

  // Register the React coords setter into the store so the callback can push updates
  useEffect(() => {
    _store.onCoordsUpdate = (coords) => {
      setCurrentCoords(coords);
      setLocationStatus('active');
    };
    return () => { _store.onCoordsUpdate = null; };
  }, []);

  // Monitor GPS status and notify manager if disabled while online
  useEffect(() => {
    if (!user || !userData?.managerId || !isOnline) {
      gpsWarningSentRef.current = false;
      return;
    }

    const sendGpsNotification = async (type: 'gps_disabled' | 'gps_restored') => {
      try {
        const title = type === 'gps_disabled' ? '⚠️ GPS DESATIVADO' : '✅ GPS RESTAURADO';
        const message = type === 'gps_disabled' 
          ? `O motorista ${userData.name} desativou a localização ou perdeu o sinal GPS.` 
          : `O motorista ${userData.name} restaurou a ligação GPS.`;

        await addDoc(collection(db, 'notifications'), {
          managerId: userData.managerId,
          type: type === 'gps_disabled' ? 'alert' : 'info',
          title,
          message,
          driverUid: user.uid,
          driverName: userData.name,
          createdAt: new Date().toISOString(),
          read: false,
          isForDrivers: false
        });
      } catch (err) {
        console.error('Error sending GPS notification:', err);
      }
    };

    if (locationStatus === 'disabled' && !gpsWarningSentRef.current) {
      sendGpsNotification('gps_disabled');
      gpsWarningSentRef.current = true;
    } else if (locationStatus === 'active' && gpsWarningSentRef.current) {
      sendGpsNotification('gps_restored');
      gpsWarningSentRef.current = false;
    }
  }, [locationStatus, isOnline, user, userData?.managerId, userData?.name]);

  const openMapForTrip = async (trip: any) => {
    if (!trip) return;
    setIsMapLoading(true);
    try {
      let geometry = null;
      let stops = [];
      if (trip.routeId && trip.routeId !== 'manual') {
        const routeDoc = await getDoc(doc(db, 'routes', trip.routeId));
        if (routeDoc.exists()) {
          const routeData = routeDoc.data();
          geometry = routeData.geometry;
          // In some versions we might have stored it as coordinates or stops
          stops = routeData.coordinates || routeData.stops || [];
          
          // Ensure stops are objects with lat/lng
          if (stops.length > 0 && typeof stops[0] === 'string') {
            // If it's just names, we can't show them on map without coords
            // but normally we store coordinates as objects
            stops = [];
          }

          // Reconstruct nested arrays for Mapbox from Firestore objects if needed
          if (geometry && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && typeof geometry.coordinates[0] === 'object') {
            geometry = {
              ...geometry,
              coordinates: geometry.coordinates.map((coord: any) => [coord.lng, coord.lat])
            };
          }

          // Set initial view state
          if (currentCoords && !isNaN(currentCoords.lat)) {
            setMapViewState({
              latitude: currentCoords.lat,
              longitude: currentCoords.lng,
              zoom: 15
            });
          } else if (stops.length > 0 && !isNaN(stops[0].lat)) {
             setMapViewState({
              latitude: stops[0].lat,
              longitude: stops[0].lng,
              zoom: 15
            });
          }
        }
      }
      setMapTripData({ ...trip, geometry, stops });
      setShowMap(true);
    } catch (err) {
      console.error('Error opening map:', err);
    } finally {
      setIsMapLoading(false);
    }
  };

  useEffect(() => {
    if (!userData?.vehicleId) {
      setAssignedVehicle(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'vehicles', userData.vehicleId), (snapshot) => {
      if (snapshot.exists()) {
        setAssignedVehicle({ id: snapshot.id, ...snapshot.data() });
      } else {
        // Fallback: Check if it's a plate number
        const plate = userData.vehicleId.toUpperCase().replace(/\s/g, '');
        const q = query(collection(db, 'vehicles'), where('plateNumber', '==', plate));
        
        getDocs(q).then((qSnap) => {
          if (!qSnap.empty) {
            const vDoc = qSnap.docs[0];
            setAssignedVehicle({ id: vDoc.id, ...vDoc.data() });
          } else {
            setAssignedVehicle(null);
          }
        }).catch((e) => {
          console.error('Fallback vehicle fetch error:', e);
          setAssignedVehicle(null);
        });
      }
    }, (err) => {
      console.error('Error listening to vehicle:', err);
    });

    return () => unsub();
  }, [userData?.vehicleId]);

  useEffect(() => {
    if (!userData?.managerId) return;

    const shiftQuery = query(
      collection(db, 'shifts'),
      where('managerId', '==', userData.managerId),
      where('status', '==', 'active'),
      limit(1)
    );

    const unsub = onSnapshot(shiftQuery, (snapshot) => {
      if (!snapshot.empty) {
        const shiftData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        // Only show modal when shift STARTS this session — not on every app open
        const shiftSeenKey = 'tuktrack_shift_seen_' + shiftData.id;
        // localStorage persists when app is killed/reopened — prevents repeated modal
        if (!prevActiveShiftRef.current && !localStorage.getItem(shiftSeenKey) && !isOnlineRef.current) {
          localStorage.setItem(shiftSeenKey, 'true');
          setShowShiftStartModal(true);
        }
        prevActiveShiftRef.current = shiftData;
        setActiveShift(shiftData);
      } else {
        prevActiveShiftRef.current = null;
        setActiveShift(null);
      }
    }, (err) => {
      console.error('Error listening to shifts:', err);
    });

    return () => unsub();
  }, [userData?.managerId, user?.uid]);

  useEffect(() => {
    // Sync local isOnline state with Firestore — no override here
    // The shift block is handled entirely in toggleShift()
    const online = userData?.isOnline || false;
    setIsOnline(online);
    // Expose to window so Median background callback can guard itself
    _store.isOnline = online; // keep module-level store in sync
  }, [userData?.isOnline]);
  useEffect(() => {
    if (userData?.activeTripId) {
      setLocalActiveTripId(userData.activeTripId);
    } else if (userData && !userData.activeTripId) {
      setLocalActiveTripId(null);
    }
  }, [userData?.activeTripId]);

  useEffect(() => {
    const effectiveTripId = localActiveTripId || userData?.activeTripId;
    if (!user || !effectiveTripId) {
      setActiveTrip(null);
      setCancelTimer(null);
      return;
    }

    const unsub = onSnapshot(doc(db, 'trips', effectiveTripId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setActiveTrip(data);
        
        // Handle cancel timer
        const createdTime = new Date(data.createdAt).getTime();
        const now = Date.now();
        const diff = (now - createdTime) / 1000;
        
        if (diff < 20 && data.status === 'active') {
          setCancelTimer(Math.ceil(60 - diff));
          const interval = setInterval(() => {
            const currentDiff = (Date.now() - createdTime) / 1000;
            if (currentDiff >= 20) {
              setCancelTimer(null);
              clearInterval(interval);
            } else {
              setCancelTimer(Math.ceil(60 - currentDiff));
            }
          }, 1000);
          return () => clearInterval(interval);
        } else {
          setCancelTimer(null);
        }
      }
    }, (err) => {
      console.error('Error listening to trip:', err);
    });

    return () => unsub();
  }, [user, userData?.activeTripId]);

  const handleTripStarted = (tripId: string) => {
    setLocalActiveTripId(tripId);
    setCancelTimer(60);
  };

  const handleCancelTrip = () => {
    // Show reason modal before cancelling
    setCancelReason('');
    setShowCancelReasonModal(true);
  };

  const confirmCancelTrip = async (reason: string) => {
    if (!user || !activeTrip) return;
    setShowCancelReasonModal(false);
    setIsActionLoading(true);
    try {
      await updateDoc(doc(db, 'trips', activeTrip.id), {
        status: 'cancelled',
        cancelReason: reason || 'Sem motivo indicado',
        cancelledAt: new Date().toISOString(),
      });
      await updateDoc(doc(db, 'users', user.uid), {
        activeTripId: '',
        isOnline: true
      });
      setLocalActiveTripId(null);
      setActiveTrip(null);
      setCancelTimer(null);
    } catch (err: any) {
      handleFirestoreError(err, 'update', `trips/${activeTrip.id}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleEndTrip = async () => {
    if (!user || !activeTrip) return;
    setIsActionLoading(true);
    try {
      await updateDoc(doc(db, 'trips', activeTrip.id), {
        status: 'completed'
      });
      await updateDoc(doc(db, 'users', user.uid), {
        activeTripId: '',
        isOnline: true
      });
      setLocalActiveTripId(null);
      setActiveTrip(null);
    } catch (err: any) {
      handleFirestoreError(err, 'update', `trips/${activeTrip.id}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Fetch today's trips
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tripsQuery = query(
      collection(db, 'trips'),
      where('driverUid', '==', user.uid),
      where('createdAt', '>=', today.toISOString()),
      where('status', '==', 'completed')
    );

    const unsub = onSnapshot(tripsQuery, (snapshot) => {
      const trips = snapshot.docs.map(doc => doc.data());
      const totalEarnings = trips.reduce((acc, curr) => acc + (curr.amount || 0), 0);
      setTodayStats({
        count: trips.length,
        earnings: totalEarnings
      });
    }, (err) => {
      console.error('Error listening to today trips:', err);
    });

    return () => unsub();
  }, [user]);

  const startBackgroundLocation = (): boolean => {
    if (!(window as any).median?.backgroundLocation) return false;
    try {
      (window as any).median.backgroundLocation.start({
        callback: 'medianLocationUpdated',
        androidPriority: 'highAccuracy',
        androidInterval: 5000,
        androidFastestInterval: 3000,
        iosDesiredAccuracy: 'best',
        iosDistanceFilter: 10,
        androidNotificationTitle: '🟢 TukTrack — Online',
        androidNotificationText: 'A partilhar localização em tempo real. Toque para abrir a aplicação.',
        androidNotificationIcon: 'ic_notification',
      });
      console.log('[Median] backgroundLocation started successfully');
      return true;
    } catch (e) {
      console.warn('[Median] backgroundLocation.start failed, falling back to watchPosition:', e);
      return false;
    }
  };

  const stopBackgroundLocation = () => {
    if ((window as any).median?.backgroundLocation) {
      try {
        (window as any).median.backgroundLocation.stop();
      } catch (e) {
        console.warn('[Median] backgroundLocation.stop failed:', e);
      }
    }
  };

  const startLocationTracking = () => {
    // Try Median background location plugin first (works in background too)
    // If the plugin exists but is unlicensed/fails, fall through to watchPosition
    if ((window as any).median?.backgroundLocation) {
      const started = startBackgroundLocation();
      if (started) return; // plugin is working — no need for watchPosition
      // Plugin failed — fall through to watchPosition below
    }

    // watchPosition fallback: works on web AND in APK when plugin is unavailable
    // This keeps location updating as long as the screen is on
    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }

    console.log('[GPS] Starting watchPosition fallback');

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        if (!user) return;

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Always update map immediately
        setCurrentCoords({ lat, lng });
        setLocationStatus('active');

        // Throttle Firestore writes to every 5 seconds
        const now = Date.now();
        if (now - lastUpdateRef.current < 5000) return;
        lastUpdateRef.current = now;

        try {
          await updateDoc(doc(db, 'users', user.uid), {
            location: {
              lat,
              lng,
              updatedAt: new Date().toISOString()
            },
            currentLat: lat,
            currentLng: lng,
            locationAccuracy: pos.coords.accuracy,
            lastUpdated: serverTimestamp()
          });
        } catch (err) {
          console.error('[GPS] watchPosition Firestore write error:', err);
        }
      },
      (err) => {
        console.error('[GPS] watchPosition error:', err);
        setLocationStatus('disabled');
        // Retry after 5s only if still online — prevents restart loop
        if (locationWatchRef.current !== null) {
          setTimeout(() => {
            if (isOnlineRef.current) startLocationTracking();
          }, 5000);
        }
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );

    locationWatchRef.current = watchId;
    setLocationWatchId(watchId);
  };

  const stopLocationTracking = () => {
    if (locationWatchRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
      setLocationWatchId(null);
    }
  };

  const handleGoOnline = async () => {
    if (!user || !userData) return;

    if (!('geolocation' in navigator)) {
      alert('GPS not available on this device');
      return;
    }

    setIsActionLoading(true);
    try {
      // Explicit permission query
      let state = 'prompt';
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' as any });
        state = permission.state;
      } catch (e) {
        console.warn('Permissions API not supported, proceeding with direct request');
      }

      if (state === 'denied') {
        setShowLocationInstructions(true);
        setIsActionLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await updateDoc(doc(db, 'users', user.uid), {
              isOnline: true,
              status: 'online',
              currentLat: pos.coords.latitude,
              currentLng: pos.coords.longitude,
              location: {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                updatedAt: new Date().toISOString()
              },
              lastUpdated: serverTimestamp()
            });
            // STEP 1: Start watchPosition FIRST — location works immediately
            startLocationTracking();
            setIsOnline(true);
            setLocationStatus('active');

            // STEP 2: Request permissions — always show regardless of platform
            if (!overlayPermissionGranted.current) {
              setTimeout(() => setShowOverlayPermissionModal(true), 800);
            } else if (!backgroundLocationGranted.current) {
              setTimeout(() => setShowBackgroundPermissionModal(true), 800);
            }
            // STEP 3: Show persistent status bar notification
            showOnlineNotification(
              activeShift?.startedAt ? new Date(activeShift.startedAt) :
              activeShift?.createdAt ? new Date(activeShift.createdAt) :
              undefined
            );
          } catch (err) {
            console.error('Failed to update online status:', err);
          } finally {
            setIsActionLoading(false);
          }
        },
        (err) => {
          console.error('Location failed:', err);
          setShowLocationInstructions(true);
          setIsActionLoading(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    } catch (e) {
      console.error('Global error in handleGoOnline:', e);
      setIsActionLoading(false);
    }
  };

  const toggleShift = async () => {
    if (!user || !userData) return;
    if (isActionLoading) return; // prevent double-tap race condition
    
    if (!isOnline) {
      return handleGoOnline();
    }

    // HARD BLOCK: Cannot go offline during a manager-initiated shift
    if (activeShift) {
      try {
        await addDoc(collection(db, 'notifications'), {
          managerId: activeShift.managerId || userData.managerId,
          type: 'gps_off_attempt',
          title: '⚠️ Tentativa de Sair de Serviço',
          message: `O motorista ${userData.name || 'Desconhecido'} tentou desativar o GPS durante um turno ativo.`,
          driverUid: user.uid,
          driverName: userData.name || 'Desconhecido',
          createdAt: new Date().toISOString(),
          read: false,
          isForDrivers: false
        });
      } catch (err) {
        console.error('Failed to send offline-attempt notification:', err);
      }
      alert('Não pode sair de serviço enquanto um turno está ativo. O Gestor controla a duração do turno.');
      return;
    }

    // BLOCK: Cannot go offline during an active trip
    if (activeTrip) {
      alert('Não pode sair de serviço enquanto tem uma viagem em curso. Termine a viagem primeiro.');
      return;
    }

    setIsActionLoading(true);
    try {
      _store.isOnline = false; // stop Median callback writes immediately
      _store.latestCoords = null;
      lastUpdateRef.current = 0; // reset throttle — next go-online writes position immediately
      stopLocationTracking();
      stopBackgroundLocation();
      await updateDoc(doc(db, 'users', user.uid), {
        isOnline: false,
        status: 'offline',
        currentLat: null,
        currentLng: null,
        location: null,
        lastUpdated: serverTimestamp()
      });
      setIsOnline(false);
      hideOnlineNotification();
    } catch (err: any) {
      handleFirestoreError(err, 'update', `users/${user.uid}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Replace old tracking useEffect
  useEffect(() => {
  if (isOnline && user?.uid) {
    stopLocationTracking();
    setTimeout(() => startLocationTracking(), 500);
  } else {
    stopLocationTracking();
    stopBackgroundLocation();
  }
  return () => {
    stopLocationTracking();
    stopBackgroundLocation();
  };
}, [isOnline, user?.uid]);

  useEffect(() => {
    if (!user) return;

    const sosQuery = query(
      collection(db, 'sos_alerts'),
      where('driverUid', '==', user.uid),
      where('status', '==', 'active'),
      limit(1)
    );

    const unsub = onSnapshot(sosQuery, (snapshot) => {
      if (!snapshot.empty) {
        setIsSOSActive(true);
        setActiveSosId(snapshot.docs[0].id);
      } else {
        setIsSOSActive(false);
        setActiveSosId(null);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'sos_alerts');
    });

    return () => unsub();
  }, [user]);

  const triggerSOS = async () => {
    if (!user || !userData || isSOSLoading) return;
    
    setIsSOSLoading(true);
    
    try {
      if (isSOSActive && activeSosId) {
        // Stop SOS
        await updateDoc(doc(db, 'sos_alerts', activeSosId), {
          status: 'resolved',
          resolvedAt: new Date().toISOString()
        });
        
        // Add a notification that SOS was resolved
        await addDoc(collection(db, 'notifications'), {
          managerId: userData.managerId,
          type: 'info',
          title: 'SOS Resolvido',
          message: `O motorista ${userData.name} resolveu o alerta SOS e está em segurança.`,
          driverUid: user.uid,
          driverName: userData.name,
          createdAt: new Date().toISOString(),
          read: false,
          isForDrivers: false
        });

        alert('Alerta SOS resolvido.');
      } else {
        // Start SOS
        const alertId = `sos_${Date.now()}`;
        let location = null;
        
        // Get current location for SOS with timeout
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            });
          });
          
          location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
        } catch (locErr) {
          console.warn('Could not get precise location for SOS, trying fallback...', locErr);
          if (userData.location) {
            location = {
              lat: userData.location.lat,
              lng: userData.location.lng
            };
          }
        }

        const sosData = sanitizeData({
          id: alertId,
          driverUid: user.uid,
          driverName: userData.name || 'Motorista',
          managerId: userData.managerId,
          location,
          status: 'active',
          createdAt: new Date().toISOString()
        });

        await setDoc(doc(db, 'sos_alerts', alertId), sosData);

        // Add a primary notification for SOS
        await addDoc(collection(db, 'notifications'), {
          managerId: userData.managerId,
          type: 'sos',
          title: 'ALERTA SOS!',
          message: `O motorista ${userData.name} acionou o SOS às ${new Date().toLocaleTimeString()}.`,
          driverUid: user.uid,
          driverName: userData.name,
          createdAt: new Date().toISOString(),
          read: false,
          isForDrivers: false
        });
        
        alert('ALERTA SOS ENVIADO! O Gestor foi notificado.');
      }
    } catch (err: any) {
      handleFirestoreError(err, isSOSActive ? 'update' : 'create', isSOSActive ? `sos_alerts/${activeSosId}` : 'sos_alerts');
      alert('Erro ao processar SOS. Tente novamente.');
    } finally {
      setIsSOSLoading(false);
    }
  };

  const handleConfirmStop = async (stopIndex: number) => {
    const effectiveTripId = localActiveTripId || userData?.activeTripId;
    if (!effectiveTripId || !activeTrip) return;
    
    try {
      const currentProgress = activeTrip.progress || { completedStops: [], lastStopIndex: -1 };
      let completedStops = [...(currentProgress.completedStops || [])];
      
      if (completedStops.includes(stopIndex)) {
        completedStops = completedStops.filter(i => i !== stopIndex);
      } else {
        completedStops.push(stopIndex);
      }
      
      await updateDoc(doc(db, 'trips', effectiveTripId), {
        progress: {
          completedStops,
          lastStopIndex: stopIndex
        }
      });
    } catch (err) {
      console.error('Error confirming stop:', err);
    }
  };

  // ─── Persistent notification via AndroidBridge (MainActivity.kt) ─────────────
  // showForegroundNotification() is a @JavascriptInterface method injected by
  // the fixed MainActivity. It creates an ongoing (non-dismissable) notification
  // in the Android status bar. Tapping it returns the driver to the dashboard.
  const showOnlineNotification = async (shiftStartTime?: Date) => {
    const bridge = (window as any).AndroidBridge;
    if (bridge?.showForegroundNotification) {
      try {
        const shiftStartMs = shiftStartTime ? shiftStartTime.getTime() : Date.now();
        bridge.showForegroundNotification(
          '🟢 TukTrack — Em Serviço',
          'A partilhar localização em tempo real. Toque para abrir.',
          shiftStartMs
        );
        console.log('[Notif] Foreground service started, timer from:', new Date(shiftStartMs));
        return;
      } catch (e) {
        console.warn('[Bridge] showForegroundNotification failed:', e);
      }
    }
    // Fallback: Web Notifications API (browser / web version)
    if ('Notification' in window) {
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm === 'granted') {
        new Notification('🟢 TukTrack — Em Serviço', {
          body: 'A partilhar localização em tempo real. Toque para abrir.',
          icon: '/pwa-192x192.png',
          tag: 'tuktrack-online',
          requireInteraction: true,
          silent: true,
        });
      }
    }
  };

  const hideOnlineNotification = () => {
    const bridge = (window as any).AndroidBridge;
    if (bridge?.hideForegroundNotification) {
      try { bridge.hideForegroundNotification(); } catch (e) {}
    }
  };

  return (
    <div className="flex flex-col space-y-8 pb-48 lg:pb-8 max-w-lg mx-auto">
      {/* Notifications Section */}
      <AnimatePresence>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden px-1"
          >
            <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-5 flex items-center justify-between shadow-lg shadow-amber-500/10">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-amber text-navy rounded-2xl shadow-lg shadow-amber/20">
                  <Activity size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-navy uppercase tracking-tight">{notif.title}</h4>
                  <p className="text-xs text-slate-600 font-medium leading-tight mt-0.5">{notif.message}</p>
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
                className="p-3 hover:bg-amber-100 text-amber-600 rounded-2xl transition-colors"
              >
                <CheckCircle2 size={20} />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Header Info */}
      <div className="flex items-center justify-between mb-2 bg-white/40 p-6 rounded-[2rem] border border-white/60 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <h1 className="text-2xl font-black font-display text-slate-800">Olá, {userData?.name?.split(' ')[0]}!</h1>
            <button 
              onClick={() => {
                if (locationStatus !== 'active') handleGoOnline();
                else setShowLocationModal(true);
              }}
              className={cn(
                "flex items-center space-x-1.5 px-2.5 py-1 rounded-full border transition-all text-[8px] font-black uppercase tracking-tighter shadow-sm",
                locationStatus === 'active' 
                  ? "bg-green-50 text-green-600 border-green-100" 
                  : "bg-red-50 text-red-500 border-red-100 animate-pulse"
              )}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full", locationStatus === 'active' ? "bg-green-500" : "bg-red-500")} />
              <span>{locationStatus === 'active' ? 'GPS Ativo' : 'GPS Desativado - Toque para Ativar'}</span>
            </button>
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <Shield size={12} className="text-amber" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {managerInfo?.companyName || managerInfo?.name || userData?.managerId || '---'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Veículo Atribuído</p>
          <div className="bg-amber/10 px-3 py-2 rounded-xl border border-amber/20 inline-block text-right">
            {assignedVehicle ? (
              <div className="flex flex-col items-end">
                <p className="font-black text-amber text-sm leading-none">{assignedVehicle.plateNumber}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    assignedVehicle.status === 'active' ? "bg-green-500" : "bg-amber-500"
                  )} />
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                    {assignedVehicle.color} • {assignedVehicle.status}
                  </p>
                </div>
              </div>
            ) : (
              <p className="font-black text-slate-400 text-sm">NENHUM</p>
            )}
          </div>
        </div>
      </div>

      {/* PRIMARY ACTION BUTTON - Moved to be FIRST */}
      <div className="z-10">
        <motion.div
          layout
          className="glass-3d-light p-2 rounded-[2.5rem] bg-white/70 backdrop-blur-xl border-amber/20 shadow-xl"
        >
          {activeTrip ? (
            <GradientButton 
              label="CHEGADA! STOP" 
              className="h-28 text-3xl font-black rounded-[3rem] shadow-2xl italic tracking-tighter"
              onClick={handleEndTrip}
              isLoading={isActionLoading}
              icon={<Square size={24} className="fill-current" />}
            />
          ) : (
            <GradientButton 
              className="h-32 text-4xl font-black rounded-[3.5rem] shadow-2xl relative overflow-hidden group italic bg-gradient-to-r from-amber to-amber-500 border-amber-600" 
              disabled={!isOnline}
              onClick={() => setIsTripModalOpen(true)}
            >
              <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-[120px] font-black opacity-10 -rotate-12 scale-150 select-none">GO</span>
              </div>
              <div className="relative z-10 flex flex-col items-center">
                <span className="text-[10px] uppercase tracking-[0.5em] mb-1 opacity-60 not-italic">Pronto para começar?</span>
                <div className="flex items-center space-x-4">
                  <Play size={36} className="fill-current" />
                  <span>GO! VIAGEM</span>
                </div>
              </div>
            </GradientButton>
          )}
        </motion.div>
      </div>

      {/* Shift Toggle - 3D Glassy */}
      <motion.button
        whileTap={{ scale: (activeTrip || isActionLoading) ? 1 : 0.95 }}
        whileHover={{ scale: (activeTrip || isActionLoading) ? 1 : 1.02 }}
        onClick={toggleShift}
        disabled={isActionLoading}
        className={cn(
          "w-full h-28 rounded-[2rem] flex items-center justify-between px-8 shadow-2xl transition-all duration-500 relative overflow-hidden group",
          isActionLoading && "opacity-60 cursor-not-allowed",
          activeShift
            ? "glass-card-light border-amber/40 text-amber bg-amber/5 cursor-not-allowed"
            : isOnline 
              ? "glass-card-light border-green-500/30 text-green-600 bg-green-50/50" 
              : "glass-card-light border-slate-200 text-slate-400",
          !activeShift && isOnline && activeTrip && "cursor-not-allowed opacity-80"
        )}
      >
        <div className="flex items-center space-x-4">
          <div className={cn(
            "p-4 rounded-2xl transition-colors relative",
            activeShift ? "bg-amber/10 text-amber" : isOnline ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
          )}>
            {activeShift ? (
              <div className="relative">
                <Lock fill="currentColor" size={24} />
                <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 border border-amber/30 shadow-sm">
                  <Shield size={10} className="text-amber fill-current" />
                </div>
              </div>
            ) : isOnline ? (
              <div className="relative">
                <Square fill="currentColor" size={24} />
                {activeTrip && (
                  <div className="absolute -top-1 -right-1 bg-white rounded-full p-0.5 border border-green-200 shadow-sm">
                    <Shield size={10} className="text-amber fill-current" />
                  </div>
                )}
              </div>
            ) : <Play fill="currentColor" size={24} />}
          </div>
          <div className="text-left">
            <span className="text-2xl font-display font-black block">
              {activeShift ? 'TURNO ATIVO' : isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
            <span className="text-xs font-medium opacity-70">
              {activeShift 
                ? 'Bloqueado pelo Gestor — não pode sair de serviço'
                : activeTrip 
                  ? 'Em viagem (status fixo)' 
                  : isOnline 
                    ? 'A partilhar localização' 
                    : 'Toque para entrar em serviço'}
            </span>
          </div>
        </div>
        <div className={cn(
          "w-3 h-3 rounded-full animate-pulse",
          activeShift ? "bg-amber shadow-[0_0_15px_rgba(245,158,11,0.5)]" : isOnline ? "bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]" : "bg-slate-300"
        )} />
      </motion.button>

      {/* Rota no Mapa Component (replaces div:nth-of-type(3)) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <div 
          onClick={() => openMapForTrip(activeTrip || lastTrip)}
          className="glass-3d-light p-6 rounded-[2.5rem] border border-amber/30 relative overflow-hidden bg-white/80 cursor-pointer group hover:scale-[1.02] transition-all"
        >
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber/10 rounded-full blur-2xl group-hover:bg-amber/20 transition-colors" />
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber/20 to-transparent" />
          
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-[10px] text-amber font-black uppercase tracking-widest mb-1">
                {activeTrip ? 'Viagem Ativa' : 'Rota Anterior'}
              </p>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Rota no Mapa</h3>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                {activeTrip ? activeTrip.description : lastTrip ? lastTrip.description : 'Sem viagens recentes'}
              </p>
            </div>
            <div className="h-12 w-12 bg-navy text-white flex items-center justify-center rounded-2xl shadow-lg shadow-navy/20 group-hover:scale-110 transition-transform">
              {isMapLoading ? <Loader2 className="animate-spin" size={24} /> : <MapPin size={24} />}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center">
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Faturação</p>
              <p className="text-xl font-black text-navy">{activeTrip ? (activeTrip.amount || 0).toFixed(2) : todayStats.earnings.toFixed(2)}€</p>
            </div>
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center">
              <p className="text-[9px] text-slate-400 uppercase font-black tracking-widest mb-1">Volume</p>
              <p className="text-xl font-black text-navy">{activeTrip ? activeTrip.passengers : todayStats.count} <span className="text-[9px] opacity-40 font-bold uppercase ml-0.5">Trip</span></p>
            </div>
          </div>

          {(activeTrip && cancelTimer !== null) && (
            <div className="mt-4">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelTrip();
                }}
                className="w-full h-12 glass-card-light border-red-100 hover:bg-red-50 text-red-500 rounded-xl font-black transition-all flex flex-col items-center justify-center shadow-sm"
              >
                <span className="text-[8px] uppercase tracking-widest mb-0.5 opacity-60">Cancelar Viagem</span>
                <span className="text-lg font-black leading-none">{cancelTimer}s</span>
              </button>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center space-x-2 text-[10px] font-black text-amber uppercase tracking-widest">
            <TrendingUp size={12} />
            <span>Toque para ver trajeto completo</span>
          </div>
        </div>
      </motion.div>

      {/* Rodas Button */}
      <div className="grid grid-cols-1 gap-4">
        <button 
          className="flex items-center space-x-3 p-5 glass-card-light rounded-3xl cursor-pointer hover:bg-white transition-all text-left group" 
          onClick={() => {
            if (activeTrip || lastTrip) {
              openStopsList(activeTrip || lastTrip);
            } else {
              setIsTripModalOpen(true);
            }
          }}
        >
          <div className="p-2 bg-slate-100 rounded-xl group-hover:bg-amber/10 group-hover:text-amber transition-colors">
            <List size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-slate-700">Rodas</span>
            <span className="text-[10px] text-slate-400 font-medium">{activeTrip ? 'Lista de Paragens' : 'Selecionar'}</span>
          </div>
        </button>
      </div>

      {/* Full Screen Stops List Overlay */}
      <AnimatePresence>
        {showStopsList && stopsListTrip && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="fixed inset-0 z-[250] bg-slate-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-8 bg-white border-b border-slate-100 sticky top-0 z-10">
              <div className="max-w-lg mx-auto flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber mb-1">Trajeto da Viagem</p>
                  <h3 className="text-2xl font-black text-navy">{stopsListTrip.description}</h3>
                </div>
                <button 
                  onClick={() => setShowStopsList(false)}
                  className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-500 hover:text-navy transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Stops List */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-lg mx-auto space-y-4">
                {stopsListTrip.stops && stopsListTrip.stops.length > 0 ? (
                  <div className="relative pl-6 space-y-8">
                    {/* Vertical Line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />
                    
                    {stopsListTrip.stops.map((stop: any, idx: number) => {
                      const isCompleted = activeTrip?.progress?.completedStops?.includes(idx);
                      const isPrevCompleted = idx === 0 || activeTrip?.progress?.completedStops?.includes(idx - 1);

                      return (
                        <div key={`stop-list-${idx}`} className="relative flex items-start space-x-4">
                          {/* Dot */}
                          <div className={cn(
                            "absolute -left-[30px] w-4 h-4 rounded-full border-4 border-white shadow-sm z-10 mt-1",
                            isCompleted ? "bg-green-500" :
                            idx === 0 ? "bg-green-500" : 
                            idx === stopsListTrip.stops.length - 1 ? "bg-black" : "bg-navy"
                          )} />
                          
                          <div className={cn(
                            "flex-1 bg-white p-5 rounded-2xl border transition-all shadow-sm",
                            isCompleted ? "bg-green-50/30 border-green-100" : "border-slate-100",
                            !isCompleted && isPrevCompleted && "ring-2 ring-amber/20"
                          )}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {idx === 0 ? 'Partida' : idx === stopsListTrip.stops.length - 1 ? 'Destino Final' : `Paragem ${idx}`}
                              </span>
                              {idx === 0 && (
                                <span className={cn(
                                  "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                                  isCompleted ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500"
                                )}>Registado</span>
                              )}
                            </div>
                            <h4 className={cn(
                              "text-lg font-bold mt-1",
                              isCompleted ? "text-green-700/60 line-through" : "text-slate-800"
                            )}>{stop.name || `Ponto de Passagem ${idx}`}</h4>
                            
                            {/* Manager Note */}
                            {stop.note && (
                              <div className="mt-2 p-3 bg-amber/5 rounded-xl border border-amber/10 flex items-start space-x-2">
                                <Activity size={12} className="text-amber mt-0.5 shrink-0" />
                                <p className="text-[10px] font-bold text-amber/80 leading-relaxed italic">
                                  {stop.note}
                                </p>
                              </div>
                            )}

                            <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-slate-50">
                               <button 
                                 onClick={() => {
                                   const url = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`;
                                   window.open(url, '_blank');
                                 }}
                                 className="flex items-center space-x-1.5 text-[10px] font-black uppercase tracking-widest text-amber hover:text-navy transition-all"
                               >
                                 <Navigation size={12} />
                                 <span>Navegar</span>
                               </button>
                               
                               {/* Confirmation Toggle */}
                               <button 
                                 onClick={() => handleConfirmStop(idx)}
                                 disabled={!activeTrip}
                                 className={cn(
                                   "ml-auto px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center space-x-2",
                                   isCompleted 
                                     ? "bg-green-500 text-white shadow-lg shadow-green-200" 
                                     : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                                 )}
                               >
                                 {isCompleted ? (
                                   <>
                                     <CheckCircle2 size={12} />
                                     <span>CONCLUÍDO</span>
                                   </>
                                 ) : (
                                   <span>CONFIRMAR CHEGADA</span>
                                 )}
                               </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-20">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                      <List size={32} />
                    </div>
                    <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Sem paragens registadas</p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="p-8 bg-white border-t border-slate-100">
               <div className="max-w-lg mx-auto flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-amber/10 rounded-xl text-amber">
                      <Users size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Passageiros</p>
                      <p className="font-black text-navy">{stopsListTrip.passengers}</p>
                    </div>
                  </div>
                  <GradientButton 
                    label="ESTOU AQUI" 
                    className="w-40 h-14 rounded-xl shadow-lg"
                    onClick={() => setShowStopsList(false)}
                  />
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Screen Map Overlay */}
      <AnimatePresence>
        {showMap && mapTripData && (
          <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[200] bg-white flex flex-col"
          >
            {/* Map Header */}
            <div className="absolute top-0 left-0 right-0 p-6 z-10 bg-gradient-to-b from-white/90 via-white/80 to-transparent backdrop-blur-md border-b border-white/20">
              <div className="max-w-lg mx-auto flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-navy">{mapTripData.description || 'Viagem'}</h3>
                  <div className="flex items-center space-x-3 mt-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center">
                      <Users size={12} className="mr-1 text-amber" /> {mapTripData.passengers} Pass
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center">
                      <Clock size={12} className="mr-1 text-blue-500" /> {mapTripData.duration || '--'} min
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setShowMap(false)}
                  className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-slate-400 hover:text-navy border border-slate-100 transition-all"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 w-full relative">
              {!MAPBOX_TOKEN ? (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 p-8 text-center">
                  <div className="max-w-xs">
                    <div className="w-16 h-16 bg-amber/10 rounded-full mx-auto mb-4 flex items-center justify-center text-amber">
                      <MapPin size={32} />
                    </div>
                    <h4 className="text-navy font-black text-lg mb-2">Mapa Indisponível</h4>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] leading-relaxed">
                      O motorista precisa do VITE_MAPBOX_ACCESS_TOKEN configurado para visualizar rotas no mapa.
                    </p>
                  </div>
                </div>
              ) : (
                <Map
                  {...mapViewState}
                  onMove={evt => setMapViewState(evt.viewState)}
                  mapStyle="mapbox://styles/mapbox/streets-v12"
                  mapboxAccessToken={MAPBOX_TOKEN}
                >
                  <NavigationControl position="bottom-right" />
                  
                  {/* Driver Current Location */}
                  {currentCoords && !isNaN(currentCoords.lat) && !isNaN(currentCoords.lng) && (
                    <Marker longitude={currentCoords.lng} latitude={currentCoords.lat}>
                      <div className="relative group cursor-pointer">
                        <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20 scale-150" />
                        <div className="w-10 h-10 bg-white rounded-full border-2 border-white shadow-xl flex items-center justify-center text-2xl filter drop-shadow-lg transform -rotate-12 group-hover:rotate-0 transition-transform">
                          🛺
                        </div>
                      </div>
                    </Marker>
                  )}
  
                  {mapTripData.geometry && (
                    <Source type="geojson" data={{ type: 'Feature', properties: {}, geometry: mapTripData.geometry }}>
                      <Layer
                        id="trip-route"
                        type="line"
                        paint={{
                          'line-color': '#f59e0b',
                          'line-width': 6,
                          'line-opacity': 0.8,
                          'line-blur': 1
                        }}
                      />
                    </Source>
                  )}
  
                  {/* Road Stops and Waypoints */}
                  {mapTripData.stops?.map((stop: any, idx: number) => {
                    if (!stop || isNaN(stop.lat) || isNaN(stop.lng)) return null;
                    return (
                      <Marker 
                        key={`stop-${idx}`}
                        longitude={stop.lng} 
                        latitude={stop.lat}
                        anchor="bottom"
                      >
                        <div className="flex flex-col items-center group cursor-default">
                           <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-xl border border-white/20 mb-1 scale-90 group-hover:scale-100 transition-all">
                              <p className="text-[8px] font-bold uppercase text-navy whitespace-nowrap">{stop.name || (stop.type === 'start' ? 'Partida' : stop.type === 'end' ? 'Chegada' : `Paragem ${idx}`)}</p>
                           </div>
                           <div className={cn(
                             "w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white font-black text-[9px] transition-all",
                             stop.type === 'start' ? "bg-green-500 scale-110" : "bg-navy hover:scale-110"
                           )}>
                              {stop.type === 'start' ? 'S' : stop.type === 'end' ? 'F' : idx}
                           </div>
                        </div>
                      </Marker>
                    );
                  })}
                </Map>
              )}
            </div>

            {/* Map Bottom Bar */}
            <div className="p-8 bg-white border-t border-slate-100">
               <div className="max-w-lg mx-auto flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status</p>
                    <div className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest",
                      mapTripData.status === 'completed' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {mapTripData.status === 'completed' ? 'CONCLUÍDA' : 'EM CURSO'}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Receita</p>
                    <p className="text-2xl font-black text-navy">{mapTripData.amount}€</p>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SOS Button - Fixed with 3D shadow */}
      <div className="fixed bottom-10 left-6 right-6 lg:static lg:mt-12">
        <motion.button
          animate={isSOSActive ? { 
            scale: [1, 1.05, 1],
            boxShadow: ["0 10px 30px rgba(220, 38, 38, 0.2)", "0 20px 40px rgba(220, 38, 38, 0.4)", "0 10px 30px rgba(220, 38, 38, 0.2)"]
          } : {}}
          transition={{ repeat: Infinity, duration: 1.5 }}
          disabled={isSOSLoading}
          onClick={triggerSOS}
          className={cn(
            "w-full h-14 rounded-2xl flex items-center justify-center space-x-2 font-display font-black text-sm transition-all duration-500",
            isSOSActive 
              ? "bg-red-600 text-white shadow-2xl scale-105" 
              : "bg-white/80 backdrop-blur-xl border border-red-100 text-red-500 shadow-xl hover:bg-red-50"
          )}
        >
          {isSOSLoading ? (
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="tracking-tight">{isSOSActive ? 'RESOLVENDO...' : 'ENVIANDO ALERTA...'}</span>
            </div>
          ) : (
            <>
              <AlertTriangle size={18} />
              <span className="tracking-tight uppercase">{isSOSActive ? 'PARAR / RESOLVER SOS' : 'EMERGÊNCIA SOS'}</span>
            </>
          )}
        </motion.button>
      </div>

      <RegisterTripModal 
        isOpen={isTripModalOpen} 
        onClose={() => setIsTripModalOpen(false)} 
        onTripStarted={handleTripStarted}
      />

      <LocationPermissionModal 
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onAllow={requestLocationPermission}
      />

      <LocationInstructionsModal 
        isOpen={showLocationInstructions}
        onClose={() => setShowLocationInstructions(false)}
        onRetry={handleGoOnline}
      />

      {/* Overlay Permission Modal — "Display over other apps" */}
      <AnimatePresence>
        {showOverlayPermissionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[350] bg-navy/95 backdrop-blur-xl flex items-end justify-center p-6"
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-navy border border-white/10 rounded-[2rem] p-8 w-full max-w-md shadow-2xl"
            >
              {/* Icon */}
              <div className="w-20 h-20 bg-amber/10 rounded-[2rem] flex items-center justify-center mx-auto mb-5 border border-amber/20">
                <div className="text-4xl">📱</div>
              </div>

              <div className="flex items-center justify-center space-x-2 mb-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber">Permissão Necessária</span>
              </div>

              <h3 className="text-2xl font-black text-white text-center mb-4 leading-tight italic">
                Manter App Visível
              </h3>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-6">
                <p className="text-slate-300 text-sm font-medium leading-relaxed mb-4">
                  Para que o TukTrack continue a funcionar enquanto usa outras aplicações, precisamos da permissão <strong className="text-amber">"Superposição sobre outras apps"</strong>.
                </p>
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber mb-2">No próximo ecrã:</p>
                  <div className="flex items-start space-x-2">
                    <span className="text-amber font-black text-sm">1.</span>
                    <span className="text-slate-300 text-xs font-medium">Encontre <strong className="text-white">TukTrack</strong> na lista</span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="text-amber font-black text-sm">2.</span>
                    <span className="text-slate-300 text-xs font-medium">Toque em <strong className="text-white">TukTrack</strong></span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="text-amber font-black text-sm">3.</span>
                    <span className="text-slate-300 text-xs font-medium">Ative <strong className="text-amber">"Autorizar superposição"</strong></span>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="text-amber font-black text-sm">4.</span>
                    <span className="text-slate-300 text-xs font-medium">Volte ao TukTrack e prima <strong className="text-white">GO!</strong></span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col space-y-3">
                <button
                  onClick={async () => {
                    setShowOverlayPermissionModal(false);
                    const bridge = (window as any).AndroidBridge;
                    if (bridge?.openOverlaySettings) {
                      bridge.openOverlaySettings();
                      let checks = 0;
                      const poll = setInterval(() => {
                        checks++;
                        if (bridge.isOverlayGranted?.()) {
                          overlayPermissionGranted.current = true;
                          localStorage.setItem('tuktrack_overlay_granted', 'true');
                          clearInterval(poll);
                          if (!backgroundLocationGranted.current) {
                            setTimeout(() => setShowBackgroundPermissionModal(true), 800);
                          }
                        }
                        if (checks >= 40) {
                          clearInterval(poll);
                          overlayPermissionGranted.current = true;
                          localStorage.setItem('tuktrack_overlay_granted', 'true');
                          if (!backgroundLocationGranted.current) {
                            setTimeout(() => setShowBackgroundPermissionModal(true), 800);
                          }
                        }
                      }, 500);
                    } else {
                      overlayPermissionGranted.current = true;
                      localStorage.setItem('tuktrack_overlay_granted', 'true');
                      if (!backgroundLocationGranted.current) {
                        setTimeout(() => setShowBackgroundPermissionModal(true), 800);
                      }
                    }
                  }}
                  className="w-full h-14 bg-amber text-navy font-black rounded-2xl shadow-lg shadow-amber/30 uppercase tracking-widest text-sm"
                >
                  Abrir Definições de Permissão
                </button>
                <button
                  onClick={() => {
                    setShowOverlayPermissionModal(false);
                    overlayPermissionGranted.current = true;
                    localStorage.setItem('tuktrack_overlay_granted', 'true');
                    // tracking already running — show background location modal next
                    if (!backgroundLocationGranted.current) {
                      setTimeout(() => setShowBackgroundPermissionModal(true), 500);
                    }
                  }}
                  className="w-full h-12 text-slate-400 font-bold text-sm hover:text-slate-200 transition-colors"
                >
                  Continuar sem esta permissão
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cancel Trip Reason Modal */}
      {showCancelReasonModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">❌</span>
              </div>
              <h3 className="text-xl font-black text-navy">Cancelar Viagem</h3>
              <p className="text-sm text-slate-400 mt-1">Indique o motivo do cancelamento</p>
            </div>
            <textarea
              className="w-full border border-slate-200 rounded-2xl p-3 text-sm text-navy resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
              rows={3}
              placeholder="Motivo do cancelamento..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowCancelReasonModal(false)}
                className="flex-1 h-12 rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm"
              >
                Voltar
              </button>
              <button
                onClick={() => confirmCancelTrip(cancelReason)}
                className="flex-1 h-12 rounded-2xl bg-red-500 text-white font-black text-sm"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Location Permission Modal */}
      <AnimatePresence>
        {showBackgroundPermissionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-end justify-center p-6"
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl"
            >
              <div className="w-16 h-16 bg-amber/10 rounded-full flex items-center justify-center mx-auto mb-5 text-amber">
                <MapPin size={32} />
              </div>
              <h3 className="text-xl font-black text-navy text-center mb-2">Localização em Segundo Plano</h3>
              <p className="text-sm text-slate-500 text-center font-medium mb-6 leading-relaxed">
                Para partilhar a sua localização enquanto usa outras aplicações, o TukTrack precisa de acesso à localização em segundo plano.<br/><br/>
                No próximo ecrã, selecione <strong>"Permitir sempre"</strong>.
              </p>
              <div className="flex flex-col space-y-3">
                <button
                  onClick={() => {
                    setShowBackgroundPermissionModal(false);
                    const bridge = (window as any).AndroidBridge;
                    if (bridge?.requestBackgroundLocation) {
                      bridge.requestBackgroundLocation();
                      let checks = 0;
                      const poll = setInterval(() => {
                        checks++;
                        if (bridge.isBackgroundLocationGranted?.()) {
                          backgroundLocationGranted.current = true;
                          localStorage.setItem('tuktrack_bg_location_granted', 'true');
                          clearInterval(poll);
                        }
                        if (checks >= 40) {
                          clearInterval(poll);
                          bridge.openLocationSettings?.();
                          backgroundLocationGranted.current = true;
                          localStorage.setItem('tuktrack_bg_location_granted', 'true');
                        }
                      }, 500);
                    } else {
                      backgroundLocationGranted.current = true;
                      localStorage.setItem('tuktrack_bg_location_granted', 'true');
                      alert('Vá a: Definições → Aplicações → TukTrack → Permissões → Localização → Permitir sempre');
                    }
                  }}
                  className="w-full h-14 bg-amber text-navy font-black rounded-2xl shadow-lg shadow-amber/20 uppercase tracking-widest text-sm"
                >
                  Permitir Localização em Segundo Plano
                </button>
                <button
                  onClick={() => {
                    setShowBackgroundPermissionModal(false);
                    backgroundLocationGranted.current = true;
                    localStorage.setItem('tuktrack_bg_location_granted', 'true');
                  }}
                  className="w-full h-12 text-slate-400 font-bold text-sm"
                >
                  Continuar sem segundo plano
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shift Start Modal — prompts driver to go online */}
      <AnimatePresence>
        {showShiftStartModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 40 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-amber/10 flex items-center justify-center">
                  <span className="text-4xl">🟢</span>
                </div>
                <h2 className="text-2xl font-black text-navy">Turno Iniciado!</h2>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  O gestor iniciou o turno de operações. Prima <strong className="text-navy">Entrar em Serviço</strong> quando estiver pronto para começar.
                </p>
                <button
                  onClick={() => {
                    setShowShiftStartModal(false);
                    if (!isOnline) handleGoOnline();
                  }}
                  className="w-full h-14 bg-amber text-navy font-black rounded-2xl shadow-lg shadow-amber/30 uppercase tracking-widest text-sm mt-2"
                >
                  Entrar em Serviço
                </button>
                <button
                  onClick={() => setShowShiftStartModal(false)}
                  className="w-full h-11 text-slate-400 font-bold text-sm"
                >
                  Mais Tarde
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {userData?.managerId && (
        <div className="flex items-center justify-center space-x-2 text-slate-300 py-6">
          <Shield size={14} className="opacity-50" />
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">TukTrack Security • ID: {userData.managerId}</span>
        </div>
      )}
    </div>
  );
}
