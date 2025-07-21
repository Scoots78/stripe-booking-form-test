import { useState, useEffect, useCallback } from 'react';
import { useFlow, FLOW_STATES } from '../context/FlowContext';
import { CardElement, useStripe, useElements, Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import * as stripeApi from '../api/stripe';
import * as eveveApi from '../api/eveve';
import useLogger from '../hooks/useLogger';

// Sample test URLs for quick testing
const SAMPLE_URLS = [
  {
    label: 'TestNZA - Deposit Required (card=2)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=10&date=2025-08-01&time=20&area=1000'
  },
  {
    label: 'TestNZA - No-Show Protection (card=1)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=4&date=2025-08-01&time=12'
  },
  {
    label: 'TestNZA - Card Required (Event)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=4&date=2025-08-01&time=18&event=1000&area=1000'
  },
  {
    label: 'TestNZA - Deposit (no area param)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=6&date=2025-08-01&time=18'
  },
  {
    label: 'TestNZA - No card required',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=2&date=2025-08-01&time=12'
  }
];

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

// Wrapper component for Stripe Elements
const UnifiedBookingFormWrapper = () => {
  const { stripe: stripeContext, flowState } = useFlow();
  const [stripePromise, setStripePromise] = useState(null);
  const { logInfo, logError } = useLogger();

  // Initialize Stripe when needed
  useEffect(() => {
    if (flowState === FLOW_STATES.ENTERING_CARD && stripeContext.publicKey && !stripePromise) {
      const initializeStripe = async () => {
        try {
          logInfo('Initializing Stripe Elements', { 
            publicKeyPrefix: stripeContext.publicKey.substring(0, 8) + '...' 
          });
          
          const stripe = await loadStripe(stripeContext.publicKey);
          setStripePromise(stripe);
        } catch (error) {
          logError('Failed to load Stripe.js', error);
        }
      };
      
      initializeStripe();
    }
  }, [flowState, stripeContext.publicKey, stripePromise, logInfo, logError]);

  return (
    <Elements stripe={stripePromise}>
      <UnifiedBookingForm stripeLoaded={!!stripePromise} />
    </Elements>
  );
};

// The main unified booking form component
const UnifiedBookingForm = ({ stripeLoaded }) => {
  // Stripe hooks
  const stripe = useStripe();
  const elements = useElements();
  
  // URL and loading state
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  
  // Stage completion flags
  const [holdComplete, setHoldComplete] = useState(false);
  const [customerDetailsComplete, setCustomerDetailsComplete] = useState(false);
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [depositInfoLoaded, setDepositInfoLoaded] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [paymentMethodAttached, setPaymentMethodAttached] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);
  
  // Form data state
  const [customerDetails, setCustomerDetails] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
    dietary: '',
    allergies: '',
    optem: 1 // Default opt-in for email marketing
  });
  
  // Error state
  const [formErrors, setFormErrors] = useState({});
  const [cardError, setCardError] = useState('');
  
  // Current step tracking
  const [currentStep, setCurrentStep] = useState('idle');
  
  // Get context values
  const { 
    booking,
    setBooking, 
    setStripeKeys, 
    setPaymentType,
    setFlowState, 
    flowState,
    isCardRequired,
    isDepositRequired,
    formatAmount,
    logApiCall,
    setError,
    setPaymentMethod,
    setCustomerDetails: setContextCustomerDetails,
    resetState,
    stripe: stripeContext
  } = useFlow();
  
  const { logInfo, logSuccess, logError } = useLogger();
  
  // Set up API logger
  useEffect(() => {
    eveveApi.setApiLogger(logApiCall);
    stripeApi.setApiLogger(logApiCall);
  }, [logApiCall]);
  
  // Parse URL to extract parameters
  const parseHoldUrl = useCallback((url) => {
    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams.entries());
      
      // Validate required parameters
      // 'area' is optional
      const requiredParams = ['est', 'covers', 'date', 'time'];
      const missingParams = requiredParams.filter(param => !params[param]);
      
      if (missingParams.length > 0) {
        return {
          isValid: false,
          error: `Missing required parameters: ${missingParams.join(', ')}`,
          params: null
        };
      }
      
      return {
        isValid: true,
        error: null,
        params: {
          est: params.est,
          lng: params.lng || 'en',
          covers: parseInt(params.covers, 10),
          date: params.date,
          time: parseInt(params.time, 10),
          // include area only if present; it's optional
          ...(params.area ? { area: parseInt(params.area, 10) } : {})
        }
      };
    } catch (error) {
      return {
        isValid: false,
        error: 'Invalid URL format',
        params: null
      };
    }
  }, []);
  
  // Validate customer details
  const validateCustomerDetails = () => {
    const errors = {};
    
    if (!customerDetails.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!customerDetails.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!customerDetails.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerDetails.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    
    setFormErrors(prev => ({
      ...prev,
      ...errors
    }));
    
    return Object.keys(errors).length === 0;
  };
  
  // Validate full form (including phone)
  const validateFullForm = () => {
    const errors = {};
    
    // Basic fields validation
    if (!customerDetails.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!customerDetails.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!customerDetails.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerDetails.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    
    // Additional fields validation
    if (!customerDetails.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^[+\d\s()-]{7,20}$/.test(customerDetails.phone.trim())) {
      errors.phone = 'Please enter a valid phone number';
    }
    
    setFormErrors(prev => ({
      ...prev,
      ...errors
    }));
    
    return Object.keys(errors).length === 0;
  };
  
  // Handle customer details input change
  const handleCustomerDetailsChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox inputs
    if (type === 'checkbox') {
      setCustomerDetails(prev => ({
        ...prev,
        [name]: checked ? 1 : 0
      }));
    } else {
      setCustomerDetails(prev => ({
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
  
  // Save customer details to context
  const saveCustomerDetails = () => {
    if (validateCustomerDetails()) {
      // Save to context for other components
      setContextCustomerDetails({
        firstName: customerDetails.firstName,
        lastName: customerDetails.lastName,
        email: customerDetails.email
      });
      
      setCustomerDetailsComplete(true);
      setCurrentStep('customerDetailsComplete');
      
      logInfo('Customer details collected', {
        name: `${customerDetails.firstName} ${customerDetails.lastName}`,
        email: customerDetails.email
      });
      
      return true;
    }
    return false;
  };
  
  // Process the booking hold
  const processHold = useCallback(async (holdParams) => {
    setIsLoading(true);
    setFlowState(FLOW_STATES.HOLDING);
    setCurrentStep('holding');
    
    try {
      const response = await eveveApi.hold(holdParams);
      
      if (!response.data.ok) {
        throw new Error('Booking hold failed');
      }
      
      // Extract and store booking data
      const bookingData = {
        uid: response.data.uid,
        created: response.data.created,
        card: response.data.card,
        perHead: response.data.perHead,
        est: holdParams.est,
        covers: holdParams.covers,
        date: holdParams.date,
        time: holdParams.time,
        // include area only when provided in the original hold parameters
        ...(holdParams.area ? { area: holdParams.area } : {})
      };
      
      setBooking(bookingData);
      setHoldComplete(true);
      setCurrentStep('holdComplete');
      
      // Log the booking status
      logInfo(`Booking hold successful (UID: ${bookingData.uid})`, {
        cardRequired: bookingData.card > 0,
        cardType: bookingData.card === 1 ? 'No-Show Protection' : 
                 bookingData.card === 2 ? 'Deposit Required' : 'None',
        amount: bookingData.perHead ? `$${(bookingData.perHead / 100).toFixed(2)} per person` : '$0.00'
      });
      
    } catch (error) {
      logError('Booking hold failed', error);
      setError({
        message: 'Booking hold failed: ' + error.message
      });
      setCurrentStep('error');
    } finally {
      setIsLoading(false);
    }
  }, [
    setFlowState, 
    setBooking, 
    logInfo, 
    logError, 
    setError
  ]);
  
  // Fetch Stripe keys using pi-get
  const fetchStripeKeys = useCallback(async () => {
    if (!booking) return;
    
    // Ensure customer details are collected before proceeding
    if (!customerDetailsComplete) {
      logError('Customer details must be collected before fetching Stripe keys');
      return;
    }
    
    try {
      setIsLoading(true);
      setCurrentStep('fetchingKeys');
      setFlowState(FLOW_STATES.AWAITING_STRIPE);
      
      // Create a friendly customer description for Stripe
      const customerDescription = `${customerDetails.firstName}_${customerDetails.lastName}_-_${customerDetails.email}`;
      
      const piGetParams = {
        est: booking.est || 'TestNZA',
        uid: booking.uid,
        type: 0,
        // Use customer details for friendly description in Stripe admin
        desc: customerDescription,
        created: booking.created
      };
      
      const response = await eveveApi.piGet(piGetParams);
      
      if (!response.data.client_secret || !response.data.public_key) {
        throw new Error('Missing Stripe keys in pi-get response');
      }
      
      setStripeKeys({
        clientSecret: response.data.client_secret,
        publicKey: response.data.public_key,
        cust: response.data.cust
      });
      
      logInfo('Stripe keys retrieved successfully', {
        customerDescription
      });
      
      setKeysLoaded(true);
      setCurrentStep('keysLoaded');
      
      return true;
    } catch (error) {
      logError('Failed to retrieve Stripe keys', error);
      setError({
        message: 'Failed to retrieve Stripe keys: ' + error.message
      });
      setCurrentStep('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [booking, setFlowState, setStripeKeys, logInfo, logError, setError, customerDetails, customerDetailsComplete]);
  
  // Fetch deposit information
  const fetchDepositInfo = useCallback(async () => {
    if (!booking) return;
    
    try {
      setIsLoading(true);
      setCurrentStep('fetchingDeposit');
      
      const depositParams = {
        est: booking.est || 'TestNZA',
        UID: booking.uid,
        created: booking.created,
        lang: 'english',
        type: 0
      };
      
      const response = await eveveApi.depositGet(depositParams);
      
      if (!response.data.ok) {
        throw new Error('Deposit-get request failed');
      }
      
      setPaymentType(response.data);
      
      // Log the payment type
      const paymentType = response.data.code === 1 ? 'No-Show Protection' : 'Deposit Required';
      logInfo(`Payment type determined: ${paymentType}`, {
        code: response.data.code,
        amount: `$${(response.data.total / 100).toFixed(2)}`,
        message: response.data.message
      });
      
      setDepositInfoLoaded(true);
      setCurrentStep('depositLoaded');
      
      return true;
    } catch (error) {
      logError('Failed to retrieve deposit information', error);
      setError({
        message: 'Failed to retrieve deposit information: ' + error.message
      });
      setCurrentStep('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [booking, setPaymentType, logInfo, logError, setError]);
  
  // Proceed to card entry
  const proceedToCardEntry = useCallback(() => {
    if (!keysLoaded || !depositInfoLoaded) {
      logError('Cannot proceed to card entry', { 
        keysLoaded, 
        depositInfoLoaded 
      });
      return;
    }
    
    setFlowState(FLOW_STATES.ENTERING_CARD);
    setCurrentStep('enteringCard');
    logInfo('Proceeding to card entry');
  }, [keysLoaded, depositInfoLoaded, setFlowState, logInfo, logError]);
  
  // Proceed to user details (when no card required)
  const proceedToUserDetails = useCallback(() => {
    setFlowState(FLOW_STATES.COLLECTING_USER);
    setCurrentStep('collectingUser');
    logInfo('Proceeding to customer details');
  }, [setFlowState, logInfo]);
  
  // Process payment with Stripe
  const processPayment = async () => {
    if (!stripe || !elements) {
      setCardError('Stripe.js has not loaded yet');
      return false;
    }
    
    if (!cardComplete) {
      setCardError('Please complete your card details');
      return false;
    }

    setCardError('');
    setCurrentStep('processingPayment');

    try {
      // Get the CardElement
      const cardElement = elements.getElement(CardElement);

      // Create billing details from customer details
      const billingDetails = {
        name: `${customerDetails.firstName} ${customerDetails.lastName}`,
        email: customerDetails.email
      };

      // Process payment based on intent type
      const intentType = stripeApi.getIntentType(stripeContext.clientSecret);
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
      
      logSuccess('Payment processed successfully', {
        paymentMethodId: paymentMethodId.substring(0, 5) + '...',
        status: intentType === 'setup_intent' ? result.setupIntent.status : result.paymentIntent.status
      });
      
      setPaymentProcessed(true);
      return {
        success: true,
        paymentMethodId
      };
    } catch (error) {
      // Log the error
      logError('Payment processing failed', {
        message: error.message,
        code: error.code,
        type: error.type,
        decline_code: error.decline_code
      });
      
      return {
        success: false,
        error
      };
    }
  };
  
  // Attach payment method to booking
  const attachPaymentMethod = async (paymentMethodId) => {
    if (!paymentMethodId) {
      return {
        success: false,
        error: new Error('No payment method available to attach')
      };
    }
    
    setCurrentStep('attachingPaymentMethod');
    
    try {
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
        paymentMethodId: paymentMethodId.substring(0, 5) + '...'
      });
      
      setPaymentMethodAttached(true);
      return {
        success: true
      };
    } catch (error) {
      // Log the error
      logError('Failed to attach payment method', error);
      
      return {
        success: false,
        error
      };
    }
  };
  
  // Update booking with customer details
  const updateBooking = async () => {
    try {
      // Prepare update parameters
      const updateParams = {
        est: booking.est,
        uid: booking.uid,
        lng: 'en',
        lastName: customerDetails.lastName,
        firstName: customerDetails.firstName,
        phone: customerDetails.phone,
        email: customerDetails.email,
        notes: customerDetails.notes || '',
        dietary: customerDetails.dietary || '',
        allergies: customerDetails.allergies || '',
        optem: customerDetails.optem
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
        name: `${customerDetails.firstName} ${customerDetails.lastName}`,
        bookingId: booking.uid
      });
      
      // Call the update API
      const response = await eveveApi.update(updateParams);
      
      if (!response.data.ok) {
        throw new Error('Booking update failed');
      }
      
      // Log success
      logSuccess('Booking details successfully updated', {
        bookingId: booking.uid,
        customerName: `${customerDetails.firstName} ${customerDetails.lastName}`
      });
      
      return {
        success: true
      };
    } catch (error) {
      // Log the error
      logError('Failed to update booking with customer details', error);
      
      return {
        success: false,
        error
      };
    }
  };
  
  // Complete booking with customer details - COMPLETELY REWRITTEN
  const completeBooking = async () => {
    // Validate all fields
    if (!validateFullForm()) {
      return;
    }
    
    setIsLoading(true);
    setFormErrors({});
    
    try {
      // Step 1: Revalidate booking before final submission
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
      
      // Step 2: Process payment and update booking in parallel if card is required
      if (isCardRequired() && cardComplete) {
        // Process both payment and booking update in parallel
        const [paymentResult, updateResult] = await Promise.all([
          processPayment(),
          updateBooking()
        ]);
        
        // Handle payment processing result
        if (!paymentResult.success) {
          throw new Error(paymentResult.error?.message || 'Payment processing failed');
        }
        
        // Handle booking update result
        if (!updateResult.success) {
          throw new Error(updateResult.error?.message || 'Booking update failed');
        }
        
        // Attach payment method to booking
        const attachResult = await attachPaymentMethod(paymentResult.paymentMethodId);
        
        if (!attachResult.success) {
          throw new Error(attachResult.error?.message || 'Failed to attach payment method to booking');
        }
        
        // Log combined success
        logSuccess('Booking successfully completed with payment', {
          bookingId: booking.uid,
          customerName: `${customerDetails.firstName} ${customerDetails.lastName}`,
          paymentStatus: isDepositRequired() 
            ? 'Deposit Charged' 
            : 'Card Stored for No-Show Protection'
        });
      } else {
        // No card required, just update the booking
        const updateResult = await updateBooking();
        
        if (!updateResult.success) {
          throw new Error(updateResult.error?.message || 'Booking update failed');
        }
        
        // Log success
        logSuccess('Booking successfully completed (no payment required)', {
          bookingId: booking.uid,
          customerName: `${customerDetails.firstName} ${customerDetails.lastName}`
        });
      }
      
      // Update state to show completion
      setBookingComplete(true);
      setFlowState(FLOW_STATES.COMPLETED);
      setCurrentStep('bookingComplete');
      
    } catch (error) {
      // Log the error
      logError('Failed to complete booking', error);
      
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
      setIsLoading(false);
    }
  };
  
  // Handle form submission
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    // Reset any previous errors
    setUrlError('');
    
    // Parse and validate URL
    const { isValid, error, params } = parseHoldUrl(url);
    
    if (!isValid) {
      setUrlError(error);
      return;
    }
    
    // Reset application state before starting new flow
    resetState();
    
    // Reset all local state
    setHoldComplete(false);
    setCustomerDetailsComplete(false);
    setKeysLoaded(false);
    setDepositInfoLoaded(false);
    setCardComplete(false);
    setPaymentProcessed(false);
    setPaymentMethodAttached(false);
    setBookingComplete(false);
    setCustomerDetails({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      notes: '',
      dietary: '',
      allergies: '',
      optem: 1
    });
    setFormErrors({});
    setCardError('');
    setCurrentStep('idle');
    
    // Process the hold request
    await processHold(params);
  }, [url, parseHoldUrl, processHold, resetState]);
  
  // Handle sample URL selection
  const handleSampleSelect = useCallback((sampleUrl) => {
    setUrl(sampleUrl);
    setUrlError('');
  }, []);
  
  // Reset all state when main reset is called
  useEffect(() => {
    if (flowState === FLOW_STATES.IDLE) {
      setHoldComplete(false);
      setCustomerDetailsComplete(false);
      setKeysLoaded(false);
      setDepositInfoLoaded(false);
      setCardComplete(false);
      setPaymentProcessed(false);
      setPaymentMethodAttached(false);
      setBookingComplete(false);
      setCustomerDetails({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        notes: '',
        dietary: '',
        allergies: '',
        optem: 1
      });
      setFormErrors({});
      setCardError('');
      setCurrentStep('idle');
    }
  }, [flowState]);
  
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
  
  // Disable form when not in IDLE state
  const isFormDisabled = flowState !== FLOW_STATES.IDLE && 
                         flowState !== FLOW_STATES.ERROR;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      <h2 className="text-xl font-semibold text-stripe-dark mb-4">Unified Booking Form</h2>
      
      {/* SECTION 1: HOLD URL INPUT - Always visible */}
      <form onSubmit={handleSubmit} className="space-y-4 mb-6">
        <div>
          <label htmlFor="holdUrl" className="form-label">
            Eveve HOLD URL
          </label>
          <input
            id="holdUrl"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://nz.eveve.com/web/hold?est=TestNZA&..."
            className={`form-input ${urlError ? 'border-red-500' : ''}`}
            disabled={isFormDisabled}
            required
          />
          {urlError && (
            <p className="mt-1 text-sm text-red-600">{urlError}</p>
          )}
        </div>
        
        <div className="flex space-x-2">
          <button
            type="submit"
            className="form-button"
            disabled={isFormDisabled || isLoading || !url.trim()}
          >
            {isLoading && currentStep === 'holding' ? 'Processing...' : 'Start Test'}
          </button>
          
          <button
            type="button"
            onClick={() => resetState()}
            className="form-button bg-gray-200 text-gray-800 hover:bg-gray-300"
            disabled={flowState === FLOW_STATES.IDLE}
          >
            Reset
          </button>
        </div>
      </form>
      
      {/* Sample URLs - Only visible in IDLE state */}
      {flowState === FLOW_STATES.IDLE && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Sample Test URLs</h3>
          <div className="space-y-2">
            {SAMPLE_URLS.map((sample, index) => (
              <button
                key={index}
                onClick={() => handleSampleSelect(sample.url)}
                className="block w-full text-left px-3 py-2 text-sm bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                disabled={isFormDisabled}
              >
                <span className="font-medium">{sample.label}</span>
                <span className="block text-xs text-gray-500 truncate mt-1">
                  {sample.url}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Booking Progress Indicator - Visible after HOLD */}
      {holdComplete && (
        <div className="mb-6 p-3 bg-blue-50 rounded-md">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Booking Progress</h3>
          <ul className="text-sm">
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Booking Hold Complete</span>
            </li>
            
            <li className="flex items-center mt-1">
              <svg className={`w-4 h-4 mr-1.5 ${customerDetailsComplete ? 'text-green-500' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                {customerDetailsComplete ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                )}
              </svg>
              <span>Customer Details</span>
            </li>
            
            {isCardRequired() && (
              <>
                <li className="flex items-center mt-1">
                  <svg className={`w-4 h-4 mr-1.5 ${paymentProcessed ? 'text-green-500' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    {paymentProcessed ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    )}
                  </svg>
                  <span>Payment Processing</span>
                </li>
              </>
            )}
            
            <li className="flex items-center mt-1">
              <svg className={`w-4 h-4 mr-1.5 ${bookingComplete ? 'text-green-500' : 'text-blue-500'}`} fill="currentColor" viewBox="0 0 20 20">
                {bookingComplete ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                )}
              </svg>
              <span>Booking Completion</span>
            </li>
          </ul>
        </div>
      )}
      
      {/* Booking Summary - Visible after HOLD */}
      {holdComplete && booking && (
        <div className="mb-6 p-4 bg-gray-50 rounded-md">
          <h3 className="text-md font-medium text-gray-700 mb-2">Booking Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-gray-600">Restaurant:</div>
            <div className="font-medium">{booking.est || 'TestNZA'}</div>
            
            <div className="text-gray-600">Date:</div>
            <div className="font-medium">{formatBookingDate()}</div>
            
            <div className="text-gray-600">Time:</div>
            <div className="font-medium">{formatBookingTime()}</div>
            
            <div className="text-gray-600">Party Size:</div>
            <div className="font-medium">{booking.covers || '0'} guests</div>
            
            <div className="text-gray-600">Booking ID:</div>
            <div className="font-medium">{booking.uid}</div>
            
            <div className="text-gray-600">Card Required:</div>
            <div className="font-medium">
              {booking.card === 0 ? 'No' : 
               booking.card === 1 ? 'Yes (No-Show Protection)' : 
               booking.card === 2 ? 'Yes (Deposit Required)' : 'Unknown'}
            </div>
          </div>
        </div>
      )}
      
      {/* SECTION 2: CUSTOMER DETAILS - Visible after HOLD */}
      {holdComplete && !customerDetailsComplete && (
        <div className="mb-6 p-4 border border-gray-200 rounded-md">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Customer Details</h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* First Name */}
              <div>
                <label htmlFor="firstName" className="form-label">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={customerDetails.firstName}
                  onChange={handleCustomerDetailsChange}
                  className={`form-input ${formErrors.firstName ? 'border-red-500' : ''}`}
                  placeholder="John"
                  disabled={isLoading}
                  required
                />
                {formErrors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.firstName}</p>
                )}
              </div>
              
              {/* Last Name */}
              <div>
                <label htmlFor="lastName" className="form-label">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={customerDetails.lastName}
                  onChange={handleCustomerDetailsChange}
                  className={`form-input ${formErrors.lastName ? 'border-red-500' : ''}`}
                  placeholder="Smith"
                  disabled={isLoading}
                  required
                />
                {formErrors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{formErrors.lastName}</p>
                )}
              </div>
            </div>
            
            {/* Email */}
            <div>
              <label htmlFor="email" className="form-label">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={customerDetails.email}
                onChange={handleCustomerDetailsChange}
                className={`form-input ${formErrors.email ? 'border-red-500' : ''}`}
                placeholder="john.smith@example.com"
                disabled={isLoading}
                required
              />
              {formErrors.email && (
                <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
              )}
            </div>
            
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">
                <span className="text-red-500">*</span> Required fields
              </p>
              
              <button
                type="button"
                onClick={saveCustomerDetails}
                className="form-button"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Save Customer Details'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* SECTION 3: PAYMENT DETAILS - Visible after customer details saved */}
      {customerDetailsComplete && isCardRequired() && (
        <div className="mb-6 p-4 border border-gray-200 rounded-md">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Payment Details</h3>
          
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
          
          {/* Manual Step Controls for Payment */}
          {!paymentMethodAttached && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">Manual Step Controls</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={fetchStripeKeys}
                  disabled={isLoading || keysLoaded}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    keysLoaded 
                      ? 'bg-green-100 text-green-800 cursor-not-allowed' 
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  }`}
                >
                  {isLoading && currentStep === 'fetchingKeys' 
                    ? 'Loading...' 
                    : keysLoaded 
                      ? '✓ Stripe Keys Loaded' 
                      : '1. Fetch Stripe Keys'}
                </button>
                
                <button
                  onClick={fetchDepositInfo}
                  disabled={isLoading || !keysLoaded || depositInfoLoaded}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    !keysLoaded 
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : depositInfoLoaded
                        ? 'bg-green-100 text-green-800 cursor-not-allowed'
                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  }`}
                >
                  {isLoading && currentStep === 'fetchingDeposit' 
                    ? 'Loading...' 
                    : depositInfoLoaded 
                      ? '✓ Deposit Info Loaded' 
                      : '2. Fetch Deposit Info'}
                </button>
                
                <button
                  onClick={proceedToCardEntry}
                  disabled={isLoading || !keysLoaded || !depositInfoLoaded}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    !keysLoaded || !depositInfoLoaded
                      ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  }`}
                >
                  {isLoading 
                    ? 'Loading...' 
                    : '3. Proceed to Card Entry'}
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Complete each step manually to avoid API call loops
              </p>
            </div>
          )}
          
          {/* Card Element - Only show if we're in the right state */}
          {flowState === FLOW_STATES.ENTERING_CARD && !paymentMethodAttached && (
            <div className="space-y-4">
              {/* Card Element */}
              <div>
                <label htmlFor="card" className="form-label">
                  Card Details <span className="text-red-500">*</span>
                </label>
                <div className="StripeElement">
                  {!stripeLoaded ? (
                    <div className="p-3 bg-gray-100 rounded border border-gray-200 text-gray-500 text-sm">
                      Loading Stripe payment form...
                    </div>
                  ) : (
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
                  )}
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
              
              {/* Message prompting next step once card entry complete */}
              {cardComplete && (
                <p className="text-sm text-blue-600">
                  Card details captured. Continue to &quot;Additional Details&quot; and press&nbsp;
                  <strong>Complete Booking</strong> to process payment and finalize your reservation.
                </p>
              )}
            </div>
          )}
          
          {/* Payment Success Message */}
          {paymentMethodAttached && (
            <div className="p-3 bg-green-50 text-green-800 rounded-md">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Payment successfully processed!</span>
              </div>
              <p className="mt-1 text-sm">
                Please complete the additional details below to finalize your booking.
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* No Card Required - Manual Proceed */}
      {customerDetailsComplete && booking && booking.card === 0 && !bookingComplete && (
        <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">No Card Required</h3>
          <p className="text-sm text-gray-600 mb-2">
            This booking doesn&apos;t require a card. You can proceed directly to additional details.
          </p>
          <button
            onClick={proceedToUserDetails}
            disabled={isLoading}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-800 hover:bg-blue-200 rounded-md transition-colors"
          >
            Proceed to Additional Details
          </button>
        </div>
      )}
      
      {/* SECTION 4: ADDITIONAL DETAILS - Visible after card entry complete or no card required */}
{((cardComplete && isCardRequired()) || 
        (customerDetailsComplete && !isCardRequired())) && 
        !bookingComplete && (
        <div className="mb-6 p-4 border border-gray-200 rounded-md">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Additional Details</h3>
          
          <div className="space-y-4">
            {/* Phone */}
            <div>
              <label htmlFor="phone" className="form-label">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={customerDetails.phone}
                onChange={handleCustomerDetailsChange}
                className={`form-input ${formErrors.phone ? 'border-red-500' : ''}`}
                placeholder="+1 (555) 123-4567"
                disabled={isLoading || bookingComplete}
                required
              />
              {formErrors.phone && (
                <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
              )}
            </div>
            
            {/* Notes */}
            <div>
              <label htmlFor="notes" className="form-label">
                Special Requests / Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                value={customerDetails.notes}
                onChange={handleCustomerDetailsChange}
                className="form-input"
                rows="2"
                placeholder="Any special requests for your booking"
                disabled={isLoading || bookingComplete}
              />
            </div>
            
            {/* Dietary & Allergies */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="dietary" className="form-label">
                  Dietary Requirements
                </label>
                <input
                  id="dietary"
                  name="dietary"
                  type="text"
                  value={customerDetails.dietary}
                  onChange={handleCustomerDetailsChange}
                  className="form-input"
                  placeholder="Vegetarian, vegan, etc."
                  disabled={isLoading || bookingComplete}
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
                  value={customerDetails.allergies}
                  onChange={handleCustomerDetailsChange}
                  className="form-input"
                  placeholder="Nuts, dairy, gluten, etc."
                  disabled={isLoading || bookingComplete}
                />
              </div>
            </div>
            
            {/* Marketing Opt-in */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="optem"
                  name="optem"
                  type="checkbox"
                  checked={customerDetails.optem === 1}
                  onChange={handleCustomerDetailsChange}
                  className="h-4 w-4 text-stripe-blue focus:ring-stripe-blue border-gray-300 rounded"
                  disabled={isLoading || bookingComplete}
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
            
            {/* Form Error */}
            {formErrors.submit && (
              <div className="p-4 bg-red-50 text-red-800 rounded-md">
                <div className="flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Error:</span>
                  <span className="ml-1">{formErrors.submit}</span>
                </div>
              </div>
            )}
            
            {/* Complete Booking Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={completeBooking}
                className="form-button"
                disabled={isLoading || bookingComplete}
              >
                {isLoading ? 'Processing...' : 'Complete Booking'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* SECTION 5: BOOKING COMPLETION - Visible after booking is completed */}
      {bookingComplete && (
        <div className="mb-6 p-4 bg-green-50 text-green-800 rounded-md">
          <div className="flex items-center mb-2">
            <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <h3 className="text-lg font-semibold">Booking Successfully Completed!</h3>
          </div>
          
          <div className="p-4 bg-white rounded-md mb-3">
            <h4 className="font-medium mb-2">Booking Details:</h4>
            <p><strong>Name:</strong> {customerDetails.firstName} {customerDetails.lastName}</p>
            <p><strong>Email:</strong> {customerDetails.email}</p>
            <p><strong>Phone:</strong> {customerDetails.phone}</p>
            <p><strong>Date:</strong> {formatBookingDate()}</p>
            <p><strong>Time:</strong> {formatBookingTime()}</p>
            <p><strong>Party Size:</strong> {booking?.covers || '0'} guests</p>
            <p><strong>Booking ID:</strong> {booking?.uid}</p>
            
            {isCardRequired() && (
              <p><strong>Payment:</strong> {isDepositRequired() 
                ? `Deposit of ${formatAmount(stripeContext.amount)} charged` 
                : 'Card stored for no-show protection'}</p>
            )}
          </div>
          
          <p className="text-sm">
            A confirmation email has been sent to {customerDetails.email}. Please check your inbox for booking details.
          </p>
        </div>
      )}
      
      {/* Secure Badge */}
      <div className="flex items-center justify-center text-xs text-gray-500 mt-4">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Secure booking powered by Eveve & Stripe
      </div>
    </div>
  );
};

export default UnifiedBookingFormWrapper;
