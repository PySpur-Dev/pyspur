import React, { useEffect, useState } from 'react'
import {
    Alert,
    Button,
    Card,
    CardBody,
    CardFooter,
    CardHeader,
    Chip,
    Dropdown,
    DropdownItem,
    DropdownMenu,
    DropdownTrigger,
    Input,
    Modal,
    ModalBody,
    ModalContent,
    ModalFooter,
    ModalHeader,
    Select,
    SelectItem,
    Spinner,
    Tab,
    Tabs,
    useDisclosure,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import {
    LibraryItem,
    LibraryCollection,
    LibraryTag,
    createLibraryItem,
    updateLibraryItem,
    deleteLibraryItem,
    searchLibraryItems,
    createCollection,
    listCollections,
    createTag,
    listTags,
} from '../utils/api'
import { useRouter } from 'next/router'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import LibraryItemCard from './library/LibraryItemCard'
import LibraryItemEditor from './library/LibraryItemEditor'

interface AlertState {
    message: string;
    color: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger';
    isVisible: boolean;
}

const Library: React.FC = () => {
    const router = useRouter()
    const [items, setItems] = useState<LibraryItem[]>([])
    const [collections, setCollections] = useState<LibraryCollection[]>([])
    const [tags, setTags] = useState<LibraryTag[]>([])
    const [selectedType, setSelectedType] = useState<'all' | 'prompt' | 'schema'>('all')
    const [selectedCollection, setSelectedCollection] = useState<string>('')
    const [selectedTags, setSelectedTags] = useState<number[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const { isOpen, onOpen, onClose } = useDisclosure()
    const [selectedItem, setSelectedItem] = useState<LibraryItem | undefined>()
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
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
        fetchLibraryData()
    }, [selectedType, selectedCollection, selectedTags, searchQuery])

    const fetchLibraryData = async () => {
        try {
            setIsLoading(true)
            const [itemsRes, collectionsRes, tagsRes] = await Promise.all([
                searchLibraryItems({
                    type: selectedType === 'all' ? undefined : selectedType,
                    collection_id: selectedCollection || undefined,
                    tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
                    query: searchQuery || undefined,
                }),
                listCollections(),
                listTags(),
            ])
            setItems(itemsRes)
            setCollections(collectionsRes)
            setTags(tagsRes)
        } catch (error) {
            console.error('Error fetching library data:', error)
            showAlert('Failed to load library data', 'danger')
        } finally {
            setIsLoading(false)
        }
    }

    const handleCreateItem = () => {
        setSelectedItem(undefined)
        setModalMode('create')
        onOpen()
    }

    const handleEditItem = (item: LibraryItem) => {
        setSelectedItem(item)
        setModalMode('edit')
        onOpen()
    }

    const handleDeleteItem = async (id: string) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            try {
                await deleteLibraryItem(id)
                showAlert('Item deleted successfully', 'success')
                fetchLibraryData()
            } catch (error) {
                console.error('Error deleting item:', error)
                showAlert('Failed to delete item', 'danger')
            }
        }
    }

    const handleDuplicateItem = async (item: LibraryItem) => {
        try {
            const { id, created_at, updated_at, versions, ...itemData } = item
            const duplicatedItem = {
                ...itemData,
                name: `${itemData.name} (Copy)`,
            }
            await createLibraryItem(duplicatedItem)
            showAlert('Item duplicated successfully', 'success')
            fetchLibraryData()
        } catch (error) {
            console.error('Error duplicating item:', error)
            showAlert('Failed to duplicate item', 'danger')
        }
    }

    const handleSaveItem = async (formData: Partial<LibraryItem>) => {
        try {
            if (modalMode === 'create') {
                await createLibraryItem(formData)
                showAlert('Item created successfully', 'success')
            } else {
                if (!selectedItem) return
                await updateLibraryItem(selectedItem.id, formData)
                showAlert('Item updated successfully', 'success')
            }
            fetchLibraryData()
            onClose()
        } catch (error) {
            console.error('Error saving item:', error)
            showAlert(`Failed to ${modalMode} item`, 'danger')
        }
    }

    const handleDragStart = (event: React.DragEvent, item: LibraryItem) => {
        event.dataTransfer.setData('application/json', JSON.stringify(item))
    }

    const renderSidebar = () => (
        <div className="w-64 h-full border-r border-divider p-4 flex flex-col gap-4">
            <div>
                <h3 className="text-sm font-semibold mb-2">Type</h3>
                <Tabs
                    selectedKey={selectedType}
                    onSelectionChange={(key) => setSelectedType(key as typeof selectedType)}
                >
                    <Tab key="all" title="All" />
                    <Tab key="prompt" title="Prompts" />
                    <Tab key="schema" title="Schemas" />
                </Tabs>
            </div>

            <div>
                <h3 className="text-sm font-semibold mb-2">Collections</h3>
                <Select
                    placeholder="Select collection"
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                >
                    <SelectItem key="" value="">All Collections</SelectItem>
                    {collections.map((collection) => (
                        <SelectItem key={collection.id} value={collection.id}>
                            {collection.name}
                        </SelectItem>
                    ))}
                </Select>
            </div>

            <div>
                <h3 className="text-sm font-semibold mb-2">Tags</h3>
                <div className="flex flex-wrap gap-1">
                    {tags.map((tag) => (
                        <Chip
                            key={tag.id}
                            variant={selectedTags.includes(tag.id) ? 'solid' : 'flat'}
                            onClick={() => {
                                setSelectedTags((prev) =>
                                    prev.includes(tag.id)
                                        ? prev.filter((id) => id !== tag.id)
                                        : [...prev, tag.id]
                                )
                            }}
                        >
                            {tag.name}
                        </Chip>
                    ))}
                </div>
            </div>
        </div>
    )

    const renderContent = () => (
        <div className="flex-1 p-6">
            <div className="flex justify-between items-center mb-6">
                <Input
                    placeholder="Search library..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    startContent={<Icon icon="lucide:search" />}
                    className="w-96"
                />
                <Button
                    color="primary"
                    onPress={handleCreateItem}
                    startContent={<Icon icon="lucide:plus" />}
                >
                    New Item
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Spinner size="lg" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map((item) => (
                        <LibraryItemCard
                            key={item.id}
                            item={item}
                            onEdit={handleEditItem}
                            onDelete={handleDeleteItem}
                            onDuplicate={handleDuplicateItem}
                            onDragStart={handleDragStart}
                        />
                    ))}
                </div>
            )}
        </div>
    )

    return (
        <DndProvider backend={HTML5Backend}>
            {alert.isVisible && (
                <div className="fixed bottom-4 right-4 z-50">
                    <Alert color={alert.color}>{alert.message}</Alert>
                </div>
            )}
            <div className="flex h-[calc(100vh-4rem)]">
                {renderSidebar()}
                {renderContent()}
            </div>

            <LibraryItemEditor
                isOpen={isOpen}
                onClose={onClose}
                onSave={handleSaveItem}
                item={selectedItem}
                collections={collections}
                tags={tags}
                mode={modalMode}
            />
        </DndProvider>
    )
}

export default Library