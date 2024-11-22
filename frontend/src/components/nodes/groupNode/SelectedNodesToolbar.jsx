import {
    useNodes,
    NodeToolbar,
    useStoreApi,
    useReactFlow,
} from '@xyflow/react';

import { useDispatch, useSelector } from 'react-redux';

import { setNodes } from '../../../store/flowSlice';

import { getId } from '../../../utils/groupUtils';

const padding = 25;

export default function SelectedNodesToolbar() {
    const dispatch = useDispatch();
    const nodes = useNodes();
    console.log('nodes', nodes);
    const { getNodesBounds } = useReactFlow();
    const store = useStoreApi();
    const selectedNodes = nodes.filter((node) => node.selected && !node.parentId);
    const selectedNodeIds = selectedNodes.map((node) => node.id);
    const isVisible = selectedNodeIds.length > 1;

    const onGroup = () => {
        const rectOfNodes = getNodesBounds(selectedNodes);
        const groupId = getId('group');
        const parentPosition = {
            x: rectOfNodes.x,
            y: rectOfNodes.y,
        };
        const groupNode = {
            id: groupId,
            type: 'group',
            position: parentPosition,
            style: {
                width: rectOfNodes.width + padding * 2,
                height: rectOfNodes.height + padding * 2,
            },
            data: {},
        };

        const nextNodes = nodes.map((node) => {
            if (selectedNodeIds.includes(node.id)) {
                return {
                    ...node,
                    position: {
                        x: node.position.x - parentPosition.x + padding,
                        y: node.position.y - parentPosition.y + padding,
                    },
                    extent: 'parent',
                    parentId: groupId,
                };
            }
            return node;
        });

        store.getState().resetSelectedElements();
        store.setState({ nodesSelectionActive: false });
        dispatch(setNodes({nodes: [groupNode, ...nextNodes]}));
    };

    return (
        <NodeToolbar nodeId={selectedNodeIds} isVisible={isVisible}>
            <button onClick={onGroup}>Group selected nodes</button>
        </NodeToolbar>
    );
}
