import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
export type SubscriptionStatus = 'active' | 'trial' | 'cancelled' | 'none';

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

  async startSubscription(priceId: string, managerId: string, userId: string, planId: string, billingCycle: string, vehicle_slots: number) {
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
        window.open(checkoutUrl, '_blank');
      }

      return { checkoutUrl };
    } catch (error: any) {
      console.error('Error starting subscription:', error);
      throw error;
    }
  }

  async openBillingPortal(managerId: string) {
    if (!managerId) throw new Error("Manager ID is required for billing");

    try {
      const headers = await this.getAuthHeaders();
      const response = await fetch('/api/stripe/create-portal', {
        method: 'POST',
        headers,
        body: JSON.stringify({ stripeCustomerId: managerId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create portal session');
      }

      const { portalUrl } = await response.json();

      if (portalUrl) {
        window.open(portalUrl, '_blank');
      }

      return { portalUrl };
    } catch (error: any) {
      console.error('Error opening billing portal:', error);
      throw error;
    }
  }

  async checkSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return 'none';
      return (userDoc.data()?.subscriptionStatus as SubscriptionStatus);
    } catch (error) {
      console.error('Error checking subscription status:', error);
      return 'none';
    }
  }

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

  subscribeToUserStatus(userId: string, callback: (data: ManagerSubscription) => void) {
    return onSnapshot(doc(db, 'users', userId), (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as ManagerSubscription);
      } else {
        callback(null);
      }
    });
  }

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
