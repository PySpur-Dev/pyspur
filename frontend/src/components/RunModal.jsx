import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
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
  Input
} from "@nextui-org/react";
import { Icon } from "@iconify/react";
import TextEditor from './textEditor/TextEditor';

const RunModal = ({ isOpen, onOpenChange, onRun, onSave }) => {
  const workflowInputVariables = useSelector(state => state.flow.workflowInputVariables);

  const workflowInputVariableNames = Object.keys(workflowInputVariables || {});
  const [testData, setTestData] = useState([]);
  const [newRow, setNewRow] = useState({});
  const [editingCell, setEditingCell] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const nodes = useSelector(state => state.flow.nodes);
  const edges = useSelector(state => state.flow.edges);

  // Add this new state to track editor contents
  const [editorContents, setEditorContents] = useState({});

  const handleAddRow = () => {

    setTestData([
      ...testData,
      {
        id: testData.length + 1,
        ...editorContents
      }
    ]);
    setEditorContents({});
    setNewRow(workflowInputVariableNames.reduce((acc, field) => ({ ...acc, [field]: "" }), {}));
  };

  // Add this useEffect to log editorContents whenever it changes
  useEffect(() => {

  }, [editorContents]);

  const handleDeleteRow = (id) => {
    setTestData(testData.filter(row => row.id !== id));
  };

  const handleDoubleClick = (rowId, field) => {
    setEditingCell({ rowId, field });
  };

  const handleCellEdit = (rowId, field, value) => {
    setTestData(testData.map(row =>
      row.id === rowId ? { ...row, [field]: value } : row
    ));
  };

  const handleBlur = () => {
    setEditingCell(null);
  };

  const renderCell = (row, field) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;

    if (isEditing) {
      return (
        <Input
          autoFocus
          size="sm"
          value={row[field]}
          onChange={(e) => handleCellEdit(row.id, field, e.target.value)}
          onBlur={handleBlur}
        />
      );
    }

    return (
      <div onDoubleClick={() => handleDoubleClick(row.id, field)}>
        <div dangerouslySetInnerHTML={{ __html: row[field] }} />
      </div>
    );
  };

  const handleKeyDown = (e) => {
    // Check if any of the input fields have values before allowing row addition
    const hasValues = Object.values(newRow).some(value => value !== "");
    if (e.key === 'Enter' && hasValues) {
      handleAddRow();
    }
  };


  const handleRun = () => {
    if (!selectedRow) return;

    // Find the selected test data
    const selectedTestCase = testData.find(row => row.id == selectedRow);
    if (!selectedTestCase) return;

    // Remove the id field from the test case
    const { id, ...inputValues } = selectedTestCase;

    // Initialize the initialInputs structure
    let initialInputs = {};

    // InputNode id
    const inputNodeId = nodes.find(node => node.type === 'InputNode')?.id;

    initialInputs = {
      [inputNodeId]: inputValues
    };



    // Call the onRun callback with the constructed initialInputs
    onRun(initialInputs);
  };

  const handleSave = () => {
    if (!selectedRow) return;

    // Find the selected test data
    const selectedTestCase = testData.find(row => row.id == selectedRow);
    if (!selectedTestCase) return;

    // Remove the id field from the test case
    const { id, ...inputValues } = selectedTestCase;

    if (typeof onSave === 'function') {
      onSave(inputValues);  // Call the onSave function
    } else {
      console.error('onSave is not a function');
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
                selectedKeys={selectedRow ? [selectedRow] : new Set()}
                onSelectionChange={(selection) => {
                  const selectedKey = Array.from(selection)[0];
                  setSelectedRow(selectedKey);
                }}
              >
                <TableHeader>
                  <TableColumn>#</TableColumn>
                  {workflowInputVariableNames.map(field => (
                    <TableColumn key={field}>{field.toUpperCase()}</TableColumn>
                  ))}
                  <TableColumn>ACTIONS</TableColumn>
                </TableHeader>
                <TableBody>
                  {testData.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.id}</TableCell>
                      {workflowInputVariableNames.map(field => (
                        <TableCell key={field}>
                          {renderCell(row, field)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleDeleteRow(row.id)}
                        >
                          <Icon icon="solar:trash-bin-trash-linear" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
                      setContent={(value) => {
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
