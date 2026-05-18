import Stripe from 'stripe';

// Initialize Stripe 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16' as any,
});

// We removed the @vercel/node import and are using standard 'any' types here to bypass the TS error
export default async function handler(req: any, res: any) {
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { priceId, managerId, userId, billingCycle, plan_id, vehicle_slots } = body;

    const metadata = {
      managerId,
      plan_id,
      vehicle_slots: String(vehicle_slots),
      billing_cycle: billingCycle,
      ownerUid: userId,
    };

    const origin = req.headers.origin || 'https://tuk-track.vercel.app';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: metadata,
      },
      metadata: metadata,
      success_url: `${origin}/manager/billing?success=true`,
      cancel_url: `${origin}/manager/billing?canceled=true`,
    });

    res.status(200).json({ checkoutUrl: session.url });

  } catch (error: any) {
    console.error("Stripe Error:", error);
    res.status(500).json({ error: error.message });
  }
}
