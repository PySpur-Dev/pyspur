import React from 'react'
import {
    Card,
    CardHeader,
    CardBody,
    CardFooter,
    Button,
    Chip,
    Dropdown,
    DropdownTrigger,
    DropdownMenu,
    DropdownItem,
} from '@heroui/react'
import { Icon } from '@iconify/react'
import { LibraryItem } from '@/utils/api'

interface LibraryItemCardProps {
    item: LibraryItem
    onEdit: (item: LibraryItem) => void
    onDelete: (id: string) => void
    onDuplicate: (item: LibraryItem) => void
    onDragStart?: (event: React.DragEvent, item: LibraryItem) => void
}

const LibraryItemCard: React.FC<LibraryItemCardProps> = ({
    item,
    onEdit,
    onDelete,
    onDuplicate,
    onDragStart,
}) => {
    return (
        <Card
            className="hover:shadow-md transition-shadow"
            isPressable
            onPress={() => onEdit(item)}
            draggable={!!onDragStart}
            onDragStart={(e) => onDragStart?.(e, item)}
        >
            <CardHeader className="flex justify-between items-start">
                <div>
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <p className="text-small text-default-500">{item.description}</p>
                </div>
                <Dropdown>
                    <DropdownTrigger>
                        <Button isIconOnly variant="light" size="sm">
                            <Icon icon="lucide:more-vertical" />
                        </Button>
                    </DropdownTrigger>
                    <DropdownMenu>
                        <DropdownItem
                            startContent={<Icon icon="lucide:edit" />}
                            onPress={() => onEdit(item)}
                        >
                            Edit
                        </DropdownItem>
                        <DropdownItem
                            startContent={<Icon icon="lucide:copy" />}
                            onPress={() => onDuplicate(item)}
                        >
                            Duplicate
                        </DropdownItem>
                        <DropdownItem
                            className="text-danger"
                            color="danger"
                            startContent={<Icon icon="lucide:trash" />}
                            onPress={() => onDelete(item.id)}
                        >
                            Delete
                        </DropdownItem>
                    </DropdownMenu>
                </Dropdown>
            </CardHeader>
            <CardBody>
                <div className="text-small">
                    <p className="font-semibold">Type:</p>
                    <Chip size="sm" variant="flat" color={item.type === 'prompt' ? 'primary' : 'secondary'}>
                        {item.type}
                    </Chip>
                </div>
                {item.tags.length > 0 && (
                    <div className="mt-2">
                        <p className="text-small font-semibold">Tags:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                            {item.tags.map((tag) => (
                                <Chip key={tag.id} size="sm" variant="flat">
                                    {tag.name}
                                </Chip>
                            ))}
                        </div>
                    </div>
                )}
            </CardBody>
            <CardFooter className="text-small text-default-400">
                Last updated: {new Date(item.updated_at).toLocaleDateString()}
            </CardFooter>
        </Card>
    )
}

export default LibraryItemCard