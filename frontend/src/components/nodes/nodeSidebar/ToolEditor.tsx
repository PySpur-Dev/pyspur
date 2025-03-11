import React, { useEffect, useState } from 'react'
import {
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
} from '@heroui/react'
import CodeEditor from '../../CodeEditor'

export interface ToolEditorModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (filename: string, content: string) => Promise<void>
    initialFilename?: string
    initialContent?: string
}

export const defaultToolTemplate = `from pyspur.tools.registry import ToolRegistry

@ToolRegistry.register(description="Description of what this tool does")
def my_tool(input_text: str) -> str:
    """
    Detailed description of the tool's functionality.
    
    Args:
        input_text: Description of the input parameter
        
    Returns:
        Description of what the tool returns
    """
    # Add your tool implementation here
    return input_text.upper()  # Example implementation
`

const ToolEditor: React.FC<ToolEditorModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialFilename = '',
    initialContent = '',
}) => {
    const [filename, setFilename] = useState(initialFilename)
    const [content, setContent] = useState(initialContent)
    const [isLoading, setIsLoading] = useState(false)

    useEffect(() => {
        setFilename(initialFilename)
        setContent(initialContent)
    }, [initialFilename, initialContent])

    const handleSave = async () => {
        try {
            setIsLoading(true)
            await onSave(filename, content)
            onClose()
        } catch (error) {
            console.error('Error saving tool:', error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="4xl">
            <ModalContent>
                <ModalHeader>
                    <div className="flex flex-col gap-1 w-[50%]">
                        <h2 className="text-lg font-semibold">Tool Editor</h2>
                        <Input
                            label="Tool Name"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            placeholder="Enter tool name (without .py extension)"
                        />
                    </div>
                </ModalHeader>
                <ModalBody>
                    <div className="h-[20vh]">
                        <CodeEditor
                            code={content}
                            onChange={setContent}
                            mode="python"
                            readOnly={false}
                        />
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="light" onPress={onClose}>
                        Cancel
                    </Button>
                    <Button color="primary" onPress={handleSave} isLoading={isLoading}>
                        Save Tool
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default ToolEditor 