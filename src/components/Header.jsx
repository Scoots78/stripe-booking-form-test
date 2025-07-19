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
  const { flowState, resetState, booking, error } = useFlow();
  
  return (
    <header className="bg-white shadow-md">
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
            
            {/* Countdown timer removed for manual-test simplicity */}
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
      </div>
    </header>
  );
};

export default Header;
