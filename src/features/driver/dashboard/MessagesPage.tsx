import { useState, useEffect, useRef } from 'react';
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../auth/AuthContext';
import { Send, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderRole: 'driver' | 'manager';
  managerId: string;
  createdAt: any;
}

export default function MessagesPage() {
  const { user, userData } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!userData?.managerId) return;

    // 7-day history filter
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const q = query(
      collection(db, 'messages'),
      where('managerId', '==', userData.managerId),
      where('driverUid', '==', user.uid),
      where('createdAt', '>=', Timestamp.fromDate(sevenDaysAgo)),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);

      // Push new incoming messages to Android notification bar
      if (msgs.length > prevCountRef.current) {
        const newMsgs = msgs.slice(prevCountRef.current);
        newMsgs.forEach((msg) => {
          // Only notify if the message is from someone else
          if (msg.senderId !== user?.uid) {
            try {
              // Try AndroidBridge first
              const bridge = (window as any).AndroidBridge;
              if (bridge?.showAlertNotification) {
                bridge.showAlertNotification(`💬 ${msg.senderName}`, msg.text, 7000);
              }
              // Also use Web Notifications API (works in Capacitor APK)
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`💬 ${msg.senderName}`, {
                  body: msg.text,
                  icon: '/pwa-192x192.png',
                  tag: 'tuktrack-message',
                });
              }
            } catch (e) {}
          }
        });
      }
      prevCountRef.current = msgs.length;

      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => unsub();
  }, [userData?.managerId, user?.uid]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !userData) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        text: newMessage.trim(),
        senderId: user.uid,
        senderName: userData.name || 'Driver',
        senderRole: 'driver',
        managerId: userData.managerId,
        driverUid: user.uid,
        createdAt: serverTimestamp(),
        read: false,
      });
      setNewMessage('');
    } catch (e) {
      console.error('Send failed:', e);
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
          <p className="text-xs text-slate-400 font-medium">Comunicação com o Gestor</p>
        </div>
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
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
                <div className={`max-w-[78%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
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
      </div>
    </div>
  );
}
