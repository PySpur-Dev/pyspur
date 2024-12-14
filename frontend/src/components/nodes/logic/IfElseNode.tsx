import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position } from '@xyflow/react';
import BaseNode from '../base/BaseNode';
import { Input, Card, Divider, Button, Select, SelectItem, RadioGroup, Radio } from '@nextui-org/react';
import { useDispatch } from 'react-redux';
import { updateNodeData } from '../../../store/flowSlice';
import { Icon } from "@iconify/react";
import { BaseNodeData, BaseNodeProps, BaseNodeConfig } from '../../../types/nodes/base';

interface Condition {
  logicalOperator?: 'AND' | 'OR';
  variable: string;
  operator: string;
  value: string;
}

interface Branch {
  conditions: Condition[];
}

interface IfElseNodeConfig extends BaseNodeConfig {
  branches: Branch[];
}

interface IfElseNodeData extends Omit<BaseNodeData, 'config'> {
  config: IfElseNodeConfig;
}

interface IfElseNodeProps extends Omit<BaseNodeProps, 'data'> {
  data: IfElseNodeData;
}

const OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'number_equals', label: 'Number Equals' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'not_starts_with', label: 'Does Not Start With' },
  { value: 'is_empty', label: 'Is Empty' },
  { value: 'is_not_empty', label: 'Is Not Empty' },
];

const DEFAULT_CONDITION: Condition = {
  variable: '',
  operator: 'contains',
  value: ''
};

const DEFAULT_BRANCH: Branch = {
  conditions: [{ ...DEFAULT_CONDITION }]
};

export const IfElseNode: React.FC<IfElseNodeProps> = ({ id, data, isCollapsed, setIsCollapsed, ...props }) => {
  const [nodeWidth, setNodeWidth] = useState<string>('auto');
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const dispatch = useDispatch();

  const inputVariables = Object.entries(data.config?.input_schema || {}).map(([key, type]) => ({
    value: key,
    label: `${key} (${type})`,
  }));

  useEffect(() => {
    if (!data.config?.branches || !Array.isArray(data.config.branches) || data.config.branches.length === 0) {
      handleUpdateBranches([{ ...DEFAULT_BRANCH }]);
    } else {
      const validBranches = data.config.branches.map(branch => ({
        conditions: Array.isArray(branch.conditions) && branch.conditions.length > 0
          ? branch.conditions.map((condition, index) => ({
            ...condition,
            logicalOperator: index > 0 ? (condition.logicalOperator || 'AND') : undefined
          }))
          : [{ ...DEFAULT_CONDITION }]
      }));
      if (JSON.stringify(validBranches) !== JSON.stringify(data.config.branches)) {
        handleUpdateBranches(validBranches);
      }
    }
  }, []);

  useEffect(() => {
    if (!nodeRef.current || !data) return;
    const minNodeWidth = 400;
    const maxNodeWidth = 800;
    setNodeWidth(`${Math.min(Math.max(minNodeWidth, nodeRef.current.scrollWidth), maxNodeWidth)}px`);
  }, [data]);

  const handleUpdateBranches = (newBranches: Branch[]) => {
    const output_schema: Record<string, string> = {};
    newBranches.forEach((_, index) => {
      output_schema[`branch${index + 1}`] = 'any';
    });

    const updatedData: IfElseNodeData = {
      ...data,
      config: {
        ...data.config,
        branches: newBranches,
        input_schema: data.config?.input_schema || { input: 'any' },
        output_schema
      }
    };

    dispatch(updateNodeData({
      id,
      data: updatedData
    }));
  };

  const addBranch = () => {
    const newBranch: Branch = {
      conditions: [{
        variable: '',
        operator: 'contains',
        value: ''
      }]
    };

    const newBranches: Branch[] = [
      ...(data.config?.branches || []),
      newBranch
    ];

    handleUpdateBranches(newBranches);
  };

  const removeBranch = (index: number) => {
    const newBranches = [...(data.config?.branches || [])];
    newBranches.splice(index, 1);
    handleUpdateBranches(newBranches);
  };

  const addCondition = (branchIndex: number) => {
    const newBranches = [...(data.config?.branches || [])].map((branch, index) => {
      if (index === branchIndex) {
        return {
          ...branch,
          conditions: [
            ...(branch.conditions || []),
            { ...DEFAULT_CONDITION, logicalOperator: 'AND' }
          ]
        };
      }
      return branch;
    });
    handleUpdateBranches(newBranches);
  };

  const removeCondition = (branchIndex: number, conditionIndex: number) => {
    const newBranches = [...(data.config?.branches || [])].map((branch, index) => {
      if (index === branchIndex && branch.conditions?.length > 1) {
        return {
          ...branch,
          conditions: branch.conditions.filter((_, i) => i !== conditionIndex)
        };
      }
      return branch;
    });
    handleUpdateBranches(newBranches);
  };

  const updateCondition = (branchIndex: number, conditionIndex: number, field: keyof Condition, value: string) => {
    const newBranches = [...(data.config?.branches || [])].map((branch, index) => {
      if (index === branchIndex) {
        return {
          ...branch,
          conditions: (branch.conditions || []).map((condition, i) => {
            if (i === conditionIndex) {
              const updatedValue = field === 'logicalOperator' ? (value as 'AND' | 'OR') : value;
              return { ...condition, [field]: updatedValue };
            }
            return condition;
          })
        };
      }
      return branch;
    });
    handleUpdateBranches(newBranches as Branch[]);
  };

  return (
    <BaseNode
      id={id}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      data={{
        ...data,
        title: data.config?.title || 'Conditional Router',
        color: data.color || '#F6AD55',
        acronym: 'IF',
        config: {
          ...data.config,
          title: data.config?.title || 'Conditional Router'
        }
      }}
      style={{ width: nodeWidth }}
      className="hover:!bg-background"
      {...props}
    >
      <div className="node-content p-3" ref={nodeRef}>
        <div className="node-handle-row flex w-full justify-start mb-4">
          <Handle
            type="target"
            position={Position.Left}
            id="input"
            className="node-handle node-handle-input"
          />
          {!isCollapsed && <span className="text-sm font-medium ml-2 text-foreground">Input →</span>}
        </div>

        {!isCollapsed && (
          <>
            <Divider className="my-2" />

            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium text-foreground">Expressions</span>
              <Divider className="flex-grow" />
            </div>

            <div className="flex flex-col gap-4">
              {(data.config?.branches || []).map((branch, branchIndex) => (
                <Card
                  key={branchIndex}
                  classNames={{
                    base: "bg-background border-default-200"
                  }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="node-handle-row flex w-full justify-end">
                      <Handle
                        type="source"
                        position={Position.Right}
                        id={`branch${branchIndex + 1}`}
                        className="node-handle node-handle-output"
                      />
                    </div>

                    {(branch.conditions || []).map((condition, conditionIndex) => (
                      <div key={conditionIndex} className="flex flex-col gap-2">
                        {conditionIndex > 0 && (
                          <div className="flex items-center gap-2 justify-center">
                            <RadioGroup
                              orientation="horizontal"
                              value={condition.logicalOperator}
                              onValueChange={(value) => updateCondition(branchIndex, conditionIndex, 'logicalOperator', value)}
                              size="sm"
                            >
                              <Radio value="AND">AND</Radio>
                              <Radio value="OR">OR</Radio>
                            </RadioGroup>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Select
                            size="sm"
                            value={condition.variable}
                            onChange={(e) => updateCondition(branchIndex, conditionIndex, 'variable', e.target.value)}
                            placeholder="Select variable"
                            className="flex-1"
                            classNames={{
                              trigger: "bg-default-100 dark:bg-default-50",
                              popoverContent: "bg-background dark:bg-background"
                            }}
                          >
                            {inputVariables.map((variable) => (
                              <SelectItem key={variable.value} value={variable.value}>
                                {variable.label}
                              </SelectItem>
                            ))}
                          </Select>
                          <Select
                            size="sm"
                            value={condition.operator}
                            onChange={(e) => updateCondition(branchIndex, conditionIndex, 'operator', e.target.value)}
                            className="flex-1"
                            classNames={{
                              trigger: "bg-default-100 dark:bg-default-50",
                              popoverContent: "bg-background dark:bg-background"
                            }}
                          >
                            {OPERATORS.map((op) => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </Select>
                          {!['is_empty', 'is_not_empty'].includes(condition.operator) && (
                            <Input
                              size="sm"
                              value={condition.value}
                              onChange={(e) => updateCondition(branchIndex, conditionIndex, 'value', e.target.value)}
                              placeholder="Value"
                              className="flex-1"
                              classNames={{
                                input: "bg-default-100",
                                inputWrapper: "shadow-none"
                              }}
                            />
                          )}
                          {branch.conditions.length > 1 && (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onClick={() => removeCondition(branchIndex, conditionIndex)}
                              className="text-default-400 hover:text-danger"
                            >
                              <Icon icon="solar:trash-bin-minimalistic-linear" width={16} />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}

                    <Button
                      size="sm"
                      variant="light"
                      onClick={() => addCondition(branchIndex)}
                      className="text-default-400 hover:text-primary"
                      startContent={<Icon icon="solar:add-circle-linear" width={16} />}
                    >
                      Add Condition
                    </Button>

                    {data.config?.branches.length > 1 && (
                      <Button
                        size="sm"
                        variant="light"
                        onClick={() => removeBranch(branchIndex)}
                        className="text-default-400 hover:text-danger"
                        startContent={<Icon icon="solar:trash-bin-minimalistic-linear" width={16} />}
                      >
                        Remove Branch
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <Button
              size="sm"
              variant="light"
              onClick={addBranch}
              className="mt-4 text-default-400 hover:text-primary"
              startContent={<Icon icon="solar:add-circle-linear" width={16} />}
            >
              Add Branch
            </Button>
          </>
        )}
      </div>
    </BaseNode>
  );
};

export default IfElseNode;
