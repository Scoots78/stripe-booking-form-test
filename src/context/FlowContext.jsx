/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, useCallback } from 'react';

// Flow states
export const FLOW_STATES = {
  IDLE: 'idle',
  HOLDING: 'holding',
  AWAITING_STRIPE: 'awaitingStripe',
  ENTERING_CARD: 'enteringCard',
  CARD_CONFIRMED: 'cardConfirmed',
  COLLECTING_USER: 'collectingUser',
  COMPLETED: 'completed',
  ERROR: 'error'
};

// Action types
const ActionTypes = {
  SET_BOOKING: 'SET_BOOKING',
  SET_STRIPE_KEYS: 'SET_STRIPE_KEYS',
  SET_PAYMENT_TYPE: 'SET_PAYMENT_TYPE',
  SET_FLOW_STATE: 'SET_FLOW_STATE',
  ADD_LOG: 'ADD_LOG',
  CLEAR_LOGS: 'CLEAR_LOGS',
  RESET_STATE: 'RESET_STATE',
  SET_ERROR: 'SET_ERROR',
  SET_PAYMENT_METHOD: 'SET_PAYMENT_METHOD',
};

// Initial state
const initialState = {
  booking: null, // { uid, created, card, perHead, ... }
  stripe: {
    clientSecret: null,
    publicKey: null,
    cust: null,
    paymentType: null, // 'deposit' or 'noshow'
  },
  paymentMethod: null, // Stripe payment method ID after card entry
  flowState: FLOW_STATES.IDLE,
  logs: [], // [{ timestamp, label, request, response, error? }]
  error: null,
  // Timestamp (ms) at which the 3-minute booking hold expires.
  holdExpiry: null,
};

// Reducer function
function flowReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_BOOKING: {
      // Re-establish a 3-minute hold-expiry timer (display-only).
      const holdExpiry = Date.now() + 3 * 60 * 1000; // 3 minutes in ms
      return {
        ...state,
        booking: action.payload,
        holdExpiry,
      };
    }
      
    case ActionTypes.SET_STRIPE_KEYS:
      return {
        ...state,
        stripe: {
          ...state.stripe,
          clientSecret: action.payload.clientSecret,
          publicKey: action.payload.publicKey,
          cust: action.payload.cust,
        },
      };
      
    case ActionTypes.SET_PAYMENT_TYPE:
      return {
        ...state,
        stripe: {
          ...state.stripe,
          paymentType: action.payload.code === 1 ? 'noshow' : 'deposit',
          amount: action.payload.total,
          currency: action.payload.currency,
        },
      };
      
    case ActionTypes.SET_FLOW_STATE:
      return {
        ...state,
        flowState: action.payload,
      };
      
    case ActionTypes.ADD_LOG:
      return {
        ...state,
        logs: [...state.logs, { timestamp: new Date().toISOString(), ...action.payload }],
      };
      
    case ActionTypes.CLEAR_LOGS:
      return {
        ...state,
        logs: [],
      };
      
    case ActionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        flowState: FLOW_STATES.ERROR,
      };
      
    case ActionTypes.SET_PAYMENT_METHOD:
      return {
        ...state,
        paymentMethod: action.payload,
      };
    
    case ActionTypes.RESET_STATE:
      return initialState;
      
    default:
      return state;
  }
}

// Create context
export const FlowContext = createContext();

// Context provider component
export function FlowProvider({ children }) {
  const [state, dispatch] = useReducer(flowReducer, initialState);
  
  // Action creators
  const setBooking = useCallback((bookingData) => {
    dispatch({ type: ActionTypes.SET_BOOKING, payload: bookingData });
  }, [dispatch]);
  
  const setStripeKeys = useCallback((keys) => {
    dispatch({ type: ActionTypes.SET_STRIPE_KEYS, payload: keys });
  }, [dispatch]);
  
  const setPaymentType = useCallback((depositData) => {
    dispatch({ type: ActionTypes.SET_PAYMENT_TYPE, payload: depositData });
  }, [dispatch]);
  
  const setFlowState = useCallback((newState) => {
    dispatch({ type: ActionTypes.SET_FLOW_STATE, payload: newState });
  }, [dispatch]);
  
  const addLog = useCallback((logData) => {
    dispatch({ type: ActionTypes.ADD_LOG, payload: logData });
  }, [dispatch]);
  
  const clearLogs = useCallback(() => {
    dispatch({ type: ActionTypes.CLEAR_LOGS });
  }, [dispatch]);
  
  const setError = useCallback((error) => {
    dispatch({ type: ActionTypes.SET_ERROR, payload: error });
  }, [dispatch]);
  
  const setPaymentMethod = useCallback((pmId) => {
    dispatch({ type: ActionTypes.SET_PAYMENT_METHOD, payload: pmId });
  }, [dispatch]);
  
  const resetState = useCallback(() => {
    dispatch({ type: ActionTypes.RESET_STATE });
  }, [dispatch]);
  
  // Log API call helper
  const logApiCall = useCallback((label, request, response, error = null) => {
    addLog({
      label,
      request,
      response,
      error,
      status: error ? 'error' : 'success',
    });
    
    if (error) {
      setError(error);
    }
  }, [addLog, setError]);
  
  // Check if card is required based on booking data
  const isCardRequired = () => {
    return state.booking && state.booking.card > 0;
  };
  
  // Check if deposit is required (vs. just no-show protection)
  const isDepositRequired = () => {
    return state.stripe.paymentType === 'deposit';
  };
  
  // Time remaining (ms) before the 3-minute hold expires.
  const getHoldTimeRemaining = () => {
    if (!state.holdExpiry) return null;
    const remaining = state.holdExpiry - Date.now();
    return remaining > 0 ? remaining : 0;
  };
  
  // Calculate time remaining for hold expiry
  // Format currency amount (cents to dollars)
  const formatAmount = (cents) => {
    if (!cents) return '$0.00';
    return `$${(cents / 100).toFixed(2)}`;
  };
  
  // Value object to be provided by context
  const value = {
    ...state,
    setBooking,
    setStripeKeys,
    setPaymentType,
    setFlowState,
    addLog,
    clearLogs,
    logApiCall,
    setError,
    setPaymentMethod,
    resetState,
    isCardRequired,
    isDepositRequired,
    getHoldTimeRemaining,
    formatAmount,
  };
  
  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

// Custom hook to use the flow context
export function useFlow() {
  const context = useContext(FlowContext);
  
  if (!context) {
    throw new Error('useFlow must be used within a FlowProvider');
  }
  
  return context;
}
