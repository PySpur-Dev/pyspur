import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useDispatch, useSelector } from 'react-redux';
import BaseNode from './base/BaseNode';
import {
  setWorkflowInputVariable,
  deleteWorkflowInputVariable,
  updateWorkflowInputVariableKey,
} from '../../store/flowSlice';
import { Input, Button } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import { RootState } from '../../store/store';
import { BaseNodeData, BaseNodeProps, BaseNodeConfig, WorkflowNode } from '../../types/nodes/base';

interface InputNodeConfig extends BaseNodeConfig {
  input_schema?: Record<string, string>;
  output_schema?: Record<string, string>;
}

interface InputNodeData extends Omit<BaseNodeData, 'config'> {
  config: InputNodeConfig;
}

interface InputNodeProps extends Omit<BaseNodeProps, 'data'> {
  data: InputNodeData;
}

const InputNode: React.FC<InputNodeProps> = ({ id, data, isCollapsed, setIsCollapsed, ...props }) => {
  const dispatch = useDispatch();
  const workflowInputVariables = useSelector((state: RootState) => state.flow.workflowInputVariables);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [nodeWidth, setNodeWidth] = useState<string>('auto');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [newFieldValue, setNewFieldValue] = useState<string>('');

  const workflowInputKeys = Object.keys(workflowInputVariables);

  useEffect(() => {
    if (nodeRef.current && data?.config) {
      const maxLabelLength = Math.max(
        ...workflowInputKeys.map((label: string) => label.length),
        (data.config.title || '').length / 1.5
      );

      const calculatedWidth = Math.max(300, maxLabelLength * 15);
      setNodeWidth(`${calculatedWidth}px`);
    }
  }, [workflowInputKeys, data?.config]);

  const saveWorkflow = useSaveWorkflow();
  const nodes = useSelector((state: RootState) => state.flow.nodes);

  const syncAndSave = useCallback(() => {
    const inputNode = nodes.find((node: WorkflowNode) => node.id === id);
    if (!inputNode) return;
    saveWorkflow();
  }, [id, nodes, saveWorkflow]);

  useEffect(() => {
    syncAndSave();
  }, [workflowInputVariables, syncAndSave]);

  const handleAddWorkflowInputVariable = useCallback(() => {
    if (!newFieldValue.trim()) return;

    dispatch(setWorkflowInputVariable({
      key: newFieldValue,
      value: ''
    }));

    setNewFieldValue('');
    syncAndSave();
  }, [dispatch, newFieldValue, syncAndSave]);

  const handleDeleteWorkflowInputVariable = useCallback(
    (keyToDelete: string) => {
      dispatch(deleteWorkflowInputVariable({ key: keyToDelete }));
    },
    [dispatch]
  );

  const handleWorkflowInputVariableKeyEdit = useCallback(
    (oldKey: string, newKey: string) => {
      if (oldKey === newKey || !newKey.trim()) {
        setEditingField(null);
        return;
      }

      dispatch(updateWorkflowInputVariableKey({ oldKey, newKey }));
      setEditingField(null);
    },
    [dispatch]
  );

  const renderWorkflowInputs = () => {
    return (
      <div className="node-handles-wrapper" id="handles">
        <div className="node-handles-column">
          {workflowInputKeys.length > 0 && (
            <table className="w-full">
              <tbody>
                {workflowInputKeys.map((key) => (
                  <tr key={key} className="relative w-full px-4 py-2">
                    <td className="node-handle-cell">
                      {!isCollapsed && (
                        <div className="flex items-center gap-2">
                          {editingField === key ? (
                            <Input
                              autoFocus
                              defaultValue={key}
                              size="sm"
                              variant="faded"
                              radius="lg"
                              onBlur={(e) => {
                                const target = e.target as HTMLInputElement;
                                handleWorkflowInputVariableKeyEdit(key, target.value);
                              }}
                              onKeyDown={(e) => {
                                const target = e.target as HTMLInputElement;
                                if (e.key === 'Enter') {
                                  handleWorkflowInputVariableKeyEdit(key, target.value);
                                } else if (e.key === 'Escape') {
                                  setEditingField(null);
                                }
                              }}
                              classNames={{
                                input: 'bg-default-100',
                                inputWrapper: 'shadow-none',
                              }}
                            />
                          ) : (
                            <div className="flex flex-col w-full gap-1">
                              <div className="flex items-center justify-between">
                                <span
                                  className="node-handle-label text-sm font-medium cursor-pointer hover:text-primary"
                                  onClick={() => setEditingField(key)}
                                >
                                  {key}
                                </span>
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  onClick={() => handleDeleteWorkflowInputVariable(key)}
                                  className="text-default-400 hover:text-danger"
                                >
                                  <Icon icon="solar:trash-bin-minimalistic-linear" width={16} />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="node-handle-cell border-l border-default-200 w-0 ml-2">
                      <div className="relative">
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={key}
                          className={`node-handle node-handle-output ${isCollapsed ? 'node-handle-collapsed' : ''}`}
                          isConnectable={!isCollapsed}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  };

  const renderAddField = () =>
    !isCollapsed && (
      <div className="flex items-center gap-2 px-4 py-2">
        <Input
          placeholder="Enter new field name"
          value={newFieldValue}
          onChange={(e) => setNewFieldValue(e.target.value)}
          size="sm"
          variant="faded"
          radius="lg"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleAddWorkflowInputVariable();
            }
          }}
          classNames={{
            input: 'bg-default-100',
            inputWrapper: 'shadow-none',
          }}
          endContent={
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onClick={handleAddWorkflowInputVariable}
              className="text-default-400 hover:text-primary"
            >
              <Icon icon="solar:add-circle-bold" width={16} />
            </Button>
          }
        />
      </div>
    );

  return (
    <div className="node-container">
      <BaseNode
        id={id}
        type="input"
        isInputNode={true}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        data={{
          ...data,
          title: data.config?.title || 'Input Node',
          color: data.color || '#2196F3',
          acronym: 'IN',
          config: {
            ...data.config,
            title: data.config?.title || 'Input Node'
          }
        }}
        style={{ width: nodeWidth }}
        className="hover:!bg-background"
        {...props}
      >
        <div className="node-content" ref={nodeRef}>
          {renderWorkflowInputs()}
          {renderAddField()}
        </div>
      </BaseNode>
    </div>
  );
};

export default InputNode;
