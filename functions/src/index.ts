import { onCall, onRequest, CallableRequest, HttpsError } from "firebase-functions/v2/https";
import { type Response } from "express";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import * as path from "path";
import * as fs from "fs";

admin.initializeApp();

// Load Firestore Database ID from config
const configPath = path.resolve(__dirname, "../../firebase-applet-config.json");
let databaseId: string | undefined = undefined;
try {
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    databaseId = config.firestoreDatabaseId;
  }
} catch (e) {
  console.error("Error reading firebase-applet-config.json:", e);
}

const db = databaseId ? getFirestore(databaseId) : getFirestore();

let stripeClient: any = null;

function getStripe(): any {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new HttpsError("failed-precondition", "STRIPE_SECRET_KEY is not set.");
    }
    stripeClient = new (Stripe as any)(key, {
      apiVersion: "2023-10-16",
    });
  }
  return stripeClient;
}

const APP_URL = process.env.APP_URL || "https://ais-dev-bn3i2zdk3e2b3742n36kjh-656504063582.europe-west2.run.app";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: any, operationType: OperationType, path: string | null, userId?: string | null): never {
  const errInfo = {
    error: error?.message || String(error),
    authInfo: {
      userId: userId || null,
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new HttpsError("internal", JSON.stringify(errInfo));
}

// 1. createCheckoutSession
export const createCheckoutSession = onCall(async (request: CallableRequest<any>) => {
  const { priceId, managerId, userId, billingCycle } = request.data;
  const authUid = request.auth?.uid;

  if (!authUid) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  if (userId !== authUid) {
    throw new HttpsError("permission-denied", "You can only create checkout sessions for your own account.");
  }

  if (!priceId || !managerId || !userId || !billingCycle) {
    throw new HttpsError("invalid-argument", "Missing required parameters.");
  }

  try {
    const userRecord = await admin.auth().getUser(userId);
    const customerEmail = userRecord.email;

    const vehicle_slots = request.data.vehicle_slots || "0";
    const plan_id = request.data.plan_id || "basic";

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: customerEmail,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          managerId,
          priceId,
          vehicle_slots: String(vehicle_slots),
          plan_id,
          billing_cycle: billingCycle,
        },
      },
      metadata: {
        managerId,
        priceId,
        vehicle_slots: String(vehicle_slots),
        plan_id,
        billing_cycle: billingCycle,
      },
      success_url: `${APP_URL}/subscription/success?managerId=${managerId}`,
      cancel_url: `${APP_URL}/subscription/cancel?managerId=${managerId}`,
    });

    return {
      sessionId: session.id,
      checkoutUrl: session.url,
    };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    console.error("Error creating checkout session:", error);
    throw new HttpsError("internal", `Stripe/Auth Error: ${error.message || "Unknown error"}`);
  }
});

// 2. stripeWebhook
export const stripeWebhook = onRequest(async (req: any, res: Response) => {
  const sig = req.headers["stripe-signature"] as string;
  const stripe = getStripe();
  let event: any;

  try {
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
    }
    const payload = (req as any).rawBody || req.body;
    event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await updateManagerSubscription(subscription, "active", session.customer as string);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const status = subscription.cancel_at_period_end ? "cancelling" : subscription.status;
        await updateManagerSubscription(subscription, status);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        await updateManagerSubscription(subscription, "cancelled");
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription as string;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await updateManagerSubscription(subscription, "payment_failed");
        }
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Webhook handler failed");
  }
});

async function updateManagerSubscription(
  subscription: any,
  customStatus?: string,
  stripeCustomerId?: string
) {
  const metadata = subscription.metadata;
  const managerId = metadata.managerId;

  if (!managerId) {
    console.error("No managerId found in subscription metadata");
    return;
  }

  const path = `users/${managerId}`;
  try {
    const managerRef = db.collection("users").doc(managerId);
    const updateData: any = {
      subscriptionStatus: customStatus || subscription.status,
      planId: metadata.plan_id || "basic",
      vehicleSlots: parseInt(metadata.vehicle_slots || "0", 10),
      billingCycle: metadata.billing_cycle || "monthly",
      stripeCustomerId: stripeCustomerId || subscription.customer,
      stripeSubscriptionId: subscription.id,
      currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await managerRef.set(updateData, { merge: true });
    console.log(`Updated manager ${managerId} subscription status to ${updateData.subscriptionStatus}`);
  } catch (error: any) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// 3. createPortalSession
export const createPortalSession = onCall(async (request: CallableRequest<any>) => {
  const { managerId } = request.data;
  const authUid = request.auth?.uid;

  if (!authUid) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  if (!managerId) {
    throw new HttpsError("invalid-argument", "Missing managerId.");
  }

  const path = `users/${managerId}`;
  try {
    const managerDoc = await db.collection("users").doc(managerId).get();
    const managerData = managerDoc.data();

    if (!managerData) {
      throw new HttpsError("not-found", "Manager not found.");
    }

    if (managerData.uid !== authUid) {
      throw new HttpsError("permission-denied", "You are not the owner of this account.");
    }

    if (!managerData.stripeCustomerId) {
      throw new HttpsError("not-found", "Stripe customer not found for this account.");
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: managerData.stripeCustomerId,
      return_url: `${APP_URL}/manager/settings`,
    });

    return { portalUrl: session.url };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    handleFirestoreError(error, OperationType.GET, path, authUid);
  }
});

// 4. cancelSubscription
export const cancelSubscription = onCall(async (request: CallableRequest<any>) => {
  const { managerId } = request.data;
  const authUid = request.auth?.uid;

  if (!authUid) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  if (!managerId) {
    throw new HttpsError("invalid-argument", "Missing managerId.");
  }

  const path = `users/${managerId}`;
  try {
    const managerDoc = await db.collection("users").doc(managerId).get();
    const managerData = managerDoc.data();

    if (!managerData) {
      throw new HttpsError("not-found", "Manager not found.");
    }

    if (managerData.uid !== authUid) {
      throw new HttpsError("permission-denied", "You are not the owner of this account.");
    }

    if (!managerData.stripeSubscriptionId) {
      throw new HttpsError("not-found", "Subscription not found for this account.");
    }

    const stripe = getStripe();
    await stripe.subscriptions.update(managerData.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db.collection("users").doc(managerId).update({
      subscriptionStatus: "cancelling",
      updatedAt: admin.firestore.Timestamp.now(),
    });

    return { success: true };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    handleFirestoreError(error, OperationType.WRITE, path, authUid);
  }
});
