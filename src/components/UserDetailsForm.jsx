import { useState, useEffect } from 'react';
import { useFlow, FLOW_STATES } from '../context/FlowContext';
import * as eveveApi from '../api/eveve';
import * as stripeApi from '../api/stripe';
import useLogger from '../hooks/useLogger';

const UserDetailsForm = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    notes: '',
    dietary: '',
    allergies: '',
    optem: 1, // Default opt-in for email marketing
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [showSuccess, setShowSuccess] = useState(false);
  
  const { 
    flowState, 
    booking, 
    stripe,
    setFlowState,
    paymentMethod,
    formatAmount,
    logApiCall,
    isCardRequired,
    isDepositRequired,
    setError
  } = useFlow();
  
  const { logInfo, logSuccess, logError } = useLogger();
  
  // Set up API logger
  useEffect(() => {
    eveveApi.setApiLogger(logApiCall);
    stripeApi.setApiLogger(logApiCall);
  }, [logApiCall]);
  
  // Only show this component when in the collecting user state or if card is confirmed
  const shouldShow = flowState === FLOW_STATES.COLLECTING_USER || 
                     (flowState === FLOW_STATES.CARD_CONFIRMED && isCardRequired());
  
  if (!shouldShow) {
    return null;
  }
  
  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // Handle checkbox inputs
    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: checked ? 1 : 0
      }));
    } else {
      setFormData(prev => ({
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
  
  // Validate form data
  const validateForm = () => {
    const errors = {};
    
    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    } else if (!/^[+\d\s()-]{7,20}$/.test(formData.phone.trim())) {
      errors.phone = 'Please enter a valid phone number';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!validateForm()) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Prepare update parameters
      const updateParams = {
        est: booking.est,
        uid: booking.uid,
        lng: 'en',
        lastName: formData.lastName,
        firstName: formData.firstName,
        phone: formData.phone,
        email: formData.email,
        notes: formData.notes || '',
        dietary: formData.dietary || '',
        allergies: formData.allergies || '',
        optem: formData.optem
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
        name: `${formData.firstName} ${formData.lastName}`,
        bookingId: booking.uid
      });

      // ------------------------------------------------------------------
      // Re-validate / reactivate the booking with a second restore call
      // ------------------------------------------------------------------
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
      
      // Call the update API
      const response = await eveveApi.update(updateParams);
      
      if (!response.data.ok) {
        throw new Error('Booking update failed');
      }
      
      // After successful update, update the Stripe payment description with customer details
      if (stripe.paymentIntentId) {
        try {
          // Build friendly description
          const bookingTime   = formatBookingTime();
          const description   = `${isDepositRequired() ? 'Deposit' : 'No-Show Protection'} HOLD ${booking.covers}pax at ${bookingTime} ${booking.est} ${booking.uid} - ${formData.firstName} ${formData.lastName} (${formData.email})`;

          // Attempt to update the PaymentIntent / SetupIntent on Stripe
          const updRes = await stripeApi.updatePaymentDescription(
            stripe.paymentIntentId,
            description,
            {
              customer_name:  `${formData.firstName} ${formData.lastName}`,
              customer_email: formData.email,
              customer_phone: formData.phone,
            },
          );

          /* 
           * The placeholder implementation resolves with `{ placeholder: true }`
           * until a backend endpoint is wired-up.  Treat this as INFO rather
           * than ERROR so the UI isn’t polluted with red log entries.
           */
          if (updRes?.placeholder) {
            logInfo('Skipped Stripe description update (placeholder implementation)', {
              intentId: stripe.paymentIntentId,
            });
          } else {
            logInfo('Updated Stripe payment description', {
              intentId: stripe.paymentIntentId,
              description,
            });
          }
        } catch (stripeError) {
          // Only log unexpected failures (network issues, etc.)
          logError('Failed to update Stripe payment description', stripeError);
        }
      }
      
      // Log success
      logSuccess('Booking successfully completed', {
        bookingId: booking.uid,
        customerName: `${formData.firstName} ${formData.lastName}`,
        paymentStatus: isCardRequired() 
          ? (isDepositRequired() ? 'Deposit Charged' : 'Card Stored for No-Show') 
          : 'No Payment Required'
      });
      
      // Show success message
      setShowSuccess(true);
      
      // Update flow state
      setFlowState(FLOW_STATES.COMPLETED);
      
    } catch (error) {
      // Log the error
      logError('Failed to update booking with customer details', error);
      
      // If update failed and we have a payment intent, attempt to refund
      if (stripe.paymentIntentId && stripe.intentType === 'payment_intent') {
        try {
          // Attempt to refund the payment
          await stripeApi.refundPayment(stripe.paymentIntentId);
          
          logInfo('Initiated refund for failed booking', {
            intentId: stripe.paymentIntentId,
            amount: formatAmount(stripe.amount)
          });
        } catch (refundError) {
          // Log but don't throw - the original error is more important
          logError('Failed to process refund', refundError);
        }
      }
      
      // Set error state
      setError({
        message: 'Failed to complete booking: ' + error.message
      });
      
      // Show error in form
      setFormErrors(prev => ({
        ...prev,
        submit: error.message || 'An error occurred while finalizing your booking'
      }));
    } finally {
      setIsLoading(false);
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
      <h2 className="text-xl font-semibold text-stripe-dark mb-4">Customer Details</h2>
      
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
      
      {/* Customer Details Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="form-label">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              value={formData.firstName}
              onChange={handleChange}
              className={`form-input ${formErrors.firstName ? 'border-red-500' : ''}`}
              placeholder="John"
              disabled={isLoading || showSuccess}
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
              value={formData.lastName}
              onChange={handleChange}
              className={`form-input ${formErrors.lastName ? 'border-red-500' : ''}`}
              placeholder="Smith"
              disabled={isLoading || showSuccess}
              required
            />
            {formErrors.lastName && (
              <p className="mt-1 text-sm text-red-600">{formErrors.lastName}</p>
            )}
          </div>
        </div>
        
        {/* Contact Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" className="form-label">
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              className={`form-input ${formErrors.phone ? 'border-red-500' : ''}`}
              placeholder="+1 (555) 123-4567"
              disabled={isLoading || showSuccess}
              required
            />
            {formErrors.phone && (
              <p className="mt-1 text-sm text-red-600">{formErrors.phone}</p>
            )}
          </div>
          
          <div>
            <label htmlFor="email" className="form-label">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              className={`form-input ${formErrors.email ? 'border-red-500' : ''}`}
              placeholder="john.smith@example.com"
              disabled={isLoading || showSuccess}
              required
            />
            {formErrors.email && (
              <p className="mt-1 text-sm text-red-600">{formErrors.email}</p>
            )}
          </div>
        </div>
        
        {/* Additional Fields */}
        <div>
          <label htmlFor="notes" className="form-label">
            Special Requests / Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            className="form-input"
            rows="2"
            placeholder="Any special requests for your booking"
            disabled={isLoading || showSuccess}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dietary" className="form-label">
              Dietary Requirements
            </label>
            <input
              id="dietary"
              name="dietary"
              type="text"
              value={formData.dietary}
              onChange={handleChange}
              className="form-input"
              placeholder="Vegetarian, vegan, etc."
              disabled={isLoading || showSuccess}
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
              value={formData.allergies}
              onChange={handleChange}
              className="form-input"
              placeholder="Nuts, dairy, gluten, etc."
              disabled={isLoading || showSuccess}
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
              checked={formData.optem === 1}
              onChange={handleChange}
              className="h-4 w-4 text-stripe-blue focus:ring-stripe-blue border-gray-300 rounded"
              disabled={isLoading || showSuccess}
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
        
        {/* Submit Button */}
        <div className="mt-6">
          <button
            type="submit"
            className="form-button w-full"
            disabled={isLoading || showSuccess}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : (
              'Complete Booking'
            )}
          </button>
        </div>
        
        {/* Required Fields Note */}
        <p className="text-xs text-gray-500 mt-2">
          <span className="text-red-500">*</span> Required fields
        </p>
      </form>
    </div>
  );
};

export default UserDetailsForm;
