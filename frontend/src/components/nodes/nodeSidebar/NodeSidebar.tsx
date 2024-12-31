import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../../store/store';
import {
  updateNodeConfigOnly,
  selectNodeById,
  setSidebarWidth,
  setSelectedNode,
  FlowWorkflowNode,
  FlowWorkflowNodeConfig,
  updateNodeTitle,
} from '../../../store/flowSlice';
import { FlowWorkflowNodeType, FlowWorkflowNodeTypesByCategory, FieldMetadata } from '../../../store/nodeTypesSlice';
import NumberInput from '../../NumberInput';
import CodeEditor from '../../CodeEditor';
import { jsonOptions } from '../../../constants/jsonOptions';
import FewShotEditor from '../../textEditor/FewShotEditor';
import TextEditor from '../../textEditor/TextEditor';
import {
  Button,
  Slider,
  Switch,
  Textarea,
  Input,
  Select,
  SelectItem,
  SelectSection,
  Accordion,
  AccordionItem,
  Card,
  Alert,
} from "@nextui-org/react";
import { Icon } from '@iconify/react';
import NodeOutput from '../NodeOutputDisplay';
import SchemaEditor from './SchemaEditor';
import { selectPropertyMetadata } from '../../../store/nodeTypesSlice';
import { cloneDeep, set, debounce } from 'lodash';
import isEqual from 'lodash/isEqual';
// Define types for props and state
interface NodeSidebarProps {
  nodeID: string;
}

// Update findNodeSchema to use imported types
const findNodeSchema = (nodeType: string, nodeTypes: FlowWorkflowNodeTypesByCategory): FlowWorkflowNodeType | null => {
  if (!nodeTypes) return null;

  for (const category in nodeTypes) {
    const nodeSchema = nodeTypes[category]?.find((n: FlowWorkflowNodeType) => n.name === nodeType);
    if (nodeSchema) {
      return nodeSchema;
    }
  }
  return null;
};

const nodeComparator = (prevNode: FlowWorkflowNode, nextNode: FlowWorkflowNode) => {
  if (!prevNode || !nextNode) return false;
  // Skip position and measured properties when comparing nodes
  const { position: prevPosition, measured: prevMeasured, ...prevRest } = prevNode;
  const { position: nextPosition, measured: nextMeasured, ...nextRest } = nextNode;
  return isEqual(prevRest, nextRest);
};

const nodesComparator = (prevNodes: FlowWorkflowNode[], nextNodes: FlowWorkflowNode[]) => {
  if (!prevNodes || !nextNodes) return false;
  if (prevNodes.length !== nextNodes.length) return false;
  return prevNodes.every((node, index) => nodeComparator(node, nextNodes[index]));
};

// Add the utility function near the top of the file
const convertToPythonVariableName = (str: string): string => {
  // Replace spaces and hyphens with underscores
  str = str.replace(/[\s-]/g, '_');

  // Remove any non-alphanumeric characters except underscores
  str = str.replace(/[^a-zA-Z0-9_]/g, '');

  // Ensure the first character is a letter or underscore
  if (!/^[a-zA-Z_]/.test(str)) {
    str = '_' + str;
  }

  return str;
};

const NodeSidebar: React.FC<NodeSidebarProps> = ({ nodeID }) => {
  const dispatch = useDispatch();
  const nodes = useSelector((state: RootState) => state.flow.nodes, nodesComparator);
  const edges = useSelector((state: RootState) => state.flow.edges, isEqual);
  const nodeTypes = useSelector((state: RootState) => state.nodeTypes.data);
  const nodeTypesMetadata = useSelector((state: RootState) => state.nodeTypes).metadata;
  const node = useSelector((state: RootState) => selectNodeById(state, nodeID));
  const storedWidth = useSelector((state: RootState) => state.flow.sidebarWidth);
  const nodeConfig = useSelector((state: RootState) => state.flow.nodeConfigs[nodeID]);
  const allNodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs);

  const hasRunOutput = !!node?.data?.run;

  const [width, setWidth] = useState<number>(storedWidth);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const [nodeType, setNodeType] = useState<string>(node?.type || 'ExampleNode');
  const [nodeSchema, setNodeSchema] = useState<FlowWorkflowNodeType | null>(
    findNodeSchema(node?.type || 'ExampleNode', nodeTypes)
  );
  const [currentNodeConfig, setCurrentNodeConfig] = useState<FlowWorkflowNodeConfig>(nodeConfig || {});
  const [fewShotIndex, setFewShotIndex] = useState<number | null>(null);
  const [showTitleError, setShowTitleError] = useState(false);
  const [titleInputValue, setTitleInputValue] = useState<string>('');

  const collectIncomingSchema = (nodeID: string): string[] => {
    const incomingEdges = edges.filter((edge) => edge.target === nodeID);
    const incomingNodes = incomingEdges.map((edge) => nodes.find((n) => n.id === edge.source));
    // foreach incoming node, get the output schema
    // return ['nodeTitle.foo', 'nodeTitle.bar', 'nodeTitle.baz',...]
    return incomingNodes.reduce((acc: string[], node) => {
      if (!node) return acc;
      const config = allNodeConfigs[node.id];
      if (config?.output_schema) {
        const nodeTitle = config.title || node.id;
        return [
          ...acc,
          ...Object.keys(config.output_schema).map((key) => `${nodeTitle}.${key}`),
        ];
      }
      return acc;
    }, []);
  }
  const [incomingSchema, setIncomingSchema] = useState<string[]>(
    collectIncomingSchema(nodeID)
  );

  useEffect(() => {
    setIncomingSchema(collectIncomingSchema(nodeID));
  }
    , [nodeID, nodes, edges]);

  // Create a debounced version of the dispatch update
  const debouncedDispatch = useCallback(
    debounce((id: string, updatedModel: FlowWorkflowNodeConfig) => {
      dispatch(updateNodeConfigOnly({ id, data: updatedModel }));
    }, 300),
    [dispatch]
  );

  // Add this useEffect to handle title initialization and updates
  useEffect(() => {
    if (nodeConfig) {
      setTitleInputValue(nodeConfig.title || node?.id || '');
    }
  }, [nodeConfig, node]); // Only depend on nodeConfig and node changes

  // Update the existing useEffect to initialize LLM nodes with a default model
  useEffect(() => {
    if (node) {
      setNodeType(node.type || 'ExampleNode');
      setNodeSchema(findNodeSchema(node.type || 'ExampleNode', nodeTypes));

      // Initialize the model with a default value for LLM nodes
      let initialConfig = nodeConfig || {};
      if (node.type === 'LLMNode' || node.type === 'SingleLLMCallNode') {
        initialConfig = {
          ...initialConfig,
          llm_info: {
            ...initialConfig.llm_info,
            model: initialConfig.llm_info?.model || 'gpt-4o' // Set default model
          }
        };
      }

      setCurrentNodeConfig(initialConfig);
    }
  }, [nodeID, node, nodeTypes, nodeConfig]);

  // Helper function to update nested object by path
  const updateNestedModel = (obj: FlowWorkflowNodeConfig, path: string, value: any): FlowWorkflowNodeConfig => {
    const deepClone = cloneDeep(obj);
    set(deepClone, path, value);
    return deepClone;
  };

  // Update the input change handler to use local state immediately but debounce Redux updates for Slider
  const handleInputChange = (key: string, value: any, isSlider: boolean = false) => {
    let updatedModel: FlowWorkflowNodeConfig;

    if (key.includes('.')) {
      updatedModel = updateNestedModel(currentNodeConfig, key, value) as FlowWorkflowNodeConfig;
    } else {
      updatedModel = { ...currentNodeConfig, [key]: value } as FlowWorkflowNodeConfig;
    }

    setCurrentNodeConfig(updatedModel);

    // Always update Redux store with the full updated model
    if (isSlider) {
      debouncedDispatch(nodeID, updatedModel);
    } else {
      dispatch(updateNodeConfigOnly({ id: nodeID, data: updatedModel }));
    }
  };

  // Update the handleNodeTitleChange function
  const handleNodeTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const validTitle = convertToPythonVariableName(e.target.value);
    setTitleInputValue(validTitle);
    dispatch(updateNodeTitle({ nodeId: nodeID, newTitle: validTitle }));
  };

  // Update the renderEnumSelect function to handle LLM model selection
  const renderEnumSelect = (
    key: string,
    label: string,
    enumValues: string[],
    fullPath: string,
    defaultSelected?: string
  ) => {
    const lastTwoDots = fullPath.split('.').slice(-2).join('.');

    // Special handling for LLM model selection
    if (key === 'model' && fullPath.includes('llm_info')) {
      // Group models by provider
      const modelsByProvider: { [key: string]: { id: string; name: string }[] } = {
        OpenAI: [],
        Anthropic: [],
        Google: [],
        Ollama: [],
      };

      enumValues.forEach((modelId) => {
        if (modelId.startsWith('ollama/')) {
          modelsByProvider.Ollama.push({ id: modelId, name: modelId.replace('ollama/', '') });
        } else if (modelId.startsWith('claude')) {
          modelsByProvider.Anthropic.push({ id: modelId, name: modelId });
        } else if (modelId.startsWith('gemini')) {
          modelsByProvider.Google.push({ id: modelId, name: modelId });
        } else {
          modelsByProvider.OpenAI.push({ id: modelId, name: modelId });
        }
      });

      // Ensure we have a valid default value
      const currentValue = currentNodeConfig?.llm_info?.model || defaultSelected || 'gpt-4o';

      return (
        <div key={key}>
          <Select
            key={`select-${nodeID}-${key}`}
            label={label}
            selectedKeys={[currentValue]}
            onChange={(e) => {
              const updatedModel = updateNestedModel(currentNodeConfig, 'llm_info.model', e.target.value);
              setCurrentNodeConfig(updatedModel);
              dispatch(updateNodeConfigOnly({ id: nodeID, data: updatedModel }));
            }}
            fullWidth
          >
            {Object.entries(modelsByProvider).map(([provider, models], index) => (
              models.length > 0 && (
                <SelectSection
                  key={`provider-${provider}`}
                  title={provider}
                  showDivider={index < Object.keys(modelsByProvider).length - 1}
                >
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectSection>
              )
            ))}
          </Select>
        </div>
      );
    }

    // Default rendering for other enum fields
    const currentValue = defaultSelected || currentNodeConfig[key] || enumValues[0];
    return (
      <div key={key}>
        <Select
          key={`select-${nodeID}-${key}`}
          label={label}
          selectedKeys={[currentValue]}
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
    const updatedExamples = [...(currentNodeConfig?.few_shot_examples || []), { input: '', output: '' }];
    handleInputChange('few_shot_examples', updatedExamples);
    setFewShotIndex(updatedExamples.length - 1);
  };

  const handleDeleteExample = (index: number) => {
    const updatedExamples = [...(currentNodeConfig?.few_shot_examples || [])];
    updatedExamples.splice(index, 1);
    handleInputChange('few_shot_examples', updatedExamples);
  };

  // Update the `getFieldMetadata` function
  const getFieldMetadata = (fullPath: string): FieldMetadata | undefined => {
    return selectPropertyMetadata({ nodeTypes: { data: nodeTypes, metadata: nodeTypesMetadata } } as unknown as RootState, fullPath) as FieldMetadata;
  };

  // Update the `renderField` function to include missing cases
  const renderField = (
    key: string,
    field: any,
    value: any,
    parentPath: string = '',
    isLast: boolean = false
  ) => {
    const fullPath = `${parentPath ? `${parentPath}.` : ''}${key}`;
    const fieldMetadata = getFieldMetadata(fullPath) as FieldMetadata;

    // Skip api_base field if the selected model is not an Ollama model
    if (key === 'api_base') {
      const modelValue = currentNodeConfig?.llm_info?.model;
      if (!modelValue || !modelValue.toString().startsWith('ollama/')) {
        return null;
      }
      // Add default value for Ollama models
      return (
        <div key={key} className="my-4">
          <Input
            key={`input-${nodeID}-${key}`}
            fullWidth
            label={fieldMetadata?.title || key}
            value={value || "http://localhost:11434"}
            onChange={(e) => handleInputChange(key, e.target.value)}
            placeholder="Enter API base URL"
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    // Handle enum fields
    if (fieldMetadata?.enum) {
      const defaultSelected = value || fieldMetadata.default;
      return renderEnumSelect(key, fieldMetadata.title || key, fieldMetadata.enum, fullPath, defaultSelected);
    }

    // Handle specific cases for input_schema, output_schema, and system_prompt
    if (key === 'input_schema') {
      return (
        <div key={`schema-editor-input-${nodeID}`} className="my-2">
          <label className="font-semibold mb-1 block">Input Schema</label>
          <SchemaEditor
            key={`schema-editor-input-${nodeID}`}
            jsonValue={currentNodeConfig.input_schema || {}}
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

    if (key === 'output_schema') {
      return (
        <div key={key} className="my-2">
          <label className="font-semibold mb-1 block">Output Schema</label>
          <SchemaEditor
            key={`schema-editor-output-${nodeID}`}
            jsonValue={currentNodeConfig.output_schema || {}}
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

    if (key === 'system_message') {
      return (
        <div key={key}>
          <TextEditor
            key={`text-editor-system-${nodeID}`}
            nodeID={nodeID}
            fieldName={key}
            inputSchema={incomingSchema}
            fieldTitle="System Message"
            content={currentNodeConfig[key] || ''}
            setContent={(value: string) => handleInputChange(key, value)}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (key === 'user_message') {
      return (
        <div key={key}>
          <TextEditor
            key={`text-editor-user-${nodeID}`}
            nodeID={nodeID}
            fieldName={key}
            inputSchema={incomingSchema}
            fieldTitle="User Message"
            content={currentNodeConfig[key] || ''}
            setContent={(value) => handleInputChange(key, value)}
          />
          {renderFewShotExamples()}
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (key.endsWith('_prompt') || key.endsWith('_message')) {
      return (
        <div key={key}>
          <TextEditor
            key={`text-editor-${nodeID}-${key}`}
            nodeID={nodeID}
            fieldName={key}
            inputSchema={incomingSchema}
            fieldTitle={key}
            content={currentNodeConfig[key] || ''}
            setContent={(value) => handleInputChange(key, value)}
          />
          {!isLast && <hr className="my-2" />}
        </div>
      );
    }

    if (key === 'code') {
      return (
        <CodeEditor
          key={`code-editor-${nodeID}-${key}`}
          code={value}
          onChange={(newValue: string) => handleInputChange(key, newValue)}
        />
      );
    }

    // Handle other types (string, number, boolean, object)
    switch (typeof field) {
      case 'string':
        return (
          <div key={key} className="my-4">
            <Textarea
              key={`textarea-${nodeID}-${key}`}
              fullWidth
              label={fieldMetadata?.title || key}
              value={value}
              onChange={(e) => handleInputChange(key, e.target.value)}
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
            <div key={key} className="my-4">
              <div className="flex justify-between items-center mb-2">
                <label className="font-semibold">{fieldMetadata.title || key}</label>
                <span className="text-sm">{value}</span>
              </div>
              <Slider
                key={`slider-${nodeID}-${key}`}
                aria-label={fieldMetadata.title || key}
                value={value}
                minValue={min}
                maxValue={max}
                step={fieldMetadata.type === 'integer' ? 1 : 0.1}
                className="w-full"
                onChange={(newValue) => {
                  const path = parentPath ? `${parentPath}.${key}` : key;
                  const lastTwoDots = path.split('.').slice(-2);
                  const finalPath = lastTwoDots[0] === 'config' ? lastTwoDots[1] : lastTwoDots.join('.');
                  handleInputChange(finalPath, newValue, true);
                }}
              />
              {!isLast && <hr className="my-2" />}
            </div>
          );
        }
        return (
          <NumberInput
            key={`number-input-${nodeID}-${key}`}
            label={key}
            value={value}
            onChange={(e) => {
              const newValue = parseFloat(e.target.value);
              handleInputChange(key, isNaN(newValue) ? 0 : newValue);
            }}
          />
        );
      case 'boolean':
        return (
          <div key={key} className="my-4">
            <div className="flex justify-between items-center">
              <label className="font-semibold">{fieldMetadata?.title || key}</label>
              <Switch
                key={`switch-${nodeID}-${key}`}
                checked={value}
                onChange={(e) => handleInputChange(key, e.target.checked)}
              />
            </div>
            {!isLast && <hr className="my-2" />}
          </div>
        );
      case 'object':
        if (field && typeof field === 'object' && !Array.isArray(field)) {
          return (
            <div key={key} className="my-2">
              {Object.keys(field).map((subKey) => renderField(subKey, field[subKey], value?.[subKey], fullPath))}
              {!isLast && <hr className="my-2" />}
            </div>
          );
        }
        return null;
      default:
        return null;
    }
  };

  // Update the `renderConfigFields` function to include missing logic
  const renderConfigFields = () => {
    if (!nodeSchema || !nodeSchema.config || !currentNodeConfig) return null;
    const properties = nodeSchema.config;
    const keys = Object.keys(properties).filter((key) => key !== 'title' && key !== 'type');

    // Prioritize system_message and user_message to appear first
    const priorityFields = ['system_message', 'user_message'];
    const remainingKeys = keys.filter(key => !priorityFields.includes(key));
    const orderedKeys = [...priorityFields.filter(key => keys.includes(key)), ...remainingKeys];

    return orderedKeys.map((key, index) => {
      const field = properties[key];
      const value = currentNodeConfig[key];
      const isLast = index === orderedKeys.length - 1;
      return renderField(key, field, value, `${nodeType}.config`, isLast);
    });
  };

  // Update the `renderFewShotExamples` function
  const renderFewShotExamples = () => {
    const fewShotExamples = nodeConfig?.few_shot_examples || [];

    return (
      <div>
        {fewShotIndex !== null ? (
          <FewShotEditor
            key={`few-shot-editor-${nodeID}-${fewShotIndex}`}
            nodeID={nodeID}
            exampleIndex={fewShotIndex}
            onSave={() => setFewShotIndex(null)}
            onDiscard={() => setFewShotIndex(null)}
          />
        ) : (
          <div>
            <h3 className="my-2 font-semibold">Few Shot Examples</h3>
            <div className="flex flex-wrap gap-2">
              {fewShotExamples.map((example, index) => (
                <div
                  key={`few-shot-${index}`}
                  className="flex items-center space-x-2 p-2 bg-gray-100 rounded-full cursor-pointer"
                  onClick={() => setFewShotIndex(index)}
                >
                  <span>Example {index + 1}</span>
                  <Button
                    isIconOnly
                    radius="full"
                    variant="light"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExample(index);
                    }}
                    color="primary"
                  >
                    <Icon icon="solar:trash-bin-trash-linear" width={22} />
                  </Button>
                </div>
              ))}

              <Button
                key={`add-example-${nodeID}`}
                isIconOnly
                radius="full"
                variant="light"
                onClick={handleAddNewExample}
                color="primary"
              >
                <Icon icon="solar:add-circle-linear" width={22} />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      const constrainedWidth = Math.min(Math.max(newWidth, 300), 800);
      if (constrainedWidth === width) return;
      setWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      dispatch(setSidebarWidth(width));
    };

    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, dispatch, width]);

  return (
    <Card
      className="fixed top-16 bottom-4 right-4 w-96 p-4 rounded-xl border border-solid border-default-200 overflow-auto"
    >
      {showTitleError && (
        <Alert
          key={`alert-${nodeID}`}
          className="absolute top-4 left-4 right-4 z-50"
          color="danger"
          onClose={() => setShowTitleError(false)}
        >
          Title cannot contain whitespace. Use underscores instead.
        </Alert>
      )}
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
                {nodeConfig?.title || node?.id || 'Node Details'}
              </h1>
              <h2 className="text-xs font-semibold">{nodeType}</h2>
            </div>
            <Button
              key={`close-btn-${nodeID}`}
              isIconOnly
              radius="full"
              variant="light"
              onClick={() => dispatch(setSelectedNode({ nodeId: null }))}
            >
              <Icon
                key={`close-icon-${nodeID}`}
                className="text-default-500"
                icon="solar:close-circle-linear"
                width={24}
              />
            </Button>
          </div>

          <Accordion
            key={`accordion-${nodeID}`}
            selectionMode="multiple"
            defaultExpandedKeys={hasRunOutput ? ['output'] : ['title', 'config']}
          >
            {nodeType !== 'InputNode' && (
              <AccordionItem key="output" aria-label="Output" title="Outputs">
                <NodeOutput key={`node-output-${nodeID}`} output={node?.data?.run} />
              </AccordionItem>
            )}

            <AccordionItem key="title" aria-label="Node Title" title="Node Title">
              <Input
                key={`title-input-${nodeID}`}
                value={titleInputValue}
                onChange={handleNodeTitleChange}
                placeholder="Enter node title"
                label="Node Title"
                fullWidth
                description="Use underscores instead of spaces"
              />
            </AccordionItem>

            <AccordionItem key="config" aria-label="Node Configuration" title="Node Configuration">
              {renderConfigFields()}
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </Card>
  );
};

export default NodeSidebar;
