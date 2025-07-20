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
  const [formErrors, setFormErrors] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  
  const { 
    stripe: stripeContext, 
    booking, 
    setFlowState, 
    setPaymentMethod,
    isDepositRequired,
    formatAmount,
    logApiCall,
    setError,
    customerDetails
  } = useFlow();
  
  const { logInfo, logSuccess, logError } = useLogger();

  // Expanded user details state - initialize with customerDetails from context
  const [userDetails, setUserDetails] = useState({
    firstName: customerDetails?.firstName || '',
    lastName: customerDetails?.lastName || '',
    email: customerDetails?.email || '',
    phone: '',
    notes: '',
    dietary: '',
    allergies: '',
    optem: 1, // Default opt-in for email marketing
  });
  
  const [currentStep, setCurrentStep] = useState('enterDetails');
  const [validatedBooking, setValidatedBooking] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [pmIdAttached, setPmIdAttached] = useState(false);

  // Set up API logger
  useEffect(() => {
    stripeApi.setApiLogger(logApiCall);
    eveveApi.setApiLogger(logApiCall);
  }, [logApiCall]);

  // Update user details when customerDetails from context changes
  useEffect(() => {
    if (customerDetails) {
      setUserDetails(prevDetails => ({
        ...prevDetails,
        firstName: customerDetails.firstName || prevDetails.firstName,
        lastName: customerDetails.lastName || prevDetails.lastName,
        email: customerDetails.email || prevDetails.email
      }));
      
      // Log that details were pre-filled
      if (customerDetails.firstName || customerDetails.lastName || customerDetails.email) {
        logInfo('Pre-filled customer details from previous step', {
          firstName: customerDetails.firstName,
          lastName: customerDetails.lastName,
          email: customerDetails.email
        });
      }
    }
  }, [customerDetails, logInfo]);

  // Determine if we're handling a deposit or no-show protection
  const _paymentType = isDepositRequired() ? 'deposit' : 'noshow'; // reserved for future logic
  const intentType = stripeApi.getIntentType(stripeContext.clientSecret);
  
  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox inputs
    if (type === 'checkbox') {
      setUserDetails(prev => ({
        ...prev,
        [name]: checked ? 1 : 0
      }));
    } else {
      setUserDetails(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    // Clear error for this field if it exists
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };
  
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
  
  // Validate initial payment form fields
  const validatePaymentForm = () => {
    const errors = {};
    
    if (!userDetails.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!userDetails.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!userDetails.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userDetails.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!cardComplete) {
      errors.card = 'Please complete your card details';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Validate full form for final submission
  const validateFullForm = () => {
    const errors = {};
    
    // Basic fields already validated in validatePaymentForm
    if (!userDetails.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!userDetails.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!userDetails.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userDetails.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    
    // Additional fields validation
    if (!userDetails.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^[+\d\s()-]{7,20}$/.test(userDetails.phone.trim())) {
      errors.phone = 'Please enter a valid phone number';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Step 2: Process payment with Stripe
  const processPayment = async () => {
    if (!stripe || !elements) {
      setCardError('Stripe.js has not loaded yet');
      return;
    }
    
    if (!validatePaymentForm()) {
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

      // Create billing details from user details
      const billingDetails = {
        name: `${userDetails.firstName} ${userDetails.lastName}`,
        email: userDetails.email
      };

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
      setCurrentStep('additionalDetails');
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
  
  // Step 4: Complete booking with customer details
  const completeBooking = async () => {
    // Validate all fields
    if (!validateFullForm()) {
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Revalidate booking before final submission
      const restoreParams = {
        est: booking.est,
        uid: booking.uid,
        type: 0
      };

      const restoreResponse = await eveveApi.restore(restoreParams);

      if (!restoreResponse.data.ok) {
        throw new Error('Booking validation failed before update');
      }

      // Log restore success
      logInfo('Booking revalidated successfully prior to customer update', {
        bookingId: booking.uid
      });
      
      // Prepare update parameters
      const updateParams = {
        est: booking.est,
        uid: booking.uid,
        lng: 'en',
        lastName: userDetails.lastName,
        firstName: userDetails.firstName,
        phone: userDetails.phone,
        email: userDetails.email,
        notes: userDetails.notes || '',
        dietary: userDetails.dietary || '',
        allergies: userDetails.allergies || '',
        optem: userDetails.optem
      };
      
      // Add any additional booking options if needed
      if (booking.bookopt) {
        updateParams.bookopt = booking.bookopt;
      }
      
      if (booking.guestopt) {
        updateParams.guestopt = booking.guestopt;
      }
      
      // Log the update attempt
      logInfo('Finalizing booking with customer details', {
        name: `${userDetails.firstName} ${userDetails.lastName}`,
        bookingId: booking.uid
      });
      
      // Call the update API
      const response = await eveveApi.update(updateParams);
      
      if (!response.data.ok) {
        throw new Error('Booking update failed');
      }
      
      // Log success
      logSuccess('Booking successfully completed', {
        bookingId: booking.uid,
        customerName: `${userDetails.firstName} ${userDetails.lastName}`,
        paymentStatus: isDepositRequired() 
          ? 'Deposit Charged' 
          : 'Card Stored for No-Show Protection'
      });
      
      // Show success message
      setShowSuccess(true);
      
      // Update flow state
      setFlowState(FLOW_STATES.COMPLETED);
      setCurrentStep('bookingComplete');
      
    } catch (error) {
      // Log the error
      logError('Failed to update booking with customer details', error);
      
      // Set error state
      setError({
        message: 'Failed to complete booking: ' + error.message
      });
      
      // Show error in form
      setFormErrors(prev => ({
        ...prev,
        submit: error.message || 'An error occurred while finalizing your booking'
      }));
      
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Format booking date for display
  const formatBookingDate = () => {
    if (!booking || !booking.date) return '';
    
    try {
      const [year, month, day] = booking.date.split('-');
      const date = new Date(year, month - 1, day);
      
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return booking.date;
    }
  };
  
  // Format booking time for display
  const formatBookingTime = () => {
    if (!booking || !booking.time) return '';
    
    const hour = parseInt(booking.time, 10);
    const isPM = hour >= 12;
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:00 ${isPM ? 'PM' : 'AM'}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      <h2 className="text-xl font-semibold text-stripe-dark mb-2">
        {currentStep === 'additionalDetails' || currentStep === 'bookingComplete' 
          ? 'Customer Details' 
          : 'Payment Details'}
      </h2>
      
      {/* Booking Summary */}
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
        <div className="mt-2 text-xs text-gray-600">
          <div><strong>Date:</strong> {formatBookingDate()}</div>
          <div><strong>Time:</strong> {formatBookingTime()}</div>
          <div><strong>Party Size:</strong> {booking?.covers || '0'} guests</div>
        </div>
      </div>
      
      {/* Manual Step Controls */}
      {currentStep !== 'bookingComplete' && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Manual Steps</h3>
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
            
            {currentStep === 'additionalDetails' && (
              <button
                onClick={completeBooking}
                disabled={isProcessing}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-800 hover:bg-blue-200 rounded-md transition-colors"
              >
                {isProcessing ? 'Processing...' : '4. Complete Booking'}
              </button>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Complete each step manually to avoid API call loops
          </p>
        </div>
      )}
      
      {/* Success Message */}
      {showSuccess && (
        <div className="mb-6 p-4 bg-green-50 text-green-800 rounded-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Booking successfully completed!</span>
          </div>
          <p className="mt-2 text-sm">
            A confirmation has been sent to your email address.
          </p>
        </div>
      )}
      
      {/* Form Error */}
      {formErrors.submit && (
        <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-md">
          <div className="flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Error:</span>
            <span className="ml-1">{formErrors.submit}</span>
          </div>
        </div>
      )}
      
      <form className="space-y-4">
        {/* Initial Payment Form Fields */}
        <div className={currentStep === 'bookingComplete' ? 'opacity-70' : ''}>
          {/* Name Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="firstName" className="form-label">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                value={userDetails.firstName}
                onChange={handleChange}
                className={`form-input ${formErrors.firstName ? 'border-red-500' : ''}`}
                placeholder="Jane"
                disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
                required
              />
              {formErrors.firstName && (
                <p className="mt-1 text-sm text-red-600">{formErrors.firstName}</p>
              )}
            </div>
            
            <div>
              <label htmlFor="lastName" className="form-label">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                value={userDetails.lastName}
                onChange={handleChange}
                className={`form-input ${formErrors.lastName ? 'border-red-500' : ''}`}
                placeholder="Smith"
                disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
                required
              />
              {formErrors.lastName && (
                <p className="mt-1 text-sm text-red-600">{formErrors.lastName}</p>
              )}
            </div>
          </div>
          
          {/* Email */}
          <div className="mb-4">
            <label htmlFor="email" className="form-label">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="jane.smith@example.com"
              value={userDetails.email}
              onChange={handleChange}
              className={`form-input ${formErrors.email ? 'border-red-500' : ''}`}
              disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
              required
            />
            {formErrors.email && (
              <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
            )}
          </div>
          
          {/* Card Element - Only show if not in additional details or complete state */}
          {currentStep !== 'additionalDetails' && currentStep !== 'bookingComplete' && (
            <div className="mb-4">
              <label htmlFor="card" className="form-label">
                Card Details <span className="text-red-500">*</span>
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
              
              {/* Test Card Info */}
              <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded mt-2">
                <p className="font-medium mb-1">Test Cards:</p>
                <p>Success: 4242 4242 4242 4242</p>
                <p>Decline: 4000 0000 0000 0002</p>
                <p>Use any future date, any 3 digits for CVC, and any postal code.</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Additional Details Fields - Only show after payment is attached */}
        {(currentStep === 'additionalDetails' || currentStep === 'bookingComplete') && (
          <div className={currentStep === 'bookingComplete' ? 'opacity-70' : ''}>
            <h3 className="text-lg font-medium text-gray-800 mb-3 mt-4">Additional Details</h3>
            
            {/* Phone */}
            <div className="mb-4">
              <label htmlFor="phone" className="form-label">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={userDetails.phone}
                onChange={handleChange}
                className={`form-input ${formErrors.phone ? 'border-red-500' : ''}`}
                placeholder="+1 (555) 123-4567"
                disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
                required
              />
              {formErrors.phone && (
                <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
              )}
            </div>
            
            {/* Notes */}
            <div className="mb-4">
              <label htmlFor="notes" className="form-label">
                Special Requests / Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={userDetails.notes}
                onChange={handleChange}
                className="form-input"
                rows="2"
                placeholder="Any special requests for your booking"
                disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
              />
            </div>
            
            {/* Dietary & Allergies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="dietary" className="form-label">
                  Dietary Requirements
                </label>
                <input
                  id="dietary"
                  name="dietary"
                  type="text"
                  value={userDetails.dietary}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Vegetarian, vegan, etc."
                  disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
                />
              </div>
              
              <div>
                <label htmlFor="allergies" className="form-label">
                  Allergies
                </label>
                <input
                  id="allergies"
                  name="allergies"
                  type="text"
                  value={userDetails.allergies}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Nuts, dairy, gluten, etc."
                  disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
                />
              </div>
            </div>
            
            {/* Marketing Opt-in */}
            <div className="flex items-start mt-4">
              <div className="flex items-center h-5">
                <input
                  id="optem"
                  name="optem"
                  type="checkbox"
                  checked={userDetails.optem === 1}
                  onChange={handleChange}
                  className="h-4 w-4 text-stripe-blue focus:ring-stripe-blue border-gray-300 rounded"
                  disabled={isProcessing || showSuccess || currentStep === 'bookingComplete'}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="optem" className="font-medium text-gray-700">
                  Email marketing
                </label>
                <p className="text-gray-500">
                  I would like to receive special offers and updates via email.
                </p>
              </div>
            </div>
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
