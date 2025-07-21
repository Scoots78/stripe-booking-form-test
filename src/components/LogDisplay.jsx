import { useState, useEffect, useRef } from 'react';
import { useFlow } from '../context/FlowContext';
import useLogger from '../hooks/useLogger';
import JsonViewer from './JsonViewer';

const LogDisplay = () => {
  const { logs } = useFlow();
  const { 
    clearLogs, 
    formatJson, 
    copyToClipboard, 
    copyAsCurl, 
    exportLogs, 
    getLogStatusClass, 
    formatTimestamp 
  } = useLogger();
  
  const [filter, setFilter] = useState('all');
  const [expandedLogs, setExpandedLogs] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const logEndRef = useRef(null);
  
  /*
   * Auto-scrolling removed per requirements:
   * The application should no longer jump down to the logs after
   * every new entry.  We keep logEndRef for potential future manual
   * scrolling needs, but omit the automatic behaviour.
   */
  
  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copiedId) {
      const timer = setTimeout(() => setCopiedId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedId]);
  
  // Toggle expanded state for a log
  const toggleExpand = (index) => {
    setExpandedLogs(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Handle copying log to clipboard
  const handleCopy = async (log, index) => {
    const success = await copyToClipboard(formatJson(log));
    if (success) setCopiedId(`log-${index}`);
  };
  
  // Handle copying as cURL command
  const handleCopyAsCurl = async (request, index) => {
    const success = await copyAsCurl(request);
    if (success) setCopiedId(`curl-${index}`);
  };
  
  // Filter logs based on selected filter
  const filteredLogs = logs.filter(log => {
    if (filter === 'all') return true;
    return log.status === filter;
  });
  
  // Get icon for log status
  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        );
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mt-4 max-h-[600px] overflow-y-auto">
      {/* Header with controls */}
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-white z-10 pb-2 border-b">
        <h2 className="text-lg font-semibold text-stripe-dark">API Log ({filteredLogs.length})</h2>
        
        <div className="flex space-x-2">
          {/* Filter dropdown */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="form-input text-sm py-1 px-2"
          >
            <option value="all">All Logs</option>
            <option value="success">Success</option>
            <option value="error">Errors</option>
            <option value="info">Info</option>
          </select>
          
          {/* Export button */}
          <button
            onClick={exportLogs}
            className="form-button py-1 px-2 text-sm bg-gray-100 text-gray-800 hover:bg-gray-200"
            title="Export logs as JSON"
            disabled={logs.length === 0}
          >
            Export
          </button>
          
          {/* Clear button */}
          <button
            onClick={clearLogs}
            className="form-button py-1 px-2 text-sm bg-gray-100 text-gray-800 hover:bg-gray-200"
            title="Clear all logs"
            disabled={logs.length === 0}
          >
            Clear
          </button>
        </div>
      </div>
      
      {/* Empty state */}
      {filteredLogs.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <svg className="w-12 h-12 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="mt-2">No logs to display</p>
          <p className="text-sm">Start by entering a booking URL</p>
        </div>
      )}
      
      {/* Log entries */}
      <div className="space-y-3">
        {filteredLogs.map((log, index) => {
          const isExpanded = expandedLogs[index] || false;
          const logKey = filteredLogs.length - 1 - index; // Reverse order
          const actualLog = logs[logKey];
          
          return (
            <div 
              key={`log-${logKey}`} 
              className={`${getLogStatusClass(actualLog.status)} rounded-md overflow-hidden`}
            >
              {/* Log header */}
              <div 
                className="flex justify-between items-center p-3 cursor-pointer hover:bg-opacity-80"
                onClick={() => toggleExpand(index)}
              >
                <div className="flex items-center space-x-2">
                  {getStatusIcon(actualLog.status)}
                  
                  <div>
                    <span className="font-medium">{actualLog.label}</span>
                    {actualLog.message && (
                      <span className="ml-2 text-sm">{actualLog.message}</span>
                    )}
                    <span className="ml-2 text-xs text-gray-500">
                      {formatTimestamp(actualLog.timestamp)}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  {/* Copy button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(actualLog, index);
                    }}
                    className="text-xs bg-white bg-opacity-30 hover:bg-opacity-50 px-2 py-1 rounded"
                    title="Copy log as JSON"
                  >
                    {copiedId === `log-${index}` ? 'Copied!' : 'Copy'}
                  </button>
                  
                  {/* cURL button (only for API requests) */}
                  {actualLog.request && actualLog.request.url && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyAsCurl(actualLog.request, index);
                      }}
                      className="text-xs bg-white bg-opacity-30 hover:bg-opacity-50 px-2 py-1 rounded"
                      title="Copy as cURL command"
                    >
                      {copiedId === `curl-${index}` ? 'Copied!' : 'cURL'}
                    </button>
                  )}
                  
                  {/* Expand/collapse indicator */}
                  <svg 
                    className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              
              {/* Expanded content */}
              {isExpanded && (
                <div className="p-3 bg-white">
                  {/* Request details */}
                  {actualLog.request && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Request</h4>
                      <JsonViewer data={actualLog.request} initialCollapsed={true} />
                    </div>
                  )}
                  
                  {/* Response data */}
                  {actualLog.response && (
                    <div className="mb-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Response</h4>
                      <JsonViewer data={actualLog.response} initialCollapsed={true} />
                    </div>
                  )}
                  
                  {/* Error details */}
                  {actualLog.error && (
                    <div>
                      <h4 className="text-sm font-medium text-red-600 mb-1">Error</h4>
                      <JsonViewer data={actualLog.error} initialCollapsed={true} />
                    </div>
                  )}
                  
                  {/* Additional data for info logs */}
                  {actualLog.data && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Data</h4>
                      <JsonViewer data={actualLog.data} initialCollapsed={true} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Auto-scroll anchor */}
      <div ref={logEndRef} />
    </div>
  );
};

export default LogDisplay;
