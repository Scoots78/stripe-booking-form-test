import { useFlow, FLOW_STATES } from './context/FlowContext';
import Header from './components/Header';
import UnifiedBookingForm from './components/UnifiedBookingForm';
import LogDisplay from './components/LogDisplay';
import useLogger from './hooks/useLogger';

function App() {
  const { flowState } = useFlow();
  useLogger(); // ensure logger hook initialises (no side-effect needed here)

  return (
    <div className="min-h-screen bg-stripe-light">
      {/* Header - Always visible */}
      <Header />
      
      {/* extra top padding so content clears sticky header */}
      <main className="pt-24 max-w-5xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-4">
          {/* Booking Form - Always visible but disabled in certain states */}
          <UnifiedBookingForm />
          
          {/* Completion Message */}
          {flowState === FLOW_STATES.COMPLETED && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-4">
              <div className="text-center">
                <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-2xl font-bold text-gray-800 mt-4">Booking Completed!</h2>
                <p className="text-gray-600 mt-2">
                  Your test booking has been successfully processed and completed.
                </p>
                <p className="text-gray-500 mt-1 text-sm">
                  Check the logs below for a detailed record of all API calls and responses.
                </p>
              </div>
            </div>
          )}
          
          {/* Error State */}
          {flowState === FLOW_STATES.ERROR && (
            <div className="bg-white rounded-lg shadow-md p-6 mb-4">
              <div className="text-center">
                <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-2xl font-bold text-gray-800 mt-4">Error Occurred</h2>
                <p className="text-gray-600 mt-2">
                  An error was encountered during the booking process.
                </p>
                <p className="text-gray-500 mt-1 text-sm">
                  Please check the logs below for details and try again.
                </p>
              </div>
            </div>
          )}
          
          {/* API Log Display - Always visible */}
          <LogDisplay />
        </div>
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              Stripe + Eveve Test App — Developer Tool Only
            </p>
            <p className="text-sm text-gray-500">
              v0.1.0
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
