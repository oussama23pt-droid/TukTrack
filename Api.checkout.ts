import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2023-10-16' as any,
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. MUST HAVE CORS HEADERS for the mobile app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 2. Extract your variables from the request body
    // Note: Because you are bypassing the Express 'authenticate' middleware, 
    // your frontend needs to send ALL of these in the fetch body.
    const { 
      priceId, 
      customerId, 
      managerId, 
      plan_id, 
      vehicle_slots, 
      billingCycle, 
      userId, 
      ownerEmail, 
      nif 
    } = req.body;

    // 3. Add Tax ID (NIF) logic exactly from your screenshot
    if (nif) {
      try {
        const taxIds = await stripe.customers.listTaxIds(customerId);
        const hasTaxId = taxIds.data.some((tid) => tid.value === nif);

        if (!hasTaxId) {
          await stripe.customers.createTaxId(customerId, {
            type: "pt_nif" as any,
            value: nif,
          });
        }
      } catch (taxErr: any) {
        console.warn("Failed to add Tax ID to Stripe:", taxErr.message);
      }
    }

    // 4. Build Metadata exactly from your screenshot
    const metadata = {
      managerId,
      plan_id,
      vehicle_slots: String(vehicle_slots),
      billing_cycle: billingCycle,
      ownerUid: userId,
      ownerEmail: ownerEmail,
      nif: nif || ""
    };

    // Vercel gets the origin from headers, or fallback to your app URL
    const origin = req.headers.origin || process.env.APP_URL || 'https://tuk-track.vercel.app';

    // 5. Create the Stripe checkout session
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

    // 6. Return exactly what your frontend expects: checkoutUrl
    res.json({ checkoutUrl: session.url });

  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
}
