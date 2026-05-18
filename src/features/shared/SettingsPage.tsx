import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Shield, User, CreditCard, HelpCircle, History, MapPin, X, Save, Fingerprint, Lock, PlayCircle, XCircle, RefreshCcw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { auth, db } from '../../lib/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { handleFirestoreError } from '../../lib/firestore-utils';
import { GradientButton } from '../../components/GradientButton';
import LegalModal from '../../components/LegalModal';
import { GlassCard } from '../../components/GlassCard';
import { cn } from '../../lib/utils';

import { TukTukLogo } from '../../components/TukTukLogo';

export default function SettingsPage() {
  const { userData } = useAuth();
  const [view, setView] = useState<'menu' | 'personal' | 'security' | 'notifications' | 'support'>('menu');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [notifs, setNotifs] = useState({
    pushNotifications: true
  });
  const [newName, setNewName] = useState(userData?.name || '');
  const [companyName, setCompanyName] = useState(userData?.companyName || '');
  const [address, setAddress] = useState(userData?.address || '');
  const [nif, setNif] = useState(userData?.nif || '');
  const [newPhone, setNewPhone] = useState(userData?.phoneNumber || '');
  const [newEmail, setNewEmail] = useState(userData?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Support Form State
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportEmail, setSupportEmail] = useState(userData?.email || '');
  const [isSupportSubmitted, setIsSupportSubmitted] = useState(false);
  const [legalModal, setLegalModal] = useState<{ open: boolean; type: 'terms' | 'privacy' }>({
    open: false,
    type: 'terms'
  });

  // Sync state if userData changes
  React.useEffect(() => {
    if (userData) {
      setNewName(prev => prev || userData.name || '');
      setCompanyName(prev => prev || userData.companyName || userData.name || '');
      setAddress(prev => prev || userData.address || '');
      setNif(prev => prev || userData.nif || '');
      setNewPhone(prev => prev || userData.phoneNumber || '');
      setNewEmail(prev => prev || userData.email || '');
    }
  }, [userData]);

  const isGoogleUser = auth.currentUser?.providerData.some(p => p.providerId === 'google.com');

  const handleLogout = async () => {
    await auth.signOut();
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData?.uid) return;
    
    setIsSaving(true);
    setSuccessMsg('');
    setErrorMsg('');

    if (newPassword && newPassword !== confirmPassword) {
      setErrorMsg('As palavras-passe não coincidem.');
      setIsSaving(false);
      return;
    }

    try {
      // 1. Update Firestore Profile
      const updates: any = {
        name: userData?.role === 'manager' ? companyName : newName,
        phoneNumber: newPhone,
        updatedAt: new Date().toISOString()
      };

      if (userData?.role === 'manager') {
        updates.companyName = companyName;
        updates.address = address;
        updates.nif = nif;
        updates.businessName = companyName;
      }

      await updateDoc(doc(db, 'users', userData.uid), updates);

      // 1.5. Sync with Stripe if manager
      if (userData?.role === 'manager' && userData.stripeCustomerId) {
        try {
          const idToken = await auth.currentUser?.getIdToken();
          await fetch('/api/stripe/update-customer', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              companyName,
              nif,
              address
            })
          });
        } catch (stripeErr) {
          console.warn('Failed to sync with Stripe:', stripeErr);
          // Don't fail the whole operation if Stripe sync fails
        }
      }

      // 2. Update Password if provided (and not Google user)
      if (newPassword && !isGoogleUser && auth.currentUser) {
        const { updatePassword } = await import('firebase/auth');
        await updatePassword(auth.currentUser, newPassword);
      }

      setSuccessMsg('Perfil atualizado com sucesso!');
      setTimeout(() => setView('menu'), 2000);
    } catch (err: any) {
      console.error('Update error:', err);
      if (err.code === 'auth/requires-recent-login') {
        setErrorMsg('Esta operação requer autenticação recente. Por favor, saia e entre novamente para alterar a palavra-passe.');
      } else {
        handleFirestoreError(err, 'update', `users/${userData.uid}`);
        setErrorMsg('Erro ao atualizar perfil.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitSupport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    
    try {
      await addDoc(collection(db, 'support_requests'), {
        uid: userData?.uid || null,
        email: supportEmail,
        subject: supportSubject,
        description: supportMessage,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });
      
      setIsSupportSubmitted(true);
      setSupportSubject('');
      setSupportMessage('');
    } catch (err: any) {
      handleFirestoreError(err, 'write' as any, 'support_requests');
      setErrorMsg('Erro ao enviar pedido de suporte. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCache = async () => {
    if (confirm('Deseja limpar todos os dados em cache? Terá de iniciar sessão novamente.')) {
      try {
        // Clear LocalStorage & SessionStorage
        localStorage.clear();
        sessionStorage.clear();

        // Clear Cache Storage if available
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }

        // Unregister service workers
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            await registration.unregister();
          }
        }

        // Logout and reload
        await auth.signOut();
        window.location.reload();
      } catch (error) {
        console.error('Failed to clear cache:', error);
        alert('Erro ao limpar cache. Por favor, tente limpar manualmente nas definições do navegador.');
      }
    }
  };

  const sections = [
    { 
      title: 'Perfil e Conta',
      items: [
        { icon: User, label: 'Dados Pessoais', desc: 'Nome, e-mail e contacto', action: () => setView('personal') },
        { icon: Bell, label: 'Notificações', desc: 'Alertas de viagens e sistema', action: () => setView('notifications') },
        { icon: Shield, label: 'Segurança', desc: 'Palavra-passe e autenticação', action: () => setView('security') }
      ]
    },
    {
      title: 'Suporte',
      items: [
        { icon: HelpCircle, label: 'Centro de Ajuda', desc: 'FAQs e documentação', action: () => { setView('support'); setIsSupportSubmitted(false); } },
        { icon: History, label: 'Versão da App', desc: 'v1.2.4 (Beta)' }
      ]
    },
    {
      title: 'Manutenção',
      items: [
        { icon: RefreshCcw, label: 'Limpar Cache', desc: 'Resolve problemas de carregamento', action: handleClearCache }
      ]
    }
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20 p-4 md:p-0">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <TukTukLogo variant="icon" className="w-8 h-8 text-amber" />
          <h1 className="text-3xl font-black text-navy font-display tracking-tight uppercase">Definições</h1>
        </div>
        {view !== 'menu' && (
          <button 
            onClick={() => setView('menu')}
            className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all font-bold text-xs uppercase tracking-widest"
          >
            <X size={16} />
            <span>Voltar</span>
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {view === 'personal' ? (
          <motion.div
            key="personal"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard className="border-none shadow-amber/[0.03] overflow-hidden">
              <div className="flex flex-col md:flex-row gap-8">
                {/* Profile Sidebar/Summary */}
                <div className="md:w-1/3 flex flex-col items-center text-center p-6 bg-slate-50/50 rounded-3xl border border-slate-100">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-full bg-amber flex items-center justify-center text-navy font-black text-4xl shadow-xl shadow-amber/20 border-4 border-white">
                      {userData?.name?.charAt(0) || 'U'}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md border border-slate-100 text-slate-400 group-hover:text-amber transition-colors cursor-pointer">
                      <User size={16} />
                    </div>
                  </div>
                  <div className="mt-4">
                    <h2 className="text-xl font-black text-navy leading-tight">
                      {userData?.role === 'manager' ? userData?.companyName : userData?.name}
                    </h2>
                    <p className="text-xs text-slate-500 font-bold font-mono mt-1 opacity-60">
                      {userData?.role === 'manager' && userData?.nif && `NIF: ${userData.nif} • `}
                      {userData?.email}
                    </p>
                    <div className="mt-3 inline-flex px-3 py-1 bg-navy text-white text-[10px] uppercase font-black rounded-full tracking-[0.2em] shadow-lg shadow-navy/20">
                      {userData?.role === 'manager' ? 'Gestor Principal' : userData?.role}
                    </div>
                  </div>
                  
                  <div className="w-full mt-8 pt-8 border-t border-slate-200/50 space-y-3">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>Estado da Conta</span>
                      <span className="text-green-500">Ativa</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span>Membro Desde</span>
                      <span className="text-navy">{userData?.createdAt ? new Date(userData.createdAt).getFullYear() : '2024'}</span>
                    </div>
                  </div>
                </div>

                {/* Profile Form */}
                <div className="flex-1 space-y-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber">Dados do Perfil</h3>
                    {successMsg && <span className="text-green-600 text-[10px] font-black uppercase bg-green-50 px-2 py-1 rounded">{successMsg}</span>}
                    {errorMsg && <span className="text-red-500 text-[10px] font-black uppercase bg-red-50 px-2 py-1 rounded">{errorMsg}</span>}
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {userData?.role === 'manager' ? (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome da Empresa</label>
                            <input
                              type="text"
                              value={companyName}
                              onChange={(e) => setCompanyName(e.target.value)}
                              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                              placeholder="Minha Empresa Lda"
                              required
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Morada da Empresa</label>
                            <input
                              type="text"
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                              placeholder="Rua de Lisboa, 123..."
                              required
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">NIF (Tax ID)</label>
                            <input
                              type="text"
                              value={nif}
                              maxLength={9}
                              pattern="[0-9]{9}"
                              onChange={(e) => setNif(e.target.value.replace(/\D/g, ''))}
                              className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                              placeholder="500123456"
                              required
                            />
                          </div>
                        </>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nome Completo</label>
                          <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                            placeholder="Seu nome"
                            required
                          />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Contacto</label>
                        <input
                          type="tel"
                          value={newPhone}
                          onChange={(e) => setNewPhone(e.target.value)}
                          className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                          placeholder="+351 ..."
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Email (Não Editável)</label>
                      <input
                        type="email"
                        value={newEmail}
                        readOnly
                        className="w-full h-11 bg-slate-100/50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-slate-400 outline-none cursor-not-allowed"
                      />
                    </div>

                    {!isGoogleUser && (
                      <div className="pt-4 mt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Nova Senha</label>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                            placeholder="••••••••"
                            minLength={6}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirmar Senha</label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all shadow-sm"
                            placeholder="••••••••"
                            minLength={6}
                          />
                        </div>
                      </div>
                    )}

                    <div className="pt-4 flex justify-end">
                      <div className="w-full sm:w-48">
                        <GradientButton 
                          label="GUARDAR ALTERAÇÕES" 
                          isLoading={isSaving} 
                          type="submit"
                          icon={<Save size={16} />}
                        />
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ) : view === 'notifications' ? (
          <motion.div
            key="notifications"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard className="p-8">
              <div className="flex items-center space-x-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-navy/5 text-navy flex items-center justify-center">
                  <Bell size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-navy uppercase tracking-tight">Notificações</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Configure os seus alertas em tempo real</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group transition-all">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm transition-colors text-amber">
                      <Bell size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-navy uppercase tracking-tight">Notificações Push</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Ativar ou desativar alertas em tempo real</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setNotifs(prev => ({ ...prev, pushNotifications: !prev.pushNotifications }))}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      notifs.pushNotifications ? "bg-navy" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                      notifs.pushNotifications ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 px-2">Documentação Legal</h4>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => setLegalModal({ open: true, type: 'terms' })}
                      className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-amber/30 transition-all text-left group"
                    >
                      <div className="flex items-center space-x-3">
                        <PlayCircle size={16} className="text-slate-400 group-hover:text-amber" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Termos de Utilização</span>
                      </div>
                      <HelpCircle size={16} className="text-slate-300" />
                    </button>
                    <button 
                      onClick={() => setLegalModal({ open: true, type: 'privacy' })}
                      className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-amber/30 transition-all text-left group"
                    >
                      <div className="flex items-center space-x-3">
                        <Shield size={16} className="text-slate-400 group-hover:text-amber" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Política de Privacidade</span>
                      </div>
                      <HelpCircle size={16} className="text-slate-300" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-amber/5 rounded-2xl border border-amber/10 flex items-start space-x-3">
                <HelpCircle size={18} className="text-amber shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber/80 font-bold uppercase tracking-widest leading-relaxed">
                  As notificações são enviadas via Push e dependem das permissões do seu navegador ou dispositivo móvel.
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ) : view === 'support' ? (
          <motion.div
            key="support"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard className="p-8">
              <div className="flex items-center space-x-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-navy/5 text-navy flex items-center justify-center">
                  <HelpCircle size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-navy uppercase tracking-tight">Centro de Ajuda</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Entre em contacto com a nossa equipa</p>
                </div>
              </div>

              {isSupportSubmitted ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12 px-6 bg-green-50/50 rounded-[2rem] border border-green-100"
                >
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 shadow-lg shadow-green-200/50">
                    <Save size={32} />
                  </div>
                  <h4 className="text-2xl font-black text-navy mb-2 uppercase">Mensagem Enviada</h4>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] leading-6 max-w-sm mx-auto">
                    A sua solicitação foi registada com sucesso. Irá receber um e-mail nosso brevemente, por favor verifique a sua caixa de entrada.
                  </p>
                  <div className="mt-8">
                    <button 
                      onClick={() => setView('menu')}
                      className="px-8 py-4 bg-navy text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-navy/20 hover:scale-105 transition-transform"
                    >
                      Voltar ao Menu
                    </button>
                  </div>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmitSupport} className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">O Seu Email</label>
                    <input
                      type="email"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all"
                      placeholder="exemplo@email.com"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Assunto</label>
                    <input
                      type="text"
                      value={supportSubject}
                      onChange={(e) => setSupportSubject(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all"
                      placeholder="Em que podemos ajudar?"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrição</label>
                    <textarea
                      value={supportMessage}
                      onChange={(e) => setSupportMessage(e.target.value)}
                      className="w-full min-h-[150px] bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-bold text-navy focus:border-amber focus:bg-white outline-none transition-all resize-none"
                      placeholder="Descreva o seu problema ou dúvida em detalhe..."
                      required
                    />
                  </div>

                  {errorMsg && (
                    <div className="p-3 bg-red-50 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-100">
                      {errorMsg}
                    </div>
                  )}

                  <div className="pt-4">
                    <GradientButton 
                      label="SUBMETER SOLICITAÇÃO" 
                      isLoading={isSaving} 
                      type="submit"
                    />
                  </div>
                </form>
              )}
            </GlassCard>
          </motion.div>
        ) : view === 'security' ? (
          <motion.div
            key="security"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <GlassCard className="p-8">
              <div className="flex items-center space-x-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-navy/5 text-navy flex items-center justify-center">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-navy uppercase tracking-tight">Segurança</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Proteja a sua conta e dados</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-amber/30 transition-all">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-amber transition-colors shadow-sm">
                      <Fingerprint size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-navy uppercase tracking-tight">Biometria</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Utilizar FaceID ou Impressão Digital para login rápido</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setBiometricsEnabled(!biometricsEnabled)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-all relative",
                      biometricsEnabled ? "bg-green-500" : "bg-slate-200"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                      biometricsEnabled ? "right-1" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-amber/30 transition-all opacity-60">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-amber transition-colors shadow-sm">
                      <Lock size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-black text-navy uppercase tracking-tight">Autenticação 2FA</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">Adicione uma camada extra de proteção</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 px-2 py-1 rounded">Brevemente</span>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] text-center">
                  Último login: {new Date().toLocaleDateString('pt-PT')} às {new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div
            key="menu"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {sections.map((section, i) => (
                <div key={i} className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-2">
                    {section.title}
                  </h3>
                  <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden divide-y divide-slate-100 shadow-sm shadow-navy/5">
                    {section.items.map((item, j) => (
                      <button
                        key={j}
                        onClick={() => item.action ? item.action() : alert(`Disponível em breve.`)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left group"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="p-2.5 bg-slate-50 rounded-xl group-hover:bg-navy group-hover:text-white transition-all group-hover:shadow-lg group-hover:shadow-navy/10">
                            <item.icon size={18} className="transition-transform group-hover:scale-110" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-navy uppercase tracking-tight">{item.label}</p>
                            <p className="text-[10px] text-slate-500 font-bold">{item.desc}</p>
                          </div>
                        </div>
                        <div className="text-slate-200 transition-transform group-hover:translate-x-1 group-hover:text-amber">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={handleLogout}
              className="w-full py-5 bg-white hover:bg-red-500 text-red-500 hover:text-white border border-red-100 hover:border-red-500 rounded-3xl font-black uppercase tracking-[0.2em] text-xs transition-all shadow-sm shadow-red-500/5 group flex items-center justify-center space-x-2"
            >
              <span>Terminar Sessão</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <LegalModal 
        isOpen={legalModal.open} 
        onClose={() => setLegalModal(prev => ({ ...prev, open: false }))} 
        type={legalModal.type} 
      />
    </div>
  );
}
