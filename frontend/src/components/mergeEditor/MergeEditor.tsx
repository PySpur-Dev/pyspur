import React from 'react';

export interface MergeEditorProps {
  inputSchemas?: Record<string, unknown>;
  branchRefs?: string[];
  onChange: (newValue: Record<string, unknown> | string[]) => void;
  nodeId: string;
}

export const MergeEditor: React.FC<MergeEditorProps> = ({
  inputSchemas,
  branchRefs,
  onChange,
  nodeId
}) => {
  if (branchRefs !== undefined) {
    return (
      <div className="w-full">
        <div className="flex flex-col gap-2">
          {branchRefs.map((ref, index) => (
            <div key={`${nodeId}-${index}`} className="p-2 border rounded">
              <div className="font-semibold mb-1">Branch {index + 1}</div>
              <div className="text-sm">{ref}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2">
        {Object.entries(inputSchemas || {}).map(([key, schema]) => (
          <div key={`${nodeId}-${key}`} className="p-2 border rounded">
            <div className="font-semibold mb-1">{key}</div>
            <pre className="text-sm bg-gray-50 p-2 rounded">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
};
