import React, { useState, ChangeEvent } from 'react';
import { Button, Input, Select, SelectItem } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { useDispatch } from 'react-redux';
import { deleteEdgeByHandle, updateEdgesOnHandleRename } from '../../../store/flowSlice';

interface SchemaEditorProps {
  jsonValue?: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  options?: string[];
  disabled?: boolean;
  schemaType?: 'input_schema' | 'output_schema';
  nodeId: string;
}

const SchemaEditor: React.FC<SchemaEditorProps> = ({
  jsonValue = {},
  onChange,
  options = [],
  disabled = false,
  schemaType = 'input_schema',
  nodeId
}) => {
  const [newKey, setNewKey] = useState<string>('');
  const [newType, setNewType] = useState<string>('str');
  const [editingField, setEditingField] = useState<string | null>(null);
  const dispatch = useDispatch();

  const getPlaceholderExample = (): string => {
    return schemaType === 'input_schema'
      ? 'eg. article'
      : 'eg. summary';
  };

  const handleAddKey = (): void => {
    if (newKey && !jsonValue?.hasOwnProperty(newKey)) {
      const updatedJson = {
        ...jsonValue,
        [newKey]: newType
      };
      onChange(updatedJson);
      setNewKey('');
      setNewType('str');
    }
  };

  const handleRemoveKey = (key: string): void => {
    const { [key]: _, ...updatedJson } = jsonValue;
    onChange(updatedJson);
    dispatch(deleteEdgeByHandle({ nodeId, handleKey: key }));
  };

  const getType = (value: any): string => {
    if (typeof value === 'object' && value !== null) {
      return value.type || 'str';
    }
    return value;
  };

  const handleKeyEdit = (oldKey: string, newKey: string): void => {
    newKey = newKey.replace(/\s+/g, '_');
    if (oldKey === newKey || !newKey.trim()) {
      setEditingField(null);
      return;
    }

    const updatedJson = {
      ...jsonValue,
      [newKey]: getType(jsonValue[oldKey]),
    };
    delete updatedJson[oldKey];

    onChange(updatedJson);
    if (newKey && oldKey) {
      dispatch(updateEdgesOnHandleRename({
        nodeId,
        oldHandleId: oldKey,
        newHandleId: newKey,
        schemaType,
      }));
    }
    setEditingField(null);
  };

  return (
    <div className="json-editor">
      <div className="mb-4 flex items-center space-x-4">
        <Input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value.replace(/\s+/g, '_'))}
          placeholder={getPlaceholderExample()}
          label="Name"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !disabled && newKey) {
              handleAddKey();
            }
          }}
          className="p-2 flex-grow w-2/3"
        />
        <Select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          disabled={disabled}
          label="Type"
          defaultSelectedKeys={["str"]}
          className="max-w-xs p-2 w-1/3"
        >
          <SelectItem key="str" value="str">str</SelectItem>
          <SelectItem key="bool" value="bool">bool</SelectItem>
          <SelectItem key="int" value="int">int</SelectItem>
          <SelectItem key="float" value="float">float</SelectItem>
        </Select>
        <Button
          isIconOnly
          radius="full"
          variant="light"
          onClick={handleAddKey}
          color="primary"
          disabled={disabled || !newKey}
          size="sm"
        >
          <Icon icon="solar:add-circle-linear" width={22} />
        </Button>
      </div>

      {jsonValue && typeof jsonValue === 'object' && !Array.isArray(jsonValue) && (
        Object.entries(jsonValue).map(([key, value]) => (
          <div key={key} className="mb-2 flex items-center">
            {editingField === key ? (
              <Input
                autoFocus
                defaultValue={key}
                size="sm"
                variant="faded"
                radius="lg"
                onBlur={(e: ChangeEvent<HTMLInputElement>) => handleKeyEdit(key, e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement;
                    handleKeyEdit(key, target.value);
                  } else if (e.key === 'Escape') {
                    setEditingField(null);
                  }
                }}
                classNames={{
                  input: "bg-default-100",
                  inputWrapper: "shadow-none",
                }}
                className="w-40"
              />
            ) : (
              <span
                className="mr-2 p-1 border rounded-full bg-default-100 hover:bg-default-200 cursor-pointer"
                onClick={() => setEditingField(key)}
              >
                {key}
              </span>
            )}
            <span className="mr-2">{getType(value)}</span>
            <Button
              isIconOnly
              radius="full"
              variant="light"
              onClick={() => handleRemoveKey(key)}
              color="primary"
              disabled={disabled}
              size="sm"
            >
              <Icon icon="solar:trash-bin-trash-linear" width={22} />
            </Button>
          </div>
        ))
      )}
    </div>
  );
};

export default SchemaEditor;
