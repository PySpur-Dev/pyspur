import cloneDeep from 'lodash/cloneDeep';
import { getUniqueNodeTitle } from './nodeTitleUtils';

// Define types for the node structure
interface NodeType {
  name: string;
  visual_tag: {
    acronym: string;
    color: string;
  };
  config: Record<string, any>;
  input?: {
    properties: Record<string, any>;
  };
  output?: {
    properties: Record<string, any>;
  };
}

interface NodeTypes {
  [category: string]: NodeType[];
}

interface Position {
  x: number;
  y: number;
}

interface AdditionalData {
  input?: {
    properties?: Record<string, any>;
    [key: string]: any;
  };
  output?: {
    properties?: Record<string, any>;
    [key: string]: any;
  };
  config?: Record<string, any>;
  [key: string]: any;
}

// Ensure properties are required in the final node structure
interface NodeIO {
  properties: Record<string, any>;
  [key: string]: any;
}

interface NodeData {
  title: string;
  acronym: string;
  color: string;
  config: Record<string, any>;
  input: NodeIO;
  output: NodeIO;
  [key: string]: any;
}

interface Node {
  id: string;
  type: string;
  position: Position;
  data: NodeData;
}

// Helper function to create NodeIO objects with required properties
const createNodeIO = (
  baseProperties: Record<string, any>,
  additionalData?: {
    properties?: Record<string, any>;
    [key: string]: any;
  }
): NodeIO => {
  const properties = {
    ...baseProperties,
    ...(additionalData?.properties || {}),
  };

  const { properties: _, ...rest } = additionalData || {};
  return {
    ...rest,
    properties,
  };
};

// Function to create a node based on its type
export const createNode = (
  nodeTypes: NodeTypes,
  type: string,
  id: string,
  position: Position,
  additionalData: AdditionalData = {},
  existingNodes: Node[] = []  // Add existingNodes parameter
): Node | null => {
  let nodeType: NodeType | null = null;

  for (const category in nodeTypes) {
    const found = nodeTypes[category].find((node) => node.name === type);
    if (found) {
      nodeType = found;
      break;
    }
  }
  if (!nodeType) {
    return null;
  }

  const inputProperties = cloneDeep(nodeType.input?.properties) || {};
  const outputProperties = cloneDeep(nodeType.output?.properties) || {};

  let processedAdditionalData = cloneDeep(additionalData);

  // If the additional data has input/output properties, merge them with the default properties
  if (additionalData.input?.properties) {
    processedAdditionalData.input = {
      properties: {
        ...inputProperties,
        ...additionalData.input.properties,
      },
      ...(processedAdditionalData.input || {}),
    };
  } else {
    processedAdditionalData.input = {
      properties: inputProperties,
    };
  }

  if (additionalData.output?.properties) {
    processedAdditionalData.output = {
      properties: {
        ...outputProperties,
        ...additionalData.output.properties,
      },
      ...(processedAdditionalData.output || {}),
    };
  } else {
    processedAdditionalData.output = {
      properties: outputProperties,
    };
  }

  const baseTitle = nodeType.name;
  const uniqueTitle = getUniqueNodeTitle(baseTitle, existingNodes);

  const node: Node = {
    id,
    type: nodeType.name,
    position,
    data: {
      title: uniqueTitle,
      acronym: nodeType.visual_tag.acronym,
      color: nodeType.visual_tag.color,
      config: {
        ...cloneDeep(nodeType.config),
        title: uniqueTitle,
      },
      input: createNodeIO(inputProperties, processedAdditionalData.input),
      output: createNodeIO(outputProperties, processedAdditionalData.output),
      ...processedAdditionalData,
    } as NodeData,
  };
  return node;
};
