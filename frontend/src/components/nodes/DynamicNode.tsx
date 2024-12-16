import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Handle, useHandleConnections, Position } from '@xyflow/react';
import { useSelector, useDispatch } from 'react-redux';
import BaseNode from './base/BaseNode';
import { Input } from '@nextui-org/react';
import {
  updateNodeData,
  updateEdgesOnHandleRename,
} from '../../store/flowSlice';
import { selectPropertyMetadata } from '../../store/nodeTypesSlice';
import { RootState } from '../../store/store';
import { NodeData, BaseNodeProps, DynamicNodeConfig, WorkflowNode } from '../../types/nodes/base';

interface SchemaMetadata {
  required?: boolean;
  title?: string;
  type?: string;
  [key: string]: unknown;
}

const updateMessageVariables = (message: string | undefined, oldKey: string, newKey: string): string | undefined => {
  if (!message) return message;

  const regex = new RegExp(`{{\\s*${oldKey}\\s*}}`, 'g');
  return message.replace(regex, `{{${newKey}}}`);
};

type DynamicNodeProps = BaseNodeProps<DynamicNodeConfig>;

const DynamicNode: React.FC<DynamicNodeProps> = ({
  id,
  data,
  isCollapsed,
  setIsCollapsed,
  ...props
}) => {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [nodeWidth, setNodeWidth] = useState<string>('auto');
  const [editingField, setEditingField] = useState<string | null>(null);
  const dispatch = useDispatch();

  const node = useSelector((state: RootState) => state.flow.nodes.find((n) => n.id === id));
  const edges = useSelector((state: RootState) => state.flow.edges);
  const inputMetadata = useSelector((state: RootState) => selectPropertyMetadata(state, `${data.type}.input`)) as SchemaMetadata;
  const outputMetadata = useSelector((state: RootState) => selectPropertyMetadata(state, `${data.type}.output`)) as SchemaMetadata;

  const excludeSchemaKeywords = (metadata: SchemaMetadata): Record<string, unknown> => {
    const schemaKeywords = ['required', 'title', 'type'];
    return Object.keys(metadata).reduce((acc: Record<string, unknown>, key) => {
      if (!schemaKeywords.includes(key)) {
        acc[key] = metadata[key];
      }
      return acc;
    }, {});
  };

  const cleanedInputMetadata = excludeSchemaKeywords(inputMetadata || { type: 'object' });
  const cleanedOutputMetadata = excludeSchemaKeywords(outputMetadata || { type: 'object' });

  const handleSchemaKeyEdit = useCallback(
    (oldKey: string, newKey: string, schemaType: 'input_schema' | 'output_schema') => {
      newKey = newKey.replace(/\s+/g, '_');
      if (oldKey === newKey || !newKey.trim()) {
        setEditingField(null);
        return;
      }

      const currentSchema = data?.config?.[schemaType] || {};
      const schemaEntries = Object.entries(currentSchema);
      const keyIndex = schemaEntries.findIndex(([key]) => key === oldKey);
      if (keyIndex !== -1) {
        schemaEntries[keyIndex] = [newKey, currentSchema[oldKey]];
      }
      const updatedSchema = Object.fromEntries(schemaEntries);

      let updatedConfig = {
        ...data?.config,
        [schemaType]: updatedSchema,
      };

      if (schemaType === 'input_schema') {
        if (data?.config?.system_message) {
          updatedConfig.system_message = updateMessageVariables(
            data.config.system_message,
            oldKey,
            newKey
          );
        }
        if (data?.config?.user_message) {
          updatedConfig.user_message = updateMessageVariables(
            data.config.user_message,
            oldKey,
            newKey
          );
        }
      }

      dispatch(
        updateNodeData({
          id,
          data: {
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
    [dispatch, id, data]
  );

  useEffect(() => {
    if (!nodeRef.current || !data) return;

    const inputSchema = data?.config?.['input_schema'] || cleanedInputMetadata || {};
    const outputSchema = data?.config?.['output_schema'] || cleanedOutputMetadata || {};

    const inputLabels = Object.keys(inputSchema);
    const outputLabels = Object.keys(outputSchema);

    const maxInputLabelLength = inputLabels.reduce((max, label) => Math.max(max, label.length), 0);
    const maxOutputLabelLength = outputLabels.reduce((max, label) => Math.max(max, label.length), 0);
    const titleLength = ((data?.title || '').length + 10) * 1.25;

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
  }, [data, cleanedInputMetadata, cleanedOutputMetadata]);

  interface HandleRowProps {
    keyName: string;
  }

  const InputHandleRow: React.FC<HandleRowProps> = ({ keyName }) => {
    const connections = useHandleConnections({ type: 'target', id: keyName });

    return (
      <div className="node-handle-row flex w-full justify-end" key={keyName} id={`input-${keyName}-row`}>
        <div className="node-handle-cell" id={`input-${keyName}-handle`}>
          <Handle
            type="target"
            position={Position.Left}
            id={keyName}
            className={`node-handle node-handle-input ${isCollapsed ? 'node-handle-collapsed' : ''}`}
            isConnectable={!isCollapsed && connections.length === 0}
          />
        </div>
        <div className="border-r border-default-200 h-full mx-0"></div>
        {!isCollapsed && (
          <div className="align-center flex flex-grow flex-shrink ml-[0.5rem] max-w-full overflow-hidden" id={`input-${keyName}-label`}>
            {editingField === keyName ? (
              <Input
                autoFocus
                defaultValue={keyName}
                size="sm"
                variant="faded"
                radius="lg"
                onBlur={(e) => handleSchemaKeyEdit(keyName, e.target.value, 'input_schema')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSchemaKeyEdit(keyName, (e.target as HTMLInputElement).value, 'input_schema');
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
                className="node-handle-label text-sm font-medium cursor-pointer hover:text-primary mr-auto overflow-hidden text-ellipsis whitespace-nowrap"
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
      <div className="node-handle-row flex w-full justify-end" key={`output-${keyName}`} id={`output-${keyName}-row`}>
        {!isCollapsed && (
          <div className="align-center flex flex-grow flex-shrink mr-[0.5rem] max-w-full overflow-hidden" id={`output-${keyName}-label`}>
            {editingField === keyName ? (
              <Input
                autoFocus
                defaultValue={keyName}
                size="sm"
                variant="faded"
                radius="lg"
                onBlur={(e) => handleSchemaKeyEdit(keyName, e.target.value, 'output_schema')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSchemaKeyEdit(keyName, (e.target as HTMLInputElement).value, 'output_schema');
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
                className="node-handle-label text-sm font-medium cursor-pointer hover:text-primary ml-auto overflow-hidden text-ellipsis whitespace-nowrap"
                onClick={() => setEditingField(keyName)}
              >
                {keyName}
              </span>
            )}
          </div>
        )}
        <div className="border-l border-default-200 h-full mx-0"></div>
        <div className="node-handle-cell" id={`output-${keyName}-handle`}>
          <Handle
            type="source"
            position={Position.Right}
            id={keyName}
            className={`node-handle node-handle-output ${isCollapsed ? 'node-handle-collapsed' : ''}`}
            isConnectable={!isCollapsed}
          />
        </div>
      </div>
    );
  };

  const renderHandles = () => {
    if (!data) return null;

    const inputSchema = data?.config?.['input_schema'] || cleanedInputMetadata || {};
    const outputSchema = data?.config?.['output_schema'] || cleanedOutputMetadata || {};

    return (
      <div className="node-handles-wrapper" id="handles">
        <div className="node-handles-column node-handles-input" id="input-handles">
          {Object.keys(inputSchema).map((key) => (
            <InputHandleRow key={key} keyName={key} />
          ))}
        </div>

        <div className="node-handles-column node-handles-output" id="output-handles">
          {Object.keys(outputSchema).map((key) => (
            <OutputHandleRow key={key} keyName={key} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="node-container">
      <BaseNode
        id={id}
        data={data}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        style={{ width: nodeWidth }}
        className="hover:!bg-background"
        {...props}
      >
        <div className="node-content" ref={nodeRef}>
          {renderHandles()}
        </div>
      </BaseNode>
    </div>
  );
};

export default DynamicNode;
