import express from "express";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const configPath = path.resolve(__dirname, "./firebase-applet-config.json");
let databaseId: string | undefined = undefined;

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  databaseId = config.firestoreDatabaseId;
  
  if (!getApps().length) {
    initializeApp({
      projectId: config.projectId,
    });
  }
}

const db = databaseId ? getFirestore(databaseId) : getFirestore();
const authAdmin = getAuth();

// Stripe Client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2023-10-16" as any,
});

const APP_URL = process.env.APP_URL || "https://tuktrack.com";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security and CORS Headers for Mobile WebView compatibility
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Stripe Webhook needs raw body
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
      if (!endpointSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const subscriptionId = session.subscription as string;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          
  // Combine metadata from session and subscription just in case
  const metadata = { ...session.metadata, ...subscription.metadata };
  const clientReferenceId = session.client_reference_id;
  const managerId = metadata.managerId || clientReferenceId;
  
  // Debug log for metadata
  console.log("[STRIPE-WEBHOOK] Checkout Completed:", { 
    id: session.id, 
    customer: session.customer, 
    managerId, 
    plan: metadata.plan_id, 
    slots: metadata.vehicle_slots, 
    clientRef: clientReferenceId 
  });
  
  await updateManagerSubscription(subscription, "active", session.customer as string, metadata, clientReferenceId as string);
          
          // Log the transaction
          await logTransaction(session, subscription, metadata);
          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const status = subscription.cancel_at_period_end ? "cancelling" : subscription.status;
          await updateManagerSubscription(subscription, status);
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          // When a subscription is deleted, we revert the user to the free plan
          await updateManagerSubscription(subscription, "cancelled", undefined, { plan_id: 'free', vehicle_slots: '1', isPro: false });
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription as string;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await updateManagerSubscription(subscription, "active");
            // Log successful payment
            const managerId = subscription.metadata.managerId;
            if (managerId) {
               await db.collection("users").doc(managerId).collection("invoices").doc(invoice.id).set({
                 amount: invoice.amount_paid / 100,
                 currency: invoice.currency,
                 status: "paid",
                 date: new Date(invoice.created * 1000),
                 pdf: invoice.invoice_pdf,
                 items: invoice.lines.data.map((item: any) => item.description)
               });
            }
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as any;
          const subscriptionId = invoice.subscription as string;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await updateManagerSubscription(subscription as any, "payment_failed");
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (error: any) {
      console.error("Error processing webhook:", error);
      res.status(500).send("Webhook handler failed");
    }
  });

  app.use(express.json());

  // Middleware to verify Firebase ID Token
  const authenticate = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const token = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await authAdmin.verifyIdToken(token);
      req.user = decodedToken;
      next();
    } catch (error) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // API: Create Checkout Session
  app.post("/api/stripe/create-checkout", authenticate, async (req: any, res) => {
    const { priceId, managerId, billingCycle, plan_id, vehicle_slots } = req.body;
    const userId = req.user.uid;

    console.log(`Creating checkout session for user ${userId}, manager ${managerId}, plan ${plan_id}`);

    try {
      // 1. Get user data from Firestore to get NIF and Company Name
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      
      if (!userData) {
        return res.status(404).json({ error: "User not found" });
      }

      const companyName = userData.companyName || userData.name || "Empresa";
      const nif = userData.nif;
      const address = userData.address;

      // 2. Find or Create Stripe Customer
      let customerId = userData.stripeCustomerId;

      if (!customerId) {
        // Create new customer
        const customerData: any = {
          email: req.user.email,
          name: companyName,
          invoice_settings: {
            custom_fields: nif ? [{ name: "NIF", value: nif }] : undefined,
          },
          metadata: {
            managerId: managerId,
            firebaseUid: userId
          }
        };

        if (address) {
          customerData.address = { line1: address };
        }

        const customer = await stripe.customers.create(customerData);
        customerId = customer.id;
        
        // Save customer ID back to user doc
        await db.collection("users").doc(userId).update({
          stripeCustomerId: customerId
        });
      } else {
        // Update existing customer name, address and invoice settings if needed
        const updateData: any = {
          name: companyName,
          invoice_settings: {
            custom_fields: nif ? [{ name: "NIF", value: nif }] : undefined,
          }
        };

        if (address) {
          updateData.address = { line1: address };
        }

        await stripe.customers.update(customerId, updateData);
      }

      // 3. Add Tax ID (NIF) to Stripe Customer if provided
      if (nif) {
        try {
          // Check if customer already has this tax ID to avoid duplicates
          const taxIds = await stripe.customers.listTaxIds(customerId);
          const hasTaxId = taxIds.data.some(tid => tid.value === nif);
          
          if (!hasTaxId) {
            await stripe.customers.createTaxId(customerId, {
              type: "pt_nif" as any,
              value: nif,
            });
          }
        } catch (taxErr: any) {
          console.warn("Failed to add Tax ID to Stripe:", taxErr.message);
          // Don't fail the whole checkout if tax ID fails (maybe invalid format?)
        }
      }

      const metadata = { 
        managerId, 
        plan_id, 
        vehicle_slots: String(vehicle_slots), 
        billing_cycle: billingCycle,
        ownerUid: userId,
        ownerEmail: req.user.email,
        nif: nif || ""
      };

      const origin = req.get('origin') || APP_URL;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "subscription",
        customer: customerId, 
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          metadata: metadata,
        },
        metadata: metadata,
        customer_update: {
          address: "auto",
          name: "auto",
        },
        success_url: `${origin}/manager/billing?success=true`,
        cancel_url: `${origin}/manager/billing?canceled=true`,
      });
      res.json({ checkoutUrl: session.url });
    } catch (error: any) {
      console.error("Stripe Checkout Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Create Portal Session
  app.post("/api/stripe/create-portal", authenticate, async (req: any, res) => {
    const { managerId } = req.body;
    const userId = req.user.uid;

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData || userData.uid !== userId) {
        return res.status(403).json({ error: "Permission denied" });
      }

      if (!userData.stripeCustomerId) {
        return res.status(404).json({ error: "Stripe customer not found" });
      }

      const origin = req.get('origin') || APP_URL;
      const session = await stripe.billingPortal.sessions.create({
        customer: userData.stripeCustomerId,
        return_url: `${origin}/manager/dashboard?tab=subscriptions`,
      });
      res.json({ portalUrl: session.url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Update Stripe Customer Info
  app.post("/api/stripe/update-customer", authenticate, async (req: any, res) => {
    const userId = req.user.uid;
    const { companyName, nif, address } = req.body;

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();
      
      const customerId = userData?.stripeCustomerId;
      if (!customerId) {
        return res.json({ status: "skipped", message: "No stripe customer associated" });
      }

      const updateData: any = {
        name: companyName,
        invoice_settings: {
          custom_fields: nif ? [{ name: "NIF", value: nif }] : undefined,
        }
      };

      if (address) {
        updateData.address = { line1: address };
      }

      await stripe.customers.update(customerId, updateData);
      res.json({ status: "success" });
    } catch (error: any) {
      console.error("Stripe customer update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Cancel Subscription
  app.post("/api/stripe/cancel", authenticate, async (req: any, res) => {
    const { managerId } = req.body;
    const userId = req.user.uid;

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      if (!userData || userData.uid !== userId) {
        return res.status(403).json({ error: "Permission denied" });
      }

      if (!userData.stripeSubscriptionId) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      await stripe.subscriptions.update(userData.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await db.collection("users").doc(userId).update({
        subscriptionStatus: "cancelling",
        updatedAt: new Date(),
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Aggressive caching for static assets in production
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          // Don't cache HTML files or it will break updates
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

async function logTransaction(session: Stripe.Checkout.Session, subscription: Stripe.Subscription, metadata: any) {
  const managerId = metadata.managerId;
  if (!managerId) return;

  await db.collection("users").doc(managerId).collection("transactions").add({
    type: "subscription_creation",
    stripeSessionId: session.id,
    stripeSubscriptionId: subscription.id,
    planId: metadata.plan_id,
    vehicleSlots: parseInt(metadata.vehicle_slots || "0", 10),
    amount: session.amount_total ? session.amount_total / 100 : 0,
    currency: session.currency,
    createdAt: new Date(),
  });
}

async function updateManagerSubscription(subscription: any, status?: string, customerId?: string, forceMetadata?: any, clientReferenceId?: string) {
  const metadata = forceMetadata || subscription.metadata;
  const managerId = metadata?.managerId || clientReferenceId;
  
  if (!managerId) {
    console.error("updateManagerSubscription: No managerId found in metadata or clientReferenceId", { metadata, clientReferenceId });
    return;
  }

  // Map Stripe status to our app status if needed
  let subscriptionStatus = status || subscription.status;
  if (subscriptionStatus === "trialing") subscriptionStatus = "active";
  
  const planId = metadata?.plan_id || "basic";
  const vehicleSlots = parseInt(metadata?.vehicle_slots || "1", 10);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const billingCycle = metadata?.billing_cycle || "monthly";
  const ownerEmail = metadata?.ownerEmail;

  console.log(`[SUBSCRIPTION-WEBHOOK] Executing updates for manager ${managerId}: plan=${planId}, slots=${vehicleSlots}`);

  try {
    // 1. Update User Record
    const userUpdate: any = {
      subscriptionStatus,
      planId,
      vehicleSlots,
      currentPeriodEnd,
      billingCycle,
      stripeCustomerId: customerId || (subscription.customer as string),
      stripeSubscriptionId: subscription.id,
      ownerEmail: ownerEmail || null,
      lastPaymentAt: new Date(),
      isPro: subscriptionStatus === "active" || subscriptionStatus === "cancelling",
      updatedAt: new Date(),
    };

    // If cancelled or expired, reset plan specific features
    if (subscriptionStatus === "cancelled" || subscriptionStatus === "unpaid") {
      userUpdate.planId = "free";
      userUpdate.vehicleSlots = 1;
      userUpdate.isPro = false;
    }

    console.log(`[SUBSCRIPTION-WEBHOOK] Updating manager ${managerId} status to ${subscriptionStatus}`);
    await db.collection("users").doc(managerId).set(userUpdate, { merge: true });

    // 2. Also keep a persistent record in a dedicated collection for audit/persistence
    await db.collection("manager_subscriptions").doc(managerId).set({
      managerId,
      subscriptionId: subscription.id,
      status: subscriptionStatus,
      planId,
      vehicleSlots,
      currentPeriodEnd,
      billingCycle,
      updatedAt: new Date(),
      lastWebhookEvent: subscription.id,
    }, { merge: true });

  } catch (err) {
    console.error(`[SUBSCRIPTION-WEBHOOK] ERROR updating ${managerId}:`, err);
  }
}

startServer();
