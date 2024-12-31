import React, { useState, useEffect } from 'react';
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
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Input,
  Tooltip
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import TextEditor from '../textEditor/TextEditor';
import { addTestInput, deleteTestInput } from '../../store/flowSlice';
import { RootState } from '../../store/store';
import { AppDispatch } from '../../store/store';
import { TestInput } from '@/types/api_types/workflowSchemas';
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow';
import { getWorkflowInputVariables } from '../../utils/flowUtils';

interface RunModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onRun: (initialInputs: Record<string, any>) => void;
  onSave?: () => void;
}

interface EditingCell {
  rowId: number;
  field: string;
}

const RunModal: React.FC<RunModalProps> = ({ isOpen, onOpenChange, onRun, onSave }) => {
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs);
  const workflowInputVariables = getWorkflowInputVariables(nodes, nodeConfigs);
  const workflowInputVariableNames = Object.keys(workflowInputVariables);
  const inputNode = nodes.find(node => node.type === 'InputNode');


  const [testData, setTestData] = useState<TestInput[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [editorContents, setEditorContents] = useState<Record<string, string>>({});

  const dispatch = useDispatch<AppDispatch>();
  const testInputs = useSelector((state: RootState) => state.flow.testInputs);
  const saveWorkflow = useSaveWorkflow();

  useEffect(() => {
    setTestData(testInputs);
  }, [testInputs]);

  useEffect(() => {
    if (testData.length > 0 && !selectedRow) {
      setSelectedRow(testData[0].id.toString());
    }
  }, [testData]);

  useEffect(() => {
    if (isOpen && testData.length > 0) {
      setSelectedRow(testData[0].id.toString());
    }
  }, [isOpen, testData]);

  const handleAddRow = () => {
    const newTestInput: TestInput = {
      id: Date.now(),
      ...editorContents,
    };
    setTestData([...testData, newTestInput]);
    setEditorContents({});
    dispatch(addTestInput(newTestInput));
    saveWorkflow();
  };

  const handleDeleteRow = (id: number) => {
    setTestData(testData.filter((row) => row.id !== id));
    dispatch(deleteTestInput({ id }));
    saveWorkflow();
  };

  const handleDoubleClick = (rowId: number, field: string) => {
    setEditingCell({ rowId, field });
  };

  const handleCellEdit = (rowId: number, field: string, value: string) => {
    setTestData(testData.map(row =>
      row.id === rowId ? { ...row, [field]: value } : row
    ));
  };

  const handleBlur = () => {
    setEditingCell(null);
  };

  const renderCell = (row: TestInput, field: string) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
    const content = row[field];

    if (isEditing) {
      return (
        <div onClick={(e) => e.stopPropagation()}>
          <Input
            autoFocus
            size="sm"
            defaultValue={content}
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
        <Tooltip content={content} showArrow={true}>
          <span className="max-w-[200px] truncate">{content}</span>
        </Tooltip>
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
    if (!selectedRow || !inputNode) return;

    const selectedTestCase = testData.find(row => row.id.toString() === selectedRow);
    if (!selectedTestCase) return;

    const { id, ...inputValues } = selectedTestCase;

    const initialInputs = {
      [inputNode.id]: inputValues
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
      classNames={{
        base: "max-w-[95vw] w-[1400px]"
      }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Select Test Input To Run or Save
            </ModalHeader>
            <ModalBody>
              <div className="overflow-x-auto">
                <Table
                  aria-label="Test cases table"
                  selectionMode="single"
                  disabledKeys={editingCell ? new Set([editingCell.rowId.toString()]) : new Set()}
                  selectedKeys={selectedRow ? [selectedRow] : new Set()}
                  onSelectionChange={(selection) => {
                    const selectedKey = Array.from(selection)[0]?.toString() || null;
                    setSelectedRow(selectedKey);
                  }}
                  classNames={{
                    base: "min-w-[800px]",
                    table: "min-w-full",
                  }}
                >
                  <TableHeader>
                    {
                      [
                        <TableColumn key="id">ID</TableColumn>,
                        ...workflowInputVariableNames.map(field => (
                          <TableColumn key={field}>{field}</TableColumn>
                        )),
                        <TableColumn key="actions">Actions</TableColumn>
                      ]
                    }
                  </TableHeader>
                  <TableBody>
                    {testData.map((row) => (
                      <TableRow key={row.id}>
                        {
                          [
                            <TableCell key="id">{row.id}</TableCell>,
                            ...workflowInputVariableNames.map(field => (
                              <TableCell key={field}>
                                {renderCell(row, field)}
                              </TableCell>
                            )),
                            <TableCell key="actions">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => handleDeleteRow(row.id)}
                              >
                                <Icon icon="solar:trash-bin-trash-linear" />
                              </Button>
                            </TableCell>
                          ]
                        }
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-2 overflow-x-auto">
                {workflowInputVariableNames.map(field => (
                  <div key={field} className="w-[300px] min-w-[300px]">
                    <TextEditor
                      nodeID={`newRow-${field}`}
                      fieldName={field}
                      fieldTitle={field}
                      inputSchema={[]}
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
                <div className="flex-none">
                  <Button
                    color="primary"
                    onPress={handleAddRow}
                    isDisabled={Object.values(editorContents).every(v => !v?.trim())}
                  >
                    Add Row
                  </Button>
                </div>
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