/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ReactNode, lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from './lib/i18n';
import { Loader2, Shield } from 'lucide-react';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { InstallProvider } from './features/auth/InstallContext';
import { SubscriptionGuard } from './components/SubscriptionGuard';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { MotionConfig } from 'motion/react';

// Lazy loaded components
const OnboardingScreen = lazy(() => import('./features/auth/OnboardingScreen'));
const RegisterPage = lazy(() => import('./features/auth/RegisterPage'));
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const GestorDashboard = lazy(() => import('./features/gestor/dashboard/GestorDashboard'));
const DriverDashboard = lazy(() => import('./features/driver/dashboard/DriverDashboard'));
const FleetMap = lazy(() => import('./features/shared/FleetMap'));
const UnifiedLoginPage = lazy(() => import('./features/auth/UnifiedLoginPage'));
const DriversManagement = lazy(() => import('./features/gestor/dashboard/DriversManagement'));
const ReportsPage = lazy(() => import('./features/gestor/dashboard/ReportsPage'));
const DailyEarningsPage = lazy(() => import('./features/gestor/dashboard/DailyEarningsPage'));
const SettingsPage = lazy(() => import('./features/shared/SettingsPage'));
const TripsHistory = lazy(() => import('./features/driver/dashboard/TripsHistory'));
const EarningsPage = lazy(() => import('./features/driver/dashboard/EarningsPage'));
const MessagesPage = lazy(() => import('./features/driver/dashboard/MessagesPage'));
const ManagerMessagesPage = lazy(() => import('./features/gestor/dashboard/ManagerMessagesPage'));
const TripsManagement = lazy(() => import('./features/gestor/dashboard/TripsManagement'));
const SubscriptionSuccess = lazy(() => import('./components/SubscriptionSuccess'));
const SubscriptionCancel = lazy(() => import('./components/SubscriptionCancel'));

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
    <Loader2 className="w-10 h-10 animate-spin text-navy mb-4" />
    <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">A carregar...</p>
  </div>
);

function ManagerRoutes() {
  const { userData, loading } = useAuth();
  
  if (loading) {
    return <PageLoader />;
  }

  return (
    <SubscriptionGuard managerId={userData?.uid}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="dashboard" element={<DashboardLayout role="manager"><GestorDashboard /></DashboardLayout>} />
          <Route path="vehicles" element={<DashboardLayout role="manager"><DriversManagement initialTab="vehicles" /></DashboardLayout>} />
          <Route path="trips" element={<DashboardLayout role="manager"><TripsManagement /></DashboardLayout>} />
          <Route path="drivers" element={<DashboardLayout role="manager"><DriversManagement initialTab="drivers" /></DashboardLayout>} />
          <Route path="billing" element={<DashboardLayout role="manager"><DriversManagement initialTab="subscriptions" /></DashboardLayout>} />
          <Route path="map" element={<DashboardLayout role="manager"><div className="h-[calc(100vh-12rem)] min-h-[500px]"><FleetMap /></div></DashboardLayout>} />
          <Route path="reports" element={<DashboardLayout role="manager"><ReportsPage /></DashboardLayout>} />
          <Route path="daily-earnings" element={<DashboardLayout role="manager"><DailyEarningsPage /></DashboardLayout>} />
          <Route path="settings" element={<DashboardLayout role="manager"><SettingsPage /></DashboardLayout>} />
          <Route path="messages" element={<DashboardLayout role="manager"><ManagerMessagesPage /></DashboardLayout>} />
        </Routes>
      </Suspense>
    </SubscriptionGuard>
  );
}

const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));

export default function App() {
  useEffect(() => {
    // Global error handler for mobile debugging
    window.onerror = (message, source, lineno, colno, error) => {
      console.error('GLOBAL ERROR:', { message, source, lineno, colno, error });
      return false;
    };

    // Request location immediately on app load
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => console.log('Location OK:', pos.coords),
        (err) => console.log('Location error:', err.code, err.message),
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
    }
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <MotionConfig transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
          <AuthProvider>
            <InstallProvider>
              <OfflineIndicator />
              <PWAInstallPrompt />
              <Router>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/" element={<UnifiedLoginPage />} />
                    <Route path="/legal/privacy" element={<PrivacyPolicy />} />
                    <Route path="/driver/login" element={<UnifiedLoginPage />} />
                    <Route path="/manager/login" element={<UnifiedLoginPage />} />
                    <Route path="/register/select" element={<OnboardingScreen />} />
                    <Route path="/auth/:role/register" element={<RegisterPage />} />
                    <Route path="/manager/*" element={<ManagerRoutes />} />
                    <Route path="/subscription/success" element={<SubscriptionSuccess />} />
                    <Route path="/subscription/cancel" element={<SubscriptionCancel />} />
                    <Route path="/driver/dashboard" element={<DashboardLayout role="driver"><DriverDashboard /></DashboardLayout>} />
                    <Route path="/driver/trips" element={<DashboardLayout role="driver"><TripsHistory /></DashboardLayout>} />
                    <Route path="/driver/messages" element={<DashboardLayout role="driver"><MessagesPage /></DashboardLayout>} />
                    <Route path="/driver/earnings" element={<DashboardLayout role="driver"><EarningsPage /></DashboardLayout>} />
                    <Route path="/driver/settings" element={<DashboardLayout role="driver"><SettingsPage /></DashboardLayout>} />
                    <Route path="*" element={<UnifiedLoginPage />} />
                  </Routes>
                </Suspense>
              </Router>
            </InstallProvider>
          </AuthProvider>
        </MotionConfig>
      </ErrorBoundary>
    </I18nextProvider>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  props: { children: ReactNode };
  state: { hasError: boolean, error: any };

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center text-red-500 mb-6">
            <Shield size={32} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Ops! Ocorreu um erro inesperado.</h2>
          <p className="text-slate-500 max-w-xs mb-8">A aplicação encontrou um problema crítico. Por favor, tente recarregar a página.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-navy text-white rounded-xl font-black uppercase tracking-widest text-[10px]"
          >
            Recarregar Aplicação
          </button>
          <pre className="mt-8 text-[8px] text-slate-400 bg-slate-100 p-4 rounded-lg max-w-full overflow-auto">
            {this.state.error?.toString()}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
