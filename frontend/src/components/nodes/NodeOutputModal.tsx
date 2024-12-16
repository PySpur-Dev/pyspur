import React from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from '@nextui-org/react';
import { NodeData, DynamicNodeConfig } from '../../types/nodes/base';
import { WorkflowNode } from '../../types/workflow';
import NodeOutputDisplay from './NodeOutputDisplay';

interface NodeOutputModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  node: WorkflowNode | undefined;
  nodeData?: NodeData<DynamicNodeConfig>;
}

const NodeOutputModal: React.FC<NodeOutputModalProps> = ({
  isOpen,
  onOpenChange,
  title,
  node,
  nodeData
}) => {
  const handleOpenChange = () => {
    onOpenChange(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
    >
      <ModalContent>
        <ModalHeader>
          <h3>{title}</h3>
        </ModalHeader>
        <ModalBody>
          <div className='py-5'>
            {nodeData ? (
              <NodeOutputDisplay node={node} data={nodeData} />
            ) : (
              <div>No output available</div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button onPress={handleOpenChange}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default NodeOutputModal;
