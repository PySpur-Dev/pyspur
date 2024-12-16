import React, { useCallback } from 'react';
import { Icon } from '@iconify/react';
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownSection, DropdownItem, Selection } from '@nextui-org/react';
import { useSelector, useDispatch } from 'react-redux';
import { addNodeWithoutConnection } from '../AddNodePopoverCanvas';
import { useReactFlow } from '@xyflow/react';
import TipPopup from './TipPopUp';
import { RootState } from '../../../store/store';
import { NodeType, NODE_TYPES } from '../../../types/nodes/base';

interface NodeTypesByCategory {
  [category: string]: NodeType[];
}

const AddNodePopoverFooter: React.FC = () => {
  const dispatch = useDispatch();
  const nodeTypes = useSelector((state: RootState) => {
    console.log('[AddNodePopoverFooter] Redux state:', state);
    console.log('[AddNodePopoverFooter] Node types:', state.nodeTypes.data);
    return state.nodeTypes.data as NodeTypesByCategory;
  });

  const reactFlowInstance = useReactFlow();

  const handleAddNode = useCallback((nodeName: string): void => {
    console.log('[AddNodePopoverFooter] Adding node of type:', nodeName);
    console.log('[AddNodePopoverFooter] Available node types:', nodeTypes);

    if (reactFlowInstance) {
      const nodeType = Object.values(nodeTypes)
        .flat()
        .find(node => node.name === nodeName);

      if (nodeType) {
        addNodeWithoutConnection(nodeTypes, nodeName, reactFlowInstance, dispatch);
      } else {
        console.error('[AddNodePopoverFooter] Failed to create node of type:', nodeName);
      }
    }
  }, [dispatch, nodeTypes, reactFlowInstance]);

  console.log('[AddNodePopoverFooter] Current nodeTypes:', nodeTypes);

  return (
    <TipPopup title='Add Node' shortcuts={['shift', 'a']}>
      <div className="relative">
        <Dropdown>
          <DropdownTrigger>
            <Button
              isIconOnly
              size="sm"
              variant="bordered"
              className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 z-[9999]"
              onPress={() => console.log('[AddNodePopoverFooter] Dropdown trigger clicked')}
            >
              <Icon icon="solar:add-square-linear" width={"80%"} className="text-default-500" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu
            aria-label="Add Node Options"
            className="z-[9999] min-w-[200px] bg-white dark:bg-gray-800 shadow-lg rounded-lg border border-gray-200 dark:border-gray-600"
            itemClasses={{
              base: "py-2 px-4 text-sm",
              title: "font-semibold text-gray-700 dark:text-gray-300"
            }}
            selectionMode="none"
          >
            {Object.keys(nodeTypes).length > 0 ? (
              Object.keys(nodeTypes).map((category) => (
                <DropdownSection key={category} title={category} showDivider>
                  {nodeTypes[category].map((node: NodeType) => {
                    const visualTag = node.visual_tag || { color: '#666', acronym: '?' };
                    console.log('[AddNodePopoverFooter] Rendering node option:', node.name);
                    return (
                      <DropdownItem
                        key={node.name}
                        onClick={() => handleAddNode(node.name)}
                        className="hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <div className='flex items-center'>
                          <div className="w-16">
                            <div
                              className={`node-acronym-tag float-left text-white px-2 py-1 rounded-full text-xs inline-block`}
                              style={{ backgroundColor: visualTag.color }}
                            >
                              {visualTag.acronym}
                            </div>
                          </div>
                          <span>{node.name}</span>
                        </div>
                      </DropdownItem>
                    );
                  })}
                </DropdownSection>
              ))
            ) : (
              <DropdownItem key="no-nodes">No node types available</DropdownItem>
            )}
          </DropdownMenu>
        </Dropdown>
      </div>
    </TipPopup>
  );
};

export default AddNodePopoverFooter;
