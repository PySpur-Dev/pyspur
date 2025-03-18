import { Button, Card, CardBody, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react'
import { Icon } from '@iconify/react'
import { useEffect } from 'react'

interface HelpModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose])

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="2xl">
            <ModalContent>
                <ModalHeader>How can we help you? 🤝</ModalHeader>
                <ModalBody>
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4">Keyboard Shortcuts</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-medium mb-2">Navigation</h4>
                                <ul className="space-y-2 text-sm text-default-600">
                                    <li className="flex items-center justify-between">
                                        <span>Pan Canvas</span>
                                        <kbd className="px-2 py-1 bg-default-100 rounded">Arrow Keys</kbd>
                                    </li>
                                    <li className="flex items-center justify-between">
                                        <span>Pan Canvas Faster</span>
                                        <kbd className="px-2 py-1 bg-default-100 rounded">Shift + Arrow Keys</kbd>
                                    </li>
                                    <li className="flex items-center justify-between">
                                        <span>Add New Nodes</span>
                                        <kbd className="px-2 py-1 bg-default-100 rounded">⌘/Ctrl + K</kbd>
                                    </li>
                                </ul>
                            </div>
                            <div>
                                <h4 className="font-medium mb-2">Actions</h4>
                                <ul className="space-y-2 text-sm text-default-600">
                                    <li className="flex items-center justify-between">
                                        <span>Copy Node</span>
                                        <kbd className="px-2 py-1 bg-default-100 rounded">⌘/Ctrl + C</kbd>
                                    </li>
                                    <li className="flex items-center justify-between">
                                        <span>Paste Node</span>
                                        <kbd className="px-2 py-1 bg-default-100 rounded">⌘/Ctrl + V</kbd>
                                    </li>
                                    <li className="flex items-center justify-between">
                                        <span>Layout Workflow</span>
                                        <kbd className="px-2 py-1 bg-default-100 rounded">⌘/Ctrl + I</kbd>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card
                            className="cursor-pointer hover:scale-[1.02] transition-transform"
                            isPressable
                            onPress={() => window.open('https://calendly.com/d/cnf9-57m-bv3/pyspur-founders', '_blank')}
                        >
                            <CardBody className="flex flex-col items-center gap-4 p-6">
                                <Icon icon="solar:calendar-linear" className="w-12 h-12 text-primary" />
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold mb-2">Talk to the Founders</h3>
                                    <p className="text-sm text-default-500">
                                        Schedule a call with our founders to discuss your needs and get personalized
                                        help
                                    </p>
                                </div>
                            </CardBody>
                        </Card>

                        <Card
                            className="cursor-pointer hover:scale-[1.02] transition-transform"
                            isPressable
                            onPress={() => window.open('https://github.com/pyspur-dev/pyspur', '_blank')}
                        >
                            <CardBody className="flex flex-col items-center gap-4 p-6">
                                <Icon icon="solar:book-linear" className="w-12 h-12 text-primary" />
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold mb-2">Documentation</h3>
                                    <p className="text-sm text-default-500">
                                        Browse our comprehensive documentation to learn more about PySpur&apos;s
                                        features
                                    </p>
                                </div>
                            </CardBody>
                        </Card>
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button
                        size="lg"
                        color="danger"
                        variant="light"
                        onPress={onClose}
                        endContent={<span className="text-xs opacity-70">ESC</span>}
                    >
                        Close
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}
