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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata },
      metadata,
      success_url: `${origin}/manager/billing?success=true`,
      cancel_url: `${origin}/manager/billing?canceled=true`,
    });

    return res.json({ checkoutUrl: session.url });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
