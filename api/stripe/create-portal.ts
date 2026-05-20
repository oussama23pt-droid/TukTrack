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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { stripeCustomerId } = req.body;
    
    console.log('Body received:', req.body);
    console.log('Looking up user:', stripeCustomerId);

    const userDoc = await db.collection('users').doc(stripeCustomerId).get();
    
    console.log('Doc exists:', userDoc.exists);
    console.log('Doc data:', JSON.stringify(userDoc.data()));

    const realStripeCustomerId = userDoc.data()?.stripeCustomerId;
    
    console.log('Stripe customer ID found:', realStripeCustomerId);

    if (!realStripeCustomerId) {
      throw new Error('No Stripe customer found for this user');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: realStripeCustomerId,
      return_url: `${process.env.APP_URL}/manager/billing`,
    });

    return res.json({ url: session.url });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
