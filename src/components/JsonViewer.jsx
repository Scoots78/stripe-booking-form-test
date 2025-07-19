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
    
    switch (type) {
      case 'object': {
        return renderObject(value, currentPath, key);
      }
      case 'array': {
        return renderArray(value, currentPath, key);
      }
      case 'string': {
        return <span className="json-string">&quot;{value}&quot;</span>;
      }
      case 'number': {
        return <span className="json-number">{value}</span>;
      }
      case 'boolean': {
        return <span className="json-boolean">{value.toString()}</span>;
      }
      case 'null': {
        return <span className="json-null">null</span>;
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
      <div className="json-object">
        <span onClick={toggleCollapse(path)} className="cursor-pointer">
          {label && <span className="json-key">{label}: </span>}
          {isEmpty ? (
            <span>{'{}'}</span>
          ) : (
            <>
              <span>{isCollapsed ? '{...}' : '{'}</span>
              {!isCollapsed && (
                <span className="text-gray-400 text-xs ml-1">
                  {Object.keys(obj).length} {Object.keys(obj).length === 1 ? 'item' : 'items'}
                </span>
              )}
            </>
          )}
        </span>
        
        {!isEmpty && !isCollapsed && (
          <div className="pl-4 border-l border-gray-200">
            {Object.entries(obj).map(([key, value], index) => (
              <div key={`${path}-${key}-${index}`} className="my-1">
                {renderValue(value, key, null, path)}
              </div>
            ))}
          </div>
        )}
        
        {!isEmpty && !isCollapsed && <div>{'}'}</div>}
      </div>
    );
  };

  // Render an array with collapsible functionality
  const renderArray = (arr, path, label = null) => {
    const isCollapsed = isPathCollapsed(path);
    const isEmpty = arr.length === 0;
    
    return (
      <div className="json-array">
        <span onClick={toggleCollapse(path)} className="cursor-pointer">
          {label && <span className="json-key">{label}: </span>}
          {isEmpty ? (
            <span>[]</span>
          ) : (
            <>
              <span>{isCollapsed ? '[...]' : '['}</span>
              {!isCollapsed && (
                <span className="text-gray-400 text-xs ml-1">
                  {arr.length} {arr.length === 1 ? 'item' : 'items'}
                </span>
              )}
            </>
          )}
        </span>
        
        {!isEmpty && !isCollapsed && (
          <div className="pl-4 border-l border-gray-200">
            {arr.map((item, index) => (
              <div key={`${path}-${index}`} className="my-1">
                {renderValue(item, null, index, path)}
              </div>
            ))}
          </div>
        )}
        
        {!isEmpty && !isCollapsed && <div>{']'}</div>}
      </div>
    );
  };

  // Main render for the root JSON viewer
  if (data === undefined || data === null) {
    return <div className="json-viewer">null</div>;
  }

  return (
    <div className="json-viewer relative">
      {/* Copy button */}
      <button 
        onClick={copyToClipboard}
        className="copy-button"
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
