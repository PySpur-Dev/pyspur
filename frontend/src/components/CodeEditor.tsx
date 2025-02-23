import React, { useState, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, useDisclosure } from '@heroui/react'
import { Icon } from '@iconify/react'
import { linter, Diagnostic } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Add custom styling for JSON error highlighting
const jsonErrorTheme = EditorView.baseTheme({
    '.cm-json-error': {
        backgroundColor: '#ff000020',
        borderBottom: '2px wavy #ff0000',
    },
})

interface CodeEditorProps {
    code: string
    label?: string
    onChange: (value: string) => void
    disabled?: boolean
    mode?: 'json' | 'python' | 'javascript' // Add mode prop to determine which language to use
    readOnly?: boolean
    height?: string
}

const CodeEditor: React.FC<CodeEditorProps> = ({
    code,
    onChange,
    disabled,
    mode = 'javascript',
    label = 'Code Editor',
    readOnly = false,
    height = '200px',
}) => {
    const [value, setValue] = useState<string>('')
    const { isOpen, onOpen, onOpenChange } = useDisclosure()
    const [modalValue, setModalValue] = useState<string>('')

    // Enhanced JSON linter function with better error position detection
    const jsonLinter = linter((view) => {
        if (mode !== 'json') return []

        const doc = view.state.doc.toString()
        try {
            JSON.parse(doc)
            return []
        } catch (e) {
            if (!(e instanceof SyntaxError)) {
                return [
                    {
                        from: 0,
                        to: doc.length,
                        severity: 'error',
                        message: 'Invalid JSON',
                    },
                ]
            }

            const message = e.message
            const match = /at position (\d+)/.exec(message)
            let pos = match ? parseInt(match[1]) : 0

            // Find the actual error position in the document
            const tree = syntaxTree(view.state)
            const node = tree.resolve(pos, 1)
            const start = node.from
            const end = node.to

            // If we can't determine precise position, highlight the current line
            if (start === end) {
                const line = view.state.doc.lineAt(pos)
                return [
                    {
                        from: line.from,
                        to: line.to,
                        severity: 'error',
                        message: message,
                        markClass: 'cm-json-error',
                    },
                ]
            }

            return [
                {
                    from: start,
                    to: end,
                    severity: 'error',
                    message: message,
                    markClass: 'cm-json-error',
                },
            ]
        }
    })

    useEffect(() => {
        if (typeof code === 'string') {
            setValue(code)
            setModalValue(code)
        }
    }, [code])

    const handleEditorChange = (newValue: string) => {
        setValue(newValue)
        setModalValue(newValue)
        onChange(newValue)
    }

    const handleModalEditorChange = (newValue: string) => {
        setModalValue(newValue)
    }

    const getExtensions = () => {
        const extensions = []
        if (mode === 'json') {
            extensions.push(json())
            extensions.push(jsonLinter)
            extensions.push(jsonErrorTheme)
        } else {
            extensions.push(python())
        }
        return extensions
    }

    const handleCancel = (onClose: () => void) => {
        setModalValue(value)
        onClose()
    }

    const handleSave = (onClose: () => void) => {
        setValue(modalValue)
        onChange(modalValue)
        onClose()
    }

    return (
        <div className="code-editor w-full relative">
            <label className="text-sm font-semibold mb-2 block">{label}</label>
            <Button
                isIconOnly
                size="sm"
                className="absolute cursor-pointer top-0 right-0 z-10"
                onPress={onOpen}
                disabled={readOnly}
            >
                <Icon icon="solar:full-screen-linear" className="w-4 h-4" />
            </Button>
            <CodeMirror
                value={value}
                height={height}
                theme={oneDark}
                extensions={getExtensions()}
                onChange={handleEditorChange}
                className={`border ${readOnly ? 'cursor-not-allowed opacity-75' : ''}`}
                editable={!readOnly}
            />
            <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="5xl" scrollBehavior="inside" placement="center">
                <ModalContent>
                    {(onClose) => (
                        <>
                            <ModalHeader className="flex flex-col gap-1">{label}</ModalHeader>
                            <ModalBody>
                                <CodeMirror
                                    value={modalValue}
                                    height="60vh"
                                    theme={oneDark}
                                    extensions={getExtensions()}
                                    onChange={handleModalEditorChange}
                                    className="border"
                                    editable={!readOnly}
                                />
                            </ModalBody>
                            <ModalFooter>
                                <Button color="danger" variant="light" onPress={() => handleCancel(onClose)}>
                                    Cancel
                                </Button>
                                <Button color="primary" onPress={() => handleSave(onClose)}>
                                    Save
                                </Button>
                            </ModalFooter>
                        </>
                    )}
                </ModalContent>
            </Modal>
        </div>
    )
}

export default CodeEditor
