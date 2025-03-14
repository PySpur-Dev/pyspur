import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react'
import NodeOutputDisplay from './NodeOutputDisplay' // Import NodeOutputDisplay

const NodeOutputModal = ({ isOpen, onOpenChange, title, data }) => {
    const handleOpenChange = () => {
        onOpenChange(false)
    }

    return (
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="full">
            <ModalContent>
                <ModalHeader>
                    <h3>{title}</h3>
                </ModalHeader>
                <ModalBody className="h-[calc(90vh-120px)] overflow-y-auto">
                    <div>
                        {data ? (
                            <NodeOutputDisplay output={data.run} maxHeight="100%" />
                        ) : (
                            <div>No output available</div>
                        )}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button onPress={handleOpenChange}>Close</Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}

export default NodeOutputModal
