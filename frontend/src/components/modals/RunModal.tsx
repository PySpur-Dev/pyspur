import { TestInput } from '@/types/api_types/workflowSchemas'
import { uploadTestFiles } from '@/utils/api'
import {
    Alert,
    Button,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
    Tooltip,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSaveWorkflow } from '../../hooks/useSaveWorkflow'
import { addTestInput, deleteTestInput, setSelectedTestInputId, updateTestInput } from '../../store/flowSlice'
import { getNodeMissingRequiredFields } from '../../store/nodeTypesSlice'
import { AppDispatch, RootState } from '../../store/store'
import FileUploadBox from '../FileUploadBox'
import TextEditor from '../textEditor/TextEditor'

interface RunModalProps {
    isOpen: boolean
    onOpenChange: (isOpen: boolean) => void
    onRun: (initialInputs: Record<string, any>, files?: Record<string, string[]>) => void
    onSave?: () => void
}

interface EditingCell {
    rowId: number
    field: string
}

const RunModal: React.FC<RunModalProps> = ({ isOpen, onOpenChange, onRun, onSave }) => {
    const nodes = useSelector((state: RootState) => state.flow.nodes)
    const nodeConfigs = useSelector((state: RootState) => state.flow.nodeConfigs)
    const nodeTypesMetadata = useSelector((state: RootState) => state.nodeTypes).metadata
    const workflowID = useSelector((state: RootState) => state.flow.workflowID)
    const selectedTestInputId = useSelector((state: RootState) => state.flow.selectedTestInputId)
    const inputNode = nodes.find((node) => node.type === 'InputNode')
    const workflowInputVariables = inputNode ? nodeConfigs[inputNode.id]?.output_schema || {} : {}
    const workflowInputVariableNames = Object.keys(workflowInputVariables)
    const [alert, setAlert] = useState<{
        message: string
        color: 'danger' | 'success' | 'warning' | 'default'
        isVisible: boolean
    }>({
        message: '',
        color: 'default',
        isVisible: false,
    })

    const [testData, setTestData] = useState<TestInput[]>([])
    const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
    const [editorContents, setEditorContents] = useState<Record<string, string>>({})
    const [uploadedFiles, setUploadedFiles] = useState<Record<string, File[]>>({})
    const [filePaths, setFilePaths] = useState<Record<string, string[]>>({})
    const [fileInputModes, setFileInputModes] = useState<Record<string, 'file' | 'url'>>({})

    const dispatch = useDispatch<AppDispatch>()
    const testInputs = useSelector((state: RootState) => state.flow.testInputs)
    const saveWorkflow = useSaveWorkflow()

    useEffect(() => {
        setTestData(testInputs)
    }, [testInputs])

    useEffect(() => {
        if (isOpen && testData.length > 0 && !selectedTestInputId) {
            const newSelectedRow = testData[0].id.toString()
            dispatch(setSelectedTestInputId(newSelectedRow))
        }
    }, [isOpen, testData, selectedTestInputId, dispatch])

    const getNextId = () => {
        const maxId = testData.reduce((max, row) => Math.max(max, row.id), 0)
        return maxId + 1
    }

    const handleAddRow = () => {
        // Check if we have any content to add
        const hasContent = Object.values(editorContents).some((v) => v?.trim())
        if (!hasContent) return

        const newId = getNextId()
        const newTestInput: TestInput = {
            id: newId,
            ...editorContents,
        }
        setTestData([...testData, newTestInput])
        setEditorContents({}) // Clear editor contents
        dispatch(addTestInput(newTestInput))
        saveWorkflow()
    }

    const handleDeleteRow = (id: number) => {
        setTestData(testData.filter((row) => row.id !== id))
        if (selectedTestInputId === id.toString()) {
            dispatch(setSelectedTestInputId(null))
        }
        dispatch(deleteTestInput({ id }))
        saveWorkflow()
    }

    const handleDoubleClick = (rowId: number, field: string) => {
        setEditingCell({ rowId, field })
    }

    const handleCellEdit = (rowId: number, field: string, value: string) => {
        setTestData(testData.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)))
        const rowToUpdate = testData.find((row) => row.id === rowId)
        if (rowToUpdate) {
            dispatch(updateTestInput({ ...rowToUpdate, [field]: value }))
        }
        saveWorkflow()
    }

    const handleBlur = () => {
        setEditingCell(null)
    }

    const handleFilesChange = async (nodeId: string, files: File[]) => {
        if (!workflowID) return

        setUploadedFiles((prev) => ({ ...prev, [nodeId]: files }))

        try {
            if (files.length === 0) {
                // If no files, clear the file path from editor contents
                const fileFields = workflowInputVariableNames.filter((field) => field.toLowerCase().includes('file'))
                if (fileFields.length > 0) {
                    const field = fileFields[0]
                    setEditorContents((prev) => ({
                        ...prev,
                        [field]: '',
                    }))
                }
                return
            }

            const paths = await uploadTestFiles(workflowID, nodeId, files)
            setFilePaths((prev) => ({ ...prev, ...paths }))

            // Update the editor contents with the file path
            const fileFields = workflowInputVariableNames.filter((field) => field.toLowerCase().includes('file'))
            if (fileFields.length > 0) {
                const field = fileFields[0]
                setEditorContents((prev) => ({
                    ...prev,
                    [field]: paths[nodeId][0], // Set the first file field to the first uploaded file path
                }))
            }
        } catch (error) {
            console.error('Error handling files:', error)
        }
    }

    const handleUrlInput = (field: string, value: string) => {
        // Basic URL validation
        const isValidUrl = value === '' || /^(https?:\/\/|gs:\/\/)/.test(value)
        if (isValidUrl) {
            setEditorContents((prev) => ({
                ...prev,
                [field]: value,
            }))
        }
    }

    const renderCell = (row: TestInput, field: string) => {
        const isEditing = editingCell?.rowId === row.id && editingCell?.field === field
        const content = row[field]

        // Handle file paths
        if (field.toLowerCase().includes('file') && content) {
            const fileName = content.split('/').pop() // Get just the filename from the path
            return (
                <div className="flex items-center gap-2">
                    <Icon icon="material-symbols:file-present" className="text-primary" />
                    <Tooltip content={content} showArrow={true}>
                        <span className="truncate">{fileName}</span>
                    </Tooltip>
                </div>
            )
        }

        if (isEditing) {
            return (
                <div onClick={(e) => e.stopPropagation()}>
                    <Input
                        autoFocus
                        size="sm"
                        defaultValue={content}
                        onBlur={(e) => {
                            handleCellEdit(row.id, field, e.target.value)
                            handleBlur()
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleCellEdit(row.id, field, e.currentTarget.value)
                                handleBlur()
                            }
                        }}
                        endContent={
                            <Button isIconOnly size="sm" variant="light" color="success" onPress={handleBlur}>
                                <Icon icon="material-symbols:check" />
                            </Button>
                        }
                    />
                </div>
            )
        }

        return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Tooltip content={content} showArrow={true}>
                    <span className="truncate">{content}</span>
                </Tooltip>
                <Button isIconOnly size="sm" variant="light" onPress={() => handleDoubleClick(row.id, field)}>
                    <Icon icon="solar:pen-linear" />
                </Button>
            </div>
        )
    }

    const showAlert = (message: string, color: 'danger' | 'success' | 'warning' | 'default') => {
        setAlert({ message, color, isVisible: true })
        setTimeout(() => setAlert((prev) => ({ ...prev, isVisible: false })), 3000)
    }

    const handleRun = (): boolean => {
        if (!inputNode) return false

        // Check each node for missing required fields
        for (const n of nodes) {
            const cfg = nodeConfigs[n.id] || {}
            const missingFields = getNodeMissingRequiredFields(n.type, cfg, nodeTypesMetadata)
            if (missingFields.length > 0) {
                showAlert(
                    `Cannot run. Node "${cfg.title || n.id}" is missing required field(s): ${missingFields.join(', ')}.`,
                    'danger'
                )
                return false
            }
        }

        let testCaseToRun: TestInput | undefined

        // If there are unsaved changes, save them first
        const hasUnsavedChanges = Object.values(editorContents).some((v) => v?.trim())
        if (hasUnsavedChanges) {
            const newId = getNextId()
            const newTestInput: TestInput = {
                id: newId,
                ...editorContents,
            }
            setTestData([...testData, newTestInput])
            dispatch(addTestInput(newTestInput))
            dispatch(setSelectedTestInputId(newId.toString()))
            setEditorContents({})
            testCaseToRun = newTestInput
        } else {
            testCaseToRun = testData.find((row) => row.id.toString() === selectedTestInputId)
        }

        if (!testCaseToRun) return false

        const { id, ...inputValues } = testCaseToRun

        const initialInputs = {
            [inputNode.id]: inputValues,
        }

        onRun(initialInputs, filePaths)
        return true
    }

    const handleSaveTestCase = () => {
        const hasContent = Object.values(editorContents).some((v) => v?.trim())
        if (!hasContent) return

        const newId = getNextId()
        const newTestInput: TestInput = {
            id: newId,
            ...editorContents,
        }
        setTestData([...testData, newTestInput])
        dispatch(addTestInput(newTestInput))
        dispatch(setSelectedTestInputId(newId.toString()))
        setEditorContents({}) // Clear editor contents
        saveWorkflow()
    }

    const handleSave = () => {
        if (typeof onSave === 'function') {
            onSave()
        }
        onOpenChange(false)
    }

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            scrollBehavior="inside"
            size="full"
            classNames={{
                base: 'overflow-hidden',
                body: 'p-0',
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        {alert.isVisible && (
                            <div className="fixed bottom-4 right-4 z-50">
                                <Alert color={alert.color}>{alert.message}</Alert>
                            </div>
                        )}
                        <ModalHeader className="flex flex-col gap-1">Run Test Cases</ModalHeader>
                        <ModalBody>
                            <div className="flex flex-col gap-4 p-4 overflow-y-auto w-full">
                                <div className="border rounded-lg w-full">
                                    <div className="p-4 border-b bg-default-50">
                                        <h3 className="text-lg font-semibold">Test Cases</h3>
                                    </div>
                                    <div className="p-4 overflow-x-auto w-full">
                                        <Table
                                            aria-label="Test cases table"
                                            selectionMode="single"
                                            disabledKeys={
                                                editingCell ? new Set([editingCell.rowId.toString()]) : new Set()
                                            }
                                            selectedKeys={selectedTestInputId ? [selectedTestInputId] : new Set()}
                                            onSelectionChange={(selection) => {
                                                const selectedKey = Array.from(selection)[0]?.toString() || null
                                                dispatch(setSelectedTestInputId(selectedKey))
                                            }}
                                            classNames={{
                                                base: 'w-full',
                                                table: 'table-fixed w-full',
                                                thead: 'w-full',
                                                tbody: 'w-full',
                                            }}
                                        >
                                            <TableHeader>
                                                {[
                                                    <TableColumn key="id" width={60}>
                                                        ID
                                                    </TableColumn>,
                                                    ...workflowInputVariableNames.map((field) => (
                                                        <TableColumn key={field} className="flex-1">
                                                            {field}
                                                        </TableColumn>
                                                    )),
                                                    <TableColumn key="actions" width={80}>
                                                        Actions
                                                    </TableColumn>,
                                                ]}
                                            </TableHeader>
                                            <TableBody>
                                                {testData.map((row) => (
                                                    <TableRow key={row.id}>
                                                        {[
                                                            <TableCell key="id">{row.id}</TableCell>,
                                                            ...workflowInputVariableNames.map((field) => (
                                                                <TableCell key={field} className="break-words">
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
                                                            </TableCell>,
                                                        ]}
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>

                                <div className="border rounded-lg">
                                    <div className="p-4 border-b bg-default-50">
                                        <h3 className="text-lg font-semibold">New Test Case</h3>
                                    </div>
                                    <div className="p-4 flex-col">
                                        <div className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-4">
                                            {workflowInputVariableNames.map((field) => (
                                                <div key={field} className="flex flex-col gap-2">
                                                    <div className="font-medium text-foreground">{field}</div>
                                                    {field.toLowerCase().includes('file') ? (
                                                        <div className="space-y-2 bg-default-50 p-3 rounded-lg">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <Switch
                                                                    size="sm"
                                                                    isSelected={fileInputModes[field] === 'url'}
                                                                    onChange={() => {
                                                                        setFileInputModes((prev) => ({
                                                                            ...prev,
                                                                            [field]:
                                                                                prev[field] === 'file' ? 'url' : 'file',
                                                                        }))
                                                                        setEditorContents((prev) => ({
                                                                            ...prev,
                                                                            [field]: '',
                                                                        }))
                                                                        if (fileInputModes[field] === 'file') {
                                                                            handleFilesChange(inputNode.id, [])
                                                                        }
                                                                    }}
                                                                >
                                                                    URL Input
                                                                </Switch>
                                                            </div>
                                                            {(fileInputModes[field] || 'file') === 'url' ? (
                                                                <Input
                                                                    type="url"
                                                                    placeholder="Enter URL (https:// or gs://)"
                                                                    value={editorContents[field] || ''}
                                                                    onChange={(e) =>
                                                                        handleUrlInput(field, e.target.value)
                                                                    }
                                                                    description="Supports HTTP(S) and Google Storage URLs"
                                                                />
                                                            ) : (
                                                                <FileUploadBox
                                                                    multiple={false}
                                                                    onFilesChange={(files) =>
                                                                        handleFilesChange(inputNode.id, files)
                                                                    }
                                                                    acceptedFileTypes={{
                                                                        // Documents
                                                                        'application/pdf': ['.pdf'],
                                                                        'text/plain': ['.txt'],
                                                                        'text/markdown': ['.md'],
                                                                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                                                                            ['.docx'],
                                                                        // Images
                                                                        'image/*': [
                                                                            '.png',
                                                                            '.jpg',
                                                                            '.jpeg',
                                                                            '.gif',
                                                                            '.webp',
                                                                        ],
                                                                        // Audio
                                                                        'audio/*': ['.mp3', '.wav', '.ogg', '.m4a'],
                                                                        // Video
                                                                        'video/*': ['.mp4', '.webm', '.avi', '.mov'],
                                                                    }}
                                                                    supportedFormatsMessage="Supported formats: Documents (PDF, TXT, MD, DOC, DOCX), Images (PNG, JPG, JPEG, GIF, WEBP), Audio (MP3, WAV, OGG, M4A), and Video files (MP4, WEBM, AVI, MOV)"
                                                                />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-default-50 p-3 rounded-lg h-full">
                                                            <TextEditor
                                                                nodeID={`newRow-${field}`}
                                                                fieldName={field}
                                                                fieldTitle={field}
                                                                inputSchema={[]}
                                                                content={editorContents[field] || ''}
                                                                setContent={(value: string) => {
                                                                    setEditorContents((prev) => ({
                                                                        ...prev,
                                                                        [field]: value,
                                                                    }))
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-4">
                                            <Button
                                                color="primary"
                                                variant="bordered"
                                                onPress={handleSaveTestCase}
                                                isDisabled={Object.values(editorContents).every((v) => !v?.trim())}
                                                startContent={<Icon icon="material-symbols:save-outline" />}
                                            >
                                                Save Test Case
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </ModalBody>
                        <ModalFooter>
                            <div className="flex gap-2 justify-end w-full">
                                <Button color="danger" variant="light" onPress={onClose}>
                                    Cancel
                                </Button>
                                <Button color="primary" variant="bordered" onPress={handleSave}>
                                    Save & Close
                                </Button>
                                <Button
                                    color="primary"
                                    onPress={() => {
                                        const success = handleRun()
                                        if (success) {
                                            onClose()
                                        }
                                    }}
                                    isDisabled={
                                        !selectedTestInputId && !Object.values(editorContents).some((v) => v?.trim())
                                    }
                                    startContent={<Icon icon="material-symbols:play-arrow" />}
                                >
                                    Run
                                </Button>
                            </div>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    )
}

export default RunModal
