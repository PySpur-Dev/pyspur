import React, { useState, useEffect } from "react";
import { Card, CardBody, CardHeader, Button, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Alert, Dropdown, DropdownTrigger, DropdownMenu, DropdownSection, DropdownItem, Slider } from "@nextui-org/react";
import { Icon } from "@iconify/react";
import { getWorkflows, getWorkflowOutputVariables, startEvalRun } from "../../utils/api";
interface EvalCardProps {
  title: string;
  description: string;
  type: string;
  numSamples: number;
  paperLink?: string;
  onRun?: (workflowId: string, numSamples: number, outputVariable: string) => Promise<void>;
}

interface Workflow {
  id: string;
  name: string;
}

interface OutputVariable {
  node_id: string;
  variable_name: string;
  prefixed_variable: string;
}

interface AlertState {
  message: string;
  color: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  isVisible: boolean;
}

export default function EvalCard({ title, description, type, numSamples, paperLink, onRun }: EvalCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [outputVariables, setOutputVariables] = useState<OutputVariable[]>([]);
  const [selectedOutputVariable, setSelectedOutputVariable] = useState<string | null>(null);
  const [selectedNumSamples, setSelectedNumSamples] = useState(1);
  const [alert, setAlert] = useState<AlertState>({ message: '', color: 'default', isVisible: false });

  const showAlert = (message: string, color: AlertState['color']) => {
    setAlert({ message, color, isVisible: true });
    setTimeout(() => setAlert(prev => ({ ...prev, isVisible: false })), 3000);
  };

  useEffect(() => {
    if (isModalOpen) {
      const fetchWorkflows = async () => {
        try {
          const workflowsData = await getWorkflows();
          setWorkflows(workflowsData);
        } catch (error) {
          console.error("Error fetching workflows:", error);
          showAlert("Failed to load workflows.", "danger");
        }
      };

      fetchWorkflows();
    }
  }, [isModalOpen]);

  useEffect(() => {
    if (selectedWorkflow) {
      const fetchOutputVariables = async () => {
        try {
          const variables = await getWorkflowOutputVariables(selectedWorkflow.id);
          setOutputVariables(variables);
        } catch (error) {
          console.error("Error fetching output variables:", error);
          showAlert("Failed to load output variables.", "danger");
        }
      };

      fetchOutputVariables();
    }
  }, [selectedWorkflow]);

  const handleRunEval = async () => {
    if (!selectedWorkflow) {
      showAlert("Please select a workflow.", "danger");
      return;
    }
    if (!selectedOutputVariable) {
      showAlert("Please select an output variable.", "danger");
      return;
    }

    try {
      const evalRunResponse = await startEvalRun(
        selectedWorkflow.id,
        title,
        selectedOutputVariable,
        selectedNumSamples
      );
      showAlert(`Eval run started with ID: ${evalRunResponse.run_id}`, "success");
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error starting eval run:", error);
      showAlert("Failed to start eval run.", "danger");
    }
  };

  return (
    <>
      {alert.isVisible && (
        <div className="fixed bottom-4 right-4 z-50">
          <Alert color={alert.color}>
            {alert.message}
          </Alert>
        </div>
      )}
      <Card className="relative w-full">
        <CardBody className="relative min-h-[220px] bg-gradient-to-br from-content1 to-default-100/50 p-6">
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-default-500 text-sm mb-3">{description}</p>
          <p className="text-default-500 text-sm mb-1"><strong>Type:</strong> {type}</p>
          <p className="text-default-500 text-sm mb-1"><strong>Num Samples:</strong> {numSamples}</p>
          {paperLink && (
            <a href={paperLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm">
              Original Paper
            </a>
          )}
        </CardBody>
        <CardHeader className="border-t-1 border-default-100 justify-end py-2 px-4">
          <Button
            color="primary"
            variant="flat"
            onPress={() => setIsModalOpen(true)}
            startContent={<Icon icon="solar:play-linear" width={16} />}
          >
            Run Eval
          </Button>
        </CardHeader>
      </Card>

      <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Eval Configuration</ModalHeader>
              <ModalBody>
                <h3 className="text-sm font-semibold mb-2">Select a Workflow</h3>
                <Dropdown>
                  <DropdownTrigger>
                    <Button variant="flat" color="primary">
                      {selectedWorkflow ? selectedWorkflow.name : "Select a Workflow"}
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu
                    aria-label="Workflows"
                    onAction={(key) => {
                      const workflow = workflows.find((wf) => wf.id === key.toString());
                      if (workflow) {
                        setSelectedWorkflow(workflow);
                        setSelectedOutputVariable(null);
                      }
                    }}
                  >
                    {workflows.map((workflow) => (
                      <DropdownItem key={workflow.id}>{workflow.name}</DropdownItem>
                    ))}
                  </DropdownMenu>
                </Dropdown>

                {selectedWorkflow && (
                  <>
                    <h3 className="text-sm font-semibold mt-4 mb-2">Select an Output Variable</h3>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button variant="flat" color="primary">
                          {selectedOutputVariable || "Select an Output Variable"}
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu
                        aria-label="Output Variables"
                        onAction={(key) => setSelectedOutputVariable(key.toString())}
                      >
                        {Object.entries(
                          outputVariables.reduce<Record<string, { variable_name: string; prefixed_variable: string }[]>>((acc, variable) => {
                            const { node_id, variable_name, prefixed_variable } = variable;
                            if (!acc[node_id]) acc[node_id] = [];
                            acc[node_id].push({ variable_name, prefixed_variable });
                            return acc;
                          }, {})
                        ).map(([nodeId, variables]) => (
                          <DropdownSection key={nodeId} title={`Node: ${nodeId}`}>
                            {variables.map(({ variable_name, prefixed_variable }) => (
                              <DropdownItem key={prefixed_variable}>
                                {variable_name}
                              </DropdownItem>
                            ))}
                          </DropdownSection>
                        ))}
                      </DropdownMenu>
                    </Dropdown>
                  </>
                )}

                <h3 className="text-sm font-semibold mt-4 mb-2">Select Number of Samples</h3>
                <Slider
                  label="Number of Samples"
                  step={1}
                  maxValue={numSamples}
                  minValue={1}
                  defaultValue={1}
                  value={selectedNumSamples}
                  onChange={(value) => setSelectedNumSamples(Number(value))}
                  className="max-w-md"
                />
              </ModalBody>
              <ModalFooter>
                <Button color="danger" variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleRunEval}>
                  Run Eval
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}