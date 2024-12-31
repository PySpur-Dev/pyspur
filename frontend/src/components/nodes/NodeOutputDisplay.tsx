import React from 'react';
import Markdown from 'react-markdown';

interface NodeOutputDisplayProps {
  output: Record<string, any>;
}

const NodeOutputDisplay: React.FC<NodeOutputDisplayProps> = ({ output }) => {
  return (
    <>
      {output && (
        <div
          className='p-5'
          style={{ maxHeight: '400px', overflowY: 'auto', touchAction: 'none' }}
          onWheel={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <div>
            {Object.entries(output).map(([key, value]) => (
              <div key={key} className="my-2 flex flex-col items-start">
                <label className="text-sm font-semibold mb-1 block">{key}:</label>
                <div className="ml-2 mt-auto">
                  <Markdown>{JSON.stringify(value, null, 1)}</Markdown>
                </div>
              </div>
            ))}
          </div>
        </div>)
      }
    </>
  );
};

export default NodeOutputDisplay;
