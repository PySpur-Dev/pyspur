import React, { useState, useEffect } from 'react'
import {
    Button,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Spinner
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { SlackAgent, WorkflowResponse, associateSlackWorkflow, getWorkflows } from '../../utils/api'

interface WorkflowAssociationModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: SlackAgent | null;
    onAssociate: (agentId: number, workflowId: string) => Promise<void>;
    onAlert?: (message: string, color: 'success' | 'danger' | 'warning' | 'default') => void;
}

const WorkflowAssociationModal: React.FC<WorkflowAssociationModalProps> = ({
    isOpen,
    onClose,
    agent,
    onAssociate,
    onAlert
}) => {
    const [workflows, setWorkflows] = useState<WorkflowResponse[]>([])
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [isAssociating, setIsAssociating] = useState(false)

    // Debug log when props change
    useEffect(() => {
        console.log('WorkflowAssociationModal props:', { isOpen, agent })
    }, [isOpen, agent])

    useEffect(() => {
        if (isOpen && agent) {
            console.log('Loading workflows for agent:', agent)
            setIsLoading(true)
            getWorkflows()
                .then(data => {
                    console.log('Fetched workflows:', data)
                    setWorkflows(data)
                    // If the agent already has a workflow, select it
                    if (agent.workflow_id) {
                        setSelectedWorkflowId(agent.workflow_id)
                    } else if (data.length > 0) {
                        // Otherwise select the first workflow
                        setSelectedWorkflowId(data[0].id)
                    }
                })
                .catch(error => {
                    console.error('Error fetching workflows:', error)
                    onAlert?.('Failed to load workflows', 'danger')
                })
                .finally(() => setIsLoading(false))
        }
    }, [isOpen, agent, onAlert])

    const handleAssociate = async () => {
        if (!agent || !selectedWorkflowId) return

        setIsAssociating(true)
        try {
            await onAssociate(agent.id, selectedWorkflowId)
            onClose()
        } catch (error) {
            console.error('Error associating workflow:', error)
            onAlert?.('Failed to associate workflow with agent', 'danger')
        } finally {
            setIsAssociating(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <Icon icon="logos:slack-icon" width={24} />
                        <span>Associate Workflow with Slack Agent</span>
                    </div>
                </ModalHeader>
                <ModalBody>
                    {!agent ? (
                        <div className="text-center p-4">
                            <p>No Slack agent selected.</p>
                        </div>
                    ) : (
                        <>
                            <p className="mb-4">
                                Select a workflow to associate with your Slack agent <strong>{agent.name}</strong>.
                                This workflow will be triggered when messages are received in Slack.
                            </p>

                            {isLoading ? (
                                <div className="flex justify-center p-4">
                                    <Spinner size="lg" />
                                </div>
                            ) : workflows.length === 0 ? (
                                <div className="text-center p-4">
                                    <p>No workflows available. Please create a workflow first.</p>
                                </div>
                            ) : (
                                <Select
                                    label="Select Workflow"
                                    placeholder="Choose a workflow"
                                    selectedKeys={selectedWorkflowId ? [selectedWorkflowId] : []}
                                    onChange={(e) => setSelectedWorkflowId(e.target.value)}
                                >
                                    {workflows.map((workflow) => (
                                        <SelectItem key={workflow.id} value={workflow.id}>
                                            {workflow.name}
                                        </SelectItem>
                                    ))}
                                </Select>
                            )}
                        </>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button variant="flat" onPress={onClose}>
                        Cancel
                    </Button>
                    <Button
                        color="primary"
                        onPress={handleAssociate}
                        isDisabled={!selectedWorkflowId || isAssociating}
                        isLoading={isAssociating}
                    >
                        Associate Workflow
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default WorkflowAssociationModal