import { useState, useEffect, useCallback } from 'react';
import { useFlow, FLOW_STATES } from '../context/FlowContext';
import * as eveveApi from '../api/eveve';
import useLogger from '../hooks/useLogger';

// Sample test URLs for quick testing
const SAMPLE_URLS = [
  {
    label: 'TestNZA - Deposit Required (card=2)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=10&date=2025-07-25&time=16&area=1000'
  },
  {
    label: 'TestNZA - No-Show Protection (card=1)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=2&date=2025-07-26&time=19&area=1000'
  },
  {
    label: 'TestNZA - No Card Required (card=0)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=1&date=2025-07-27&time=12&area=1000'
  },
  // --- Examples WITHOUT the optional `area` parameter ---
  {
    label: 'TestNZA - Deposit (no area param)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=6&date=2025-07-30&time=18'
  },
  {
    label: 'TestNZA - No-Show (no area param)',
    url: 'https://nz.eveve.com/web/hold?est=TestNZA&lng=en&covers=4&date=2025-08-01&time=20'
  }
];

const BookingForm = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [keysLoaded, setKeysLoaded] = useState(false);
  const [depositInfoLoaded, setDepositInfoLoaded] = useState(false);
  const [currentStep, setCurrentStep] = useState('idle');
  // Local form state for customer details. The *context* function to save
  // details globally is also named `setCustomerDetails`, so use a distinct
  // name here to avoid collisions.
  const [customerDetails, setLocalCustomerDetails] = useState({
    firstName: '',
    lastName: '',
    email: ''
  });
  const [customerDetailsErrors, setCustomerDetailsErrors] = useState({});
  const [customerDetailsComplete, setCustomerDetailsComplete] = useState(false);
  
  const { 
    booking,
    setBooking, 
    setStripeKeys, 
    setPaymentType,
    setFlowState, 
    flowState,
    isCardRequired,
    logApiCall,
    setError,
    setCustomerDetails,
    resetState
  } = useFlow();
  
  const { logInfo, logError } = useLogger();
  
  // Set up API logger
  useEffect(() => {
    eveveApi.setApiLogger(logApiCall);
  }, [logApiCall]);
  
  // Parse URL to extract parameters
  const parseHoldUrl = useCallback((url) => {
    try {
      const urlObj = new URL(url);
      const params = Object.fromEntries(urlObj.searchParams.entries());
      
      // Validate required parameters
      // 'area' is now optional – remove it from the required list
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
    
    setCustomerDetailsErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Handle customer details form submission
  const handleCustomerDetailsSubmit = (e) => {
    e.preventDefault();
    
    if (validateCustomerDetails()) {
      // Persist details in global flow context for use in other components
      setCustomerDetails(customerDetails);          // save to context
      setCustomerDetailsComplete(true);
      setCurrentStep('customerDetailsComplete');
      logInfo('Customer details collected', {
        name: `${customerDetails.firstName} ${customerDetails.lastName}`,
        email: customerDetails.email
      });
    }
  };
  
  // Handle customer details input change
  const handleCustomerDetailsChange = (e) => {
    const { name, value } = e.target;
    setLocalCustomerDetails(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error for this field if it exists
    if (customerDetailsErrors[name]) {
      setCustomerDetailsErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };
  
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
      setCurrentStep('holdComplete');
      
      // Log the booking status
      logInfo(`Booking hold successful (UID: ${bookingData.uid})`, {
        cardRequired: bookingData.card > 0,
        cardType: bookingData.card === 1 ? 'No-Show Protection' : 
                 bookingData.card === 2 ? 'Deposit Required' : 'None',
        amount: bookingData.perHead ? `$${(bookingData.perHead / 100).toFixed(2)} per person` : '$0.00'
      });
      
      // No automatic progression to next steps - wait for manual action
      
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
    setKeysLoaded(false);
    setDepositInfoLoaded(false);
    setCustomerDetailsComplete(false);
    setLocalCustomerDetails({
      firstName: '',
      lastName: '',
      email: ''
    });
    setCustomerDetailsErrors({});
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
      setKeysLoaded(false);
      setDepositInfoLoaded(false);
      setCustomerDetailsComplete(false);
    setLocalCustomerDetails({
        firstName: '',
        lastName: '',
        email: ''
      });
      setCustomerDetailsErrors({});
      setCurrentStep('idle');
    }
  }, [flowState]);
  
  // Disable form when not in IDLE state
  const isFormDisabled = flowState !== FLOW_STATES.IDLE && 
                         flowState !== FLOW_STATES.ERROR;
  
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
      <h2 className="text-xl font-semibold text-stripe-dark mb-4">Start Booking Test</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
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
      
      {/* Customer Details Form - Show after hold is complete */}
      {currentStep === 'holdComplete' && booking && (
        <div className="mt-6 p-4 bg-gray-50 rounded-md">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Customer Details</h3>
          
          {/* Booking Summary */}
          <div className="mb-4 p-3 bg-blue-50 rounded-md">
            <h4 className="text-sm font-medium text-blue-800 mb-1">Booking Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-600">Date:</div>
              <div className="font-medium">{formatBookingDate()}</div>
              
              <div className="text-gray-600">Time:</div>
              <div className="font-medium">{formatBookingTime()}</div>
              
              <div className="text-gray-600">Party Size:</div>
              <div className="font-medium">{booking.covers} guests</div>
              
              <div className="text-gray-600">Booking ID:</div>
              <div className="font-medium">{booking.uid}</div>
            </div>
          </div>
          
          <form onSubmit={handleCustomerDetailsSubmit} className="space-y-4">
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
                  className={`form-input ${customerDetailsErrors.firstName ? 'border-red-500' : ''}`}
                  placeholder="John"
                  disabled={customerDetailsComplete || isLoading}
                  required
                />
                {customerDetailsErrors.firstName && (
                  <p className="mt-1 text-sm text-red-600">{customerDetailsErrors.firstName}</p>
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
                  className={`form-input ${customerDetailsErrors.lastName ? 'border-red-500' : ''}`}
                  placeholder="Smith"
                  disabled={customerDetailsComplete || isLoading}
                  required
                />
                {customerDetailsErrors.lastName && (
                  <p className="mt-1 text-sm text-red-600">{customerDetailsErrors.lastName}</p>
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
                className={`form-input ${customerDetailsErrors.email ? 'border-red-500' : ''}`}
                placeholder="john.smith@example.com"
                disabled={customerDetailsComplete || isLoading}
                required
              />
              {customerDetailsErrors.email && (
                <p className="mt-1 text-sm text-red-600">{customerDetailsErrors.email}</p>
              )}
            </div>
            
            <div className="flex justify-between items-center">
              <p className="text-xs text-gray-500">
                <span className="text-red-500">*</span> Required fields
              </p>
              
              {!customerDetailsComplete ? (
                <button
                  type="submit"
                  className="form-button"
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing...' : 'Save Customer Details'}
                </button>
              ) : (
                <div className="flex items-center text-green-600">
                  <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Customer Details Saved</span>
                </div>
              )}
            </div>
          </form>
          
          <div className="mt-3 text-sm text-gray-600">
            <p>These details will be used to create a friendly customer reference in Stripe.</p>
          </div>
        </div>
      )}
      
      {/* Manual Step Controls for Card Required Bookings */}
      {['customerDetailsComplete', 'keysLoaded', 'fetchingKeys', 'depositLoaded', 'fetchingDeposit']
        .includes(currentStep) && booking && booking.card > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Manual Step Controls</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={fetchStripeKeys}
              disabled={isLoading || keysLoaded || !customerDetailsComplete}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                !customerDetailsComplete
                  ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                  : keysLoaded 
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
      
      {/* No Card Required - Manual Proceed */}
      {currentStep === 'customerDetailsComplete' && booking && booking.card === 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">No Card Required</h3>
          <p className="text-sm text-gray-600 mb-2">
            This booking doesn&apos;t require a card. You can proceed directly to customer details.
          </p>
          <button
            onClick={proceedToUserDetails}
            disabled={isLoading}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-800 hover:bg-blue-200 rounded-md transition-colors"
          >
            Proceed to Customer Details
          </button>
        </div>
      )}
      
      {/* Sample URLs */}
      {flowState === FLOW_STATES.IDLE && (
      <div className="mt-6">
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
      
      {/* Current Flow State */}
      {flowState !== FLOW_STATES.IDLE && (
        <div className="mt-6 p-3 bg-blue-50 rounded-md">
          <h3 className="text-sm font-medium text-blue-800">Testing Progress</h3>
          <ul className="mt-2 text-sm">
            <li className="flex items-center">
              <svg className="w-4 h-4 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Booking Hold
            </li>
            
            <li className="flex items-center mt-1">
              <svg className={`w-4 h-4 mr-1.5 ${!customerDetailsComplete ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                {!customerDetailsComplete ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                )}
              </svg>
              Collect Customer Details
            </li>
            
            {isCardRequired() && (
              <>
                <li className="flex items-center mt-1">
                  <svg className={`w-4 h-4 mr-1.5 ${!keysLoaded ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    {!keysLoaded ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    )}
                  </svg>
                  Retrieve Stripe Keys
                </li>
                
                <li className="flex items-center mt-1">
                  <svg className={`w-4 h-4 mr-1.5 ${!depositInfoLoaded ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    {!depositInfoLoaded ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    )}
                  </svg>
                  Determine Payment Type
                </li>
                
                <li className="flex items-center mt-1">
                  <svg className={`w-4 h-4 mr-1.5 ${flowState !== FLOW_STATES.ENTERING_CARD && flowState !== FLOW_STATES.CARD_CONFIRMED && flowState !== FLOW_STATES.COLLECTING_USER && flowState !== FLOW_STATES.COMPLETED ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    {flowState !== FLOW_STATES.ENTERING_CARD && flowState !== FLOW_STATES.CARD_CONFIRMED && flowState !== FLOW_STATES.COLLECTING_USER && flowState !== FLOW_STATES.COMPLETED ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    )}
                  </svg>
                  Collect Card Details
                </li>
              </>
            )}
            
            <li className="flex items-center mt-1">
              <svg className={`w-4 h-4 mr-1.5 ${flowState !== FLOW_STATES.COLLECTING_USER && flowState !== FLOW_STATES.COMPLETED ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                {flowState !== FLOW_STATES.COLLECTING_USER && flowState !== FLOW_STATES.COMPLETED ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                )}
              </svg>
              Complete Booking Details
            </li>
            
            <li className="flex items-center mt-1">
              <svg className={`w-4 h-4 mr-1.5 ${flowState !== FLOW_STATES.COMPLETED ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                {flowState !== FLOW_STATES.COMPLETED ? (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                )}
              </svg>
              Complete Booking
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default BookingForm;
