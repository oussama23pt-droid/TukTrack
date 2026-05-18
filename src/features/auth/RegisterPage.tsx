import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { GradientButton } from '../../components/GradientButton';
import { auth, db } from '../../lib/firebase';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError } from '../../lib/firestore-utils';
import { cn } from '../../lib/utils';
import { Download } from 'lucide-react';
import { motion } from 'motion/react';
import LegalModal from '../../components/LegalModal';
import { useTranslation } from 'react-i18next';
import { TukTukLogo } from '../../components/TukTukLogo';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

export default function RegisterPage() {
  const { t } = useTranslation();
  const { role } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialState = location.state as { email?: string; name?: string } || {};

  const [email, setEmail] = useState(initialState.email || '');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState(initialState.name || '');
  const [address, setAddress] = useState('');
  const [nif, setNif] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isManagerAccount, setIsManagerAccount] = useState(false);
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false
  });
  const [legalModal, setLegalModal] = useState<{ open: boolean; type: 'terms' | 'privacy' }>({
    open: false,
    type: 'terms'
  });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallButton(false);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallButton(false);
    }
  };

  const currentUser = auth.currentUser;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreements.terms || !agreements.privacy) {
      setError('Deve aceitar os Termos e a Política de Privacidade para continuar.');
      return;
    }

    setIsLoading(true);
    setError('');
    
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (role === 'driver') {
        setError('O registo de motoristas deve ser feito pelo Gestor.');
        setIsLoading(false);
        return;
      }

      let uid = currentUser?.uid;
      let userEmail = cleanEmail;

      // If already logged in but with a different email, sign out to allow creating the new intended account
      if (currentUser && currentUser.email?.toLowerCase() !== cleanEmail) {
        await auth.signOut();
        uid = undefined;
      }

      if (!uid) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        uid = userCredential.user.uid;
      } else {
        userEmail = currentUser.email || email;
      }
      
      // Now that we are signed in, check if this email was already registered as a driver
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      
      try {
        const snap = await getDocs(q);
        if (!snap.empty) {
          const existingData = snap.docs[0].data();
          // If it exists but not for this UID, it might be a driver placeholder or another account
          if (existingData.uid !== uid) {
            if (existingData.role === 'driver') {
              // It's a driver account, we should probably sign them out and tell them to use PIN
              await auth.signOut();
              setError('Este e-mail está registado como motorista. Por favor, use o login com PIN.');
              setIsLoading(false);
              return;
            } else {
              // Already a manager?
              setError('Este e-mail já está registado como gestor.');
              setIsLoading(false);
              return;
            }
          }
        }
      } catch (err: any) {
        // If we can't query it, it's already in use by someone else
        if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
          setError('Este e-mail já está em uso por outro utilizador.');
          setIsLoading(false);
          return;
        }
        throw err;
      }

      const finalRole = 'manager';

      // Create user record only if it doesn't exist or merge it
      try {
        const userDocRef = doc(db, 'users', uid);
        const existingDoc = await getDoc(userDocRef);
        
        if (existingDoc.exists()) {
          // If user exists, only update basic profile info if needed, don't reset plans
          await setDoc(userDocRef, {
            id: uid,
            uid,
            email: userEmail,
            name: companyName || existingDoc.data().name,
            companyName: companyName || existingDoc.data().companyName,
            address: address || existingDoc.data().address,
            nif: nif || existingDoc.data().nif,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } else {
          // New user
          await setDoc(userDocRef, {
            id: uid,
            uid,
            email: userEmail,
            name: companyName,
            companyName: companyName,
            address: address,
            nif: nif,
            businessName: companyName,
            phoneNumber: currentUser?.phoneNumber || '',
            role: finalRole,
            subscriptionStatus: 'active',
            planId: 'free',
            vehicleSlots: 1,
            status: 'active',
            termsAccepted: true,
            privacyAccepted: true,
            acceptedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        handleFirestoreError(err, 'create', `users/${uid}`);
        return;
      }

      navigate('/manager/dashboard');
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Este e-mail já está registado. Se apagou a sua conta anteriormente, tente entrar com a sua palavra-passe habitual ou recupere-a na página de login.');
      } else if (err.code === 'auth/weak-password') {
        setError('A palavra-passe é demasiado fraca.');
      } else if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized domain')) {
        setError('ERRO DE DOMÍNIO: Este domínio não está autorizado no Firebase. Adicione-o na consola do Firebase (Autenticação > Definições > Domínios Autorizados).');
      } else {
        setError(err.message || 'Falha no registo.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleRegister = async () => {
    setIsLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      if (role === 'driver') {
        setError('O registo com Google não está disponível para motoristas. Por favor, utilize o login com Email e PIN fornecido pelo seu gestor.');
        setIsLoading(false);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      const uid = result.user.uid;
      const googleEmail = result.user.email?.toLowerCase();
      
      // Check if user already has a doc by UID
      const userDoc = await getDoc(doc(db, 'users', uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const targetDashboard = (userData.role === 'owner' || userData.role === 'manager') ? 'manager' : 'driver';
        navigate(`/${targetDashboard}/dashboard`);
        return;
      }

      // Check if email exists in users collection (for cases where they were added as driver with this email)
      if (googleEmail) {
        const q = query(collection(db, 'users'), where('email', '==', googleEmail));
        try {
          const snap = await getDocs(q);
          if (!snap.empty) {
            const userData = snap.docs[0].data();
            if (userData.role === 'driver') {
              await auth.signOut();
              setError('Este e-mail está registado como motorista. Use Email e PIN para entrar.');
              setIsLoading(false);
              return;
            }
          }
        } catch (err: any) {
          if (err?.code === 'permission-denied' || err?.message?.includes('insufficient permissions')) {
            // Already in use by someone else
            setError('Este e-mail já está associado a outro utilizador.');
            setIsLoading(false);
            return;
          }
          throw err;
        }
      }

      const finalRole = 'manager';

      // Create user record
      try {
        await setDoc(doc(db, 'users', uid), {
          id: uid,
          uid,
          email: result.user.email,
          name: companyName || result.user.displayName || result.user.email?.split('@')[0] || 'Empresa',
          companyName: companyName || result.user.displayName || 'Empresa',
          address: address,
          nif: nif,
          businessName: companyName || `${result.user.displayName}'s Business`,
          phoneNumber: result.user.phoneNumber || '',
          role: finalRole,
          subscriptionStatus: 'active',
          planId: 'free',
          vehicleSlots: 1,
          status: 'active',
          termsAccepted: true,
          privacyAccepted: true,
          acceptedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
        });
      } catch (err: any) {
        if (err?.message?.includes('auth/internal-error') || err?.code === 'auth/internal-error') {
          setError('Erro interno do Firebase ao guardar o perfil. Por favor, tente abrir a aplicação num novo separador ou verifique a sua ligação.');
        } else {
          handleFirestoreError(err, 'create', `users/${uid}`);
        }
        return;
      }

      navigate('/manager/dashboard');
    } catch (err: any) {
      console.error('Google registration error:', err);
      if (err.code === 'auth/operation-not-allowed') {
        setError('O registo com Google não está ativado no Firebase Console.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Este e-mail já está associado a outro método de login (ex: Palavra-passe).');
      } else if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized domain')) {
        setError('ERRO DE DOMÍNIO: Este domínio não está autorizado no Firebase. Adicione-o na consola do Firebase (Autenticação > Definições > Domínios Autorizados).');
      } else {
        setError(err.message || 'Falha no registo com Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 p-6 text-slate-800 text-center justify-center relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute top-3 right-3 sm:top-8 sm:right-8 z-50">
        <LanguageSwitcher />
      </div>

      <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber/10 blur-[100px] rounded-full" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/5 blur-[120px] rounded-full" />

      {showInstallButton && (
        <div className="absolute top-6 left-6 z-50">
          <motion.button 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={handleInstallClick}
            className="flex items-center space-x-2 bg-white/60 hover:bg-white border border-white/80 shadow-md rounded-full px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-navy transition-all backdrop-blur-sm active:scale-95 group"
          >
            <Download size={14} className="text-amber group-hover:scale-110 transition-transform" />
            <span>Download App</span>
          </motion.button>
        </div>
      )}

      <header className="mb-8 relative z-10 flex flex-col items-center">
        <TukTukLogo className="w-16 h-16 mb-4" />
        <h1 className="font-display text-4xl font-black mb-2 text-slate-900 tracking-tighter italic">TukTrack</h1>
        <p className="text-slate-500 font-medium">
          {t('create_fleet_account')}
        </p>
      </header>

      <div className="w-full max-w-sm mx-auto relative z-10">
        <div id="register-card" className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-2xl shadow-slate-200/60 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber to-navy opacity-50" />
          
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="space-y-5 text-left">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5 grayscale-0 group focus-within:grayscale-0">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">{t('company_name')}</label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Ex: Minha Empresa Lda"
                      className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all font-bold text-slate-900 text-sm shadow-sm group-hover:border-slate-200"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 grayscale-0 group focus-within:grayscale-0">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">{t('company_address')}</label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Ex: Rua de Lisboa, 123, 1000-001 Lisboa"
                      className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all font-bold text-slate-900 text-sm shadow-sm group-hover:border-slate-200"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 grayscale-0 group focus-within:grayscale-0">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">{t('nif')}</label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Ex: 500123456"
                      maxLength={9}
                      pattern="[0-9]{9}"
                      className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all font-bold text-slate-900 text-sm shadow-sm group-hover:border-slate-200"
                      value={nif}
                      onChange={(e) => setNif(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 grayscale-0 group focus-within:grayscale-0">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">{t('email')}</label>
                  <div className="relative group">
                    <input
                      type="email"
                      placeholder="email@exemplo.com"
                      className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all font-bold text-slate-900 text-sm shadow-sm group-hover:border-slate-200"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5 focus-within:grayscale-0">
                  <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">{t('set_password')}</label>
                  <div className="relative group">
                    <input
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all font-bold text-slate-900 text-sm shadow-sm group-hover:border-slate-200"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-500 text-[11px] bg-red-50/50 p-4 rounded-2xl border border-red-100 font-bold text-left italic backdrop-blur-sm"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-3 pt-2 text-left bg-slate-50/50 p-4 rounded-3xl border border-slate-100">
              <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => setAgreements(prev => ({ ...prev, terms: !prev.terms }))}>
                <div className={cn(
                  "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                  agreements.terms ? "bg-navy border-navy" : "border-slate-300 bg-white"
                )}>
                  {agreements.terms && <div className="w-1.5 h-1.5 bg-amber rounded-full" />}
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                  {t('i_accept')} <button type="button" onClick={(e) => { e.stopPropagation(); setLegalModal({ open: true, type: 'terms' }); }} className="text-amber underline hover:text-navy">{t('terms')}</button>
                </p>
              </div>

              <div className="flex items-center space-x-3 group cursor-pointer" onClick={() => setAgreements(prev => ({ ...prev, privacy: !prev.privacy }))}>
                <div className={cn(
                  "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                  agreements.privacy ? "bg-navy border-navy" : "border-slate-300 bg-white"
                )}>
                  {agreements.privacy && <div className="w-1.5 h-1.5 bg-amber rounded-full" />}
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                  {t('i_accept_privacy')} <button type="button" onClick={(e) => { e.stopPropagation(); setLegalModal({ open: true, type: 'privacy' }); }} className="text-amber underline hover:text-navy">{t('privacy')}</button>
                </p>
              </div>
            </div>
            
            <GradientButton label={t('create_my_account')} isLoading={isLoading} type="submit" className="h-16 text-xs" />
            
            {!currentUser && (
              <div className="space-y-4">
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-100"></div>
                  </div>
                  <div className="relative flex justify-center text-[9px] font-black uppercase tracking-[0.3em]">
                    <span className="bg-white px-4 text-slate-300 italic">{t('or')}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleRegister}
                  className="flex h-14 w-full items-center justify-center space-x-4 rounded-2xl border-2 border-slate-100 bg-white font-black transition-all hover:bg-slate-50 hover:border-slate-200 active:scale-95 text-slate-600 text-[10px] uppercase tracking-widest px-8 shadow-sm"
                >
                  <img loading="lazy" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-5 w-5" alt="Google" />
                  <span>{t('register')} com Google</span>
                </button>
              </div>
            )}
          </form>
          
          <div className="mt-10 pt-6 border-t border-slate-100">
            <button
              onClick={() => navigate('/')}
              className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-navy transition-all flex items-center justify-center space-x-2 mx-auto"
            >
              <span className="opacity-50">{t('already_member')}</span>
              <span className="text-amber decoration-2 underline-offset-4 hover:underline">{t('login_here')}</span>
            </button>
          </div>
        </div>
      </div>

      <footer className="mt-8 text-slate-400 text-[10px] font-black uppercase tracking-widest text-center">
        TukTrack © 2024
      </footer>

      <LegalModal 
        isOpen={legalModal.open} 
        onClose={() => setLegalModal(prev => ({ ...prev, open: false }))} 
        type={legalModal.type} 
      />
    </div>
  );
}
