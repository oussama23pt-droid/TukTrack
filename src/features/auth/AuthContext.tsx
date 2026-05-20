import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDocFromServer, collection, query, where } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { UserModel } from '../../types';

interface AuthContextType {
  user: User | null;
  userData: UserModel | null;
  isPro: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  isPro: false,
  loading: true,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserModel | null>(null);
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for expiry every minute
    const interval = setInterval(() => {
      if (userData && userData.currentPeriodEnd) {
        const now = new Date();
        const periodEnd = userData.currentPeriodEnd.toDate ? 
          userData.currentPeriodEnd.toDate() : 
          (userData.currentPeriodEnd.seconds ? new Date(userData.currentPeriodEnd.seconds * 1000) : new Date(userData.currentPeriodEnd));
        
        if (now > periodEnd && isPro) {
          console.log("[AUTH] Subscription expired in real-time. Restricting access.");
          setIsPro(false);
        }
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [userData, isPro]);

  useEffect(() => {
    let unsubscribeUser: (() => void) | null = null;
    let unsubscribeFleet: (() => void) | null = null;
    let unsubscribeSubs: (() => void) | null = null;

    const cleanup = () => {
      if (unsubscribeUser) unsubscribeUser();
      if (unsubscribeFleet) unsubscribeFleet();
      if (unsubscribeSubs) unsubscribeSubs();
      unsubscribeUser = null;
      unsubscribeFleet = null;
      unsubscribeSubs = null;
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      
      if (!user) {
        cleanup();
        setUserData(null);
        setIsPro(false);
        setLoading(false);
      } else {
        setLoading(true);

        // Handle success redirect immediately
if (window.location.search.includes('success')) {
  localStorage.setItem('payment_just_completed', 'true');
  const pending = sessionStorage.getItem('pending_subscription');
  if (pending) {
    console.log("[AUTH] Success redirect detected, applying optimistic subscription");
    localStorage.setItem('pending_subscription_sync', pending);
  }
}

// APK fallback - check if payment was just completed
const justPaid = localStorage.getItem('payment_just_completed');
if (justPaid) {
  localStorage.removeItem('payment_just_completed');
  const pending = sessionStorage.getItem('pending_subscription') 
    || localStorage.getItem('pending_subscription_sync');
  if (pending) {
    localStorage.setItem('pending_subscription_sync', pending);
  }
}
        
        let userDocData: UserModel | null = null;
        let subDocData: any = null;

        const mergeAndSetData = (uDoc: UserModel | null, sDoc: any) => {
          if (!uDoc) return;
          
          let merged = { ...uDoc };
          
          // If we have subscription data in the vault, it's the source of truth for billing status and dates
          if (sDoc) {
            const now = new Date();
            const subEnd = sDoc.currentPeriodEnd ? 
              (sDoc.currentPeriodEnd.toDate ? sDoc.currentPeriodEnd.toDate() : new Date(sDoc.currentPeriodEnd)) 
              : null;
            
            // If the vault has a subscription that is active or recently cancelling, sync it to merged data
            if (sDoc.status === 'active' || sDoc.status === 'cancelling' || (subEnd && now < subEnd)) {
               merged.planId = sDoc.planId || merged.planId;
               merged.vehicleSlots = sDoc.vehicleSlots || merged.vehicleSlots;
               merged.subscriptionStatus = sDoc.status || merged.subscriptionStatus;
               merged.currentPeriodEnd = sDoc.currentPeriodEnd;
               merged.billingCycle = sDoc.billingCycle || merged.billingCycle;
               console.log("[AUTH] Synced subscription data from persistent vault:", merged.planId, "Expiry:", subEnd);
            }
          }

          // Apply optimistic updates from localStorage if pending
          const pendingSync = localStorage.getItem('pending_subscription_sync');
          if (pendingSync) {
            try {
              const pendingData = JSON.parse(pendingSync);
              const { planId: pId, vehicleSlots: vSlots, billingCycle: bCycle, timestamp, currentPeriodEnd: existingEnd } = pendingData;
              const isExpired = Date.now() - timestamp > 1800000;
              
              // Only apply if it's an upgrade or the current plan is free
              const isBetter = (vSlots > (merged.vehicleSlots || 1)) || (merged.planId === 'free');
              
              if (!isExpired && isBetter) { 
                let resolvedEnd = existingEnd;
                
                // If it's the first time we apply this optimistic update, calculate the fixed end date
                if (!resolvedEnd) {
                  const defaultEnd = new Date();
                  if (bCycle === 'annual') defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
                  else defaultEnd.setDate(defaultEnd.getDate() + 30);
                  resolvedEnd = defaultEnd.toISOString();
                  
                  // Save it back to prevent resets on refresh
                  localStorage.setItem('pending_subscription_sync', JSON.stringify({
                    ...pendingData,
                    currentPeriodEnd: resolvedEnd
                  }));
                }
                
                merged = {
                  ...merged,
                  planId: pId,
                  vehicleSlots: Math.max(merged.vehicleSlots || 1, vSlots),
                  billingCycle: bCycle || 'monthly',
                  subscriptionStatus: 'active',
                  currentPeriodEnd: resolvedEnd,
                  isOptimistic: true as any
                };
                console.log("[AUTH] Applied optimistic update for upgrade:", pId, "Slots:", vSlots, "Target End:", resolvedEnd);
              } else if (isExpired) {
                localStorage.removeItem('pending_subscription_sync');
              }
            } catch (e) {
              localStorage.removeItem('pending_subscription_sync');
            }
          }

          // Final Pro Check
          const now = new Date();
          const periodEnd = merged.currentPeriodEnd ? (
            merged.currentPeriodEnd.toDate ? 
              merged.currentPeriodEnd.toDate() : 
              (merged.currentPeriodEnd.seconds ? new Date(merged.currentPeriodEnd.seconds * 1000) : new Date(merged.currentPeriodEnd))
          ) : null;
          const isExpired = periodEnd ? now > periodEnd : false;

          const userIsPro = (
            (merged.subscriptionStatus === 'active' || merged.subscriptionStatus === 'cancelling') || 
            (merged.planId && merged.planId !== 'free' && !isExpired) ||
            (merged.isPro === true && !isExpired)
          );

          setIsPro(userIsPro);
          setUserData(merged);
          setLoading(false);

          // Helper to get time safely for comparison
          const getTime = (val: any) => {
            if (!val) return 0;
            if (val.toDate) return val.toDate().getTime();
            if (val.seconds) return val.seconds * 1000;
            return new Date(val).getTime();
          };

          // Write back to users doc if there's a discrepancy (Sync back)
          const vaultTime = getTime(sDoc?.currentPeriodEnd);
          const userTime = getTime(uDoc?.currentPeriodEnd);
          
          const needsSyncBack = sDoc && uDoc && (
            (uDoc.planId === 'free' && (sDoc.status === 'active' || sDoc.status === 'cancelling')) ||
            (sDoc.vehicleSlots > (uDoc.vehicleSlots || 1)) ||
            (vaultTime > userTime + 10000) // Vault has newer expiry (10s buffer)
          );

          if (needsSyncBack) {
            const subEnd = sDoc.currentPeriodEnd ? 
              (sDoc.currentPeriodEnd.toDate ? sDoc.currentPeriodEnd.toDate() : new Date(sDoc.currentPeriodEnd)) 
              : null;
            const now = new Date();
            if (subEnd && now < subEnd) {
              console.log("[AUTH] Triggering background sync back to users collection (Upgrade/Vault discrepancy)");
              import('firebase/firestore').then(({ updateDoc, doc: fDoc }) => {
                updateDoc(fDoc(db, 'users', user.uid), {
                  planId: sDoc.planId,
                  vehicleSlots: sDoc.vehicleSlots,
                  subscriptionStatus: sDoc.status,
                  currentPeriodEnd: sDoc.currentPeriodEnd,
                  billingCycle: sDoc.billingCycle,
                  isPro: true,
                  updatedAt: new Date().toISOString()
                }).catch(e => console.warn("[AUTH] Sync back failed:", e));
              });
            }
          }

          // Clear optimistic flags if cloud state is reached
          if (!merged.isOptimistic && merged.planId !== 'free' && merged.subscriptionStatus === 'active') {
             localStorage.removeItem('pending_subscription_sync');
             sessionStorage.removeItem('pending_subscription');
          }
        };

        // 0. Initial Server Side truth check (for reinstalls/fresh logins)
        const initServerSync = async () => {
          try {
            // First check the vault
            const subDoc = await getDocFromServer(doc(db, 'manager_subscriptions', user.uid));
            if (subDoc.exists()) {
              subDocData = subDoc.data();
              console.log("[AUTH] Initial server vault fetch successful");
            }
            
            // Then check user doc
            const uDoc = await getDocFromServer(doc(db, 'users', user.uid));
            if (uDoc.exists()) {
              userDocData = uDoc.data() as UserModel;
              console.log("[AUTH] Initial server user fetch successful");
              mergeAndSetData(userDocData, subDocData);
            }
          } catch (e) {
            console.warn("[AUTH] Initial server sync failed, falling back to listeners");
          }
        };

        initServerSync();

        // 1. Listen to User document
        unsubscribeUser = onSnapshot(doc(db, 'users', user.uid), (userDoc) => {
          if (userDoc.exists()) {
            userDocData = userDoc.data() as UserModel;
            mergeAndSetData(userDocData, subDocData);
          } else {
            setUserData(null);
            setLoading(false);
          }
        }, (err) => {
          console.error("User sync error:", err);
          setLoading(false);
        });

        // 2. Listen to Persistent Subscription Vault
        unsubscribeSubs = onSnapshot(doc(db, 'manager_subscriptions', user.uid), (subDoc) => {
          if (subDoc.exists()) {
            subDocData = subDoc.data();
            mergeAndSetData(userDocData, subDocData);
          }
        }, (err) => {
          console.warn("[AUTH] Subscription vault sync failed:", err);
        });
      }
    });

    return () => {
      unsubscribeAuth();
      cleanup();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, isPro, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
