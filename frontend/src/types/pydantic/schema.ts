import { NodeType } from '../nodes/base';

export interface PydanticSchema {
  $defs?: Record<string, PydanticSchema>;
  properties?: Record<string, PydanticSchema>;
  anyOf?: PydanticSchema[];
  oneOf?: PydanticSchema[];
  allOf?: PydanticSchema[];
  items?: PydanticSchema;
  additionalProperties?: boolean | PydanticSchema;
  $ref?: string;
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
  required?: boolean | string[];
  name?: string;
  visual_tag?: string;
  input?: PydanticSchema;
  output?: PydanticSchema;
  config?: PydanticSchema;
  [key: string]: unknown;  // Allow string indexing for dynamic properties
}

export interface NodeMetadata {
  name?: string;
  visual_tag?: string;
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: unknown[];
  required?: boolean;
  input?: Record<string, NodeMetadata>;
  output?: Record<string, NodeMetadata>;
  config?: Record<string, NodeMetadata>;
  [key: string]: unknown;  // Allow string indexing for dynamic properties
}

export interface CategoryMetadata {
  [category: string]: NodeMetadata[];
}

export interface PropertyConstraints {
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  required?: boolean;
  [key: string]: unknown;  // Allow string indexing for dynamic properties
}

// Type guards
export function isPydanticSchema(obj: unknown): obj is PydanticSchema {
  return obj !== null && typeof obj === 'object';
}

export function isNodeMetadata(obj: unknown): obj is NodeMetadata {
  return obj !== null && typeof obj === 'object';
}

export function isNodeMetadataArray(obj: unknown): obj is NodeMetadata[] {
  return Array.isArray(obj) && obj.every(isNodeMetadata);
}
