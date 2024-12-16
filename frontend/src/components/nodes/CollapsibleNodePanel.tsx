import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { Button, Accordion, AccordionItem, Input } from '@nextui-org/react';
import { useSelector, useDispatch } from 'react-redux';
import { ReactFlowInstance, useReactFlow } from '@xyflow/react';
import { Selection } from '@react-types/shared';

import { AppDispatch, RootState } from '../../store/store';
import { NodeType, NODE_TYPES } from '../../types/nodes/base';
import { addNodeWithoutConnection } from '../canvas/AddNodePopoverCanvas';

interface NodeTypesByCategory {
  [category: string]: NodeType[];
}

const CollapsibleNodePanel: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const dispatch = useDispatch();
  const nodeTypes = useSelector((state: RootState) => state.nodeTypes.data as NodeTypesByCategory);
  const reactFlowInstance = useReactFlow();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Selection>(new Set<string>());
  const [filteredNodeTypes, setFilteredNodeTypes] = useState<NodeTypesByCategory>({});

  const handleAddNode = (nodeName: string): void => {
    if (reactFlowInstance) {
      const nodeTypeArray = nodeTypes[nodeName];
      if (nodeTypeArray && nodeTypeArray.length > 0) {
        addNodeWithoutConnection(nodeTypes, nodeName, reactFlowInstance, dispatch);
      }
    }
  };

  useEffect(() => {
    setFilteredNodeTypes(Object.keys(nodeTypes).reduce((acc, category) => {
      if (searchTerm.trim().length === 0) {
        return nodeTypes;
      }
      const filteredNodes = nodeTypes[category].filter((node: NodeType) =>
        node.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      if (filteredNodes.length > 0) {
        acc[category] = filteredNodes;
        setSelectedCategory((prev) => {
          const newSet = new Set(prev);
          if (!newSet.has(category)) {
            newSet.add(category);
          }
          return newSet;
        });
      }
      return acc;
    }, {} as NodeTypesByCategory));
  }, [nodeTypes, searchTerm]);

  return (
    <div className={`${!isExpanded ? 'w-auto h-auto' : 'w-64'} shadow-sm rounded-xl border border-solid border-default-200 bg-background transition-width duration-300 transition-height duration-300`}>
      <Button
        isIconOnly
        size="md"
        className="bg-background"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Icon icon={isExpanded ? "solar:minus-square-linear" : "solar:widget-add-linear"} width={"80%"} className="text-default-500" />
      </Button>
      {isExpanded && (
        <>
          <Input
            type="search"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            fullWidth
            className="px-2 rounded"
            startContent={<Icon icon="akar-icons:search" className="text-default-500" />}
          />
          <div className="mt-4 max-h-[calc(100vh-16rem)] overflow-auto" id="node-type-accordion">
            <Accordion selectionMode="multiple" selectedKeys={selectedCategory} onSelectionChange={(keys: Selection) => setSelectedCategory(keys)}>
              {Object.keys(filteredNodeTypes).map((category) => (
                <AccordionItem key={category} title={category}>
                  {filteredNodeTypes[category].map((node: NodeType) => (
                    <div
                      key={node.name}
                      className="flex items-center cursor-pointer p-2 hover:bg-default-100"
                      onClick={() => handleAddNode(node.name)}
                    >
                      <div className="w-16 flex-shrink-0">
                        <div
                          className={`node-acronym-tag float-left text-white px-2 py-1 rounded-full text-xs inline-block`}
                          style={{ backgroundColor: node.visual_tag?.color ?? '#666666' }}
                        >
                          {node.visual_tag?.acronym ?? 'N/A'}
                        </div>
                      </div>
                      <span
                        className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap text-foreground"
                        title={node.config.title}
                      >
                        {node.config.title}
                      </span>
                    </div>
                  ))}
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </>
      )}
    </div>
  );
};

export default CollapsibleNodePanel;
