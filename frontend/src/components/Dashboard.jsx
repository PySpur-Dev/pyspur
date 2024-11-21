import React, { useState, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  getKeyValue,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Progress,
  useDisclosure,
  Accordion,
  AccordionItem
} from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { getWorkflows, createWorkflow, uploadDataset, startBatchRun, deleteWorkflow, updateWorkflow, getTemplates, instantiateTemplate, duplicateWorkflow } from '../utils/api';
import { useRouter } from 'next/router';
import TemplateCard from './TemplateCard';
import WorkflowBatchRunsTable from './WorkflowBatchRunsTable';

const Dashboard = () => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const router = useRouter();

  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const workflows = await getWorkflows();
        setWorkflows(workflows);
      } catch (error) {
        console.error('Error fetching workflows:', error);
      }
    };

    fetchWorkflows();
  }, []);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const workflows = await getTemplates();
        setTemplates(workflows);
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    };

    fetchTemplates();
  }, []);

  const columns = [
    { key: "id", label: "ID" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "action", label: "Action" },
  ];

  const handleRunClick = (workflow) => {
    setSelectedWorkflow(workflow);
    onOpen();
  };

  const handleEditClick = (workflow) => {
    router.push({
      pathname: `/workflows/${workflow.id}`,
    });
  };

  // const handleEditClick = (workflow) => {
  //   router.push({
  //     pathname: '/workflow',
  //     query: { workflowId: workflow.key },
  //   });
  // };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleRunWorkflow = async () => {
    if (!file) {
      alert('Please upload a file');
      return;
    }
    let uploadedDataset;
    // upload file as dataset
    try {
      // Generate a unique name for the dataset using the current timestamp
      const datasetName = `Dataset_${Date.now()}`;
      const datasetDescription = `Uploaded dataset for workflow ${selectedWorkflow.name}`;

      // Call the API to upload the dataset
      uploadedDataset = await uploadDataset(datasetName, datasetDescription, file);

      console.log('Dataset uploaded successfully:', uploadedDataset);
    } catch (error) {
      console.error('Error uploading dataset:', error);
      alert('Failed to upload dataset. Please try again.');
      return;
    }

    try {
      // Simulate workflow run and progress
      setProgress(0);
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 500);

      // Call the API to start a batch workflow run
      await startBatchRun(selectedWorkflow.id, uploadedDataset.id);
    } catch (error) {
      console.error('Error running workflow:', error);
    }
  };

  // const handleNewWorkflowClick = () => {
  //   router.push('/workflow');
  // };

  const handleNewWorkflowClick = async () => {
    try {
      // Generate a unique name for the new workflow
      const uniqueName = `New Spur ${new Date().toLocaleString()}`;

      // Create an empty workflow object
      const newWorkflow = {
        name: uniqueName,
        description: '',

      };

      // Call the API to create the workflow
      const createdWorkflow = await createWorkflow(newWorkflow);

      // Navigate to the new workflow's page using its ID
      router.push(`/workflows/${createdWorkflow.id}`);
    } catch (error) {
      console.error('Error creating new workflow:', error);
    }
  };

  const handleImportWorkflowClick = async () => {
    try {
      // Ask the user to upload a JSON file
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'application/json';
      fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) {
          alert('No file selected. Please try again.');
          return;
        }

        // Read the file content
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            let jsonContent = JSON.parse(e.target.result);

            // Generate a unique name for the new workflow
            const uniqueName = `Imported Spur ${new Date().toLocaleString()}`;

            // Create an empty workflow object
            const newWorkflow = {
              name: uniqueName,
              description: '',
            };
            // to support old style downloaded workflows
            if (jsonContent.name) {
              newWorkflow.name = jsonContent.name;
            }
            if (jsonContent.description) {
              newWorkflow.description = jsonContent.description;
            }
            if (jsonContent.nodes) {
              newWorkflow.definition = jsonContent;
            }
            if (jsonContent.definition) {
              newWorkflow.definition = jsonContent.definition;
            }
            // Call the API to create the workflow
            const createdWorkflow = await createWorkflow(newWorkflow);

            // Navigate to the new workflow's page using its ID
            router.push(`/workflows/${createdWorkflow.id}`);
          } catch (error) {
            console.error('Error processing the JSON file:', error);
            alert('Failed to import workflow. Please ensure the file is a valid JSON.');
          }
        };
        reader.readAsText(file);
      };
      fileInput.click();
    } catch (error) {
      console.error('Error importing workflow:', error);
    }
  };

  const handleUseTemplate = async (template) => {
    try {
      const newWorkflow = await instantiateTemplate(template);
      router.push(`/workflows/${newWorkflow.id}`);
    } catch (error) {
      console.error('Error using template:', error);
    }
  };

  const handleDeleteClick = async (workflow) => {
    if (window.confirm(`Are you sure you want to delete workflow "${workflow.name}"?`)) {
      try {
        // Call the API to delete the workflow
        await deleteWorkflow(workflow.id);

        // Remove the deleted workflow from the state
        setWorkflows((prevWorkflows) => prevWorkflows.filter((w) => w.id !== workflow.id));

        console.log(`Workflow "${workflow.name}" deleted successfully.`);
      } catch (error) {
        console.error('Error deleting workflow:', error);
        alert('Failed to delete workflow. Please try again.');
      }
    }
  };

  const handleDuplicateClick = async (workflow) => {
    try {
      const duplicatedWorkflow = await duplicateWorkflow(workflow.id);
      // Update the workflows state
      setWorkflows((prevWorkflows) => [duplicatedWorkflow, ...prevWorkflows]);
      console.log(`Workflow "${workflow.name}" duplicated successfully.`);
    } catch (error) {
      console.error('Error duplicating workflow:', error);
      alert('Failed to duplicate workflow. Please try again.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="w-3/4 mx-auto p-5">

        {/* Dashboard Header */}
        <header className="mb-6 flex w-full items-center">
          <div className="flex flex-col max-w-fit" id="dashboard-title">
            <h1 className="text-xl font-bold text-default-900 lg:text-3xl">Dashboard</h1>
            <p className="text-small text-default-400 lg:text-medium">Manage your spurs</p>
          </div>
          <div className="ml-auto flex items-center gap-2" id="new-workflow-entries">
            <Button
              className="bg-foreground text-background"
              startContent={
                <Icon className="flex-none text-background/60" icon="lucide:plus" width={16} />
              }
              onClick={handleNewWorkflowClick}
            >
              New Spur
            </Button>
            <Button
              className="bg-foreground text-background"
              startContent={
                <Icon className="flex-none text-background/60" icon="lucide:upload" width={16} />
              }
              onClick={handleImportWorkflowClick}
            >
              Import Spur
            </Button>
          </div>
        </header>

        {/* Wrap sections in Accordion */}
        <Accordion defaultExpandedKeys={["1", "2", "3"]} selectionMode="multiple">
          <AccordionItem
            key="1"
            aria-label="Spur Templates"
            title={
              <h3 className="text-xl font-semibold mb-4">
                Spur Templates
              </h3>
            }
          >
            {/* Spur Templates Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1 px-1 mb-8">
              {templates.map((template) => (
                <TemplateCard
                  key={template.file_name}
                  title={template.name}
                  description={template.description}
                  features={template.features}
                  onUse={() => handleUseTemplate(template)}
                />
              ))}
            </div>
          </AccordionItem>

          <AccordionItem
            key="2"
            aria-label="Recent Spurs"
            title={
              <h3 className="text-xl font-semibold mb-4">
                Recent Spurs
              </h3>
            }
          >
            {/* Recent Spurs Section */}
            <Table aria-label="Saved Workflows" isHeaderSticky>
              <TableHeader columns={columns}>
                {(column) => <TableColumn key={column.key}>{column.label}</TableColumn>}
              </TableHeader>
              <TableBody items={workflows}>
                {(workflow) => (
                  <TableRow key={workflow.key}>
                    {(columnKey) => (
                      <TableCell>
                        {columnKey === "action" ? (
                          <div className="flex items-center gap-2">
                            <Icon
                              icon="solar:play-bold"
                              className="cursor-pointer text-default-400"
                              height={18}
                              width={18}
                              onClick={() => handleRunClick(workflow)}
                            />
                            <Icon
                              icon="solar:pen-bold"
                              className="cursor-pointer text-default-400"
                              height={18}
                              width={18}
                              onClick={() => handleEditClick(workflow)}
                            />
                            <Icon
                              icon="solar:copy-bold"
                              className="cursor-pointer text-default-400"
                              height={18}
                              width={18}
                              onClick={() => handleDuplicateClick(workflow)}
                            />
                            <Icon
                              icon="solar:trash-bin-trash-bold"
                              className="cursor-pointer text-default-400"
                              height={18}
                              width={18}
                              onClick={() => handleDeleteClick(workflow)}
                            />
                          </div>
                        ) : (
                          getKeyValue(workflow, columnKey)
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </AccordionItem>

          <AccordionItem
            key="3"
            aria-label="Spur Jobs"
            title={
              <h3 className="text-xl font-semibold mb-4">
                Spur Jobs
              </h3>
            }
          >
            {/* Spur Jobs Section */}
            <WorkflowBatchRunsTable />
          </AccordionItem>
        </Accordion>
      </div>

      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                Run {selectedWorkflow?.name}
              </ModalHeader>
              <ModalBody>
                <Input
                  type="file"
                  accept=".csv,.jsonl"
                  onChange={handleFileChange}
                  label="Upload CSV or JSONL"
                />
                {progress > 0 && <Progress value={progress} />}
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Close
                </Button>
                <Button
                  color="primary"
                  onPress={handleRunWorkflow}
                  disabled={progress > 0 && progress < 100}
                >
                  {progress > 0 && progress < 100 ? 'Running...' : 'Run'}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
};

export default Dashboard;