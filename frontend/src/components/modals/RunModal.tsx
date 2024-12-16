import React, { useState, useEffect, Key, ReactElement, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  Input,
  Tooltip
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import TextEditor from '../textEditor/TextEditor';
import { addTestInput, deleteTestInput, updateTestInput } from '../../store/flowSlice';
import { RootState } from '../../store/store';
import { AppDispatch } from '../../store/store';
import type { Selection } from "@nextui-org/react";

interface RunModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onRun: (initialInputs: Record<string, any>) => void;
  onSave?: () => void;
}

interface TestInput {
  id: string;
  [key: string]: any;
}

interface EditingCell {
  rowId: string;
  field: string;
}

type TestData = {
  id: string;
  [key: string]: string | number | boolean;
};

type TestTableColumn = {
  key: string;
  label: string;
}

const RunModal: React.FC<RunModalProps> = ({ isOpen, onOpenChange, onRun, onSave }) => {
  const workflowInputVariables = useSelector((state: RootState) => state.flow.workflowInputVariables);
  const workflowInputVariableNames = Object.keys(workflowInputVariables || {});

  const [testData, setTestData] = useState<TestInput[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [editorContents, setEditorContents] = useState<Record<string, string>>({});

  const dispatch = useDispatch<AppDispatch>();
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const edges = useSelector((state: RootState) => state.flow.edges);
  const testInputs = useSelector((state: RootState) => state.flow.testInputs);

  useEffect(() => {
    if (Array.isArray(testInputs)) {
      setTestData(testInputs);
    }
  }, [testInputs]);

  const handleAddRow = () => {
    const newTestInput: TestInput = {
      id: Date.now().toString(),
      ...editorContents,
    };
    setTestData([...testData, newTestInput]);
    setEditorContents({});
    dispatch(addTestInput(newTestInput));
  };

  const handleDeleteRow = (id: string) => {
    setTestData(testData.filter((row) => row.id !== id));
    dispatch(deleteTestInput({ id }));
  };

  const handleDoubleClick = (rowId: string, field: string) => {
    setEditingCell({ rowId, field });
  };

  const handleCellEdit = (rowId: string, field: string, value: string) => {
    setTestData(prevData =>
      prevData.map(row =>
        row.id === rowId ? { ...row, [field]: value } : row
      )
    );
    dispatch(updateTestInput({ id: rowId, [field]: value }));
  };

  const handleBlur = () => {
    setEditingCell(null);
  };

  const renderCell = (row: TestInput, field: string) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            size="sm"
            defaultValue={row[field]}
            onBlur={(e) => {
              handleCellEdit(row.id, field, e.target.value);
              handleBlur();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCellEdit(row.id, field, e.currentTarget.value);
                handleBlur();
              }
            }}
            endContent={
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="success"
                onPress={handleBlur}
              >
                <Icon icon="material-symbols:check" />
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <span>{row[field]}</span>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          onPress={() => handleDoubleClick(row.id, field)}
        >
          <Icon icon="solar:pen-linear" />
        </Button>
      </div>
    );
  };

  const handleRun = () => {
    if (!selectedRow) return;

    const selectedTestCase = testData.find(row => row.id === selectedRow);
    if (!selectedTestCase) return;

    const { id, ...inputValues } = selectedTestCase;
    const inputNodeId = nodes.find(node => node.type === 'InputNode')?.id;

    if (!inputNodeId) return;

    const initialInputs = {
      [inputNodeId]: inputValues
    };

    onRun(initialInputs);
  };

  const handleSave = () => {
    if (typeof onSave === 'function') {
      onSave();
    }
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Select Test Input To Run or Save
            </ModalHeader>
            <ModalBody>
              <Table
                aria-label="Test cases table"
                selectionMode="single"
                disabledKeys={editingCell ? new Set([editingCell.rowId]) : new Set()}
                selectedKeys={selectedRow ? new Set([selectedRow]) : new Set()}
                onSelectionChange={(selection) => {
                  const selectedKey = Array.from(selection)[0]?.toString() || null;
                  setSelectedRow(selectedKey);
                }}
              >
                {useMemo(() => {
                  const columns: TestTableColumn[] = [
                    { key: 'id', label: '#' },
                    ...workflowInputVariableNames.map(field => ({
                      key: field,
                      label: field.toUpperCase()
                    })),
                    { key: 'actions', label: 'ACTIONS' }
                  ];

                  return (
                    <TableHeader>
                      {columns.map(column => (
                        <TableColumn key={column.key} align={column.key === 'actions' ? 'center' : 'start'}>
                          {column.label}
                        </TableColumn>
                      ))}
                    </TableHeader>
                  );
                }, [workflowInputVariableNames])}
                <TableBody items={testData}>
                  {(item: TestInput) => {
                    const cells = [
                      <TableCell key="id">{item.id}</TableCell>,
                      ...workflowInputVariableNames.map((field: string) => (
                        <TableCell key={field}>
                          {renderCell(item, field)}
                        </TableCell>
                      )),
                      <TableCell key="actions">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleDeleteRow(item.id)}
                        >
                          <Icon icon="solar:trash-bin-trash-linear" />
                        </Button>
                      </TableCell>
                    ];

                    return (
                      <TableRow key={item.id}>
                        {cells}
                      </TableRow>
                    );
                  }}
                </TableBody>
              </Table>

              <div className="flex gap-2">
                {workflowInputVariableNames.map(field => (
                  <div key={field} className="flex-1">
                    <TextEditor
                      nodeID={`newRow-${field}`}
                      fieldName={field}
                      fieldTitle={field}
                      inputSchema={{}}
                      content={editorContents[field] || ''}
                      setContent={(value: string) => {
                        setEditorContents(prev => ({
                          ...prev,
                          [field]: value
                        }));
                      }}
                    />
                  </div>
                ))}
                <Button
                  color="primary"
                  onPress={handleAddRow}
                  isDisabled={Object.values(editorContents).every(v => !v?.trim())}
                >
                  Add Row
                </Button>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button color="danger" variant="light" onPress={onClose}>
                Cancel
              </Button>
              <Button
                color="primary"
                onPress={handleSave}
              >
                Save
              </Button>
              <Button
                color="primary"
                onPress={() => {
                  handleRun();
                  onClose();
                }}
                isDisabled={!selectedRow}
              >
                Run
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
};

export default RunModal;
