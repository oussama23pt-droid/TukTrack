import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Stripe using the secret key you saved in Vercel
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. MUST HAVE CORS headers so your phone doesn't block the request!
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 2. Parse the data sent from your phone
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { priceId, managerId, userId, billingCycle, plan_id, vehicle_slots } = body;

    // 3. Build the metadata exactly like your old server did
    const metadata = {
      managerId,
      plan_id,
      vehicle_slots: String(vehicle_slots),
      billing_cycle: billingCycle,
      ownerUid: userId,
    };

    const origin = req.headers.origin || 'https://tuk-track.vercel.app';

    // 4. Create the Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
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

    // 5. Send the URL back to your phone!
    res.status(200).json({ checkoutUrl: session.url });

  } catch (error: any) {
    console.error("Stripe Error:", error);
    res.status(500).json({ error: error.message });
  }
}
