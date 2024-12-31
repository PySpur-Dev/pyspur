import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { Button, Accordion, AccordionItem, Input } from '@nextui-org/react';
import { useSelector, useDispatch } from 'react-redux';
import { ReactFlowInstance, useReactFlow } from '@xyflow/react';
import { useHotkeys } from 'react-hotkeys-hook';

import { AppDispatch, RootState } from '../../store/store';
import type { FlowWorkflowNodeType, FlowWorkflowNodeTypesByCategory } from '../../store/nodeTypesSlice';
import { setNodePanelExpanded } from '../../store/panelSlice';
import { createNodeAtCenter } from '../../utils/flowUtils';


const CollapsibleNodePanel: React.FC = () => {
  const isExpanded = useSelector((state: RootState) => state.panel.isNodePanelExpanded);
  const dispatch = useDispatch();
  const nodes = useSelector((state: RootState) => state.flow.nodes);
  const nodeTypes = useSelector((state: RootState) => state.nodeTypes.data as FlowWorkflowNodeTypesByCategory);
  const reactFlowInstance = useReactFlow();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Set<string>>(new Set());
  const [filteredNodeTypes, setFilteredNodeTypes] = useState<FlowWorkflowNodeTypesByCategory>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useHotkeys('ctrl+n, n', (event) => {
    event.preventDefault();
    dispatch(setNodePanelExpanded(!isExpanded));
  }, [isExpanded]);

  useHotkeys('esc', () => {
    if (isExpanded && panelRef.current?.contains(document.activeElement)) {
      dispatch(setNodePanelExpanded(false));
    }
  }, { enableOnFormTags: true }, [isExpanded]);

  useEffect(() => {
    if (isExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isExpanded]);

  const handleAddNode = (nodeName: string): void => {
    if (reactFlowInstance) {
      createNodeAtCenter( nodes, nodeTypes, nodeName, reactFlowInstance, dispatch);
      dispatch(setNodePanelExpanded(false));
    }
  };

  useEffect(() => {
    setFilteredNodeTypes(Object.keys(nodeTypes).reduce((acc, category) => {
      if (searchTerm.trim().length === 0) {
        return nodeTypes;
      }
      const filteredNodes = nodeTypes[category].filter((node: FlowWorkflowNodeType) =>
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
    }, {} as FlowWorkflowNodeTypesByCategory));
  }, [nodeTypes, searchTerm]);

  const handleToggleExpand = () => {
    dispatch(setNodePanelExpanded(!isExpanded));
  };

  return (
    <div ref={panelRef} className={`${!isExpanded ? 'w-auto h-auto' : 'w-64'} shadow-sm rounded-xl border border-solid border-default-200 bg-background transition-width duration-300 transition-height duration-300`}>
      <Button
        isIconOnly
        size="md"
        className="bg-background"
        onClick={handleToggleExpand}
      >
        <Icon icon={isExpanded ? "solar:minus-square-linear" : "solar:widget-add-linear"} width={"80%"} className="text-default-500" />
      </Button>
      {isExpanded && (
        <>
          <Input
            ref={searchInputRef}
            id="node-search-input"
            type="search"
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            fullWidth
            className="px-2 rounded"
            startContent={<Icon icon="akar-icons:search" className="text-default-500" />}
          />
          <div className="mt-4 max-h-[calc(100vh-16rem)] overflow-auto" id="node-type-accordion">
          <Accordion 
              selectionMode="multiple" 
              selectedKeys={Array.from(selectedCategory)} 
              onSelectionChange={(keys) => setSelectedCategory(new Set(Array.from(keys) as string[]))}
          >
              {Object.keys(filteredNodeTypes).filter(category => category !== "Input/Output").map((category) => (
                <AccordionItem key={category} title={category}>
                  {filteredNodeTypes[category].map((node: FlowWorkflowNodeType) => (
                    <div
                      key={node.name}
                      className="flex items-center cursor-pointer p-2 hover:bg-default-100"
                      onClick={() => handleAddNode(node.name)}
                    >
                      <div className="w-16 flex-shrink-0">
                        <div
                          className={`node-acronym-tag float-left text-white px-2 py-1 rounded-full text-xs inline-block`}
                          style={{ backgroundColor: node.visual_tag.color }}
                        >
                          {node.visual_tag.acronym}
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
