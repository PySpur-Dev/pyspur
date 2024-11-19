import React, { useState, useEffect } from 'react';
import { Button, Input, Select, SelectItem } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { useDispatch } from 'react-redux';
import { deleteEdgeByHandle } from '../../../store/flowSlice'; // Import the deleteEdge action

const SchemaEditor = ({ jsonValue = {}, onChange, options = [], disabled = false, schemaType = 'input_schema', nodeId }) => {
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState('str'); // Default to 'string'
  const [editingField, setEditingField] = useState(null); // Track the field being edited
  const dispatch = useDispatch(); // Initialize dispatch

  const getPlaceholderExample = () => {
    return schemaType === 'input_schema'
      ? 'eg. article'
      : 'eg. summary';
  };

  const handleAddKey = () => {
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

  const handleRemoveKey = (key) => {
    const { [key]: _, ...updatedJson } = jsonValue;
    console.log("after removing a key: ", key, updatedJson);
    onChange(updatedJson);
    // Dispatch an action to remove the corresponding edge
    dispatch(deleteEdgeByHandle({ nodeId, handleKey: key }));
  };

  // Helper function to extract the type from the value
  const getType = (value) => {
    if (typeof value === 'object' && value !== null) {
      return value.type || 'str';
    }
    return value;
  };

  const handleKeyEdit = (oldKey, newKey) => {
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
    setEditingField(null);
  };

  return (
    <div className="json-editor">
      <div className="mb-4 flex items-center space-x-4">
        <Input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
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
          selectedValue={newType}
          onChange={setNewType}
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
          auto
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
                onBlur={(e) => handleKeyEdit(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleKeyEdit(key, e.target.value);
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
                className="mr-2 p-1 border rounded-full bg-gray-100 cursor-pointer"
                onClick={() => setEditingField(key)} // Open the input on click
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
              auto
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