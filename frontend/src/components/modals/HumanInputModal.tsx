import React, { useState } from 'react'
import {
    Button,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Input,
    Textarea,
    Select,
    SelectItem,
    Chip,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { PausedWorkflowResponse } from '@/utils/api'
import { formatDistanceToNow } from 'date-fns'

interface HumanInputModalProps {
    isOpen: boolean
    onClose: () => void
    workflow: PausedWorkflowResponse
    onSubmit: (action: 'APPROVE' | 'DECLINE' | 'OVERRIDE', inputData: Record<string, any>, comments: string) => void
}

const HumanInputModal: React.FC<HumanInputModalProps> = ({ isOpen, onClose, workflow, onSubmit }) => {
    const [action, setAction] = useState<'APPROVE' | 'DECLINE' | 'OVERRIDE'>('APPROVE')
    const [inputData, setInputData] = useState<Record<string, any>>({})
    const [comments, setComments] = useState('')

    // Initialize input data with existing input fields if available
    React.useEffect(() => {
        // Try to extract any existing input data from the paused workflow
        if (workflow?.current_pause?.input_data) {
            const existingData = workflow.current_pause.input_data;
            setInputData(existingData);
        }
    }, [workflow]);

    const handleSubmit = () => {
        // Here's the key change - we need to structure the data correctly for downstream nodes
        // Instead of just passing inputData, we structure it to match the expected format
        // so that HumanInterventionNode_1.input_1 can be accessed in templates
        onSubmit(action, inputData, comments)
        onClose()
    }

    const getInputSchema = () => {
        const node = workflow.workflow.nodes.find(n => n.id === workflow.current_pause.node_id)
        return node?.config?.input_schema || {}
    }

    const renderInputField = (key: string, type: string) => {
        const value = inputData[key] || ''
        const handleChange = (newValue: any) => {
            setInputData(prev => ({ ...prev, [key]: newValue }))
        }

        switch (type.toLowerCase()) {
            case 'string':
                return (
                    <Input
                        key={key}
                        label={key}
                        placeholder={`Enter ${key}`}
                        value={value}
                        onChange={e => handleChange(e.target.value)}
                    />
                )
            case 'number':
                return (
                    <Input
                        key={key}
                        type="number"
                        label={key}
                        placeholder={`Enter ${key}`}
                        value={value}
                        onChange={e => handleChange(Number(e.target.value))}
                    />
                )
            case 'boolean':
                return (
                    <Select
                        key={key}
                        label={key}
                        placeholder={`Select ${key}`}
                        value={value}
                        onChange={e => handleChange(e.target.value === 'true')}
                    >
                        <SelectItem key="true" value="true">True</SelectItem>
                        <SelectItem key="false" value="false">False</SelectItem>
                    </Select>
                )
            default:
                return (
                    <Input
                        key={key}
                        label={key}
                        placeholder={`Enter ${key}`}
                        value={value}
                        onChange={e => handleChange(e.target.value)}
                    />
                )
        }
    }

    return (
        <Modal size="3xl" isOpen={isOpen} onClose={onClose}>
            <ModalContent>
                <ModalHeader className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold">Human Input Required</h3>
                    <div className="flex items-center gap-2 text-sm text-default-500">
                        <Chip size="sm" color="warning">Paused</Chip>
                        <span>•</span>
                        <span>Workflow: {workflow.workflow.name}</span>
                        <span>•</span>
                        <span>Run ID: {workflow.run.id}</span>
                    </div>
                </ModalHeader>
                <ModalBody>
                    <div className="space-y-4">
                        {/* Pause Message */}
                        <div className="bg-default-100 p-4 rounded-lg">
                            <div className="flex items-start gap-3">
                                <Icon icon="lucide:alert-circle" className="w-5 h-5 text-warning mt-0.5" />
                                <div>
                                    <h4 className="font-medium">Message</h4>
                                    <p className="text-sm text-default-600">{workflow.current_pause.pause_message}</p>
                                    <p className="text-xs text-default-400 mt-1">
                                        Paused {formatDistanceToNow(new Date(workflow.current_pause.pause_time))} ago
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Action Selection */}
                        <div>
                            <h4 className="font-medium mb-2">Action</h4>
                            <div className="flex gap-2">
                                <Button
                                    color={action === 'APPROVE' ? 'success' : 'default'}
                                    variant={action === 'APPROVE' ? 'solid' : 'bordered'}
                                    onPress={() => setAction('APPROVE')}
                                >
                                    Approve
                                </Button>
                                <Button
                                    color={action === 'DECLINE' ? 'danger' : 'default'}
                                    variant={action === 'DECLINE' ? 'solid' : 'bordered'}
                                    onPress={() => setAction('DECLINE')}
                                >
                                    Decline
                                </Button>
                                <Button
                                    color={action === 'OVERRIDE' ? 'warning' : 'default'}
                                    variant={action === 'OVERRIDE' ? 'solid' : 'bordered'}
                                    onPress={() => setAction('OVERRIDE')}
                                >
                                    Override
                                </Button>
                            </div>
                        </div>

                        {/* Input Fields */}
                        {action !== 'DECLINE' && (
                            <div>
                                <h4 className="font-medium mb-2">Required Inputs</h4>
                                <div className="space-y-3">
                                    {Object.entries(getInputSchema()).map(([key, type]) => renderInputField(key, type))}
                                </div>
                            </div>
                        )}

                        {/* Comments */}
                        <div>
                            <h4 className="font-medium mb-2">Comments</h4>
                            <Textarea
                                placeholder="Add any comments about your decision..."
                                value={comments}
                                onChange={e => setComments(e.target.value)}
                            />
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="bordered" onPress={onClose}>Cancel</Button>
                    <Button color="primary" onPress={handleSubmit}>Submit Decision</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default HumanInputModal