import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { markWelcomeSeen } from '../../store/userPreferencesSlice'

interface WelcomeModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
    const dispatch = useDispatch()

    const handleClose = () => {
        dispatch(markWelcomeSeen())
        onClose()
    }

    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
                handleClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen])

    return (
        <Modal isOpen={isOpen} onClose={handleClose}>
            <ModalContent>
                <ModalHeader>Welcome to PySpur! 👋</ModalHeader>
                <ModalBody>
                    <p>PySpur is your platform for building and managing AI workflows.</p>
                    <p>Get started by:</p>
                    <ul className="list-disc pl-6">
                        <li>Creating a new Spur from scratch</li>
                        <li>Using one of our templates</li>
                        <li>Importing an existing workflow</li>
                    </ul>
                </ModalBody>
                <ModalFooter>
                    <Button
                        size="lg"
                        color="primary"
                        onPress={handleClose}
                        endContent={<span className="text-xs opacity-70">↵</span>}
                    >
                        Get Started
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    )
}
