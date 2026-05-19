import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed':
      console.log('Checkout completed:', event.data.object);
      break;
    case 'customer.subscription.deleted':
      console.log('Subscription cancelled:', event.data.object);
      break;
  }

  return res.json({ received: true });
}
