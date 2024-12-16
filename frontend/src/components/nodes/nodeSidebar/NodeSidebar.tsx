import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../../types/store';
import {
  updateNodeData,
  selectNodeById,
  setSidebarWidth,
  setSelectedNode,
} from '../../../store/flowSlice';
import {
  Button,
  Slider,
  Switch,
  Textarea,
  Input,
  Select,
  SelectItem,
  Accordion,
  AccordionItem,
  Card,
  Selection
} from '@nextui-org/react';
import { Icon } from '@iconify/react';
import NodeOutput from '../NodeOutputDisplay';
import SchemaEditor from './SchemaEditor';
import { selectPropertyMetadata } from '../../../store/nodeTypesSlice';
import { cloneDeep, set, debounce } from 'lodash';
import { MergeEditor } from '../../mergeEditor/MergeEditor';
import IfElseEditor from './IfElseEditor';
import {
  NodeType,
  NodeData,
  DynamicNodeConfig,
  WorkflowNode,
  BaseNodeConfig,
  FieldMetadata,
  findNodeSchema as findNodeSchemaBase
} from '../../../types/nodes/base';
import type { Key } from '@react-types/shared';
import NumberInput from '../../NumberInput';
import CodeEditor from '../../CodeEditor';
import { jsonOptions } from '../../../constants/jsonOptions';
import FewShotEditor from '../../textEditor/FewShotEditor';
import TextEditor from '../../textEditor/TextEditor';
import type { AppDispatch } from '../../../store/store';
import type { Branch } from './IfElseEditor';

// Define types for props and state
interface NodeSidebarProps {
  nodeID: string;
}

// Use DynamicNodeConfig as our NodeConfig type
type NodeConfig = DynamicNodeConfig;

interface Node extends WorkflowNode {
  type: string;
  id: string;
  data: NodeData;
}

// Use the imported base function instead of redefining
const findNodeSchema = findNodeSchemaBase;

const NodeSidebar: React.FC<NodeSidebarProps> = ({ nodeID }) => {
  const dispatch = useDispatch<AppDispatch>();
  const [width, setWidth] = useState<number>(400);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [fewShotIndex, setFewShotIndex] = useState<number | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set(['title']));
  const nodeTypes = useSelector((state: RootState) => state.nodeTypes.data);
  const node = useSelector((state: RootState) => selectNodeById(state, nodeID));
  const storedWidth = useSelector((state: RootState) => state.flow.sidebarWidth);
  const metadata = useSelector((state: RootState) => state.nodeTypes.metadata);

  const [nodeSchema, setNodeSchema] = useState<NodeType | null>(null);
  const [dynamicModel, setDynamicModel] = useState<DynamicNodeConfig>(() => {
    const defaultConfig: DynamicNodeConfig = {
      title: '',
      input_schema: {},
      output_schema: {},
      input_schemas: {},
      branches: [],
      branch_refs: []
    };

    const nodeConfig = node?.data?.config || {};
    return { ...defaultConfig, ...nodeConfig };
  });

  const hasRunOutput = Boolean(node?.data?.output);

  const debouncedDispatch = useCallback(
    debounce((id: string, updatedModel: DynamicNodeConfig) => {
      dispatch(updateNodeData({ id, data: { config: updatedModel } }));
    }, 300),
    [dispatch]
  );

  useEffect(() => {
    if (node) {
      const schema = findNodeSchema(node.type || 'ExampleNode', nodeTypes);
      if (schema) {
        setNodeSchema({
          name: schema.name,
          type: schema.name,  // Use schema.name as type since it's used in findNodeSchema
          config: schema.config as BaseNodeConfig,
          visual_tag: {
            color: '#ccc',
            acronym: 'N',
            icon: undefined
          }
        });
      }
      const config = node.data?.config as Partial<DynamicNodeConfig> || {};
      setDynamicModel({
        title: config.title || '',
        input_schema: config.input_schema || {},
        output_schema: config.output_schema || {},
        input_schemas: config.input_schemas || {},
        branches: config.branches || [],
        branch_refs: config.branch_refs || [],
        ...config
      });
    }
  }, [node, nodeTypes]);

  const updateNestedModel = (obj: DynamicNodeConfig, path: string, value: unknown): DynamicNodeConfig => {
    const deepClone = cloneDeep(obj);
    set(deepClone, path, value);
    return deepClone;
  };

  const handleInputChange = (key: string, value: any, isSlider: boolean = false) => {
    let updatedModel: DynamicNodeConfig;

    if (key.includes('.')) {
      updatedModel = updateNestedModel(dynamicModel, key, value);
    } else {
      updatedModel = { ...dynamicModel, [key]: value };
    }

    setDynamicModel(updatedModel);

    if (isSlider) {
      debouncedDispatch(nodeID, updatedModel);
    } else {
      dispatch(updateNodeData({ id: nodeID, data: { config: updatedModel } }));
    }
  };

  const renderEnumSelect = (
    key: string,
    label: string,
    enumValues: string[],
    fullPath: string,
    defaultSelected?: string
  ) => {
    const lastTwoDots = fullPath.split('.').slice(-2).join('.');
    return (
      <div key={key}>
        <Select
          label={label}
          defaultSelectedKeys={defaultSelected ? [defaultSelected] : undefined}
          onChange={(e) => handleInputChange(lastTwoDots, e.target.value)}
          fullWidth
        >
          {enumValues.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </Select>
      </div>
    );
  };

  const handleAddNewExample = () => {
    const updatedExamples = [...(dynamicModel?.few_shot_examples || []), { input: '', output: '' }];
    handleInputChange('few_shot_examples', updatedExamples);
    setFewShotIndex(updatedExamples.length - 1);
  };

  const handleDeleteExample = (index: number) => {
    const updatedExamples = [...(dynamicModel?.few_shot_examples || [])];
    updatedExamples.splice(index, 1);
    handleInputChange('few_shot_examples', updatedExamples);
  };

  const getFieldMetadata = (fullPath: string): FieldMetadata | undefined => {
    const state: RootState = {
      flow: {
        nodes: [], edges: [], selectedNodes: [], selectedEdges: [], copiedNodes: [], copiedEdges: [],
        nodeTypes, isRunning: false, runStatus: '', runOutput: {}, runError: null, runId: null,
        workflowId: null, workflowVersion: null, workflowName: '', workflowDescription: '', workflowTags: [],
        sidebarWidth: width, selectedNode: null, projectName: '', workflowInputVariables: {},
        testInputs: {}, inputNodeValues: {}, history: { past: [], future: [] }
      },
      nodeTypes: { data: nodeTypes, metadata: {}, status: 'idle', error: null }
    };
    return selectPropertyMetadata(state, fullPath) as FieldMetadata | undefined;
  };

  const renderField = (
    fieldKey: string,
    field: FieldMetadata | Record<string, unknown>,
    value: Record<string, unknown> | string | number | boolean | null,
    parentPath: string = '',
    isLast: boolean = false
  ) => {
    const fullPath = `${parentPath ? `${parentPath}.` : ''}${fieldKey}`;
    const fieldMetadata = getFieldMetadata(fullPath);

    // Handle special field types
    if (fieldKey === 'system_message') {
      return (
        <div key={fieldKey}>
          <TextEditor
            key={fieldKey}
            nodeID={nodeID}
            fieldName={fieldKey}
            inputSchema={dynamicModel?.input_schema || {}}
            fieldTitle="System Message"
            content={String(value || '')}
            setContent={(newValue: string) => handleInputChange(fieldKey, newValue)}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey === 'input_schema') {
      return (
        <div key={fieldKey} className="my-2">
          <label className="font-semibold mb-1 block">Input Schema</label>
          <SchemaEditor
            jsonValue={dynamicModel?.input_schema || {}}
            onChange={(newValue) => {
              handleInputChange('input_schema', newValue);
            }}
            options={jsonOptions}
            schemaType="input_schema"
            nodeId={nodeID}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey === 'branches') {
      return (
        <div key={fieldKey} className="my-2">
          <label className="font-semibold mb-1 block">Conditional Branches</label>
          <IfElseEditor
            branches={(dynamicModel?.branches || []) as Branch[]}
            onChange={(branches) => {
              handleInputChange('branches', branches);
            }}
            inputSchema={dynamicModel?.input_schema || {}}
            disabled={false}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey === 'input_schemas' && node?.type === 'MergeNode') {
      return (
        <div key={fieldKey} className="my-2">
          <label className="font-semibold mb-1 block">Input Schemas</label>
          <MergeEditor
            inputSchemas={dynamicModel?.input_schemas}
            onChange={(newValue) => {
              handleInputChange('input_schemas', newValue);
            }}
            nodeId={nodeID}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey === 'output_schema') {
      return (
        <div key={fieldKey} className="my-2">
          <label className="font-semibold mb-1 block">Output Schema</label>
          <SchemaEditor
            jsonValue={dynamicModel?.output_schema || {}}
            onChange={(newValue) => {
              handleInputChange('output_schema', newValue);
            }}
            options={jsonOptions}
            schemaType="output_schema"
            nodeId={nodeID}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey === 'user_message') {
      return (
        <div key={fieldKey}>
          <TextEditor
            key={fieldKey}
            nodeID={nodeID}
            fieldName={fieldKey}
            inputSchema={dynamicModel?.input_schema || {}}
            fieldTitle="User Message"
            content={String(value || '')}
            setContent={(newValue: string) => handleInputChange(fieldKey, newValue)}
          />
          {renderFewShotExamples()}
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey.endsWith('_prompt') || fieldKey.endsWith('_message')) {
      return (
        <div key={fieldKey}>
          <TextEditor
            key={fieldKey}
            nodeID={nodeID}
            fieldName={fieldKey}
            inputSchema={dynamicModel?.input_schema || {}}
            fieldTitle={fieldKey}
            content={String(value || '')}
            setContent={(newValue: string) => handleInputChange(fieldKey, newValue)}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (fieldKey === 'code') {
      return (
        <CodeEditor
          key={fieldKey}
          code={typeof value === 'string' ? value : ''}
          onChange={(newValue: string) => handleInputChange(fieldKey, newValue)}
        />
      );
    }

    // Handle different field types
    switch (typeof field) {
      case 'string':
        return (
          <div key={fieldKey} className="my-4">
            <Textarea
              fullWidth
              label={fieldMetadata?.title || fieldKey}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => handleInputChange(fieldKey, e.target.value)}
              placeholder="Enter your input"
            />
            {!isLast && <hr className="my-2" />}
          </div>
        );
      case 'number':
        if (fieldMetadata && (fieldMetadata.minimum !== undefined || fieldMetadata.maximum !== undefined)) {
          const min = fieldMetadata.minimum ?? 0;
          const max = fieldMetadata.maximum ?? 100;

          return (
            <div key={fieldKey} className="my-4">
              <div className="flex justify-between items-center mb-2">
                <label className="font-semibold">{fieldMetadata.title || fieldKey}</label>
                <span className="text-sm">{typeof value === 'string' ? value : String(value)}</span>
              </div>
              <Slider
                aria-label={fieldMetadata.title || fieldKey}
                value={typeof value === 'number' ? value : 0}
                minValue={min}
                maxValue={max}
                step={fieldMetadata.type === 'integer' ? 1 : 0.1}
                className="w-full"
                onChange={(newValue) => handleInputChange(fieldKey, newValue, true)}
              />
              {!isLast && <hr className="my-2" />}
            </div>
          );
        }
        return (
          <NumberInput
            key={fieldKey}
            label={fieldKey}
            value={String(typeof value === 'number' ? value : 0)}
            onChange={(val) => {
              const newValue = typeof val === 'number' ? val : parseFloat(String(val));
              handleInputChange(fieldKey, isNaN(newValue) ? 0 : newValue);
            }}
          />
        );
      case 'boolean':
        return (
          <div key={fieldKey} className="my-4">
            <div className="flex justify-between items-center">
              <label className="font-semibold">{fieldMetadata?.title || fieldKey}</label>
              <Switch
                isSelected={Boolean(value)}
                onValueChange={(checked: boolean) => handleInputChange(fieldKey, checked)}
                size="sm"
              />
            </div>
            {!isLast && <hr className="my-2" />}
          </div>
        );
      case 'object':
        if (field && typeof field === 'object' && !Array.isArray(field)) {
          return (
            <div key={fieldKey} className="my-2">
              {Object.entries(field as Record<string, unknown>).map(([subKey, subField], index, arr) =>
                renderField(
                  subKey,
                  subField as Record<string, unknown>,
                  ((value as Record<string, unknown> | null)?.[subKey] ?? {}) as Record<string, unknown> | string | number | boolean | null,
                  fullPath,
                  index === arr.length - 1
                )
              )}
            </div>
          );
        }
        return null;
      default:
        return null;
    }
  };

  const renderConfigFields = useCallback(() => {
    if (!nodeSchema?.config || !dynamicModel) return null;

    const properties = nodeSchema.config;
    const keys = Object.keys(properties).filter((fieldKey) => fieldKey !== 'title' && fieldKey !== 'type');

    if (node?.type === 'MergeNode') {
      return (
        <MergeEditor
          branchRefs={dynamicModel.branch_refs as string[]}
          inputSchemas={dynamicModel.input_schemas as Record<string, unknown>}
          onChange={(newValue: string[] | Record<string, unknown>) => {
            if (Array.isArray(newValue)) {
              handleInputChange('branch_refs', newValue);
            } else {
              handleInputChange('input_schemas', newValue);
            }
          }}
          nodeId={nodeID}
        />
      );
    }

    return keys.map((fieldKey, index) => {
      const field = properties[fieldKey] as FieldMetadata | Record<string, unknown>;
      const value = dynamicModel[fieldKey as keyof DynamicNodeConfig] as string | number | boolean | Record<string, unknown> | null;
      const isLast = index === keys.length - 1;
      return renderField(fieldKey, field, value, `${node?.type}.config`, isLast);
    });
  }, [nodeSchema, dynamicModel, node?.type, nodeID, handleInputChange, renderField]);

  const renderFewShotExamples = useCallback(() => {
    const fewShotExamples = (dynamicModel?.few_shot_examples || []) as Array<Record<string, string>>;

    return (
      <div>
        {fewShotIndex !== null ? (
          <FewShotEditor
            nodeID={nodeID}
            exampleIndex={fewShotIndex}
            onSave={() => setFewShotIndex(null)}
            onDiscard={() => setFewShotIndex(null)}
          />
        ) : (
          <div>
            <h3 className="my-2 font-semibold">Few Shot Examples</h3>
            <div className="flex flex-wrap gap-2">
              {fewShotExamples.map((example: Record<string, string>, index: number) => (
                <div
                  key={`few-shot-${index}`}
                  className="flex items-center space-x-2 p-2 bg-gray-100 rounded-full cursor-pointer"
                  onClick={() => setFewShotIndex(index)}
                >
                  <span>Example {index + 1}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExample(index);
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Icon icon="mdi:close" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddNewExample}
                className="flex items-center space-x-1 p-2 bg-blue-100 rounded-full hover:bg-blue-200"
              >
                <Icon icon="mdi:plus" />
                <span>Add Example</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }, [dynamicModel, fewShotIndex, nodeID, handleAddNewExample, handleDeleteExample, setFewShotIndex]);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    setWidth(e.clientX);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    if (dispatch) {
      dispatch(setSidebarWidth(width));
    }
  }, [dispatch, width]);

  useEffect(() => {
    if (node?.type && nodeTypes) {
      const schema = findNodeSchema(node.type, nodeTypes);
      if (schema) {
        setNodeSchema({
          name: schema.name,
          type: node.type,  // Use node.type since we already verified it exists
          config: schema.config as Record<string, FieldMetadata | Record<string, unknown>>,
          visual_tag: schema.visual_tag || {
            color: '#666666',
            acronym: schema.name.substring(0, 2).toUpperCase(),
            icon: undefined
          },
          input: schema.input,
          output: schema.output
        });
      }
    }
  }, [node?.type, nodeTypes]);

  return (
    <Card
      className="fixed top-16 bottom-4 right-4 w-96 p-4 rounded-xl border border-solid border-default-200 overflow-auto"
    >
      <div
        className="absolute top-0 right-0 h-full flex"
        style={{
          width: `${width}px`,
          zIndex: 2,
          userSelect: isResizing ? 'none' : 'auto'
        }}
      >
        <div
          className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-primary hover:opacity-100 opacity-0 transition-opacity"
          onMouseDown={handleMouseDown}
          style={{
            backgroundColor: isResizing ? 'var(--nextui-colors-primary)' : 'transparent',
            opacity: isResizing ? '1' : undefined
          }}
        />

        <div className="flex-1 px-6 py-1 overflow-auto max-h-screen" id="node-details">
          <div className="flex justify-between items-center mb-2">
            <div>
              <h1 className="text-lg font-semibold">
                {dynamicModel.title || node?.id || 'Node Details'}
              </h1>
              <h2 className="text-xs font-semibold">{node?.type || ''}</h2>
            </div>
            <Button
              isIconOnly
              radius="full"
              variant="light"
              onClick={() => dispatch(setSelectedNode({ nodeId: null }))}
            >
              <Icon
                className="text-default-500"
                icon="solar:close-circle-linear"
                width={24}
              />
            </Button>
          </div>

          <Accordion
            defaultSelectedKeys={selectedKeys}
            onSelectionChange={setSelectedKeys}
            selectionMode="multiple"
            className="w-full"
            variant="bordered"
          >
            {[
              node?.type !== 'InputNode' ? (
                <AccordionItem key="output" aria-label="Output" title="Outputs">
                  <NodeOutput node={node} />
                </AccordionItem>
              ) : null,
              <AccordionItem key="title" aria-label="Node Title" title="Node Title">
                <Input
                  value={dynamicModel.title || ''}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Enter node title"
                  size="sm"
                  fullWidth
                />
              </AccordionItem>,
              <AccordionItem key="config" aria-label="Node Configuration" title="Node Configuration">
                {renderConfigFields()}
              </AccordionItem>
            ].filter(Boolean)}
          </Accordion>
        </div>
      </div>
    </Card>
  );
};

export default NodeSidebar;
