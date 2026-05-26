import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from 'firebase/auth';
import { doc, getDoc, query, collection, where, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { Download } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { handleFirestoreError } from '../../lib/firestore-utils';
import { GradientButton } from '../../components/GradientButton';
import { cn } from '../../lib/utils';
import { motion } from 'motion/react';
import { useAuth } from './AuthContext';
import { useInstall } from './InstallContext';
import LegalModal from '../../components/LegalModal';
import { useTranslation } from 'react-i18next';
import { TukTukLogo } from '../../components/TukTukLogo';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';

export default function UnifiedLoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userData, loading } = useAuth();
  const { handleInstallClick, deferredPrompt, isStandalone, isIOS } = useInstall();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginMode, setLoginMode] = useState<'driver' | 'manager'>('driver');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (location.pathname === '/driver/login') {
      setLoginMode('driver');
    } else if (location.pathname === '/manager/login') {
      setLoginMode('manager');
    }
  }, [location.pathname]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [legalModal, setLegalModal] = useState<{ open: boolean; type: 'terms' | 'privacy' }>({
    open: false,
    type: 'terms'
  });

  useEffect(() => {
    // Auto-redirect if already logged in — no confirmation screen
    if (!loading && user && userData) {
      const target = userData.role === 'driver' ? '/driver/dashboard' : '/manager/dashboard';
      navigate(target, { replace: true });
    }
  }, [user, userData, loading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Try standard sign in
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
      } catch (authErr: any) {
        console.warn('Auth attempt failed:', authErr.code, authErr.message);
        
        // Handle combined error codes in newer Firebase SDKs
        const isInvalidCred = 
          authErr.code === 'auth/invalid-credential' || 
          authErr.code === 'auth/invalid-login-credentials' ||
          authErr.code === 'auth/user-not-found' || 
          authErr.code === 'auth/wrong-password';

        // AUTO-PROVISION DEMO ACCOUNTS
        if ((cleanEmail === 'motorista@test.com' || cleanEmail === 'gestor@test.com') && password === '123456') {
          try {
            // If sign in failed with wrong password for a demo account, it means someone changed it manually 
            // in Auth console, but we'll try to re-create or catch it.
            if (authErr.code === 'auth/wrong-password') {
               throw new Error('A palavra-passe da conta de demonstração foi alterada.');
            }

            userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            const newUser = userCredential.user;
            const isDriver = cleanEmail === 'motorista@test.com';

            // Create Demo Profile with proper status
            await setDoc(doc(db, 'users', newUser.uid), {
              id: newUser.uid,
              uid: newUser.uid,
              name: isDriver ? 'Motorista Demo' : 'Gestor Demo',
              email: cleanEmail,
              role: isDriver ? 'driver' : 'manager',
              managerId: isDriver ? 'DEMO_MANAGER' : newUser.uid,
              status: 'active',
              createdAt: new Date().toISOString()
            });

            // Demo manager setup (if needed, but usually we just need the drivers to point to a manager)
            if (!isDriver) {
               // We don't need a separate fleets collection anymore
            }

          } catch (demoErr: any) {
            console.error("Demo Provisioning Error:", demoErr);
            if (demoErr.code === 'auth/email-already-in-use') {
              throw new Error('Email ou Palavra-passe incorretos para a conta Demo.');
            }
            throw demoErr;
          }
        } else {
          // 2. Driver PIN login — check both drivers_init and users collections
          let driverData = null;

          if (isInvalidCred) {
            // Check drivers_init first
            try {
              const initDoc = await getDoc(doc(db, 'drivers_init', cleanEmail));
              if (initDoc.exists()) {
                const iData = initDoc.data();
                if (iData.pin && (String(iData.pin).trim() === String(password).trim())) {
                  driverData = iData;
                  console.log('[Login] Found in drivers_init');
                }
              }
            } catch (initErr) {
              console.error('drivers_init lookup failed:', initErr);
            }

            // Also check users collection (drivers created directly by manager)
            if (!driverData) {
              try {
                const usersSnap = await getDocs(
                  query(collection(db, 'users'),
                    where('email', '==', cleanEmail),
                    where('role', '==', 'driver')
                  )
                );
                if (!usersSnap.empty) {
                  const uData = usersSnap.docs[0].data();
                  const docId = usersSnap.docs[0].id;
                  console.log('[Login] Found in users, pin:', uData.pin, 'entered:', password);
                  if (uData.pin && (String(uData.pin).trim() === String(password).trim())) {
                    driverData = { ...uData, id: docId };
                    console.log('[Login] PIN matched from users collection');
                  }
                }
              } catch (usersErr) {
                console.error('users lookup failed:', usersErr);
              }
            }
          }

          if (driverData) {
            // First time login — create Firebase Auth account using PIN as password
            try {
              userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            } catch (createErr: any) {
              if (createErr.code === 'auth/email-already-in-use') {
                // Auth account exists but wrong password — sign in failed earlier
                // This means PIN was changed or account exists with different password
                throw new Error('A sua conta existe mas o PIN não coincide. Contacte o seu gestor para redefinir o PIN.');
              }
              throw createErr;
            }

            const newUser = userCredential.user;
            const oldId = driverData.id;

            // Write full profile with real UID
            try {
              await setDoc(doc(db, 'users', newUser.uid), {
                ...driverData,
                uid: newUser.uid,
                id: newUser.uid,
                status: 'active',
                termsAccepted: true,
                privacyAccepted: true,
                acceptedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });

              // Remove old placeholder document if different
              if (oldId && oldId !== newUser.uid) {
                try { await deleteDoc(doc(db, 'users', oldId)); } catch (_) {}
              }

              // Clean up drivers_init
              try { await deleteDoc(doc(db, 'drivers_init', cleanEmail)); } catch (_) {}

            } catch (migErr) {
              console.error('Profile migration failed:', migErr);
            }
          } else {
            throw authErr;
          }
        }
      }

      const loggedUser = userCredential.user;
      
      // Check user profile
      const userDoc = await getDoc(doc(db, 'users', loggedUser.uid));
      
      if (userDoc.exists()) {
        const uData = userDoc.data();
        const role = uData.role;
        
        if (role === 'manager') {
          navigate('/manager/dashboard');
        } else if (role === 'driver') {
          navigate('/driver/dashboard');
        } else {
          setError('Função de utilizador não reconhecida.');
        }
      } else {
        // New user or migration required
        navigate('/register/select');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      const isInvalidCred = 
        err.code === 'auth/invalid-credential' || 
        err.code === 'auth/invalid-login-credentials' ||
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-email';

      if (isInvalidCred) {
        setError('Email, PIN ou Palavra-passe incorretos. Verifique os dados com o seu gestor.');
      } else if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized domain')) {
        setError('ERRO DE DOMÍNIO: Este domínio não está autorizado no Firebase. Adicione-o na consola do Firebase (Autenticação > Definições > Domínios Autorizados).');
      } else {
        setError(err.message || 'Falha ao entrar. Tente novamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, insira o seu email primeiro.');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setSuccess('Link de recuperação enviado para o seu email!');
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError('Erro ao enviar link de recuperação. Verifique se o email está correto.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const { uid } = result.user;
      const googleEmail = result.user.email?.toLowerCase();
      
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (userDoc.exists()) {
        const uData = userDoc.data();
        // If they are a driver, they SHOULD NOT be able to use Google login 
        // because drivers are typically managed by PIN/Email for simplicity in this app
        if (uData.role === 'driver') {
          await signOut(auth);
          setError('Contas de motorista devem entrar apenas com Email e PIN.');
          setIsLoading(false);
          return;
        }
        navigate('/manager/dashboard');
      } else {
        // If it's a new UID, but the email is already in our 'users' collection as a driver
        if (googleEmail) {
          const q = query(collection(db, 'users'), where('email', '==', googleEmail));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const userData = snap.docs[0].data();
            if (userData.role === 'driver') {
              await signOut(auth);
              setError('Este email está registado como motorista. Utilize o seu Email e PIN para entrar.');
              setIsLoading(false);
              return;
            }
          }
        }
        // Truly new user - go to selection or direct register
        navigate('/register/select');
      }
    } catch (err: any) {
      console.error('Google login error:', err);
      // Only call handleFirestoreError if it's likely a Firestore error, 
      // preventing misleading "write" errors in logs when it's an Auth failure
      if (err?.code?.startsWith('firestore/')) {
        handleFirestoreError(err, 'get', 'users');
      }
      
      if (err.code === 'auth/popup-blocked') {
        setError('O popup de login foi bloqueado pelo navegador.');
      } else if (err.code === 'auth/internal-error') {
        setError('Erro interno do Firebase. Verifique a sua ligação ou tente abrir num novo separador.');
      } else if (err.code === 'auth/unauthorized-domain' || err.message?.includes('unauthorized domain')) {
        setError('ERRO DE DOMÍNIO: Este domínio não está autorizado no Firebase. Adicione-o na consola do Firebase (Autenticação > Definições > Domínios Autorizados).');
      } else {
        setError(err.message || 'Falha ao entrar com Google.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-amber border-t-transparent"></div>
      </div>
    );
  }

  // ALREADY LOGGED IN — show spinner while useEffect redirects
  if (user && userData) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50 items-center justify-center">
        <div className="w-12 h-12 border-4 border-amber border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">A entrar...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 p-6 text-slate-800 text-center justify-center relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber/10 blur-[100px] rounded-full" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/5 blur-[120px] rounded-full" />

      <div className="absolute top-3 right-3 sm:top-8 sm:right-8 z-50">
        <LanguageSwitcher />
      </div>

      {(deferredPrompt || isIOS) && !isStandalone && (
        <div className="absolute top-3 left-3 sm:top-8 sm:left-8 z-50">
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

      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 relative z-10 flex flex-col items-center"
      >
        <TukTukLogo className="w-16 h-16 mb-4" />
        <h1 className="font-display text-5xl font-black mb-3 text-slate-900 tracking-tighter italic">
          TukTrack
        </h1>
        <div className="inline-block px-4 py-1.5 bg-navy/5 rounded-full border border-navy/10 backdrop-blur-sm">
          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.2em] px-2">
            {loginMode === 'driver' ? t('driver_portal') : t('fleet_management_title')}
          </p>
        </div>
      </motion.header>

      <div className="w-full max-w-sm mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-slate-200 rounded-[3rem] p-10 shadow-2xl shadow-slate-200/60 overflow-hidden relative"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber to-navy opacity-50" />

          <div className="flex bg-slate-50 p-1.5 rounded-2xl mb-10 border border-slate-100">
            <button 
              onClick={() => { setLoginMode('driver'); setError(''); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                loginMode === 'driver' ? "bg-white text-navy shadow-md shadow-slate-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {t('driver_role')}
            </button>
            <button 
              onClick={() => { setLoginMode('manager'); setError(''); }}
              className={cn(
                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                loginMode === 'manager' ? "bg-white text-navy shadow-md shadow-slate-200" : "text-slate-400 hover:text-slate-600"
              )}
            >
              {t('manager_role')}
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-8">
            <div className="space-y-5">
              <div className="text-left space-y-1.5 grayscale-0">
                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">{t('email')}</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="ex: joao@gmail.com"
                    className="w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all text-slate-900 placeholder:text-slate-400 font-bold text-sm shadow-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              
              <div className="text-left space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 ml-1">
                  {loginMode === 'driver' ? t('pin') : t('password')}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={loginMode === 'driver' ? '****' : '********'}
                    inputMode={loginMode === 'driver' ? 'numeric' : 'text'}
                    className={cn(
                      "w-full h-14 bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 focus:border-amber focus:bg-white outline-none transition-all text-slate-900 placeholder:text-slate-400 font-bold text-sm shadow-sm",
                      loginMode === 'driver' ? "tracking-[0.5em] placeholder:tracking-normal" : "tracking-normal"
                    )}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
            
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-red-500 text-[11px] bg-red-50/50 p-4 rounded-2xl border border-red-100 font-bold text-left italic backdrop-blur-sm"
              >
                {error}
              </motion.div>
            )}

            {success && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-emerald-500 text-[11px] bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 font-bold text-left italic backdrop-blur-sm"
              >
                {success}
              </motion.div>
            )}
            
            <GradientButton 
              label={loginMode === 'driver' ? t('login_now') : t('enter_dashboard')} 
              isLoading={isLoading} 
              type="submit" 
              className="h-16 text-xs"
            />

            {loginMode === 'manager' && (
              <div className="text-center">
                <button 
                  type="button" 
                  onClick={handleForgotPassword}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-amber transition-all italic underline decoration-transparent hover:decoration-amber underline-offset-4"
                >
                  {t('forgot_password')}
                </button>
              </div>
            )}
          </form>

          {loginMode === 'manager' && (
            <div className="mt-10 pt-6 border-t border-slate-100 space-y-5">
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
                onClick={handleGoogleLogin}
                className="flex h-14 w-full items-center justify-center space-x-4 rounded-2xl border-2 border-slate-100 bg-white font-black transition-all hover:bg-slate-50 hover:border-slate-200 active:scale-95 text-slate-600 text-[10px] uppercase tracking-widest px-8 shadow-sm"
              >
                <img loading="lazy" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-5 w-5" alt="Google" />
                <span>{t('login_with_google')}</span>
              </button>
            </div>
          )}
          
          <div className="mt-10 pt-6 border-t border-slate-100 italic">
            <Link 
              to="/auth/manager/register" 
              className="group block text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-navy transition-all flex items-center justify-center space-x-2 bg-slate-50 py-4 rounded-2xl border border-slate-100 hover:border-amber/30"
            >
              <span className="opacity-50">{t('new_to_tuktrack')}</span>
              <span className="text-amber decoration-2 underline-offset-4 group-hover:underline">{t('create_account')}</span>
            </Link>
          </div>
        </motion.div>
      </div>

      <footer className="mt-12 text-slate-400 text-[10px] font-black uppercase tracking-widest text-center relative z-10 space-y-4">
        <div>TukTrack © 2024</div>
        <div className="flex justify-center space-x-6 text-[8px] text-slate-300">
          <button onClick={() => setLegalModal({ open: true, type: 'terms' })} className="hover:text-amber underline">{t('terms')}</button>
          <button onClick={() => setLegalModal({ open: true, type: 'privacy' })} className="hover:text-amber underline">{t('privacy')}</button>
        </div>
      </footer>

      <LegalModal 
        isOpen={legalModal.open} 
        onClose={() => setLegalModal(prev => ({ ...prev, open: false }))} 
        type={legalModal.type} 
      />
    </div>
  );
}
