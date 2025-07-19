import { useState, useEffect } from 'react';
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
  const [manuallyInitialized, setManuallyInitialized] = useState(false);

  // Only show this component when in the entering card state
  if (flowState !== FLOW_STATES.ENTERING_CARD) {
    return null;
  }

  // Manual initialization of Stripe
  const initializeStripe = async () => {
    if (stripePromise || !stripeContext.publicKey) return;
    
    try {
      logInfo('Manually initializing Stripe Elements', { 
        publicKeyPrefix: stripeContext.publicKey.substring(0, 8) + '...' 
      });
      
      const stripe = await loadStripe(stripeContext.publicKey);
      setStripePromise(stripe);
      setManuallyInitialized(true);
    } catch (error) {
      logError('Failed to load Stripe.js', error);
    }
  };

  if (!manuallyInitialized) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 mb-4">
        <h2 className="text-xl font-semibold text-stripe-dark mb-4">Stripe Payment Form</h2>
        <p className="mb-4 text-gray-600">
          Stripe Elements needs to be initialized before you can enter card details.
        </p>
        <button 
          onClick={initializeStripe}
          className="form-button"
          disabled={!stripeContext.publicKey}
        >
          Initialize Stripe Elements
        </button>
      </div>
    );
  }

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
  const [currentStep, setCurrentStep] = useState('enterDetails');
  const [validatedBooking, setValidatedBooking] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [pmIdAttached, setPmIdAttached] = useState(false);

  const { 
    stripe: stripeContext, 
    booking, 
    setFlowState, 
    setPaymentMethod,
    isDepositRequired,
    formatAmount,
    logApiCall,
    _setError        // intentionally unused, kept for future error handling
  } = useFlow();
  
  const { logInfo, logSuccess, logError } = useLogger();

  // Set up API logger
  useEffect(() => {
    stripeApi.setApiLogger(logApiCall);
    eveveApi.setApiLogger(logApiCall);
  }, [logApiCall]);

  // Determine if we're handling a deposit or no-show protection
  const _paymentType = isDepositRequired() ? 'deposit' : 'noshow'; // reserved for future logic
  const intentType = stripeApi.getIntentType(stripeContext.clientSecret);
  
  // Step 1: Validate booking is still valid
  const validateBooking = async () => {
    setIsProcessing(true);
    setCardError('');
    setCurrentStep('validatingBooking');
    
    try {
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
      setValidatedBooking(true);
      setCurrentStep('readyForPayment');
      return true;
    } catch (error) {
      logError('Booking validation failed', error);
      setCardError('Booking validation failed: ' + error.message);
      setCurrentStep('error');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Step 2: Process payment with Stripe
  const processPayment = async () => {
    if (!stripe || !elements) {
      setCardError('Stripe.js has not loaded yet');
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
    
    if (!validatedBooking) {
      setCardError('Please validate the booking first');
      return;
    }

    setIsProcessing(true);
    setCardError('');
    setCurrentStep('processingPayment');

    try {
      // Get the CardElement
      const cardElement = elements.getElement(CardElement);

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
      }
      
      // Payment or setup successful
      const paymentMethodId = intentType === 'setup_intent' 
        ? result.setupIntent.payment_method
        : result.paymentIntent.payment_method;
      
      // Store the payment method ID
      setPaymentMethod(paymentMethodId);
      setPaymentResult({
        paymentMethodId,
        status: intentType === 'setup_intent' ? result.setupIntent.status : result.paymentIntent.status,
        type: intentType
      });
      
      logSuccess('Payment processed successfully', {
        paymentMethodId: paymentMethodId.substring(0, 5) + '...',
        status: intentType === 'setup_intent' ? result.setupIntent.status : result.paymentIntent.status
      });
      
      setCurrentStep('paymentComplete');
      return true;
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
      
      setCurrentStep('error');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Step 3: Attach payment method to booking
  const attachPaymentMethod = async () => {
    if (!paymentResult || !paymentResult.paymentMethodId) {
      setCardError('No payment method available to attach');
      return;
    }
    
    setIsProcessing(true);
    setCardError('');
    setCurrentStep('attachingPaymentMethod');
    
    try {
      // Call pm-id to attach the payment method to the booking
      const pmIdParams = {
        est: booking.est,
        uid: booking.uid,
        created: booking.created,
        pm: paymentResult.paymentMethodId,
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
        paymentMethodId: paymentResult.paymentMethodId.substring(0, 5) + '...'
      });
      
      setPmIdAttached(true);
      setCurrentStep('complete');
      return true;
    } catch (error) {
      // Log the error
      logError('Failed to attach payment method', error);
      
      // Set the error message
      setCardError(
        error.message ||
        'An error occurred while attaching the payment method to your booking.'
      );
      
      setCurrentStep('error');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Step 4: Proceed to customer details
  const proceedToCustomerDetails = () => {
    if (!pmIdAttached) {
      setCardError('Please attach the payment method first');
      return;
    }
    
    // Update flow state to move to customer details
    setFlowState(FLOW_STATES.CARD_CONFIRMED);
    logInfo('Proceeding to customer details form');
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
      
      {/* Manual Step Controls */}
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
        <h3 className="text-sm font-medium text-yellow-800 mb-2">Manual Payment Steps</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={validateBooking}
            disabled={isProcessing || validatedBooking}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              validatedBooking 
                ? 'bg-green-100 text-green-800 cursor-not-allowed' 
                : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
            }`}
          >
            {isProcessing && currentStep === 'validatingBooking'
              ? 'Validating...' 
              : validatedBooking 
                ? '✓ Booking Validated' 
                : '1. Validate Booking'}
          </button>
          
          <button
            onClick={processPayment}
            disabled={isProcessing || !validatedBooking || paymentResult}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              !validatedBooking 
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                : paymentResult
                  ? 'bg-green-100 text-green-800 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
            }`}
          >
            {isProcessing && currentStep === 'processingPayment'
              ? 'Processing...' 
              : paymentResult 
                ? '✓ Payment Processed' 
                : '2. Process Payment'}
          </button>
          
          <button
            onClick={attachPaymentMethod}
            disabled={isProcessing || !paymentResult || pmIdAttached}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              !paymentResult
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                : pmIdAttached
                  ? 'bg-green-100 text-green-800 cursor-not-allowed'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
            }`}
          >
            {isProcessing && currentStep === 'attachingPaymentMethod'
              ? 'Attaching...' 
              : pmIdAttached 
                ? '✓ Payment Method Attached' 
                : '3. Attach Payment Method'}
          </button>
          
          <button
            onClick={proceedToCustomerDetails}
            disabled={isProcessing || !pmIdAttached}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              !pmIdAttached
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
            }`}
          >
            {isProcessing 
              ? 'Processing...' 
              : '4. Proceed to Customer Details'}
          </button>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Complete each step manually to avoid API call loops
        </p>
      </div>
      
      <form className="space-y-4">
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
            disabled={currentStep !== 'enterDetails' && currentStep !== 'readyForPayment'}
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
            disabled={currentStep !== 'enterDetails' && currentStep !== 'readyForPayment'}
          />
        </div>
        
        {/* Card Element */}
        <div>
          <label htmlFor="card" className="form-label">
            Card Details
          </label>
          <div className={`StripeElement ${currentStep !== 'enterDetails' && currentStep !== 'readyForPayment' ? 'opacity-50' : ''}`}>
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
              disabled={currentStep !== 'enterDetails' && currentStep !== 'readyForPayment'}
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
        
        {/* Status Message */}
        {currentStep === 'complete' && (
          <div className="p-3 bg-green-50 text-green-800 rounded-md">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">Payment successfully processed!</span>
            </div>
            <p className="mt-1 text-sm">
              You can now proceed to enter customer details.
            </p>
          </div>
        )}
        
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
