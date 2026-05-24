import { useState, useEffect, useRef } from 'react';
import {
  collection, addDoc, onSnapshot, query, where,
  orderBy, serverTimestamp, Timestamp
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';
import { Send, MessageCircle, AlertCircle } from 'lucide-react';
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

export default function MessagesPage() {
  const { user, userData } = useAuth();
  const [messages, setMessages]   = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const prevCount  = useRef(0);

  useEffect(() => {
    // A driver MUST have a managerId — without it the Firestore query will fail
    if (!user || !userData?.managerId) {
      setError('Conta não associada a nenhum gestor. Contacte o seu gestor para ser adicionado.');
      return;
    }
    setError(null);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const q = query(
      collection(db, 'messages'),
      where('managerId', '==', userData.managerId),
      where('driverUid', '==', user.uid),
      where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Message));
        setMessages(msgs);
        setError(null);

        // Notify about new incoming messages
        if (msgs.length > prevCount.current) {
          msgs.slice(prevCount.current).forEach((msg) => {
            if (msg.senderId !== user.uid) {
              try {
                // AndroidBridge alert notification (APK)
                const bridge = (window as any).AndroidBridge;
                if (bridge?.showAlertNotification) {
                  bridge.showAlertNotification(`💬 ${msg.senderName}`, msg.text, 5000);
                }
                // Web Notifications API fallback
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
        console.error('Messages listener error:', err);
        // PERMISSION_DENIED means firestore.rules is missing the /messages collection rule
        if ((err as any).code === 'permission-denied') {
          setError('Permissão negada. As regras do Firestore precisam de ser publicadas. Execute: firebase deploy --only firestore:rules');
        } else {
          setError(`Erro ao carregar mensagens: ${err.message}`);
        }
      }
    );

    return () => unsub();
  }, [user?.uid, userData?.managerId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !userData?.managerId) return;
    setSending(true);
    setError(null);
    try {
      await addDoc(collection(db, 'messages'), {
        text:        newMessage.trim(),
        senderId:    user.uid,
        senderName:  userData.name || 'Driver',
        senderRole:  'driver',
        managerId:   userData.managerId,
        driverUid:   user.uid,
        createdAt:   serverTimestamp(),
        read:        false,
      });
      setNewMessage('');
    } catch (e: any) {
      console.error('Send failed:', e);
      if (e.code === 'permission-denied') {
        setError('Não tem permissão para enviar mensagens. As regras do Firestore precisam de ser publicadas.');
      } else {
        setError('Falha ao enviar. Verifique a sua ligação.');
      }
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center space-x-3 p-4 bg-white border-b border-slate-100">
        <div className="w-10 h-10 rounded-2xl bg-amber flex items-center justify-center">
          <MessageCircle className="w-5 h-5 text-navy" />
        </div>
        <div>
          <h1 className="font-black text-navy text-lg">Mensagens</h1>
          <p className="text-xs text-slate-400 font-medium">
            {userData?.managerId ? 'Comunicação com o Gestor' : 'Sem gestor associado'}
          </p>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 font-medium">{error}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!error && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <MessageCircle className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-bold text-sm">Sem mensagens ainda</p>
            <p className="text-xs">Inicie a conversa com o seu gestor</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  {!isMe && (
                    <span className="text-[10px] font-bold text-slate-400 mb-1 ml-1">
                      {msg.senderName}
                    </span>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm font-medium ${
                    isMe
                      ? 'bg-amber text-navy rounded-tr-sm'
                      : 'bg-white text-navy shadow-sm border border-slate-100 rounded-tl-sm'
                  }`}>
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-300 mt-1 mx-1">
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-100">
        {!userData?.managerId ? (
          <p className="text-center text-xs text-slate-400 py-2">
            Sem gestor associado — não pode enviar mensagens
          </p>
        ) : (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Escreva uma mensagem..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium text-navy placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-amber/50 focus:border-amber"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !newMessage.trim()}
              className="w-12 h-12 bg-amber rounded-2xl flex items-center justify-center shadow-lg shadow-amber/30 disabled:opacity-40 active:scale-95 transition-transform"
            >
              <Send className="w-5 h-5 text-navy" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
