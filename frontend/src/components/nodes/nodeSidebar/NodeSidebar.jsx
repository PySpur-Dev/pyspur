import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { updateNodeData, selectNodeById, setSidebarWidth, setSelectedNode } from '../../../store/flowSlice';
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
  Accordion,
  AccordionItem,
  Card,
} from '@nextui-org/react';
import { Icon } from '@iconify/react';
import NodeOutput from '../NodeOutputDisplay';
import SchemaEditor from './SchemaEditor';
import { selectPropertyMetadata } from '../../../store/nodeTypesSlice';
import { cloneDeep, set, debounce } from 'lodash';
import { withTheme } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { Cross1Icon } from '@radix-ui/react-icons';

const NodeSidebar = ({ nodeID }) => {
  const dispatch = useDispatch();
  const nodeTypes = useSelector((state) => state.nodeTypes.data);
  const node = useSelector((state) => selectNodeById(state, nodeID));
  const storedWidth = useSelector((state) => state.flow.sidebarWidth);
  const hasRunOutput = node?.data?.run ? true : false;

  // Fetch all metadata once at the top level
  const metadata = useSelector((state) => state.nodeTypes.metadata);

  // Initialize width state with the stored value
  const [width, setWidth] = useState(storedWidth);
  const [isResizing, setIsResizing] = useState(false);

  const [nodeType, setNodeType] = useState(node?.type || 'ExampleNode');
  const findNodeSchema = (nodeType) => {
    for (const category in nodeTypes) {
      const nodeSchema = nodeTypes[category].find((n) => n.name === nodeType);
      if (nodeSchema) {
        return nodeSchema;
      }
    }
    return null;
  };

  const [nodeSchema, setNodeSchema] = useState(findNodeSchema(node?.type));
  const [dynamicModel, setDynamicModel] = useState(node?.data?.config || {});
  const [fewShotIndex, setFewShotIndex] = useState(null); // Track the index of the few-shot example being edited

  // Create a debounced version of the dispatch update
  const debouncedDispatch = useCallback(
    debounce((id, updatedModel) => {
      dispatch(updateNodeData({ id, data: { config: updatedModel } }));
    }, 300), // Adjust the delay (in ms) as needed
    [dispatch],
  );

  // Update dynamicModel when nodeID changes
  useEffect(() => {
    if (node) {
      setNodeType(node.type || 'ExampleNode');
      setNodeSchema(findNodeSchema(node.type));
      setDynamicModel(node.data.config || {});
    }
  }, [nodeID, node, node.data.config]);

  // Helper function to update nested object by path
  const updateNestedModel = (obj, path, value) => {
    const deepClone = cloneDeep(obj); // Use lodash's cloneDeep for deep cloning
    set(deepClone, path, value); // Use lodash's set to update the nested value
    return deepClone;
  };

  // Update the input change handler to use local state immediately but debounce Redux updates for Slider
  const handleInputChange = (key, value, isSlider = false) => {
    let updatedModel;

    if (key.includes('.')) {
      updatedModel = updateNestedModel(dynamicModel, key, value);
    } else {
      updatedModel = { ...dynamicModel, [key]: value };
    }

    // Update local state immediately
    setDynamicModel(updatedModel);

    // Conditionally debounce the Redux update for Slider inputs
    if (isSlider) {
      debouncedDispatch(nodeID, updatedModel);
    } else {
      dispatch(updateNodeData({ id: nodeID, data: { config: updatedModel } }));
    }
  };

  const renderEnumSelect = (key, label, enumValues, fullPath, defaultSelected) => {
    const lastTwoDots = fullPath.split('.').slice(-2).join('.'); // Extract last two segments of the path
    return (
      <div key={key}>
        <Select
          label={label}
          defaultSelectedKeys={[defaultSelected || dynamicModel[key] || '']}
          onChange={(e) => handleInputChange(lastTwoDots, e.target.value)} // Use lastTwoDots in handleInputChange
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

  // Handle adding a new few-shot example
  const handleAddNewExample = () => {
    const updatedExamples = [...(dynamicModel?.few_shot_examples || []), { input: '', output: '' }];
    handleInputChange('few_shot_examples', updatedExamples);

    // Set the fewShotIndex to the index of the newly added example
    setFewShotIndex(updatedExamples.length - 1);
  };

  // Handle deleting a few-shot example
  const handleDeleteExample = (index) => {
    const updatedExamples = [...(dynamicModel?.few_shot_examples || [])];
    updatedExamples.splice(index, 1);
    handleInputChange('few_shot_examples', updatedExamples);
  };

  // Helper function to get field metadata
  const getFieldMetadata = (fullPath) => {
    return selectPropertyMetadata({ nodeTypes: { metadata } }, fullPath);
  };

  // Helper function to render fields based on their type
  const renderField = (key, field, value, parentPath = '', isLast = false) => {
    const fullPath = `${parentPath ? `${parentPath}.` : ''}${key}`;
    const fieldMetadata = getFieldMetadata(fullPath);

    // Handle enum fields
    if (fieldMetadata?.enum) {
      const defaultSelected = value || fieldMetadata.default;
      return renderEnumSelect(key, fieldMetadata.title || key, fieldMetadata.enum, fullPath, defaultSelected); // Pass fullPath
    }

    // Handle specific cases for input_schema, output_schema, and system_prompt
    if (key === 'input_schema') {
      return (
        <div key={key} className="my-2">
          <label className="font-semibold mb-1 block">Input Schema</label>
          <SchemaEditor
            jsonValue={dynamicModel.input_schema || {}}
            onChange={(newValue) => {
              handleInputChange('input_schema', newValue);
            }}
            options={jsonOptions}
            schemaType="input_schema" // Specify schema type
            nodeId={nodeID}
          />
          {!isLast && <hr className="my-2" />} {/* Add hr only if not the last element */}
        </div>
      );
    }

    if (key === 'output_schema') {
      return (
        <div key={key} className="my-2">
          <label className="font-semibold mb-1 block">Output Schema</label>
          <SchemaEditor
            jsonValue={dynamicModel.output_schema || {}}
            onChange={(newValue) => {
              handleInputChange('output_schema', newValue);
            }}
            options={jsonOptions}
            schemaType="output_schema" // Specify schema type
            nodeId={nodeID}
          />
          {!isLast && <hr className="my-2" />} {/* Add hr only if not the last element */}
        </div>
      );
    }

    if (key === 'system_message') {
      return (
        <div key={key}>
          <TextEditor
            key={key}
            nodeID={nodeID}
            fieldName={key}
            inputSchema={dynamicModel.input_schema || {}}
            fieldTitle="System Message"
            content={dynamicModel[key] || ''}
            setContent={(value) => handleInputChange(key, value)}
          />
          {!isLast && <hr className="my-2" />} {/* Add hr only if not the last element */}
        </div>
      );
    } else if (key === 'user_message') {
      return (
        <div key={key}>
          <TextEditor
            key={key}
            nodeID={nodeID}
            fieldName={key}
            inputSchema={dynamicModel.input_schema || {}}
            fieldTitle="User Message"
            content={dynamicModel[key] || ''}
            setContent={(value) => handleInputChange(key, value)}
          />
          {/* Render Few Shot Examples right after the System Prompt */}
          {renderFewShotExamples()}
          {!isLast && <hr className="my-2" />} {/* Add hr only if not the last element */}
        </div>
      );
    } else if (key.endsWith('_prompt')) {
      return (
        <div key={key}>
          <TextEditor
            key={key}
            nodeID={nodeID}
            fieldName={key}
            inputSchema={dynamicModel.input_schema || {}}
            fieldTitle={key}
            content={dynamicModel[key] || ''}
            setContent={(value) => handleInputChange(key, value)}
          />
          {!isLast && <hr className="my-2" />} {/* Add hr only if not the last element */}
        </div>
      );
    } else if (key === 'code') {
      return <CodeEditor key={key} code={value} onChange={(newValue) => handleInputChange(key, newValue)} />;
    }

    // Handle other types (string, number, boolean, object, code)
    switch (typeof field) {
      case 'string':
        return (
          <Textarea
            fullWidth
            key={key}
            label={key}
            value={value}
            onChange={(e) => handleInputChange(key, e.target.value)}
            placeholder="Enter your input"
          />
        );
      case 'number':
        // Check if we have constraints that would make this suitable for a slider
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
                aria-label={fieldMetadata.title || key}
                value={value}
                minValue={min}
                maxValue={max}
                step={fieldMetadata.type === 'integer' ? 1 : 0.1}
                className="w-full"
                onChange={(newValue) => {
                  const path = parentPath ? `${parentPath}.${key}` : key;
                  const lastTwoDots = path.split('.').slice(-2);

                  // If the first part is "config", only pass the second part
                  const finalPath = lastTwoDots[0] === 'config' ? lastTwoDots[1] : lastTwoDots.join('.');

                  handleInputChange(finalPath, newValue, true); // Pass true for isSlider
                }}
              />
            </div>
          );
        }
        // Fall back to number input if no suitable constraints
        return (
          <NumberInput
            key={key}
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
              <label className="font-semibold">{key}</label>
              <Switch checked={value} onChange={(e) => handleInputChange(key, e.target.checked)} />
            </div>
          </div>
        );
      case 'object':
        // Ensure field is a valid object before traversing
        if (field && typeof field === 'object' && !Array.isArray(field)) {
          return (
            <div key={key} className="my-2">
              {Object.keys(field).map((subKey) => renderField(subKey, field[subKey], value?.[subKey], fullPath))}
              {!isLast && <hr className="my-2" />} {/* Add hr only if not the last element */}
            </div>
          );
        }
        return null; // Return null if field is not a valid object
      case 'code':
        return <CodeEditor key={key} code={value} onChange={(newValue) => handleInputChange(key, newValue)} />;
      default:
        return null;
    }
  };

  // Updated renderConfigFields function
  const renderConfigFields = () => {
    if (!nodeSchema || !nodeSchema.config || !dynamicModel) return null;
    const properties = nodeSchema.config;
    const keys = Object.keys(properties).filter((key) => key !== 'title' && key !== 'type'); // Skip "title" and "type"

    return keys.map((key, index) => {
      const field = properties[key];
      const value = dynamicModel[key]; // Access value from DynamicModel
      const isLast = index === keys.length - 1; // Check if this is the last element
      return renderField(key, field, value, `${nodeType}.config`, isLast); // Pass the isLast flag
    });
  };

  const renderFewShotExamples = () => {
    const fewShotExamples = node?.data?.config?.few_shot_examples || [];

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
              {fewShotExamples.map((example, index) => (
                <div
                  key={`few-shot-${index}`}
                  className="flex items-center space-x-2 p-2 bg-gray-100 rounded-full cursor-pointer"
                  onClick={() => setFewShotIndex(index)} // Open editor on click
                >
                  <span>Example {index + 1}</span>
                  <Button
                    isIconOnly
                    radius="full"
                    variant="light"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering the edit on delete click
                      handleDeleteExample(index);
                    }}
                    color="primary"
                    auto
                  >
                    <Icon icon="solar:trash-bin-trash-linear" width={22} />
                  </Button>
                </div>
              ))}

              {/* Add new example button */}
              <Button isIconOnly radius="full" variant="light" onClick={handleAddNewExample} color="primary" auto>
                <Icon icon="solar:add-circle-linear" width={22} />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Add resize handler
  const handleMouseDown = useCallback((e) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  // Add mouse move and mouse up handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;

      // Calculate new width based on mouse position
      const newWidth = window.innerWidth - e.clientX;
      // Set minimum and maximum width constraints
      const constrainedWidth = Math.min(Math.max(newWidth, 300), 800);
      setWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Persist the final width to Redux when mouse is released
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
    <div
      className="absolute top-0 right-0 h-full bg-white border-l border-gray-200 flex"
      style={{
        width: `${width}px`,
        zIndex: 2,
        userSelect: isResizing ? 'none' : 'auto',
      }}
    >
      {/* Add resize handle */}
      <div
        className="absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-blue-500 hover:opacity-100 opacity-0 transition-opacity"
        onMouseDown={handleMouseDown}
        style={{
          backgroundColor: isResizing ? 'rgb(59, 130, 246)' : 'transparent',
          opacity: isResizing ? '1' : undefined,
        }}
      />

      {/* Updated sidebar content */}
      <div className="flex-1 px-4 py-1 overflow-auto max-h-screen" id="node-details">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-lg font-semibold">{node?.data?.config?.title || node?.id || 'Node Details'}</h1>
            <h2 className="text-xs font-semibold">{nodeType}</h2>
          </div>
          <Button isIconOnly radius="full" variant="light" onClick={() => dispatch(setSelectedNode({ nodeId: null }))}>
            <Icon className="text-default-500" icon="solar:close-circle-linear" width={24} />
          </Button>
        </div>

        <Accordion selectionMode="multiple" defaultExpandedKeys={hasRunOutput ? ['output'] : ['title', 'config']}>
          {nodeType !== 'InputNode' && (
            <AccordionItem key="output" aria-label="Output" title="Outputs">
              <NodeOutput node={node} />
            </AccordionItem>
          )}

          <AccordionItem key="title" aria-label="Node Title" title="Node Title">
            <Input
              value={node?.data?.config?.title || ''}
              onChange={(e) => handleInputChange('title', e.target.value)}
              placeholder="Enter node title"
              maxRows={1}
              label="Node Title"
              fullWidth
            />
          </AccordionItem>

          <AccordionItem key="config" aria-label="Node Configuration" title="Node Configuration">
            {renderConfigFields()}
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
};

export function NewNodeSidebar({ nodeID }) {
  const dispatch = useDispatch();
  const node = useSelector((state) => selectNodeById(state, nodeID));
  const nodeType = useSelector((state) => {
    return Object.values(state.nodeTypes.raw)
      .flat()
      .find((nodeType) => nodeType.name === node?.type);
  });

  useEffect(() => {
    console.log('nodeType', nodeType);
    console.log('node', node);
  }, [nodeType, node]);

  const nodeConfig = nodeType?.config;

  const NextUITheme = useMemo(
    () => ({
      widgets: {
        TextWidget: (props) =>
          ['number', 'integer'].includes(String(props.schema.type)) ? (
            <Slider
              label={props.label && ' '}
              defaultValue={props.value}
              hideValue={false}
              getValue={(value) => <span className="text-xs font-medium">{value}</span>}
              onChange={(e) => props.onChange(e)}
              color="foreground"
              minValue={props.schema.minimum || 0}
              maxValue={props.schema.maximum || 100}
              step={props.schema.type === 'integer' ? 1 : 0.1}
              className={props.label ? '-mt-5' : ''}
            />
          ) : (
            <Input
              type="text"
              size="sm"
              value={props.value}
              onChange={(e) => props.onChange(e.target.value)}
              placeholder={props.placeholder}
              isRequired={props.required}
              isDisabled={props.disabled}
              isReadOnly={props.readonly}
              description={props.schema.description}
              className="w-full"
            />
          ),
        TextAreaWidget: (props) => (
          <Textarea
            value={props.value}
            size="sm"
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            isRequired={props.required}
            isDisabled={props.disabled}
            isReadOnly={props.readonly}
            description={props.schema.description}
            className="w-full"
            minRows={3}
          />
        ),
        SelectWidget: (props) => (
          <Select
            size="sm"
            autoFocus={props.autoFocus}
            disabled={props.disabled}
            id={props.id}
            name={props.name}
            onBlur={() => props.onBlur(props.id, props.value)}
            onFocus={() => props.onFocus(props.id, props.value)}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder={props.placeholder}
            isRequired={props.required}
            description={props.schema.description}
            value={props.value}
            className="w-full"
            defaultSelectedKeys={[props.value]}
          >
            {(props.options?.enumOptions ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        ),
        BooleanWidget: (props) => (
          <div className="flex flex-col gap-1">
            {props.label && <span className="text-sm">{props.label}</span>}
            <Switch
              size="sm"
              isSelected={props.value}
              onValueChange={(checked) => props.onChange(checked)}
              isDisabled={props.disabled}
            />
            {props.schema.description && <span className="text-xs text-gray-500">{props.schema.description}</span>}
          </div>
        ),
        RangeWidget: (props) => (
          <div className="flex flex-col gap-1">
            {props.label && <span className="text-sm">{props.label}</span>}
            <Slider
              size="sm"
              value={props.value}
              onChange={(value) => props.onChange(value)}
              minValue={props.schema.minimum ?? 0}
              maxValue={props.schema.maximum ?? 100}
              step={1}
              aria-label={props.label}
              className="w-full"
            />
            {props.schema.description && <span className="text-xs text-gray-500">{props.schema.description}</span>}
          </div>
        ),
      },
      fields: {},
      templates: {
        ButtonTemplates: {
          SubmitButton: () => {
            return <Button radius="sm">Submit</Button>;
          },
          AddButton: (props) => {
            return (
              <Button
                size="sm"
                radius="sm"
                disabled={props.disabled}
                onClick={props.onClick}
                variant="solid"
                color="primary"
              >
                Add
              </Button>
            );
          },
          RemoveButton: (props) => {
            return (
              <Button
                size="sm"
                radius="sm"
                isIconOnly
                color="primary"
                variant="light"
                disabled={props.disabled}
                onClick={props.onClick}
              >
                <Cross1Icon />
              </Button>
            );
          },
          SubmitButton: () => {
            return null;
          },
        },
        ObjectFieldTemplate: (props) => {
          const { AddButton } = props.registry.templates.ButtonTemplates;
          return (
            <div className="flex flex-col gap-4 w-full">
              {props.title && (
                <h3 className="text-lg font-medium sticky -top-4 bg-white py-2 z-10 -mx-4 p-4">{props.title}</h3>
              )}
              <div className="flex flex-col gap-4">
                {props.properties.map((property) =>
                  !property.hidden ? (
                    <div key={property.name} className="flex flex-col gap-2 w-full">
                      {property.content}
                    </div>
                  ) : null,
                )}
              </div>
              {props.schema.additionalProperties && (
                <div className="flex justify-end">
                  <AddButton registry={props.registry} onClick={props.onAddClick(props.schema)} />
                </div>
              )}
            </div>
          );
        },
        WrapIfAdditionalTemplate: (props) => {
          const { RemoveButton } = props.registry.templates.ButtonTemplates;

          if (!props.schema.__additional_property) {
            return <>{props.children}</>;
          }

          console.log('props', props);
          return (
            <div className="flex flex-col gap-2">
              <div className="flex flex-row gap-2">
                <div className="flex flex-col gap-2">
                  <Input
                    size="sm"
                    radius="sm"
                    defaultValue={props.label}
                    onChange={debounce((e) => {
                      props.onKeyChange(e.target.value);
                    }, 300)}
                  />
                </div>
                <div className="custom-form-field flex flex-col gap-2">{props.children}</div>
                <RemoveButton registry={props.registry} onClick={props.onDropPropertyClick(props.label)} />
              </div>
            </div>
          );
        },
        UnsupportedFieldTemplate: (props) => {
          const { schema, reason } = props;
          return (
            <div>
              <p className="text-red-500">Unsupported field schema, reason = {reason}</p>
              <pre>{JSON.stringify(schema, null, 2)}</pre>
            </div>
          );
        },
      },
    }),
    [node],
  );

  const CustomForm = useMemo(() => withTheme(NextUITheme), [NextUITheme]);

  return (
    <Card className="absolute top-4 bottom-4 right-4 w-96 p-4 bg-white rounded-xl border border-solid border-gray-200 overflow-auto">
      <CustomForm
        schema={nodeConfig}
        formData={node.data.config}
        validator={validator}
        onChange={debounce(({ formData, ...other }) => {
          console.log('formData', formData);
          dispatch(updateNodeData({ id: nodeID, data: { config: formData } }));
        }, 300)}
      ></CustomForm>
    </Card>
  );
}

export default NodeSidebar;
