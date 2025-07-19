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
  }
];

const BookingForm = () => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  
  const { 
    setBooking, 
    setStripeKeys, 
    setPaymentType,
    setFlowState, 
    flowState,
    isCardRequired,
    logApiCall,
    setError,
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
      const requiredParams = ['est', 'covers', 'date', 'time', 'area'];
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
          area: parseInt(params.area, 10)
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
  
  // Fetch Stripe keys using pi-get
  const fetchStripeKeys = useCallback(async (bookingData) => {
    try {
      setFlowState(FLOW_STATES.AWAITING_STRIPE);
      
      const piGetParams = {
        est: bookingData.est || 'TestNZA',
        uid: bookingData.uid,
        type: 0,
        desc: 0,
        created: bookingData.created
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
      
      logInfo('Stripe keys retrieved successfully');
      
      return true;
    } catch (error) {
      logError('Failed to retrieve Stripe keys', error);
      setError({
        message: 'Failed to retrieve Stripe keys: ' + error.message
      });
      return false;
    }
  }, [setFlowState, setStripeKeys, logInfo, logError, setError]);
  
  // Fetch deposit information
  const fetchDepositInfo = useCallback(async (bookingData) => {
    try {
      const depositParams = {
        est: bookingData.est || 'TestNZA',
        UID: bookingData.uid,
        created: bookingData.created,
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
      
      return true;
    } catch (error) {
      logError('Failed to retrieve deposit information', error);
      setError({
        message: 'Failed to retrieve deposit information: ' + error.message
      });
      return false;
    }
  }, [setPaymentType, logInfo, logError, setError]);
  
  // Process the booking hold
  const processHold = useCallback(async (holdParams) => {
    setIsLoading(true);
    setFlowState(FLOW_STATES.HOLDING);
    
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
        area: holdParams.area
      };
      
      setBooking(bookingData);
      
      // Log the booking status
      logInfo(`Booking hold successful (UID: ${bookingData.uid})`, {
        cardRequired: bookingData.card > 0,
        cardType: bookingData.card === 1 ? 'No-Show Protection' : 
                 bookingData.card === 2 ? 'Deposit Required' : 'None',
        amount: bookingData.perHead ? `$${(bookingData.perHead / 100).toFixed(2)} per person` : '$0.00'
      });
      
      // If card is required, fetch Stripe keys and deposit info
      if (bookingData.card > 0) {
        const keysSuccess = await fetchStripeKeys(bookingData);
        
        if (!keysSuccess) {
          return;
        }
        
        const depositSuccess = await fetchDepositInfo(bookingData);
        
        if (!depositSuccess) {
          return;
        }
        
        // Transition to card entry state
        setFlowState(FLOW_STATES.ENTERING_CARD);
      } else {
        // No card required, transition to user details
        setFlowState(FLOW_STATES.COLLECTING_USER);
        logInfo('No card required for this booking');
      }
    } catch (error) {
      logError('Booking hold failed', error);
      setError({
        message: 'Booking hold failed: ' + error.message
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    setFlowState, 
    setBooking, 
    fetchStripeKeys, 
    fetchDepositInfo, 
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
    
    // Process the hold request
    await processHold(params);
  }, [url, parseHoldUrl, processHold, resetState]);
  
  // Handle sample URL selection
  const handleSampleSelect = useCallback((sampleUrl) => {
    setUrl(sampleUrl);
    setUrlError('');
  }, []);
  
  // Disable form when not in IDLE state
  const isFormDisabled = flowState !== FLOW_STATES.IDLE && 
                         flowState !== FLOW_STATES.ERROR;
  
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
            {isLoading ? 'Processing...' : 'Start Test'}
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
      
      {/* Sample URLs */}
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
            
            {isCardRequired() && (
              <>
                <li className="flex items-center mt-1">
                  <svg className={`w-4 h-4 mr-1.5 ${flowState === FLOW_STATES.HOLDING ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    {flowState === FLOW_STATES.HOLDING ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    )}
                  </svg>
                  Retrieve Stripe Keys
                </li>
                
                <li className="flex items-center mt-1">
                  <svg className={`w-4 h-4 mr-1.5 ${flowState === FLOW_STATES.HOLDING || flowState === FLOW_STATES.AWAITING_STRIPE ? 'text-blue-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20">
                    {flowState === FLOW_STATES.HOLDING || flowState === FLOW_STATES.AWAITING_STRIPE ? (
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
              Collect Customer Details
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
