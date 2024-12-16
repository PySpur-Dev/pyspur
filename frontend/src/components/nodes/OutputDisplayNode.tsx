import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Handle, useHandleConnections, Position, NodeProps } from '@xyflow/react';
import { useSelector, useDispatch } from 'react-redux';
import BaseNode from './BaseNode';
import styles from './OutputDisplayNode.module.css';
import { Input } from '@nextui-org/react';
import {
  updateNodeData,
  updateEdgesOnHandleRename,
} from '../../store/flowSlice';
import NodeOutputDisplay from './NodeOutputDisplay';
import NodeOutputModal from './NodeOutputModal';
import { NodeData, BaseNodeProps, DynamicNodeConfig, WorkflowNode } from '../../types/nodes/base';
import { RootState } from '../../store/store';

interface MessageVariables {
  message: string;
  oldKey: string;
  newKey: string;
}

const updateMessageVariables = ({ message, oldKey, newKey }: MessageVariables): string => {
  if (!message) return message;
  const regex = new RegExp(`{{\\s*${oldKey}\\s*}}`, 'g');
  return message.replace(regex, `{{${newKey}}}`);
};

interface OutputDisplayNodeProps extends BaseNodeProps<DynamicNodeConfig> {
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}

interface HandleRowProps {
  keyName: string;
  onDelete?: (key: string) => void;
  onEdit?: (key: string, newKey: string) => void;
}

const OutputDisplayNode: React.FC<OutputDisplayNodeProps> = ({
  id,
  type,
  data: nodeData,
  selected,
  isCollapsed = false,
  setIsCollapsed = () => {},
  ...props
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [nodeWidth, setNodeWidth] = useState<string>('auto');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const dispatch = useDispatch();

  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const handleDelete = useCallback((key: string) => {
    if (!nodeData?.config) return;

    const updatedConfig = { ...nodeData.config };
    if (updatedConfig.input_schema) delete updatedConfig.input_schema[key];
    if (updatedConfig.output_schema) delete updatedConfig.output_schema[key];
    dispatch(
      updateNodeData({
        id,
        data: {
          ...nodeData,
          config: updatedConfig,
        },
      })
    );
  }, [dispatch, id, nodeData]);

  const handleSchemaKeyEdit = useCallback(
    (oldKey: string, newKey: string, schemaType: 'input_schema' | 'output_schema') => {
      newKey = newKey.replace(/\s+/g, '_');
      if (oldKey === newKey || !newKey.trim()) {
        setEditingField(null);
        return;
      }

      if (!nodeData?.config) return;

      const updatedSchema = {
        ...nodeData.config?.[schemaType] || {},
        [newKey]: nodeData.config?.[schemaType]?.[oldKey],
      };
      delete updatedSchema[oldKey];

      const updatedConfig = {
        ...nodeData.config,
        [schemaType]: updatedSchema,
      };

      if (schemaType === 'input_schema') {
        if (nodeData.config.system_message) {
          updatedConfig.system_message = updateMessageVariables({
            message: nodeData.config.system_message,
            oldKey,
            newKey,
          });
        }
        if (nodeData.config.user_message) {
          updatedConfig.user_message = updateMessageVariables({
            message: nodeData.config.user_message,
            oldKey,
            newKey,
          });
        }
      }

      dispatch(
        updateNodeData({
          id,
          data: {
            ...nodeData,
            config: updatedConfig,
          },
        })
      );

      dispatch(
        updateEdgesOnHandleRename({
          nodeId: id,
          oldHandleId: oldKey,
          newHandleId: newKey,
          schemaType,
        })
      );

      setEditingField(null);
    },
    [dispatch, id, nodeData]
  );

  useEffect(() => {
    if (!nodeRef.current || !nodeData) return;

    const inputSchema = nodeData.config['input_schema'] || {};
    const outputSchema = nodeData.config['output_schema'] || {};

    const inputLabels = Object.keys(inputSchema);
    const outputLabels = Object.keys(outputSchema);

    const maxInputLabelLength = inputLabels.reduce((max, label) => Math.max(max, label.length), 0);
    const maxOutputLabelLength = outputLabels.reduce((max, label) => Math.max(max, label.length), 0);
    const titleLength = ((nodeData.title || '').length + 10) * 1.25;

    const maxLabelLength = Math.max(
      (maxInputLabelLength + maxOutputLabelLength + 5),
      titleLength
    );

    const minNodeWidth = 300;
    const maxNodeWidth = 600;

    const finalWidth = Math.min(
      Math.max(maxLabelLength * 10, minNodeWidth),
      maxNodeWidth
    );

    setNodeWidth(`${finalWidth}px`);
  }, [nodeData]);

  const InputHandleRow: React.FC<HandleRowProps> = ({ keyName }) => {
    const connections = useHandleConnections({
      type: 'target',
      id: keyName
    });

    return (
      <div className={`${styles.handleRow} w-full justify-end`} key={keyName} id={`input-${keyName}-row`}>
        <div className={`${styles.handleCell} ${styles.inputHandleCell}`} id={`input-${keyName}-handle`}>
          <Handle
            type="target"
            position={Position.Left}
            id={keyName}
            className={`${styles.handle} ${styles.handleLeft} ${isCollapsed ? styles.collapsedHandleInput : ''}`}
            isConnectable={!isCollapsed && connections.length === 0}
          />
        </div>
        {!isCollapsed && (
          <div className="align-center flex flex-grow flex-shrink ml-[0.5rem] max-w-full overflow-hidden" id={`input-${keyName}-label`}>
            {editingField === keyName ? (
              <Input
                autoFocus
                defaultValue={keyName}
                size="sm"
                variant="faded"
                radius="lg"
                onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                  handleSchemaKeyEdit(keyName, e.currentTarget.value, 'input_schema')
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    handleSchemaKeyEdit(keyName, e.currentTarget.value, 'input_schema');
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
              <span
                className={`${styles.handleLabel} text-sm font-medium cursor-pointer hover:text-primary mr-auto overflow-hidden text-ellipsis whitespace-nowrap`}
                onClick={() => setEditingField(keyName)}
              >
                {keyName}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const OutputHandleRow: React.FC<HandleRowProps> = ({ keyName }) => {
    return (
      <div className={`${styles.handleRow} w-full justify-end`} key={`output-${keyName}`} id={`output-${keyName}-row`}>
        {!isCollapsed && (
          <div className="align-center flex flex-grow flex-shrink mr-[0.5rem] max-w-full overflow-hidden" id={`output-${keyName}-label`}>
            {editingField === keyName ? (
              <Input
                autoFocus
                defaultValue={keyName}
                size="sm"
                variant="faded"
                radius="lg"
                onBlur={(e: React.FocusEvent<HTMLInputElement>) =>
                  handleSchemaKeyEdit(keyName, e.currentTarget.value, 'output_schema')
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    handleSchemaKeyEdit(keyName, e.currentTarget.value, 'output_schema');
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
              <span
                className={`${styles.handleLabel} text-sm font-medium cursor-pointer hover:text-primary ml-auto overflow-hidden text-ellipsis whitespace-nowrap`}
                onClick={() => setEditingField(keyName)}
              >
                {keyName}
              </span>
            )}
          </div>
        )}
        <div className="border-l border-gray-300 h-full mx-0"></div>
        <div className={`${styles.handleCell} ${styles.outputHandleCell}`} id={`output-${keyName}-handle`}>
          <Handle
            type="source"
            position={Position.Right}
            id={keyName}
            className={`${styles.handle} ${styles.handleRight} ${isCollapsed ? styles.collapsedHandleOutput : ''}`}
            isConnectable={!isCollapsed}
          />
        </div>
      </div>
    );
  };

  const renderHandles = () => {
    const inputSchema = nodeData.config.input_schema || {};
    const outputSchema = nodeData.config.output_schema || {};

    return (
      <>
        <div className={styles.inputHandles}>
          {Object.keys(inputSchema).map((key) => (
            <InputHandleRow
              key={key}
              keyName={key}
              onDelete={handleDelete}
              onEdit={(oldKey, newKey) =>
                handleSchemaKeyEdit(oldKey, newKey, 'input_schema')
              }
            />
          ))}
        </div>
        <div className={styles.outputHandles}>
          {Object.keys(outputSchema).map((key) => (
            <OutputHandleRow
              key={key}
              keyName={key}
              onDelete={handleDelete}
              onEdit={(oldKey, newKey) =>
                handleSchemaKeyEdit(oldKey, newKey, 'output_schema')
              }
            />
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <BaseNode
        {...props}
        id={id}
        data={nodeData}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        handleOpenModal={handleOpenModal}
        className={styles.outputDisplayNode}
        style={{ width: nodeWidth }}
      >
        {renderHandles()}
      </BaseNode>
      {isModalOpen && (
        <NodeOutputModal
          title={nodeData.title || ''}
          isOpen={isModalOpen}
          onOpenChange={(isOpen) => setIsModalOpen(isOpen)}
          node={{
            id,
            type,
            data: nodeData,
            position: { x: 0, y: 0 }, // Position is required but not used in modal
          }}
          nodeData={nodeData}
        />
      )}
    </>
  );
};

export default OutputDisplayNode;
