import { loadStripe } from '@stripe/stripe-js';

// Store a reference to the logging function that will be set later
let logApiCallFunction = null;

// Store the Stripe instance once loaded
let stripeInstance = null;

/**
 * Set the API logger function from the Flow context
 * @param {Function} loggerFunction - The logging function from Flow context
 */
export const setApiLogger = (loggerFunction) => {
  logApiCallFunction = loggerFunction;
};

/**
 * Initialize Stripe with the public key
 * @param {string} publicKey - Stripe public key from Eveve
 * @returns {Promise<Stripe>} - Initialized Stripe instance
 */
export const initializeStripe = async (publicKey) => {
  try {
    // Log the initialization attempt
    if (logApiCallFunction) {
      logApiCallFunction(
        'Stripe Initialize',
        { publicKey: publicKey ? `${publicKey.substring(0, 8)}...` : null },
        { initialized: !!publicKey }
      );
    }

    if (!publicKey) {
      throw new Error('Stripe public key is required');
    }

    // Load and initialize Stripe
    stripeInstance = await loadStripe(publicKey);
    return stripeInstance;
  } catch (error) {
    // Log the error
    if (logApiCallFunction) {
      logApiCallFunction(
        'ERROR: Stripe Initialize',
        { publicKey: publicKey ? `${publicKey.substring(0, 8)}...` : null },
        null,
        { message: error.message }
      );
    }
    throw error;
  }
};

/**
 * Get the current Stripe instance or initialize a new one
 * @param {string} publicKey - Stripe public key (optional if already initialized)
 * @returns {Promise<Stripe>} - Stripe instance
 */
export const getStripe = async (publicKey = null) => {
  if (stripeInstance) return stripeInstance;
  if (!publicKey) throw new Error('Stripe not initialized and no public key provided');
  return initializeStripe(publicKey);
};

/**
 * Confirm a Stripe Setup Intent (for no-show protection)
 * @param {string} clientSecret - The client secret from the SetupIntent
 * @param {Object} paymentMethod - The payment method data or ID
 * @param {Object} options - Additional confirmation options
 * @returns {Promise<Object>} - The confirmation result
 */
export const confirmSetupIntent = async (clientSecret, paymentMethod, options = {}) => {
  const startTime = new Date();
  
  try {
    const stripe = await getStripe();
    
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Determine if we have a payment method ID or element
    const paymentMethodParam = typeof paymentMethod === 'string' 
      ? { payment_method: paymentMethod } 
      : { payment_method: paymentMethod };
    
    // Confirm the setup intent
    const result = await stripe.confirmSetupIntent(
      clientSecret,
      {
        ...paymentMethodParam,
        ...options
      }
    );
    
    const duration = new Date() - startTime;
    
    // Log the successful confirmation
    if (logApiCallFunction) {
      logApiCallFunction(
        'Stripe confirmSetupIntent',
        {
          clientSecret: clientSecret ? `${clientSecret.substring(0, 10)}...` : null,
          paymentMethod: typeof paymentMethod === 'string' 
            ? `${paymentMethod.substring(0, 5)}...` 
            : 'PaymentElement',
          duration: `${duration}ms`,
        },
        {
          status: result.setupIntent?.status,
          id: result.setupIntent?.id,
          payment_method: result.setupIntent?.payment_method,
        }
      );
    }
    
    return result;
  } catch (error) {
    const duration = new Date() - startTime;
    
    // Log the error
    if (logApiCallFunction) {
      logApiCallFunction(
        'ERROR: Stripe confirmSetupIntent',
        {
          clientSecret: clientSecret ? `${clientSecret.substring(0, 10)}...` : null,
          duration: `${duration}ms`,
        },
        null,
        {
          message: error.message,
          code: error.code,
          type: error.type,
          decline_code: error.decline_code,
        }
      );
    }
    
    throw error;
  }
};

/**
 * Confirm a Stripe Payment Intent (for deposits)
 * @param {string} clientSecret - The client secret from the PaymentIntent
 * @param {Object} paymentMethod - The payment method data or ID
 * @param {Object} options - Additional confirmation options
 * @returns {Promise<Object>} - The confirmation result
 */
export const confirmPaymentIntent = async (clientSecret, paymentMethod, options = {}) => {
  const startTime = new Date();
  
  try {
    const stripe = await getStripe();
    
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Determine if we have a payment method ID or element
    const paymentMethodParam = typeof paymentMethod === 'string' 
      ? { payment_method: paymentMethod } 
      : { payment_method: paymentMethod };
    
    // Confirm the payment intent
    const result = await stripe.confirmPaymentIntent(
      clientSecret,
      {
        ...paymentMethodParam,
        ...options
      }
    );
    
    const duration = new Date() - startTime;
    
    // Log the successful confirmation
    if (logApiCallFunction) {
      logApiCallFunction(
        'Stripe confirmPaymentIntent',
        {
          clientSecret: clientSecret ? `${clientSecret.substring(0, 10)}...` : null,
          paymentMethod: typeof paymentMethod === 'string' 
            ? `${paymentMethod.substring(0, 5)}...` 
            : 'PaymentElement',
          duration: `${duration}ms`,
        },
        {
          status: result.paymentIntent?.status,
          id: result.paymentIntent?.id,
          amount: result.paymentIntent?.amount,
          payment_method: result.paymentIntent?.payment_method,
        }
      );
    }
    
    return result;
  } catch (error) {
    const duration = new Date() - startTime;
    
    // Log the error
    if (logApiCallFunction) {
      logApiCallFunction(
        'ERROR: Stripe confirmPaymentIntent',
        {
          clientSecret: clientSecret ? `${clientSecret.substring(0, 10)}...` : null,
          duration: `${duration}ms`,
        },
        null,
        {
          message: error.message,
          code: error.code,
          type: error.type,
          decline_code: error.decline_code,
        }
      );
    }
    
    throw error;
  }
};

/**
 * Create a payment method directly with Stripe
 * @param {Object} paymentMethodData - Card and billing details
 * @returns {Promise<Object>} - The created payment method
 */
export const createPaymentMethod = async (paymentMethodData) => {
  const startTime = new Date();
  
  try {
    const stripe = await getStripe();
    
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    
    // Create the payment method
    const result = await stripe.createPaymentMethod({
      type: 'card',
      ...paymentMethodData
    });
    
    const duration = new Date() - startTime;
    
    // Log the successful creation
    if (logApiCallFunction) {
      logApiCallFunction(
        'Stripe createPaymentMethod',
        {
          type: 'card',
          duration: `${duration}ms`,
        },
        {
          id: result.paymentMethod?.id,
          type: result.paymentMethod?.type,
          card: {
            brand: result.paymentMethod?.card?.brand,
            last4: result.paymentMethod?.card?.last4,
            exp_month: result.paymentMethod?.card?.exp_month,
            exp_year: result.paymentMethod?.card?.exp_year,
          }
        }
      );
    }
    
    return result;
  } catch (error) {
    const duration = new Date() - startTime;
    
    // Log the error
    if (logApiCallFunction) {
      logApiCallFunction(
        'ERROR: Stripe createPaymentMethod',
        {
          type: 'card',
          duration: `${duration}ms`,
        },
        null,
        {
          message: error.message,
          code: error.code,
          type: error.type,
        }
      );
    }
    
    throw error;
  }
};

/**
 * Handle Stripe error responses and format them for display
 * @param {Object} error - Stripe error object
 * @returns {Object} - Formatted error object
 */
export const handleStripeError = (error) => {
  // Extract the most relevant error information
  return {
    message: error.message || 'An unknown error occurred',
    code: error.code,
    type: error.type,
    decline_code: error.decline_code,
    param: error.param,
  };
};

/**
 * Determine if a client secret is for a SetupIntent or PaymentIntent
 * @param {string} clientSecret - The client secret from Eveve
 * @returns {string} - 'setup_intent' or 'payment_intent'
 */
export const getIntentType = (clientSecret) => {
  if (!clientSecret) return null;
  
  if (clientSecret.startsWith('seti_')) {
    return 'setup_intent';
  } else if (clientSecret.startsWith('pi_')) {
    return 'payment_intent';
  }
  
  // Try to infer from the secret format
  return clientSecret.includes('_seti_') ? 'setup_intent' : 'payment_intent';
};

/**
 * Confirm the appropriate intent type based on client secret
 * @param {string} clientSecret - The client secret from Eveve
 * @param {Object} paymentMethod - The payment method data or ID
 * @param {Object} options - Additional confirmation options
 * @returns {Promise<Object>} - The confirmation result
 */
export const confirmIntent = async (clientSecret, paymentMethod, options = {}) => {
  const intentType = getIntentType(clientSecret);
  
  if (intentType === 'setup_intent') {
    return confirmSetupIntent(clientSecret, paymentMethod, options);
  } else {
    return confirmPaymentIntent(clientSecret, paymentMethod, options);
  }
};

// Export all functions
export default {
  initializeStripe,
  getStripe,
  confirmSetupIntent,
  confirmPaymentIntent,
  createPaymentMethod,
  handleStripeError,
  getIntentType,
  confirmIntent,
  setApiLogger,
};

/**
 * Update the description / metadata on a PaymentIntent or SetupIntent.
 * ───────────────────────────────────────────────────────────────────
 * ⚠  THIS **MUST** BE IMPLEMENTED ON A SECURE SERVER.
 *    Browser-side code cannot use your Stripe secret key.  This placeholder
 *    exists so frontend calls compile; implement server call separately.
 *
 * @param {string} intentId - PaymentIntent / SetupIntent id (e.g. pi_123…)
 * @param {string} description - New description including customer details
 * @param {Object} [metadata] - Extra metadata to attach
 */
export const updatePaymentDescription = async (
  intentId,
  description,
  metadata = {}
) => {
  if (logApiCallFunction) {
    logApiCallFunction(
      'Stripe updatePaymentDescription (placeholder)',
      { intentId, description, metadata },
      { status: 'NOT_IMPLEMENTED' }
    );
  }
  /* 
   * Do NOT throw an error here—this is a frontend-only placeholder. 
   * Returning a resolved promise allows the calling code to continue
   * without logging an error while still surfacing that the call is
   * not yet implemented on the backend.
   */
  return Promise.resolve({
    ok: true,
    placeholder: true,
    message: 'updatePaymentDescription skipped – requires server-side implementation',
  });
};

/**
 * Refund a captured PaymentIntent.
 * ─────────────────────────────────
 * ⚠ Requires secret-key; placeholder for now.
 *
 * @param {string} paymentIntentId - The id of the intent to refund
 * @param {number|null} [amount=null] - Amount in cents. Null = full refund
 */
export const refundPayment = async (paymentIntentId, amount = null) => {
  if (logApiCallFunction) {
    logApiCallFunction(
      'Stripe refundPayment (placeholder)',
      { paymentIntentId, amount },
      { status: 'NOT_IMPLEMENTED' }
    );
  }
  /*
   * Placeholder – avoid throwing to keep UI free of error noise.
   * Backend implementation should handle real refunds.
   */
  return Promise.resolve({
    ok: true,
    placeholder: true,
    message: 'refundPayment skipped – requires server-side implementation',
  });
};
