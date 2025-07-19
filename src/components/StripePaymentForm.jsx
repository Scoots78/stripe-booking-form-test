import { useState, useEffect, useCallback } from 'react';
import { useFlow, FLOW_STATES } from '../context/FlowContext';
import { CardElement, useStripe, useElements, Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import * as stripeApi from '../api/stripe';
import * as eveveApi from '../api/eveve';
import useLogger from '../hooks/useLogger';

// Stripe card element styling options
const cardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      fontFamily: 'Arial, sans-serif',
      '::placeholder': {
        color: '#aab7c4',
      },
    },
    invalid: {
      color: '#9e2146',
      iconColor: '#9e2146',
    },
  },
  hidePostalCode: true,
};

// Wrapper component that loads Stripe
const StripePaymentFormWrapper = () => {
  const { stripe: stripeContext, flowState } = useFlow();
  const [stripePromise, setStripePromise] = useState(null);
  const { logInfo, logError } = useLogger();

  // Only show this component when in the entering card state
  if (flowState !== FLOW_STATES.ENTERING_CARD) {
    return null;
  }

  // Initialize Stripe with the public key
  useEffect(() => {
    if (stripeContext.publicKey && !stripePromise) {
      logInfo('Initializing Stripe Elements', { publicKeyPrefix: stripeContext.publicKey.substring(0, 8) + '...' });
      
      // Load Stripe.js
      const loadStripeInstance = async () => {
        try {
          const stripe = await loadStripe(stripeContext.publicKey);
          setStripePromise(stripe);
        } catch (error) {
          logError('Failed to load Stripe.js', error);
        }
      };
      
      loadStripeInstance();
    }
  }, [stripeContext.publicKey, stripePromise, logInfo, logError]);

  if (!stripePromise) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-4">
        <h2 className="text-xl font-semibold text-stripe-dark mb-4">Loading Stripe...</h2>
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <StripePaymentForm />
    </Elements>
  );
};

// The actual payment form component
const StripePaymentForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardError, setCardError] = useState('');
  const [cardComplete, setCardComplete] = useState(false);
  const [billingDetails, setBillingDetails] = useState({
    name: '',
    email: '',
  });

  const { 
    stripe: stripeContext, 
    booking, 
    setFlowState, 
    setPaymentMethod,
    isDepositRequired,
    formatAmount,
    logApiCall,
    setError
  } = useFlow();
  
  const { logInfo, logSuccess, logError } = useLogger();

  // Set up API logger
  useEffect(() => {
    stripeApi.setApiLogger(logApiCall);
    eveveApi.setApiLogger(logApiCall);
  }, [logApiCall]);

  // Determine if we're handling a deposit or no-show protection
  const paymentType = isDepositRequired() ? 'deposit' : 'noshow';
  const intentType = stripeApi.getIntentType(stripeContext.clientSecret);
  
  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js has not loaded yet
      return;
    }

    if (!cardComplete) {
      setCardError('Please complete your card details');
      return;
    }

    if (!billingDetails.name.trim()) {
      setCardError('Please provide the cardholder name');
      return;
    }

    setIsProcessing(true);
    setCardError('');

    try {
      // Get the CardElement
      const cardElement = elements.getElement(CardElement);

      // Verify booking is still valid by calling restore
      const restoreParams = {
        est: booking.est,
        uid: booking.uid,
        type: 0
      };
      
      const restoreResponse = await eveveApi.restore(restoreParams);
      
      if (!restoreResponse.data.ok) {
        throw new Error('Booking is no longer valid');
      }

      logInfo('Booking verified as valid', { uid: booking.uid });

      // Process payment based on intent type
      let result;
      
      if (intentType === 'setup_intent') {
        // No-show protection - just store the card
        logInfo('Processing setup intent for no-show protection');
        
        result = await stripe.confirmCardSetup(stripeContext.clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: billingDetails
          }
        });
      } else {
        // Deposit - charge the card now
        logInfo('Processing payment intent for deposit', { 
          amount: formatAmount(stripeContext.amount) 
        });
        
        result = await stripe.confirmCardPayment(stripeContext.clientSecret, {
          payment_method: {
            card: cardElement,
            billing_details: billingDetails
          }
        });
      }

      if (result.error) {
        // Show error to your customer
        throw result.error;
      } else {
        // Payment or setup successful
        const paymentMethodId = intentType === 'setup_intent' 
          ? result.setupIntent.payment_method
          : result.paymentIntent.payment_method;
        
        // Store the payment method ID
        setPaymentMethod(paymentMethodId);
        
        // Call pm-id to attach the payment method to the booking
        const pmIdParams = {
          est: booking.est,
          uid: booking.uid,
          created: booking.created,
          pm: paymentMethodId,
          total: stripeContext.amount,
          totalFloat: stripeContext.amount / 100,
          type: 0
        };
        
        const pmIdResponse = await eveveApi.pmId(pmIdParams);
        
        if (!pmIdResponse.data.ok) {
          throw new Error('Failed to attach payment method to booking');
        }

        // Log success
        const successMessage = isDepositRequired()
          ? `Deposit of ${formatAmount(stripeContext.amount)} successfully charged`
          : 'Card successfully stored for no-show protection';
          
        logSuccess(successMessage, {
          paymentMethodId: paymentMethodId.substring(0, 5) + '...',
          cardBrand: result.paymentMethod?.card?.brand,
          last4: result.paymentMethod?.card?.last4
        });
        
        // Update flow state to move to customer details
        setFlowState(FLOW_STATES.CARD_CONFIRMED);
      }
    } catch (error) {
      // Log the error
      logError('Payment processing failed', {
        message: error.message,
        code: error.code,
        type: error.type,
        decline_code: error.decline_code
      });
      
      // Set the error message
      setCardError(
        error.message ||
        'An error occurred while processing your payment. Please try again.'
      );
      
      // Set global error state
      setError({
        message: 'Payment processing failed: ' + error.message
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      <h2 className="text-xl font-semibold text-stripe-dark mb-2">Payment Details</h2>
      
      {/* Payment Type Info */}
      <div className="mb-4 p-3 bg-blue-50 rounded-md">
        <p className="text-sm text-blue-800">
          {isDepositRequired() ? (
            <>
              <span className="font-semibold">Deposit Required:</span> {formatAmount(stripeContext.amount)}
              <span className="block mt-1 text-xs">Your card will be charged immediately.</span>
            </>
          ) : (
            <>
              <span className="font-semibold">No-Show Protection:</span> {formatAmount(stripeContext.amount)}
              <span className="block mt-1 text-xs">Your card will only be charged in case of a no-show.</span>
            </>
          )}
        </p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Cardholder Name */}
        <div>
          <label htmlFor="name" className="form-label">
            Cardholder Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="Jane Smith"
            required
            value={billingDetails.name}
            onChange={(e) => {
              setBillingDetails({ ...billingDetails, name: e.target.value });
            }}
            className="form-input"
          />
        </div>
        
        {/* Email (optional) */}
        <div>
          <label htmlFor="email" className="form-label">
            Email (optional)
          </label>
          <input
            id="email"
            type="email"
            placeholder="jane.smith@example.com"
            value={billingDetails.email}
            onChange={(e) => {
              setBillingDetails({ ...billingDetails, email: e.target.value });
            }}
            className="form-input"
          />
        </div>
        
        {/* Card Element */}
        <div>
          <label htmlFor="card" className="form-label">
            Card Details
          </label>
          <div className="StripeElement">
            <CardElement
              id="card"
              options={cardElementOptions}
              onChange={(e) => {
                setCardComplete(e.complete);
                if (e.error) {
                  setCardError(e.error.message);
                } else {
                  setCardError('');
                }
              }}
            />
          </div>
          {cardError && (
            <p className="mt-1 text-sm text-red-600">{cardError}</p>
          )}
        </div>
        
        {/* Test Card Info */}
        <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
          <p className="font-medium mb-1">Test Cards:</p>
          <p>Success: 4242 4242 4242 4242</p>
          <p>Decline: 4000 0000 0000 0002</p>
          <p>Use any future date, any 3 digits for CVC, and any postal code.</p>
        </div>
        
        {/* Submit Button */}
        <button
          type="submit"
          disabled={isProcessing || !stripe || !cardComplete}
          className="form-button w-full"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : (
            <span>
              {isDepositRequired() 
                ? `Pay Deposit (${formatAmount(stripeContext.amount)})` 
                : 'Secure Booking with Card'}
            </span>
          )}
        </button>
        
        {/* Secure Badge */}
        <div className="flex items-center justify-center text-xs text-gray-500 mt-4">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Secure payment powered by Stripe
        </div>
      </form>
    </div>
  );
};

export default StripePaymentFormWrapper;
