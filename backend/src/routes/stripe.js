/**
 * Stripe payment routes
 *
 * Handles:
 * - Checkout session creation
 * - Webhook events (subscription lifecycle)
 * - Customer portal session creation
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { supabase } = require('../config/supabaseClient');
const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, FRONTEND_URL } = require('../config/env');
const { verifyToken, extractToken } = require('../utils/auth');

// Initialize Stripe
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

/**
 * Middleware to require authentication
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = extractToken(authHeader);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * POST /api/stripe/create-checkout-session
 * Create a Stripe Checkout session for Pro subscription
 */
router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const userId = req.user.sub;
    const userEmail = req.user.email;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id, email')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    let customerId = profile.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || userEmail,
        metadata: {
          supabase_user_id: userId
        }
      });

      customerId = customer.id;

      // Save customer ID to database
      await supabase
        .from('user_profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/billing?canceled=true`,
      metadata: {
        supabase_user_id: userId
      }
    });

    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * POST /api/stripe/create-portal-session
 * Create a Stripe Customer Portal session for managing subscription
 */
router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const userId = req.user.sub;

    // Get user's Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile || !profile.stripe_customer_id) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${FRONTEND_URL}/billing`
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhook events
 *
 * Events handled:
 * - checkout.session.completed: New subscription created
 * - customer.subscription.updated: Subscription status changed
 * - customer.subscription.deleted: Subscription canceled
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'];

    let event;

    try {
      // Verify webhook signature
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Log webhook event
    await supabase
      .from('webhook_events')
      .insert({
        event_type: event.type,
        stripe_event_id: event.id,
        payload: event.data.object,
        processed: false
      });

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark webhook as processed
    await supabase
      .from('webhook_events')
      .update({ processed: true })
      .eq('stripe_event_id', event.id);

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);

    // Log error in webhook_events
    await supabase
      .from('webhook_events')
      .update({ error: error.message })
      .eq('stripe_event_id', event?.id);

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle checkout.session.completed event
 * Creates subscription record when checkout is successful
 */
async function handleCheckoutCompleted(session) {
  const userId = session.metadata.supabase_user_id;
  const customerId = session.customer;

  // Get subscription details from Stripe
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  // Create subscription record
  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end
    });

  if (subError) {
    console.error('Error creating subscription record:', subError);
    throw subError;
  }

  // Update user profile to Pro tier
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({
      subscription_tier: 'pro',
      stripe_customer_id: customerId
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating user profile:', profileError);
    throw profileError;
  }

  console.log(`✅ Subscription created for user ${userId}`);
}

/**
 * Handle subscription updated event
 * Updates subscription status and user tier
 */
async function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;

  // Find user by customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Update subscription record
  const { error: subError } = await supabase
    .from('subscriptions')
    .update({
      status: subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null
    })
    .eq('stripe_subscription_id', subscription.id);

  if (subError) {
    console.error('Error updating subscription:', subError);
  }

  // Update user tier based on subscription status
  const isActive = subscription.status === 'active' || subscription.status === 'trialing';
  const newTier = isActive ? 'pro' : 'free';

  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ subscription_tier: newTier })
    .eq('id', profile.id);

  if (profileError) {
    console.error('Error updating user tier:', profileError);
  }

  console.log(`✅ Subscription updated for user ${profile.id} - status: ${subscription.status}, tier: ${newTier}`);
}

/**
 * Handle subscription deleted event
 * Downgrades user to free tier
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;

  // Find user by customer ID
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) {
    console.error('User not found for customer:', customerId);
    return;
  }

  // Update subscription record
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id);

  // Downgrade user to free tier
  await supabase
    .from('user_profiles')
    .update({ subscription_tier: 'free' })
    .eq('id', profile.id);

  console.log(`✅ Subscription canceled for user ${profile.id} - downgraded to free tier`);
}

/**
 * GET /api/stripe/subscription
 * Get user's current subscription status
 */
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.user.sub;

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !subscription) {
      return res.json({ subscription: null, hasSubscription: false });
    }

    res.json({
      subscription,
      hasSubscription: true
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
