import React from 'react';
import Markdown from 'react-markdown';
import { BaseNodeData } from '../../types/nodes/base';

interface Node {
  id: string;
  data?: BaseNodeData;
}

interface NodeOutputDisplayProps {
  node?: Node;
}

const NodeOutputDisplay: React.FC<NodeOutputDisplayProps> = ({ node }) => {
  const nodeID = node?.id;
  const output = node?.data?.run;

  return (
    <div className="w-full">
      {output ? (
        <div className="space-y-4">
          {Object.entries(output).map(([key, value]) => (
            <div key={key} className="flex flex-col gap-2 p-2 rounded-lg bg-gray-50">
              <label className="text-sm font-semibold text-gray-700">{key}</label>
              <div className="prose prose-sm max-w-none">
                <Markdown>{String(value)}</Markdown>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic text-center py-2">
          No output available
        </div>
      )}
    </div>
  );
};

export default NodeOutputDisplay;
