import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, query, where,
  orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';
import { Send, MessageCircle, ChevronLeft, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: 'driver' | 'manager';
  managerId: string;
  driverUid: string;
  createdAt: any;
}

interface Driver {
  uid: string;
  name: string;
}

export default function ManagerMessagesPage() {
  const { user, userData } = useAuth();
  const [drivers, setDrivers]           = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [newMessage, setNewMessage]     = useState('');
  const [sending, setSending]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [unread, setUnread]             = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  // Load drivers under this manager
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users'),
      where('managerId', '==', user.uid),
      where('role', '==', 'driver')
    );
    const unsub = onSnapshot(q, (snap) => {
      setDrivers(snap.docs.map(d => ({ uid: d.id, name: d.data().name || 'Driver' })));
    });
    return () => unsub();
  }, [user?.uid]);

  // Track unread counts for each driver
  useEffect(() => {
    if (!user) return;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const q = query(
      collection(db, 'messages'),
      where('managerId', '==', user.uid),
      where('senderRole', '==', 'driver'),
      where('read', '==', false),
      where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo))
    );
    const unsub = onSnapshot(q, (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(d => {
        const driverUid = d.data().driverUid;
        counts[driverUid] = (counts[driverUid] || 0) + 1;
      });
      setUnread(counts);
    }, () => {}); // silence permission errors on this secondary query
    return () => unsub();
  }, [user?.uid]);

  // Load messages for selected driver
  useEffect(() => {
    if (!user || !selectedDriver) return;
    prevCount.current = 0;
    setError(null);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const q = query(
      collection(db, 'messages'),
      where('managerId', '==', user.uid),
      where('driverUid', '==', selectedDriver.uid),
      where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
        setMessages(msgs);
        setError(null);

        // Notify for new driver messages
        if (msgs.length > prevCount.current) {
          msgs.slice(prevCount.current).forEach((msg) => {
            if (msg.senderId !== user.uid && msg.senderRole === 'driver') {
              try {
                const bridge = (window as any).AndroidBridge;
                if (bridge?.showAlertNotification) {
                  bridge.showAlertNotification(`💬 ${msg.senderName}`, msg.text, 5001);
                }
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(`💬 ${msg.senderName}`, {
                    body: msg.text,
                    icon: '/pwa-192x192.png',
                    tag: 'tuktrack-message',
                  });
                }
              } catch (_) {}
            }
          });
        }
        prevCount.current = msgs.length;
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      },
      (err) => {
        console.error('Messages error:', err);
        if ((err as any).code === 'permission-denied') {
          setError('Permissão negada. Execute: firebase deploy --only firestore:rules');
        } else {
          setError(`Erro: ${err.message}`);
        }
      }
    );

    return () => unsub();
  }, [user?.uid, selectedDriver?.uid]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !userData || !selectedDriver) return;
    setSending(true);
    setError(null);
    try {
      await addDoc(collection(db, 'messages'), {
        text:           newMessage.trim(),
        senderId:       user.uid,
        senderName:     userData.name || 'Gestor',
        senderRole:     'manager',
        managerId:      user.uid,
        driverUid:      selectedDriver.uid,
        targetDriverId: selectedDriver.uid,
        createdAt:      serverTimestamp(),
        read:           false,
      });
      setNewMessage('');
    } catch (e: any) {
      console.error('Send failed:', e);
      setError(e.code === 'permission-denied'
        ? 'Sem permissão. Publique as regras do Firestore.'
        : 'Falha ao enviar. Verifique a ligação.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ── Driver list ────────────────────────────────────────────────────────────
  if (!selectedDriver) {
    return (
      <div className="p-4">
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-amber flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-navy" />
          </div>
          <div>
            <h1 className="font-black text-navy text-lg">Mensagens</h1>
            <p className="text-xs text-slate-400">Selecione um motorista</p>
          </div>
        </div>

        <div className="space-y-2">
          {drivers.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-12">Nenhum motorista encontrado</p>
          )}
          {drivers.map((driver) => (
            <button
              key={driver.uid}
              onClick={() => { setSelectedDriver(driver); setMessages([]); }}
              className="w-full flex items-center space-x-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm active:scale-[0.98] transition-transform text-left"
            >
              <div className="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center">
                <span className="font-black text-navy text-sm">{driver.name[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <p className="font-bold text-navy">{driver.name}</p>
                <p className="text-xs text-slate-400">Toque para conversar</p>
              </div>
              {(unread[driver.uid] || 0) > 0 && (
                <span className="w-5 h-5 bg-amber rounded-full flex items-center justify-center text-[10px] font-black text-navy">
                  {unread[driver.uid]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Chat view ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center space-x-3 p-4 bg-white border-b border-slate-100">
        <button onClick={() => { setSelectedDriver(null); setMessages([]); setError(null); }} className="p-1">
          <ChevronLeft className="w-5 h-5 text-navy" />
        </button>
        <div className="w-9 h-9 rounded-full bg-navy/10 flex items-center justify-center">
          <span className="font-black text-navy text-sm">{selectedDriver.name[0]?.toUpperCase()}</span>
        </div>
        <div>
          <h2 className="font-black text-navy">{selectedDriver.name}</h2>
          <p className="text-xs text-slate-400">Motorista</p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 font-medium">{error}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <MessageCircle className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-sm font-bold">Sem mensagens</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className="text-[10px] font-bold text-slate-400 mb-1 ml-1">{msg.senderName}</span>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium ${
                    isMe ? 'bg-amber text-navy rounded-tr-sm' : 'bg-white text-navy shadow-sm border border-slate-100 rounded-tl-sm'
                  }`}>{msg.text}</div>
                  <span className="text-[10px] text-slate-300 mt-1 mx-1">{formatTime(msg.createdAt)}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Escreva uma mensagem..."
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-navy placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-amber/50"
          />
          <button
            onClick={sendMessage}
            disabled={sending || !newMessage.trim()}
            className="w-12 h-12 bg-amber rounded-2xl flex items-center justify-center shadow-lg disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Send className="w-5 h-5 text-navy" />
          </button>
        </div>
      </div>
    </div>
  );
}
