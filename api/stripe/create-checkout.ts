import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { priceId, customerId, metadata } = req.body;
    const origin = req.headers.origin || process.env.APP_URL;

    // If customerId looks like a Firebase UID (not a Stripe customer), create one
    let stripeCustomerId = customerId;
    if (!customerId || !customerId.startsWith('cus_')) {
      const customer = await stripe.customers.create({
        metadata: { firebaseUid: customerId }
      });
      stripeCustomerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata },
      metadata,
      success_url: `${origin}/manager/dashboard?success=true`,
      cancel_url: `${origin}/manager/billing?canceled=true`,
    });

    return res.json({ 
      checkoutUrl: session.url,
      stripeCustomerId 
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
