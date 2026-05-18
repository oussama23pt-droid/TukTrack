"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelSubscription = exports.createPortalSession = exports.stripeWebhook = exports.createCheckoutSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = __importDefault(require("stripe"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
admin.initializeApp();
const configPath = path.resolve(__dirname, "../../firebase-applet-config.json");
let databaseId = undefined;
try {
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        databaseId = config.firestoreDatabaseId;
    }
}
catch (e) {
    console.error("Error reading firebase-applet-config.json:", e);
}
const db = databaseId ? (0, firestore_1.getFirestore)(databaseId) : (0, firestore_1.getFirestore)();
let stripeClient = null;
function getStripe() {
    if (!stripeClient) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key) {
            throw new https_1.HttpsError("failed-precondition", "STRIPE_SECRET_KEY is not set.");
        }
        stripeClient = new stripe_1.default(key, {
            apiVersion: "2023-10-16",
        });
    }
    return stripeClient;
}
const APP_URL = process.env.APP_URL || "https://ais-dev-bn3i2zdk3e2b3742n36kjh-656504063582.europe-west2.run.app";
var OperationType;
(function (OperationType) {
    OperationType["CREATE"] = "create";
    OperationType["UPDATE"] = "update";
    OperationType["DELETE"] = "delete";
    OperationType["LIST"] = "list";
    OperationType["GET"] = "get";
    OperationType["WRITE"] = "write";
})(OperationType || (OperationType = {}));
function handleFirestoreError(error, operationType, path, userId) {
    const errInfo = {
        error: error?.message || String(error),
        authInfo: {
            userId: userId || null,
        },
        operationType,
        path
    };
    console.error("Firestore Error: ", JSON.stringify(errInfo));
    throw new https_1.HttpsError("internal", JSON.stringify(errInfo));
}
exports.createCheckoutSession = (0, https_1.onCall)(async (request) => {
    const { priceId, fleetId, userId, billingCycle } = request.data;
    const authUid = request.auth?.uid;
    if (!authUid) {
        throw new https_1.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    if (userId !== authUid) {
        throw new https_1.HttpsError("permission-denied", "You can only create checkout sessions for your own account.");
    }
    if (!priceId || !fleetId || !userId || !billingCycle) {
        throw new https_1.HttpsError("invalid-argument", "Missing required parameters.");
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
                    fleetId,
                    priceId,
                    vehicle_slots: String(vehicle_slots),
                    plan_id,
                    billing_cycle: billingCycle,
                },
            },
            metadata: {
                fleetId,
                priceId,
                vehicle_slots: String(vehicle_slots),
                plan_id,
                billing_cycle: billingCycle,
            },
            success_url: `${APP_URL}/subscription/success?fleetId=${fleetId}`,
            cancel_url: `${APP_URL}/subscription/cancel?fleetId=${fleetId}`,
        });
        return {
            sessionId: session.id,
            checkoutUrl: session.url,
        };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        console.error("Error creating checkout session:", error);
        throw new https_1.HttpsError("internal", `Stripe/Auth Error: ${error.message || "Unknown error"}`);
    }
});
exports.stripeWebhook = (0, https_1.onRequest)(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const stripe = getStripe();
    let event;
    try {
        const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!endpointSecret) {
            throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
        }
        const payload = req.rawBody || req.body;
        event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    }
    catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const subscriptionId = session.subscription;
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                await updateFleetSubscription(subscription, "active", session.customer);
                break;
            }
            case "customer.subscription.updated": {
                const subscription = event.data.object;
                const status = subscription.cancel_at_period_end ? "cancelling" : subscription.status;
                await updateFleetSubscription(subscription, status);
                break;
            }
            case "customer.subscription.deleted": {
                const subscription = event.data.object;
                await updateFleetSubscription(subscription, "cancelled");
                break;
            }
            case "invoice.payment_failed": {
                const invoice = event.data.object;
                const subscriptionId = invoice.subscription;
                if (subscriptionId) {
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    await updateFleetSubscription(subscription, "payment_failed");
                }
                break;
            }
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).send("Webhook handler failed");
    }
});
async function updateFleetSubscription(subscription, customStatus, stripeCustomerId) {
    const metadata = subscription.metadata;
    const fleetId = metadata.fleetId;
    if (!fleetId) {
        console.error("No fleetId found in subscription metadata");
        return;
    }
    const path = `fleets/${fleetId}`;
    try {
        const fleetRef = db.collection("fleets").doc(fleetId);
        const updateData = {
            subscriptionStatus: customStatus || subscription.status,
            planId: metadata.plan_id || "basic",
            vehicleSlots: parseInt(metadata.vehicle_slots || "0", 10),
            billingCycle: metadata.billing_cycle || "monthly",
            stripeCustomerId: stripeCustomerId || subscription.customer,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: admin.firestore.Timestamp.fromMillis(subscription.current_period_end * 1000),
            updatedAt: admin.firestore.Timestamp.now(),
        };
        await fleetRef.set(updateData, { merge: true });
        console.log(`Updated fleet ${fleetId} subscription status to ${updateData.subscriptionStatus}`);
    }
    catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
    }
}
exports.createPortalSession = (0, https_1.onCall)(async (request) => {
    const { fleetId } = request.data;
    const authUid = request.auth?.uid;
    if (!authUid) {
        throw new https_1.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    if (!fleetId) {
        throw new https_1.HttpsError("invalid-argument", "Missing fleetId.");
    }
    const path = `fleets/${fleetId}`;
    try {
        const fleetDoc = await db.collection("fleets").doc(fleetId).get();
        const fleetData = fleetDoc.data();
        if (!fleetData) {
            throw new https_1.HttpsError("not-found", "Fleet not found.");
        }
        if (fleetData.ownerUid !== authUid) {
            throw new https_1.HttpsError("permission-denied", "You are not the owner of this fleet.");
        }
        if (!fleetData.stripeCustomerId) {
            throw new https_1.HttpsError("not-found", "Stripe customer not found for this fleet.");
        }
        const stripe = getStripe();
        const session = await stripe.billingPortal.sessions.create({
            customer: fleetData.stripeCustomerId,
            return_url: `${APP_URL}/manager/billing`,
        });
        return { portalUrl: session.url };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        handleFirestoreError(error, OperationType.GET, path, authUid);
    }
});
exports.cancelSubscription = (0, https_1.onCall)(async (request) => {
    const { fleetId } = request.data;
    const authUid = request.auth?.uid;
    if (!authUid) {
        throw new https_1.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    if (!fleetId) {
        throw new https_1.HttpsError("invalid-argument", "Missing fleetId.");
    }
    const path = `fleets/${fleetId}`;
    try {
        const fleetDoc = await db.collection("fleets").doc(fleetId).get();
        const fleetData = fleetDoc.data();
        if (!fleetData) {
            throw new https_1.HttpsError("not-found", "Fleet not found.");
        }
        if (fleetData.ownerUid !== authUid) {
            throw new https_1.HttpsError("permission-denied", "You are not the owner of this fleet.");
        }
        if (!fleetData.stripeSubscriptionId) {
            throw new https_1.HttpsError("not-found", "Subscription not found for this fleet.");
        }
        const stripe = getStripe();
        await stripe.subscriptions.update(fleetData.stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        await db.collection("fleets").doc(fleetId).update({
            subscriptionStatus: "cancelling",
            updatedAt: admin.firestore.Timestamp.now(),
        });
        return { success: true };
    }
    catch (error) {
        if (error instanceof https_1.HttpsError)
            throw error;
        handleFirestoreError(error, OperationType.WRITE, path, authUid);
    }
});
//# sourceMappingURL=index.js.map