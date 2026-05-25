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

    // Also write to subscription vault so AuthContext remembers after logout
    const vaultRef = db.collection("manager_subscriptions").doc(managerId);
    await vaultRef.set(updateData, { merge: true });
    console.log(`Updated vault for manager ${managerId}`);
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

// ─── 5. Push Notification System ─────────────────────────────────────────────
// Sends FCM push notifications for key events:
//   - SOS alerts → manager
//   - Shift start → all drivers of that manager
//   - Trip start/cancel → manager
//   - Manager notifications → drivers (general)
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

/** Helper: send FCM push to a list of FCM tokens */
async function sendFcmPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (!tokens.length) return;
  const unique = [...new Set(tokens.filter(Boolean))];
  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: unique,
      notification: { title, body },
      data: data || {},
      android: {
        priority: "high",
        notification: {
          channelId: "tuktrack_alerts",
          priority: "high",
          defaultSound: true,
        },
      },
    });
    console.log(`FCM sent: ${response.successCount} ok, ${response.failureCount} failed`);
  } catch (err) {
    console.error("FCM sendEachForMulticast error:", err);
  }
}

/** Helper: get FCM tokens for all drivers under a manager */
async function getDriverTokens(managerId: string): Promise<string[]> {
  const snap = await db
    .collection("users")
    .where("managerId", "==", managerId)
    .where("role", "==", "driver")
    .get();
  return snap.docs.flatMap((d) => {
    const data = d.data();
    const tokens: string[] = [];
    if (data.fcmToken) tokens.push(data.fcmToken);
    if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
    return tokens;
  });
}

/** Helper: get FCM token(s) for a manager */
async function getManagerTokens(managerId: string): Promise<string[]> {
  const snap = await db.collection("users").doc(managerId).get();
  const data = snap.data();
  if (!data) return [];
  const tokens: string[] = [];
  if (data.fcmToken) tokens.push(data.fcmToken);
  if (Array.isArray(data.fcmTokens)) tokens.push(...data.fcmTokens);
  return tokens;
}

// 5a. notifications collection — push to drivers (general manager broadcasts)
export const sendDriverNotification = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const notif = event.data?.data();
    if (!notif || notif.pushSent) return;

    const managerId: string = notif.managerId;
    if (!managerId) return;

    let tokens: string[] = [];
    let title: string = notif.title || "TukTrack";
    let body: string = notif.message || notif.body || "";

    if (notif.isForDrivers) {
      // Broadcast to all drivers under this manager
      tokens = await getDriverTokens(managerId);
    } else {
      // Send to manager
      tokens = await getManagerTokens(managerId);
    }

    if (tokens.length) {
      await sendFcmPush(tokens, title, body, {
        type: notif.type || "info",
        notifId: event.params.notifId,
      });
    }

    await event.data?.ref.update({
      pushSent: true,
      pushedAt: admin.firestore.Timestamp.now(),
    });
  }
);

// 5b. SOS alerts — push manager immediately when a new SOS is created
export const sendSosNotification = onDocumentCreated(
  "sos_alerts/{sosId}",
  async (event) => {
    const sos = event.data?.data();
    if (!sos || sos.status !== "active") return;

    const managerId: string = sos.managerId;
    if (!managerId) return;

    const tokens = await getManagerTokens(managerId);
    await sendFcmPush(
      tokens,
      "🆘 ALERTA SOS!",
      `O motorista ${sos.driverName || "Desconhecido"} acionou o SOS. Verifique a aplicação imediatamente!`,
      { type: "sos", sosId: event.params.sosId }
    );
  }
);

// 5c. Shift created/updated → notify drivers when shift goes active
export const sendShiftNotification = onDocumentCreated(
  "shifts/{shiftId}",
  async (event) => {
    const shift = event.data?.data();
    if (!shift || shift.status !== "active") return;

    const managerId: string = shift.managerId;
    if (!managerId) return;

    const tokens = await getDriverTokens(managerId);
    await sendFcmPush(
      tokens,
      "🟢 Turno Iniciado!",
      "O gestor iniciou o turno de operações. Por favor, fiquem atentos às rotas e comunicações.",
      { type: "shift_start", shiftId: event.params.shiftId }
    );
  }
);

// 5d. Trip events — notify manager when a driver starts or cancels a trip
export const sendTripNotification = onDocumentCreated(
  "trips/{tripId}",
  async (event) => {
    const trip = event.data?.data();
    if (!trip) return;

    const managerId: string = trip.managerId;
    if (!managerId) return;

    const tokens = await getManagerTokens(managerId);
    await sendFcmPush(
      tokens,
      "🛺 Viagem Iniciada",
      `${trip.driverName || "Motorista"} iniciou uma viagem — ${trip.description || "Rota Manual"}.`,
      { type: "trip_start", tripId: event.params.tripId }
    );
  }
);

export const sendTripCancelNotification = onDocumentUpdated(
  "trips/{tripId}",
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only fire when status changes TO cancelled
    if (before.status === "cancelled" || after.status !== "cancelled") return;

    const managerId: string = after.managerId;
    if (!managerId) return;

    const tokens = await getManagerTokens(managerId);
    const reason = after.cancelReason ? ` Motivo: ${after.cancelReason}` : "";
    await sendFcmPush(
      tokens,
      "🚫 Viagem Cancelada",
      `${after.driverName || "Motorista"} cancelou a viagem.${reason}`,
      { type: "trip_cancel", tripId: event.params.tripId }
    );
  }
);
