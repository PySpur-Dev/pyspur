import React, { useEffect, useState } from 'react'
import {
    Alert,
    Modal,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    Input,
    Select,
    SelectItem,
    Chip,
    Tabs,
    Tab,
} from '@heroui/react'
import { LibraryItem, LibraryCollection, LibraryTag } from '@/utils/api'
import CodeEditor from '@/components/CodeEditor'

interface LibraryItemModalProps {
    isOpen: boolean
    onClose: () => void
    onSave: (item: Partial<LibraryItem>) => Promise<void>
    item?: LibraryItem
    collections: LibraryCollection[]
    tags: LibraryTag[]
    mode: 'create' | 'edit'
}

interface AlertState {
    message: string;
    color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
    isVisible: boolean;
}

const LibraryItemModal: React.FC<LibraryItemModalProps> = ({
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

    const [alert, setAlert] = useState<AlertState>({
        message: '',
        color: 'default',
        isVisible: false,
    })

    const showAlert = (message: string, color: AlertState['color']) => {
        setAlert({ message, color, isVisible: true })
        setTimeout(() => setAlert((prev) => ({ ...prev, isVisible: false })), 3000)
    }

    useEffect(() => {
        if (item && mode === 'edit') {
            setFormData({
                ...item,
                tag_ids: item.tags.map((tag) => tag.id),
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
    }, [item, mode])

    const handleSave = async () => {
        try {
            await onSave(formData)
            onClose()
        } catch (error) {
            console.error('Error saving item:', error)
            showAlert('Failed to save item', 'danger')
        }
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="3xl"
            scrollBehavior="inside"
        >
            <ModalContent>
                {alert.isVisible && (
                    <div className="absolute top-4 right-4 z-50">
                        <Alert color={alert.color}>{alert.message}</Alert>
                    </div>
                )}
                <ModalHeader>{mode === 'create' ? 'Create New Item' : 'Edit Item'}</ModalHeader>
                <ModalBody>
                    <div className="flex flex-col gap-4">
                        <Input
                            label="Name"
                            placeholder="Enter item name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                        <Input
                            label="Description"
                            placeholder="Enter description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                        <Select
                            label="Type"
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as 'prompt' | 'schema' })}
                        >
                            <SelectItem value="prompt">Prompt</SelectItem>
                            <SelectItem value="schema">Schema</SelectItem>
                        </Select>
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
                        <div className="h-80">
                            <CodeEditor
                                code={formData.content as string}
                                onChange={(value) => setFormData({ ...formData, content: value })}
                                mode={formData.type === 'schema' ? 'json' : 'python'}
                                label="Content"
                            />
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button variant="flat" onPress={onClose}>
                        Cancel
                    </Button>
                    <Button color="primary" onPress={handleSave}>
                        {mode === 'create' ? 'Create' : 'Save'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default LibraryItemModal