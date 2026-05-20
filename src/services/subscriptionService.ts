import { doc, getDoc, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export type SubscriptionStatus = 'active' | 'trial' | 'cancelled' | 'cancelling' | 'expired' | 'payment_failed' | 'incomplete' | 'past_due' | 'unpaid' | 'none';

export interface ManagerSubscription {
  subscriptionStatus: SubscriptionStatus;
  vehicleSlots: number;
  planId: string;
  billingCycle: 'monthly' | 'annual';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: any;
}

class SubscriptionService {
  private async getAuthHeaders() {
    const token = await auth.currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Starts a subscription by calling the local Express API
   */
  async startSubscription(priceId: string, managerId: string, userId: string, billingCycle: string, planId: string, vehicle_slots: number) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers,
 body: JSON.stringify({
  priceId,
  customerId: managerId,
  metadata: {
    userId,
    plan: planId,
    billingCycle,
    vehicle_slots
  }
})
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create checkout session');
      }

      const { checkoutUrl } = await response.json();
      
      if (checkoutUrl) {
  sessionStorage.setItem('pending_subscription', JSON.stringify({
    planId,
    vehicleSlots: vehicle_slots,
    billingCycle,
    timestamp: Date.now()
  }));

  if ((window as any).median) {
    (window as any).median.openExternalUrl({
      url: checkoutUrl
    });
  } else {
    window.location.href = checkoutUrl;
  }
}
      
      
      return { checkoutUrl };
    } catch (error: any) {
      console.error('Error starting subscription:', error);
      throw error;
    }
  }

  /**
   * Opens the Stripe Customer Portal using the backend API
   */
  async openBillingPortal(managerId: string) {
    if (!managerId) throw new Error("Manager ID is required for billing portal");

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers,
        body: JSON.stringify({ managerId })
      });
if ((window as any).median) {
  (window as any).median.openExternalUrl({ 
    url: portalUrl 
  });
} else {
  window.location.href = portalUrl;
}
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create portal session');
      }

      const { portalUrl } = await response.json();
      if (portalUrl) {
        window.location.href = portalUrl;
      }
      return { portalUrl };
    } catch (error: any) {
      console.error('Error opening billing portal:', error);
      throw error;
    }
  }

  /**
   * Checks subscription status directly from Firestore
   */
  async checkSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return 'none';
      
      return (userDoc.data()?.subscriptionStatus as SubscriptionStatus) || 'none';
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return 'none';
    }
  }

  /**
   * Gets the number of vehicle slots unlocked
   */
  async getVehicleSlots(userId: string): Promise<number> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return 0;
      
      return (userDoc.data()?.vehicleSlots as number) || 0;
    } catch (error) {
      console.error('Error getting vehicle slots:', error);
      return 0;
    }
  }

  /**
   * Listens to subscription changes in real time
   */
  subscribeToUserStatus(userId: string, callback: (data: ManagerSubscription | null) => void) {
    return onSnapshot(doc(db, 'users', userId), (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as ManagerSubscription);
      } else {
        callback(null);
      }
    });
  }

  /**
   * Cancels subscription at period end
   */
  async cancelSubscription(managerId: string) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/stripe/cancel', {
        method: 'POST',
        headers,
        body: JSON.stringify({ managerId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to cancel subscription');
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }
}

export const subscriptionService = new SubscriptionService();
