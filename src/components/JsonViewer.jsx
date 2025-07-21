import { useState, useCallback } from 'react';

/**
 * Custom JSON viewer component with syntax highlighting and collapsible sections
 */
const JsonViewer = ({ data, initialCollapsed = false, level = 0, label = null }) => {
  const [copied, setCopied] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState({});

  // Format the JSON data as a string
  const jsonString = JSON.stringify(data, null, 2);

  // Copy JSON to clipboard
  const copyToClipboard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [jsonString]);

  // Toggle collapse state for a specific path
  const toggleCollapse = useCallback((path) => (e) => {
    e.stopPropagation();
    setCollapsedPaths(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  }, []);

  // Check if a path is collapsed
  const isPathCollapsed = useCallback((path) => {
    return collapsedPaths[path] === undefined 
      ? initialCollapsed && level > 0 
      : collapsedPaths[path];
  }, [collapsedPaths, initialCollapsed, level]);

  // Determine the type of the data
  const getType = (value) => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  };

  // Render a value based on its type
  const renderValue = (value, key = null, arrayIndex = null, path = '') => {
    const type = getType(value);
    const currentPath = key ? 
      (path ? `${path}.${key}` : key) : 
      (arrayIndex !== null ? `${path}[${arrayIndex}]` : path);
    
    // If this is an array item with an index
    if (arrayIndex !== null) {
      return (
        <div className="flex">
          <span className="text-yellow-600">{arrayIndex}: </span>
          {renderValueByType(value, type, currentPath, null)}
        </div>
      );
    }
    
    // If this is a key-value pair
    if (key !== null) {
      return (
        <div className="flex">
          <span className="text-blue-600 font-medium">{key}</span>
          <span className="text-gray-900">: </span>
          {renderValueByType(value, type, currentPath, null)}
        </div>
      );
    }
    
    // If this is a standalone value (root)
    return renderValueByType(value, type, currentPath, label);
  };
  
  // Helper function to render the actual value based on its type
  const renderValueByType = (value, type, path, label) => {
    switch (type) {
      case 'object': {
        return renderObject(value, path, label);
      }
      case 'array': {
        return renderArray(value, path, label);
      }
      case 'string': {
        return <span className="text-red-600">&quot;{value}&quot;</span>;
      }
      case 'number': {
        return <span className="text-green-600">{value}</span>;
      }
      case 'boolean': {
        return <span className="text-blue-500">{value.toString()}</span>;
      }
      case 'null': {
        return <span className="text-blue-500">null</span>;
      }
      default: {
        return <span>{String(value)}</span>;
      }
    }
  };

  // Render an object with collapsible functionality
  const renderObject = (obj, path, label = null) => {
    const isCollapsed = isPathCollapsed(path);
    const isEmpty = Object.keys(obj).length === 0;
    
    return (
      <div className="my-1">
        <div onClick={toggleCollapse(path)} className="cursor-pointer flex">
          {label && (
            <>
              <span className="text-blue-600 font-medium">{label}</span>
              <span className="text-gray-900">: </span>
            </>
          )}
          {isEmpty ? (
            <span className="text-gray-900">{'{}'}</span>
          ) : (
            <>
              <span className="text-gray-900">{'{'}</span>
              {isCollapsed && <span className="text-gray-400">...</span>}
              {!isCollapsed && (
                <span className="text-gray-400 text-xs ml-1">
                  {Object.keys(obj).length} {Object.keys(obj).length === 1 ? 'item' : 'items'}
                </span>
              )}
            </>
          )}
        </div>
        
        {!isEmpty && !isCollapsed && (
          <div className="pl-4 border-l border-gray-200 ml-2">
            {Object.entries(obj).map(([key, value], index) => (
              <div key={`${path}-${key}-${index}`} className="my-1">
                {renderValue(value, key, null, path)}
              </div>
            ))}
          </div>
        )}
        
        {!isEmpty && !isCollapsed && <div className="text-gray-900">{'}'}</div>}
      </div>
    );
  };

  // Render an array with collapsible functionality
  const renderArray = (arr, path, label = null) => {
    const isCollapsed = isPathCollapsed(path);
    const isEmpty = arr.length === 0;
    
    return (
      <div className="my-1">
        <div onClick={toggleCollapse(path)} className="cursor-pointer flex">
          {label && (
            <>
              <span className="text-blue-600 font-medium">{label}</span>
              <span className="text-gray-900">: </span>
            </>
          )}
          {isEmpty ? (
            <span className="text-gray-900">{'[]'}</span>
          ) : (
            <>
              <span className="text-gray-900">{'['}</span>
              {isCollapsed && <span className="text-gray-400">...</span>}
              {!isCollapsed && (
                <span className="text-gray-400 text-xs ml-1">
                  {arr.length} {arr.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </>
          )}
        </div>
        
        {!isEmpty && !isCollapsed && (
          <div className="pl-4 border-l border-gray-200 ml-2">
            {arr.map((item, index) => (
              <div key={`${path}-${index}`} className="my-1">
                {renderValue(item, null, index, path)}
              </div>
            ))}
          </div>
        )}
        
        {!isEmpty && !isCollapsed && <div className="text-gray-900">{']'}</div>}
      </div>
    );
  };

  // Main render for the root JSON viewer
  if (data === undefined || data === null) {
    return <div className="font-mono text-sm">null</div>;
  }

  return (
    <div className="relative font-mono text-sm leading-relaxed">
      {/* Copy button */}
      <button 
        onClick={copyToClipboard}
        className="absolute top-0 right-0 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
        title="Copy to clipboard"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      
      {/* Root object or array */}
      <div className="pt-8">
        {renderValue(data, label)}
      </div>
    </div>
  );
};

export default JsonViewer;
