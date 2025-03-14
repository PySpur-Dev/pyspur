'use client'

import {
    Alert,
    Button,
    Card,
    CardBody,
    Checkbox,
    CheckboxGroup,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Radio,
    RadioGroup,
    Textarea,
    Tooltip,
    useDisclosure,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { Color } from '@tiptap/extension-color'
import ListItem from '@tiptap/extension-list-item'
import TextStyle from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import { Editor, EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import axios from 'axios'
import { List, ListOrdered } from 'lucide-react'
import React, { forwardRef, useEffect, useImperativeHandle } from 'react'
import { Markdown } from 'tiptap-markdown'
import { generateMessage } from '../../utils/api'
import styles from './TextEditor.module.css'

interface TextEditorProps {
    nodeID: string
    fieldName: string
    content: string
    setContent: (content: string) => void
    isEditable?: boolean
    fullScreen?: boolean
    inputSchema?: string[]
    fieldTitle?: string
    disableFormatting?: boolean
    isTemplateEditor?: boolean
    readOnly?: boolean
    enableAIGeneration?: boolean
    messageType?: 'system' | 'user'
}

interface TextEditorRef {
    insertAtCursor: (text: string) => void
}

const TextEditor = forwardRef<TextEditorRef, TextEditorProps>(
    (
        {
            content: initialContent,
            setContent,
            isEditable = true,
            fullScreen = false,
            inputSchema = [],
            fieldTitle,
            disableFormatting = false,
            isTemplateEditor = false,
            readOnly = false,
            enableAIGeneration = false,
            messageType = 'user',
            nodeID,
            fieldName,
        },
        ref
    ) => {
        const [localContent, setLocalContent] = React.useState(initialContent)
        const [isOpen, setIsOpen] = React.useState(false)
        const [description, setDescription] = React.useState('')
        const [generationType, setGenerationType] = React.useState<'new' | 'enhance'>('new')
        const [isGenerating, setIsGenerating] = React.useState(false)
        const [generationError, setGenerationError] = React.useState('')
        const [hasOpenAIKey, setHasOpenAIKey] = React.useState<boolean>(false)
        const [selectedVariables, setSelectedVariables] = React.useState<string[]>([])
        const [isAIGenerated, setIsAIGenerated] = React.useState(false)

        // Check for OpenAI API key on mount
        useEffect(() => {
            const checkOpenAIKey = async () => {
                try {
                    const response = await axios.get('/api/env-mgmt/OPENAI_API_KEY')
                    setHasOpenAIKey(!!response.data.value)
                } catch (error) {
                    setHasOpenAIKey(false)
                }
            }
            checkOpenAIKey()
        }, [])

        const getEditorExtensions = () => {
            if (disableFormatting) {
                return [
                    StarterKit.configure({
                        heading: false,
                        bold: false,
                        italic: false,
                        bulletList: false,
                        orderedList: false,
                        code: false,
                        codeBlock: false,
                        blockquote: false,
                        strike: false,
                    }),
                    Markdown.configure({
                        html: false,
                        transformPastedText: true,
                        transformCopiedText: true,
                    }),
                ]
            }

            return [
                Color.configure({ types: [TextStyle.name, ListItem.name] }),
                TextStyle.configure(),
                StarterKit.configure({
                    bulletList: { keepMarks: true, keepAttributes: false },
                    orderedList: { keepMarks: true, keepAttributes: false },
                }),
                Underline,
                Markdown.configure({
                    html: false,
                    transformPastedText: true,
                    transformCopiedText: true,
                }),
            ]
        }

        // Select all variables by default when modal opens
        useEffect(() => {
            if (isOpen && inputSchema && inputSchema.length > 0) {
                setSelectedVariables(inputSchema)
            }
        }, [isOpen, inputSchema])

        // Helper function to reset modal state
        const resetModalState = () => {
            setDescription('')
            setGenerationError('')
            setGenerationType('new')
            setSelectedVariables([])
            setIsOpen(false)
        }

        const handleGenerateMessage = async () => {
            if (!description.trim()) {
                setGenerationError('Please enter a description')
                return
            }

            setIsGenerating(true)
            setGenerationError('')

            try {
                const response = await generateMessage({
                    description: description,
                    message_type: messageType,
                    existing_message: generationType === 'enhance' ? localContent : undefined,
                    available_variables: selectedVariables.length > 0 ? selectedVariables : undefined,
                })

                setIsAIGenerated(true)
                setLocalContent(response.message)
                setContent(response.message)
                resetModalState()
            } catch (error: any) {
                setGenerationError(error.response?.data?.detail || 'Failed to generate message')
            } finally {
                setIsGenerating(false)
            }
        }

        const editor = useEditor({
            extensions: getEditorExtensions(),
            content: localContent ? localContent : '',
            editorProps: {
                attributes: {
                    class: [
                        'w-full bg-content2 hover:bg-content3 transition-colors min-h-[120px] max-h-[300px] overflow-y-auto resize-y rounded-medium px-3 py-2 text-foreground outline-none placeholder:text-foreground-500',
                        isEditable && !readOnly ? '' : 'rounded-medium',
                        fullScreen ? styles.fullScreenEditor : styles.truncatedEditor,
                    ]
                        .filter(Boolean)
                        .join(' '),
                },
            },
            parseOptions: {
                preserveWhitespace: 'full',
            },
            onUpdate: ({ editor }) => {
                const newContent = editor.storage.markdown?.getMarkdown() ?? ''
                setLocalContent(newContent)
                setContent(newContent)
            },
            editable: isEditable && !readOnly,
            autofocus: 'end',
            immediatelyRender: false,
        })

        const { isOpen: modalIsOpen, onOpen: modalOnOpen, onOpenChange: modalOnOpenChange } = useDisclosure()

        const modalEditor = useEditor({
            extensions: getEditorExtensions(),
            content: localContent ? localContent : '',
            editorProps: {
                attributes: {
                    class: 'w-full bg-content2 hover:bg-content3 transition-colors min-h-[40vh] resize-y rounded-medium px-3 py-2 text-foreground outline-none placeholder:text-foreground-500',
                },
            },
            onUpdate: ({ editor }) => {
                const newContent = editor.storage.markdown?.getMarkdown() ?? ''
                setLocalContent(newContent)
                setContent(newContent)
            },
            editable: true,
            autofocus: false,
            immediatelyRender: false,
        })

        // Effect to update editor content after AI generation
        useEffect(() => {
            if (isAIGenerated) {
                if (editor) {
                    editor.commands.setContent(localContent)
                }
                if (modalEditor) {
                    modalEditor.commands.setContent(localContent)
                }
                setIsAIGenerated(false)
            }
        }, [localContent, editor, modalEditor, isAIGenerated])

        useImperativeHandle(ref, () => ({
            insertAtCursor: (text: string) => {
                if (editor) {
                    editor.chain().focus().insertContent(text).run()
                }
            },
        }))

        // Update effect to only sync modal editor content when modal opens
        useEffect(() => {
            if (modalIsOpen && modalEditor && editor) {
                const content = editor.storage.markdown?.getMarkdown() ?? ''
                modalEditor.commands.setContent(content)
            }
        }, [modalIsOpen, modalEditor, editor])

        const renderVariableButtons = (editorInstance: Editor | null) => {
            // Only show variable buttons if this is a template editor
            if (!isTemplateEditor) return null

            // Show message when no input schema is available (undefined or empty array)
            if (!inputSchema || !Array.isArray(inputSchema) || inputSchema.length === 0) {
                return (
                    <div className="flex items-center gap-2 mb-2 px-2">
                        <span className="text-foreground-500 text-sm flex items-center gap-1">
                            <Icon icon="solar:info-circle-linear" className="w-4 h-4" />
                            Connect nodes to use variables
                        </span>
                    </div>
                )
            }

            const generateFullSchemaJson = () => {
                const schemaObject = inputSchema.reduce(
                    (acc, variable) => {
                        acc[variable] = `{{${variable}}}`
                        return acc
                    },
                    {} as Record<string, string>
                )
                return JSON.stringify(schemaObject, null, 2)
            }

            return (
                <div className="flex flex-wrap gap-2 mb-2 px-2">
                    {Array.isArray(inputSchema) && inputSchema.length > 0 && (
                        <Button
                            size="sm"
                            variant="flat"
                            color="primary"
                            onPress={() => {
                                if (editorInstance) {
                                    editorInstance.chain().focus().insertContent(generateFullSchemaJson()).run()
                                }
                            }}
                            isIconOnly
                        >
                            <Icon icon="solar:document-add-linear" className="w-4 h-4" />
                        </Button>
                    )}
                    {Array.isArray(inputSchema)
                        ? inputSchema.map((variable) => (
                              <Button
                                  key={variable}
                                  size="sm"
                                  variant="flat"
                                  color="primary"
                                  onPress={() => {
                                      if (editorInstance) {
                                          editorInstance.chain().focus().insertContent(`{{${variable}}}`).run()
                                      }
                                  }}
                              >
                                  {variable}
                              </Button>
                          ))
                        : null}
                </div>
            )
        }

        const renderToolbar = (editorInstance: Editor | null, isFullScreen = false) => {
            if (!editorInstance) return null

            const buttonSize = isFullScreen ? 'sm' : 'md'
            const buttonClassName = isFullScreen ? 'w-4 h-4' : 'w-3 h-3'
            const toolbarClassName = `px-2 py-2 rounded-t-medium flex flex-col gap-2 w-full bg-content2 border-b border-divider`

            return (
                <div className={toolbarClassName}>
                    {!disableFormatting && (
                        <div className="flex justify-between items-center w-full">
                            <div className="flex justify-start items-center gap-1 lg:w-10/12 flex-wrap">
                                <Button
                                    onPress={() => editorInstance.chain().focus().toggleBold().run()}
                                    disabled={!editorInstance.can().chain().focus().toggleBold().run()}
                                    color="primary"
                                    variant={editorInstance.isActive('bold') ? 'solid' : 'flat'}
                                    size={buttonSize}
                                    isIconOnly
                                >
                                    <Icon icon="solar:text-bold-linear" className={buttonClassName} />
                                </Button>
                                <Button
                                    onPress={() => editorInstance.chain().focus().toggleItalic().run()}
                                    disabled={!editorInstance.can().chain().focus().toggleItalic().run()}
                                    color="primary"
                                    variant={editorInstance.isActive('italic') ? 'solid' : 'flat'}
                                    size={buttonSize}
                                    isIconOnly
                                >
                                    <Icon icon="solar:text-italic-linear" className={buttonClassName} />
                                </Button>
                                <Button
                                    onPress={() => editorInstance.chain().focus().toggleUnderline().run()}
                                    disabled={!editorInstance.can().chain().focus().toggleUnderline().run()}
                                    color="primary"
                                    variant={editorInstance.isActive('underline') ? 'solid' : 'flat'}
                                    size={buttonSize}
                                    isIconOnly
                                >
                                    <Icon icon="solar:text-underline-linear" className={buttonClassName} />
                                </Button>
                                <Button
                                    onPress={() => editorInstance.chain().focus().toggleBulletList().run()}
                                    color="primary"
                                    variant={editorInstance.isActive('bulletList') ? 'solid' : 'flat'}
                                    size={buttonSize}
                                    isIconOnly
                                >
                                    <List className={buttonClassName} />
                                </Button>
                                <Button
                                    onPress={() => editorInstance.chain().focus().toggleOrderedList().run()}
                                    color="primary"
                                    variant={editorInstance.isActive('orderedList') ? 'solid' : 'flat'}
                                    size={buttonSize}
                                    isIconOnly
                                >
                                    <ListOrdered className={buttonClassName} />
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                {enableAIGeneration && renderGenerateButton()}
                                {!fullScreen && !isFullScreen && (
                                    <Button onPress={modalOnOpen} isIconOnly size={buttonSize}>
                                        <Icon icon="solar:full-screen-linear" className={buttonClassName} />
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    {renderVariableButtons(editorInstance)}
                </div>
            )
        }

        const handleSave = (onClose: () => void) => {
            if (modalEditor && editor) {
                const content = modalEditor.storage.markdown?.getMarkdown() ?? ''
                editor.commands.setContent(content)
                setLocalContent(content)
                setContent(content)
            }
            onClose()
        }

        const handleCancel = (onClose: () => void) => {
            if (modalEditor && editor) {
                const content = editor.storage.markdown?.getMarkdown() ?? ''
                modalEditor.commands.setContent(content)
            }
            onClose()
        }

        const renderGenerateButton = () => {
            if (readOnly || !enableAIGeneration) return null

            const buttonLabel = `AI Generate ${messageType === 'system' ? 'System Message' : 'Prompt'}`

            const button = (
                <Button
                    size="sm"
                    color="primary"
                    variant="light"
                    startContent={<Icon icon="solar:magic-stick-linear" width={20} />}
                    onClick={() => setIsOpen(true)}
                    isDisabled={!hasOpenAIKey || readOnly}
                >
                    AI Generate
                </Button>
            )

            if (!hasOpenAIKey) {
                return (
                    <Tooltip
                        content="OpenAI API key is required for AI message generation. Please add your API key in the settings."
                        placement="top"
                    >
                        {button}
                    </Tooltip>
                )
            }

            return button
        }

        // Get appropriate placeholder text based on message type
        const getPlaceholderText = () => {
            if (messageType === 'system') {
                return generationType === 'new'
                    ? 'Example: Create a system message for a coding assistant that specializes in debugging JavaScript code'
                    : 'Example: Make the assistant more detailed in its explanations and add instructional guidance'
            } else {
                return generationType === 'new'
                    ? 'Example: Create a prompt that asks for a detailed analysis of quarterly financial data with trend identification'
                    : 'Example: Add a request for the response to include actionable recommendations'
            }
        }

        useEffect(() => {
            setLocalContent(initialContent)
        }, [initialContent])

        return (
            <div className="relative">
                {isEditable && !readOnly && renderToolbar(editor)}
                <div className={styles.tiptap}>
                    <EditorContent editor={editor} />
                </div>

                <Modal
                    isOpen={modalIsOpen}
                    onOpenChange={modalOnOpenChange}
                    size="full"
                    scrollBehavior="inside"
                    placement="center"
                >
                    <ModalContent>
                        {(onClose) => (
                            <>
                                <ModalHeader className="flex flex-col gap-1">Prompt Editor</ModalHeader>
                                <ModalBody>
                                    <div>
                                        {renderToolbar(modalEditor, true)}
                                        <div className={styles.tiptap}>
                                            <EditorContent editor={modalEditor} />
                                        </div>
                                    </div>
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

                <Modal
                    isOpen={isOpen}
                    onClose={resetModalState}
                    size="2xl"
                    isDismissable={!isGenerating}
                    hideCloseButton={isGenerating}
                >
                    <ModalContent>
                        {(onClose) => (
                            <>
                                <ModalHeader className="flex flex-col gap-1">
                                    Generate {messageType === 'system' ? 'System Message' : 'User Prompt'}
                                </ModalHeader>
                                <ModalBody>
                                    {generationError && (
                                        <Alert color="danger" className="mb-2">
                                            <div className="flex items-center gap-2">
                                                <span>{generationError}</span>
                                            </div>
                                        </Alert>
                                    )}
                                    <RadioGroup
                                        value={generationType}
                                        onValueChange={(value) => setGenerationType(value as 'new' | 'enhance')}
                                        className="mb-4"
                                        isDisabled={isGenerating}
                                    >
                                        <Radio value="new">Create New Message</Radio>
                                        <Radio
                                            value="enhance"
                                            isDisabled={!localContent.trim() || isGenerating}
                                            description={
                                                !localContent.trim() ? 'No existing message to enhance' : undefined
                                            }
                                        >
                                            Enhance Existing Message
                                        </Radio>
                                    </RadioGroup>

                                    {generationType === 'enhance' && localContent.trim() && (
                                        <Card className="mb-4">
                                            <CardBody>
                                                <div className="text-sm font-semibold mb-2">Current Message:</div>
                                                <div className="bg-default-100 p-3 rounded-md text-sm whitespace-pre-wrap">
                                                    {localContent}
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}

                                    {inputSchema && inputSchema.length > 0 && (
                                        <Card className="mb-4">
                                            <CardBody>
                                                <div className="text-sm font-semibold mb-2">
                                                    Available Template Variables:
                                                </div>
                                                <div className="mb-2 text-xs text-default-500">
                                                    Select which variables should be included in your generated message:
                                                </div>

                                                <div className="flex justify-between items-center gap-2 mb-2">
                                                    <div className="text-xs text-default-500">
                                                        {selectedVariables.length} of {inputSchema.length} variables
                                                        selected
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="flat"
                                                            onClick={() => setSelectedVariables([...inputSchema])}
                                                            isDisabled={isGenerating}
                                                        >
                                                            Select All
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="flat"
                                                            onClick={() => setSelectedVariables([])}
                                                            isDisabled={isGenerating}
                                                        >
                                                            Deselect All
                                                        </Button>
                                                    </div>
                                                </div>

                                                <CheckboxGroup
                                                    value={selectedVariables}
                                                    onValueChange={setSelectedVariables}
                                                    className="mt-2"
                                                >
                                                    {inputSchema.map((variable) => (
                                                        <Checkbox
                                                            key={variable}
                                                            value={variable}
                                                            isDisabled={isGenerating}
                                                        >
                                                            <code className="text-primary">{`{{ ${variable} }}`}</code>
                                                        </Checkbox>
                                                    ))}
                                                </CheckboxGroup>

                                                <div className="mt-2 text-xs text-default-500">
                                                    These variables will be used in your message template and will be
                                                    replaced with actual values at runtime.
                                                </div>
                                            </CardBody>
                                        </Card>
                                    )}

                                    <Textarea
                                        label={
                                            generationType === 'new'
                                                ? `Describe the ${messageType === 'system' ? 'system message' : 'user prompt'} you want to generate`
                                                : `Describe how you want to enhance the ${messageType === 'system' ? 'system message' : 'user prompt'}`
                                        }
                                        placeholder={getPlaceholderText()}
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="mb-2"
                                        isDisabled={isGenerating}
                                        minRows={5}
                                    />
                                </ModalBody>
                                <ModalFooter>
                                    <Button
                                        size="sm"
                                        variant="light"
                                        onClick={resetModalState}
                                        isDisabled={isGenerating}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        color="primary"
                                        onClick={handleGenerateMessage}
                                        isLoading={isGenerating}
                                        isDisabled={isGenerating}
                                    >
                                        Generate
                                    </Button>
                                </ModalFooter>
                            </>
                        )}
                    </ModalContent>
                </Modal>
            </div>
        )
    }
)

TextEditor.displayName = 'TextEditor'

export default TextEditor
