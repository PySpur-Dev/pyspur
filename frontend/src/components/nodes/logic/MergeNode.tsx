import React, { useState, useMemo, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import BaseNode from '../base/BaseNode';
import { NodeData, BaseNodeConfig, WorkflowNode, BaseNodeProps } from '../../../types/nodes/base';

interface MergeNodeConfig extends BaseNodeConfig {
  branch_refs: string[];
}

interface MergeNodeData extends NodeData<MergeNodeConfig> {
  config: MergeNodeConfig;
}

interface MergeNodeProps extends Omit<BaseNodeProps<MergeNodeConfig>, 'isCollapsed' | 'setIsCollapsed'> {
  id: string;
  data: MergeNodeData;
  selected?: boolean;
}

// Use WorkflowNode instead of custom FlowNode interface
type FlowNode = WorkflowNode<MergeNodeConfig>;

const MergeNode: React.FC<MergeNodeProps> = ({
  id,
  data,
  selected,
  type,
  dragging,
  zIndex,
  isConnectable = true,
  positionAbsoluteX,
  positionAbsoluteY,
  ...props
}) => {
  const edges = useSelector((state: RootState) => state.flow.edges);
  const nodes = useSelector((state: RootState) => state.flow.nodes) as FlowNode[];
  const [isCollapsed, setIsCollapsed] = useState(false);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  // Get incoming branches based on connected edges, ensuring uniqueness
  const incomingBranches = useMemo(() => {
    const branchMap = new Map();

    edges
      .filter(edge => edge.target === id)
      .forEach(edge => {
        const sourceNode = nodes.find(node => node.id === edge.source);
        if (!branchMap.has(edge.source)) {
          branchMap.set(edge.source, {
            id: edge.source,
            sourceHandle: edge.sourceHandle,
            label: sourceNode?.data?.config?.title || sourceNode?.id || 'Unknown Source'
          });
        }
      });

    return Array.from(branchMap.values());
  }, [edges, nodes, id]);

  return (
    <div className="node-wrapper">
      <BaseNode
        id={id}
        data={data}
        type={type}
        dragging={dragging}
        zIndex={zIndex}
        isConnectable={isConnectable}
        selected={selected}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        positionAbsoluteX={positionAbsoluteX}
        positionAbsoluteY={positionAbsoluteY}
        className="hover:!bg-background"
        {...props}
      >
        <div className="flex flex-col gap-3" ref={nodeRef}>
          {!isCollapsed && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500">
                  Incoming Branches ({incomingBranches.length})
                </div>
              </div>

              {incomingBranches.length === 0 ? (
                <div className="text-xs text-gray-400 italic p-2 border border-dashed border-gray-200 rounded-md text-center">
                  Connect branches to continue the flow
                </div>
              ) : (
                incomingBranches.map((branch) => (
                  <div key={branch.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                    <div className="text-sm">
                      <span className="font-medium">{branch.label}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Input Handle */}
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            className={`node-handle node-handle-input ${isCollapsed ? 'collapsed' : ''}`}
          />

          {/* Output Handle */}
          <Handle
            type="source"
            position={Position.Right}
            id="result"
            className={`node-handle node-handle-output ${isCollapsed ? 'collapsed' : ''}`}
          />
        </div>
      </BaseNode>
    </div>
  );
};

export default MergeNode;
