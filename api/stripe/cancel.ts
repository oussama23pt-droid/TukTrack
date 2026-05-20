import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { managerId } = req.body;
    const subscription = await stripe.subscriptions.cancel(managerId);
    return res.json({ subscription });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
