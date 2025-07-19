import { useCallback } from 'react';
import { useFlow } from '../context/FlowContext';

/**
 * Custom hook for structured logging with formatting and utility functions
 * @returns {Object} - Logging utilities and functions
 */
const useLogger = () => {
  const { logs, addLog, clearLogs, logApiCall } = useFlow();

  /**
   * Format JSON data for display
   * @param {Object} data - JSON data to format
   * @returns {string} - Formatted JSON string
   */
  const formatJson = useCallback((data) => {
    try {
      if (!data) return 'null';
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return `Error formatting JSON: ${error.message}`;
    }
  }, []);

  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   * @returns {Promise<boolean>} - Success status
   */
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }, []);

  /**
   * Copy a log entry to clipboard as formatted JSON
   * @param {Object} log - Log entry to copy
   * @returns {Promise<boolean>} - Success status
   */
  const copyLogToClipboard = useCallback(async (log) => {
    const logText = formatJson(log);
    return copyToClipboard(logText);
  }, [formatJson, copyToClipboard]);

  /**
   * Copy a request as cURL command
   * @param {Object} requestData - Request data from log
   * @returns {Promise<boolean>} - Success status
   */
  const copyAsCurl = useCallback(async (requestData) => {
    if (!requestData || !requestData.url) return false;
    
    try {
      const { url, method = 'GET', params } = requestData;
      
      // Build the base URL with query params if it's a GET request
      let fullUrl = url;
      if (method.toUpperCase() === 'GET' && params) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          queryParams.append(key, value);
        });
        fullUrl = `${url}${url.includes('?') ? '&' : '?'}${queryParams.toString()}`;
      }
      
      // Build the cURL command
      let curlCommand = `curl -X ${method.toUpperCase()} "${fullUrl}"`;
      
      // Add headers
      curlCommand += ' -H "Content-Type: application/json"';
      
      // Add body for non-GET requests
      if (method.toUpperCase() !== 'GET' && params) {
        curlCommand += ` -d '${JSON.stringify(params)}'`;
      }
      
      return copyToClipboard(curlCommand);
    } catch (error) {
      console.error('Failed to generate cURL command:', error);
      return false;
    }
  }, [copyToClipboard]);

  /**
   * Export all logs as JSON file
   */
  const exportLogs = useCallback(() => {
    try {
      const logsJson = JSON.stringify(logs, null, 2);
      const blob = new Blob([logsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link and trigger click
      const a = document.createElement('a');
      a.href = url;
      a.download = `eveve-stripe-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  }, [logs]);

  /**
   * Log an API call with request and response details
   * @param {string} label - Log entry label
   * @param {Object} request - Request details
   * @param {Object} response - Response data
   * @param {Object|null} error - Error details (if any)
   */
  const logApi = useCallback((label, request, response, error = null) => {
    logApiCall(label, request, response, error);
  }, [logApiCall]);

  /**
   * Log an informational message
   * @param {string} message - Info message
   * @param {Object} data - Additional data (optional)
   */
  const logInfo = useCallback((message, data = null) => {
    addLog({
      label: 'INFO',
      message,
      data,
      status: 'info',
    });
  }, [addLog]);

  /**
   * Log a success message
   * @param {string} message - Success message
   * @param {Object} data - Additional data (optional)
   */
  const logSuccess = useCallback((message, data = null) => {
    addLog({
      label: 'SUCCESS',
      message,
      data,
      status: 'success',
    });
  }, [addLog]);

  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Object} error - Error details (optional)
   */
  const logError = useCallback((message, error = null) => {
    addLog({
      label: 'ERROR',
      message,
      error,
      status: 'error',
    });
  }, [addLog]);

  /**
   * Get CSS class for log status
   * @param {string} status - Log status ('success', 'error', 'info')
   * @returns {string} - CSS class name
   */
  const getLogStatusClass = useCallback((status) => {
    switch (status) {
      case 'success': return 'api-log success';
      case 'error': return 'api-log error';
      case 'info': return 'api-log info';
      default: return 'api-log';
    }
  }, []);

  /**
   * Format timestamp for display
   * @param {string} timestamp - ISO timestamp
   * @returns {string} - Formatted time string
   */
  const formatTimestamp = useCallback((timestamp) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        fractionalSecondDigits: 3
      });
    } catch (error) {
      return timestamp;
    }
  }, []);

  return {
    logs,
    clearLogs,
    formatJson,
    copyToClipboard,
    copyLogToClipboard,
    copyAsCurl,
    exportLogs,
    logApi,
    logInfo,
    logSuccess,
    logError,
    getLogStatusClass,
    formatTimestamp,
  };
};

export default useLogger;
