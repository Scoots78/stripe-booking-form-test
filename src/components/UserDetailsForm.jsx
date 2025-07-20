import { useEffect } from 'react';
import { useFlow, FLOW_STATES } from '../context/FlowContext';
import * as eveveApi from '../api/eveve';
import useLogger from '../hooks/useLogger';

const UserDetailsForm = () => {
  const { 
    flowState, 
    booking, 
    stripe,
    setFlowState,
    paymentMethod,
    formatAmount,
    logApiCall,
    isCardRequired,
    isDepositRequired
  } = useFlow();
  
  const { logInfo } = useLogger();
  
  // Set up API logger
  useEffect(() => {
    eveveApi.setApiLogger(logApiCall);
  }, [logApiCall]);
  
  // Log that user reached this fallback component
  useEffect(() => {
    logInfo('User reached the standalone UserDetailsForm (fallback component)', {
      flowState,
      hasPaymentMethod: !!paymentMethod
    });
  }, [flowState, paymentMethod, logInfo]);
  
  // Only show this component when in the collecting user state or if card is confirmed
  const shouldShow = flowState === FLOW_STATES.COLLECTING_USER || 
                     (flowState === FLOW_STATES.CARD_CONFIRMED && isCardRequired());
  
  if (!shouldShow) {
    return null;
  }
  
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

  // Handle going back to payment form
  const handleBackToPaymentForm = () => {
    setFlowState(FLOW_STATES.ENTERING_CARD);
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-4">
      <h2 className="text-xl font-semibold text-stripe-dark mb-4">Customer Details</h2>
      
      {/* Unified Form Message */}
      <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-md">
        <div className="flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span className="font-medium">We&rsquo;ve improved our booking process!</span>
        </div>
        <p className="mt-2 text-sm">
          Customer details are now collected directly in the payment form to avoid duplicating information.
          Please return to the payment form to complete your booking in one step.
        </p>
        <button
          onClick={handleBackToPaymentForm}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Return to Payment Form
        </button>
      </div>
      
      {/* Booking Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-md">
        <h3 className="text-md font-medium text-gray-700 mb-2">Booking Summary</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-600">Restaurant:</div>
          <div className="font-medium">{booking?.est || 'TestNZA'}</div>
          
          <div className="text-gray-600">Date:</div>
          <div className="font-medium">{formatBookingDate()}</div>
          
          <div className="text-gray-600">Time:</div>
          <div className="font-medium">{formatBookingTime()}</div>
          
          <div className="text-gray-600">Party Size:</div>
          <div className="font-medium">{booking?.covers || '0'} guests</div>
          
          {isCardRequired() && (
            <>
              <div className="text-gray-600">Payment:</div>
              <div className="font-medium">
                {isDepositRequired() 
                  ? `Deposit: ${formatAmount(stripe?.amount)}` 
                  : `No-Show Protection: ${formatAmount(stripe?.amount)}`}
              </div>
              
              {paymentMethod && (
                <>
                  <div className="text-gray-600">Card:</div>
                  <div className="font-medium">
                    {`${paymentMethod.substring(0, 5)}...`}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Fallback Message */}
      <div className="p-4 bg-yellow-50 text-yellow-800 rounded-md">
        <p className="text-sm">
          This is a fallback component. In our new unified flow, all customer details are collected 
          in a single form along with payment information to provide a smoother booking experience.
        </p>
      </div>
    </div>
  );
};

export default UserDetailsForm;
