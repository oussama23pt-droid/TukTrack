import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY!))
  });
}
const db = getFirestore();

export const config = { api: { bodyParser: false } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature']!;
  let event;

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req as any) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    event = stripe.webhooks.constructEvent(
      rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan || 'pro';

      if (userId) {
        const vehicleSlots = plan === 'starter' ? 3
  : plan === 'basic' ? 10
  : plan === 'pro' ? 30
  : 1;

// TO:
await db.collection('users').doc(userId).update({
  planId: plan,
  plan: plan,
  vehicleSlots: vehicleSlots,
  subscriptionStatus: 'active',
  stripeSubscriptionId: session.subscription,
  stripeCustomerId: session.customer,
  subscriptionId: session.subscription,
  planActivatedAt: new Date().toISOString(),
});
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const snapshot = await db.collection('users')
        .where('subscriptionId', '==', sub.id).get();
      snapshot.forEach(doc => {
        doc.ref.update({ plan: 'free', planId: 'free', vehicleSlots: 1, subscriptionStatus: 'cancelled', subscriptionId: null })
      break;
    }
  }

  return res.json({ received: true });
}
