import { useState, useEffect } from 'react';
import { useFlow, FLOW_STATES } from '../context/FlowContext';

// Map flow states to user-friendly labels
const flowStateLabels = {
  [FLOW_STATES.IDLE]: 'Ready',
  [FLOW_STATES.HOLDING]: 'Booking Hold...',
  [FLOW_STATES.AWAITING_STRIPE]: 'Retrieving Stripe Keys...',
  [FLOW_STATES.ENTERING_CARD]: 'Enter Payment Details',
  [FLOW_STATES.CARD_CONFIRMED]: 'Card Confirmed',
  [FLOW_STATES.COLLECTING_USER]: 'Enter Customer Details',
  [FLOW_STATES.COMPLETED]: 'Booking Complete',
  [FLOW_STATES.ERROR]: 'Error'
};

// Map flow states to progress percentage
const flowStateProgress = {
  [FLOW_STATES.IDLE]: 0,
  [FLOW_STATES.HOLDING]: 20,
  [FLOW_STATES.AWAITING_STRIPE]: 40,
  [FLOW_STATES.ENTERING_CARD]: 60,
  [FLOW_STATES.CARD_CONFIRMED]: 80,
  [FLOW_STATES.COLLECTING_USER]: 90,
  [FLOW_STATES.COMPLETED]: 100,
  [FLOW_STATES.ERROR]: 0
};

const Header = () => {
  const { flowState, resetState, booking, error, getHoldTimeRemaining } = useFlow();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [showExpiryWarning, setShowExpiryWarning] = useState(false);

  // Format time as MM:SS
  const formatTimeRemaining = (ms) => {
    if (ms === null) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // Return css class for timer pill
  const getTimerClass = (ms) => {
    if (ms === null) return 'px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700';
    if (ms < 30_000) return 'px-2 py-0.5 rounded text-xs bg-red-100 text-red-700';
    if (ms < 60_000) return 'px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800';
    return 'px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700';
  };

  // Update timer every second – display-only, no auto-reset
  useEffect(() => {
    // only run timer while a booking exists
    if (!booking) {
      setTimeRemaining(null);
      return;
    }
    // initial value
    const initial = getHoldTimeRemaining();
    setTimeRemaining(initial);
    if (initial <= 0) setShowExpiryWarning(true);

    const id = setInterval(() => {
      const remaining = getHoldTimeRemaining();
      setTimeRemaining(remaining);
      if (remaining <= 0) {
        setShowExpiryWarning(true);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [booking, getHoldTimeRemaining]);
  
  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* App Title */}
          <div>
            <h1 className="text-2xl font-bold text-stripe-dark flex items-center">
              <span className="text-stripe-blue">Stripe</span>
              <span className="mx-2">+</span>
              <span>Eveve</span>
              <span className="ml-2 text-sm font-normal text-gray-500">Test App</span>
            </h1>
          </div>
          
          {/* Flow State & Timer */}
          <div className="flex items-center space-x-4">
            {/* Flow State Label */}
            <div className="text-sm font-medium">
              Status: <span className={`${flowState === FLOW_STATES.ERROR ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                {flowStateLabels[flowState]}
              </span>
              
              {/* Show booking ID if available */}
              {booking?.uid && (
                <span className="ml-2 text-xs text-gray-500">
                  (UID: {booking.uid})
                </span>
              )}
            </div>
            
            {/* Countdown Timer – warning only, no auto-reset */}
            {timeRemaining !== null && (
              <div className={getTimerClass(timeRemaining)}>
                Expiry&nbsp;{formatTimeRemaining(timeRemaining)}
              </div>
            )}

            {/* Reset Button */}
            <button
              onClick={resetState}
              className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded-md transition-colors duration-150"
              title="Reset application state"
            >
              Reset
            </button>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-3 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full ${flowState === FLOW_STATES.ERROR ? 'bg-red-500' : 'bg-stripe-blue'} transition-all duration-300 ease-in-out`}
            style={{ width: `${flowStateProgress[flowState]}%` }}
          ></div>
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
            {error.message || 'An error occurred'}
          </div>
        )}

        {/* Expiry warning */}
        {showExpiryWarning && (
          <div className="mt-2 text-sm text-yellow-800 bg-yellow-50 p-2 rounded flex justify-between items-start">
            <span>
              Timer has expired. You may encounter an error if you proceed without resetting or completing the flow.
            </span>
            <button
              onClick={() => setShowExpiryWarning(false)}
              className="ml-4 text-yellow-900 hover:text-yellow-700 font-semibold"
              aria-label="Dismiss expiry warning"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
