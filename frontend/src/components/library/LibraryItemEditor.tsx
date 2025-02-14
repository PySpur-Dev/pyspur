import React, { useState, useEffect } from 'react'
import {
    Button,
    Input,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Select,
    SelectItem,
    Chip,
    Tabs,
    Tab,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { LibraryItem, LibraryCollection, LibraryTag } from '@/utils/api'
import TextEditor from '../textEditor/TextEditor'
import SchemaEditor from '../nodes/nodeSidebar/SchemaEditor'
import CodeEditor from '../CodeEditor'
import { motion } from 'framer-motion'

interface LibraryItemEditorProps {
    isOpen: boolean
    onClose: () => void
    onSave: (item: Partial<LibraryItem>) => Promise<void>
    item?: LibraryItem
    collections: LibraryCollection[]
    tags: LibraryTag[]
    mode: 'create' | 'edit'
}

const LibraryItemEditor: React.FC<LibraryItemEditorProps> = ({
    isOpen,
    onClose,
    onSave,
    item,
    collections,
    tags,
    mode,
}) => {
    const [formData, setFormData] = useState<Partial<LibraryItem>>({
        name: '',
        description: '',
        type: 'prompt',
        content: '',
        collection_id: '',
        tag_ids: [],
    })
    const [selectedTab, setSelectedTab] = useState('visual')
    const [jsonSchemaError, setJsonSchemaError] = useState<string>('')

    useEffect(() => {
        if (item) {
            setFormData({
                name: item.name,
                description: item.description,
                type: item.type,
                content: item.content,
                collection_id: item.collection_id,
                tag_ids: item.tag_ids,
            })
        } else {
            setFormData({
                name: '',
                description: '',
                type: 'prompt',
                content: '',
                collection_id: '',
                tag_ids: [],
            })
        }
    }, [item])

    const handleSave = async () => {
        try {
            await onSave(formData)
            onClose()
        } catch (error) {
            console.error('Error saving library item:', error)
        }
    }

    const renderBasicInfo = () => (
        <div className="space-y-4">
            <div className="flex gap-4">
                <Input
                    label="Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter name"
                    className="flex-1"
                />
                <Select
                    label="Type"
                    selectedKeys={[formData.type || 'prompt']}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-32"
                    isDisabled={mode === 'edit'}
                >
                    <SelectItem key="prompt" value="prompt">Prompt</SelectItem>
                    <SelectItem key="schema" value="schema">Schema</SelectItem>
                </Select>
            </div>
            <Input
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
            />
            <Select
                label="Collection"
                value={formData.collection_id}
                onChange={(e) => setFormData({ ...formData, collection_id: e.target.value })}
            >
                <SelectItem value="">No Collection</SelectItem>
                {collections.map((collection) => (
                    <SelectItem key={collection.id} value={collection.id}>
                        {collection.name}
                    </SelectItem>
                ))}
            </Select>
            <div>
                <label className="text-sm font-medium">Tags</label>
                <div className="flex flex-wrap gap-1 mt-1">
                    {tags.map((tag) => (
                        <Chip
                            key={tag.id}
                            variant={formData.tag_ids?.includes(tag.id) ? 'solid' : 'flat'}
                            onClick={() => {
                                setFormData({
                                    ...formData,
                                    tag_ids: formData.tag_ids?.includes(tag.id)
                                        ? formData.tag_ids.filter((id) => id !== tag.id)
                                        : [...(formData.tag_ids || []), tag.id],
                                })
                            }}
                        >
                            {tag.name}
                        </Chip>
                    ))}
                </div>
            </div>
        </div>
    )

    const renderPromptEditor = () => (
        <div className="h-full">
            <TextEditor
                nodeID="library-item"
                fieldName="content"
                content={formData.content || ''}
                setContent={(content) => setFormData({ ...formData, content })}
                fullScreen={true}
            />
        </div>
    )

    const renderSchemaEditor = () => (
        <div className="h-full">
            <Tabs
                selectedKey={selectedTab}
                onSelectionChange={(key) => setSelectedTab(key as string)}
            >
                <Tab key="visual" title="Visual Editor">
                    <SchemaEditor
                        jsonValue={formData.content ? JSON.parse(formData.content) : {}}
                        onChange={(value) => setFormData({ ...formData, content: JSON.stringify(value, null, 2) })}
                        options={[]}
                        nodeId="library-item"
                        availableFields={['string', 'number', 'boolean', 'array', 'object']}
                    />
                </Tab>
                <Tab key="json" title="JSON">
                    <CodeEditor
                        code={formData.content || ''}
                        onChange={(value) => setFormData({ ...formData, content: value })}
                        mode="json"
                    />
                </Tab>
            </Tabs>
        </div>
    )

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="full"
            scrollBehavior="inside"
            classNames={{
                base: "transition-all duration-300",
            }}
        >
            <ModalContent>
                {(onClose) => (
                    <>
                        <ModalHeader className="flex justify-between items-center">
                            <span>{mode === 'create' ? 'Create New Item' : 'Edit Item'}</span>
                        </ModalHeader>
                        <ModalBody>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2 }}
                                className="flex h-[80vh] gap-4"
                            >
                                <div className="w-80 border-r pr-4">
                                    {renderBasicInfo()}
                                </div>
                                <motion.div
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex-1"
                                >
                                    {formData.type === 'prompt' ? renderPromptEditor() : renderSchemaEditor()}
                                </motion.div>
                            </motion.div>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="light" onPress={onClose}>Cancel</Button>
                            <Button
                                color="primary"
                                onPress={handleSave}
                                isDisabled={!formData.name || !formData.type}
                            >
                                Save
                            </Button>
                        </ModalFooter>
                    </>
                )}
            </ModalContent>
        </Modal>
    )
}

export default LibraryItemEditor