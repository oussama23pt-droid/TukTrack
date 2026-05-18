export type UserRole = 'manager' | 'driver';

export interface UserModel {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  managerId?: string; // For drivers to know who their manager is
  vehicleId?: string;
  activeTripId?: string;
  phoneNumber?: string;
  isOnline?: boolean;
  location?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
  createdAt: string;
  subscriptionStatus?: string;
  planId?: string;
  vehicleSlots?: number;
  currentPeriodEnd?: any;
  billingCycle?: 'monthly' | 'annual';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  isPro?: boolean;
  isOptimistic?: boolean;
}

export interface DriverModel {
  id: string;
  managerId: string;
  name: string;
  phoneNumber: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface VehicleModel {
  id: string;
  managerId: string;
  plateNumber: string;
  color: string;
  status: 'active' | 'maintenance' | 'service';
  createdAt: string;
}

export interface TripModel {
  id: string;
  driverUid: string;
  managerId: string;
  amount: number;
  passengers?: number;
  description?: string;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface SOSAlertModel {
  id: string;
  driverUid: string;
  managerId: string;
  location?: {
    lat: number;
    lng: number;
  };
  status: 'active' | 'resolved';
  createdAt: string;
}
