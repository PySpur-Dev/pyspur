// frontend/src/utils/JSPydanticModel.js

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

class JSPydanticModel {
  constructor(schema) {
    this._schema = schema;
    this.ajv = new Ajv({
      useDefaults: true,
      coerceTypes: true,
      removeAdditional: true,
      allErrors: true,
    });
    addFormats(this.ajv);
  }

  createObjectFromSchema() {
    // Handle node types schema (primitives/llm/python)
    if (this._schema.primitives || this._schema.llm || this._schema.python) {
      return this.processNodeTypesSchema(this._schema);
    }

    // Handle regular JSON schemas
    try {
      const validate = this.ajv.compile(this._schema);
      const obj = {};
      validate(obj);
      // Exclude JSON Schema keywords from the resulting object
      const cleanedObj = this.excludeSchemaKeywords(obj);
      return cleanedObj;
    } catch (error) {
      console.error('Error compiling schema:', error);
      return null;
    }
  }

  excludeSchemaKeywords(obj) {
    const schemaKeywords = ['$defs', 'properties', 'anyOf', 'oneOf', 'allOf', 'items', 'additionalProperties', '$ref'];
    if (Array.isArray(obj)) {
      return obj.map(item => this.excludeSchemaKeywords(item));
    } else if (obj && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        if (!schemaKeywords.includes(key)) {
          acc[key] = this.excludeSchemaKeywords(obj[key]);
        }
        return acc;
      }, {});
    } else {
      return obj;
    }
  }

  processNodeTypesSchema(schema) {
    const result = {};

    ['primitives', 'llm', 'python'].forEach(category => {
      if (schema[category]) {
        result[category] = schema[category].map(node => {
          // Copy all fields from the original node
          const processedNode = { ...node };

          // Process schemas for input, output, and config
          ['input', 'output', 'config'].forEach(key => {
            if (node[key]) {
              try {
                const validator = this.ajv.compile(node[key]);
                const obj = {};
                validator(obj);
                // Merge the validated object with any existing fields
                processedNode[key] = {
                  ...node[key],  // Keep original fields like title, description etc
                  ...obj         // Add validated default values
                };
                // Exclude JSON Schema keywords from the resulting object
                processedNode[key] = this.excludeSchemaKeywords(processedNode[key]);
              } catch (error) {
                console.error(`Error processing ${key} schema for node:`, error);
                processedNode[key] = node[key] || {}; // Fallback to original or empty object
              }
            }
          });

          return processedNode;
        });
      }
    });

    return result;
  }

  extractMetadata() {
    this._metadata = {
      primitives: [],
      llm: [],
      python: []
    };
    this._extractMetadata(this._schema);
  }

  _extractMetadata(schema, path = []) {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    // If this is an anyOf/oneOf schema, flatten it by taking the first non-null type
    if (schema.anyOf || schema.oneOf) {
      const variants = schema.anyOf || schema.oneOf;
      const nonNullVariant = variants.find(v => v.type !== 'null');
      if (nonNullVariant) {
        // Merge the parent schema's metadata with the non-null variant
        const mergedSchema = {
          ...schema,
          ...nonNullVariant
        };
        // Remove the anyOf/oneOf to prevent infinite recursion
        delete mergedSchema.anyOf;
        delete mergedSchema.oneOf;
        this._extractMetadata(mergedSchema, path);
        return;
      }
    }

    const metadataKeys = [
      'type', 'title', 'description', 'default',
      'minimum', 'maximum', 'minItems', 'maxItems',
      'minLength', 'maxLength', 'pattern', 'enum',
      'required', 'additionalProperties', 'name', 'description',
      'visual_tag'
    ];

    // Get metadata at current level
    const metadata = metadataKeys.reduce((acc, key) => {
      if (schema[key] !== undefined) {
        acc[key] = schema[key];
      }
      return acc;
    }, {});

    // Store metadata in nested structure
    if (Object.keys(metadata).length > 0) {
      this.setNestedMetadata(path, metadata);
    }

    // Handle root-level arrays (primitives, llm, python)
    ['primitives', 'llm', 'python'].forEach(category => {
      if (Array.isArray(schema[category])) {
        if (!this._metadata[category]) {
          this._metadata[category] = [];
        }

        schema[category].forEach((node, index) => {
          // Store the node's name and visual_tag at the category level
          if (!this._metadata[category][index]) {
            this._metadata[category][index] = {
              name: node.name,
              visual_tag: node.visual_tag,
              input: {},
              output: {},
              config: {}
            };
          } else {
            // Update existing metadata with name and visual_tag
            this._metadata[category][index].name = node.name;
            this._metadata[category][index].visual_tag = node.visual_tag;
          }

          ['input', 'output', 'config'].forEach(schemaType => {
            if (node[schemaType]) {
              const newPath = [category, index, schemaType];
              this._extractMetadata(node[schemaType], newPath);

              // Handle $defs without including it in path
              if (schemaType === 'config' && node[schemaType].$defs) {
                Object.entries(node[schemaType].$defs).forEach(([key, value]) => {
                  // Remove '$defs' from path
                  this._extractMetadata(value, [...newPath, key]);
                });
              }

              if (node[schemaType].properties) {
                Object.entries(node[schemaType].properties).forEach(([key, value]) => {
                  // Remove 'properties' from path
                  this._extractMetadata(value, [...newPath, key]);
                });
              }
            }
          });
        });
      }
    });

    // Handle $ref to definitions
    if (schema.$ref) {
      const refPath = schema.$ref.replace(/^#\//, '').split('/');
      let refSchema = this._schema;

      // Special handling for $defs references
      if (refPath[0] === '$defs') {
        const currentContext = this.findContextWithDefs(schema);
        if (currentContext && currentContext.$defs) {
          refSchema = currentContext.$defs[refPath[1]];
          if (refSchema) {
            // Instead of using the $defs path, use the current path
            // This will store the metadata under the property that has the $ref
            this._extractMetadata(refSchema, path);
          }
        }
      } else {
        for (const part of refPath) {
          if (refSchema && typeof refSchema === 'object') {
            refSchema = refSchema[part];
          }
        }
        if (refSchema) {
          this._extractMetadata(refSchema, path);
        }
      }
      return;
    }

    // Process nested properties - remove 'properties' from path
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        // Remove 'properties' from path
        this._extractMetadata(value, [...path, key]);
      });
    }

    // Process array items
    if (schema.items) {
      this._extractMetadata(schema.items, [...path, 'items']);
    }

    // Process additionalProperties
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this._extractMetadata(schema.additionalProperties, [...path, 'additionalProperties']);
    }
  }

  // Helper method to set nested metadata
  setNestedMetadata(path, metadata) {
    if (path.length === 0) return;

    let current = this._metadata;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (Array.isArray(current)) {
        if (!current[key]) {
          current[key] = {};
        }
      } else {
        if (!current[key]) {
          // Check if next key is numeric to determine if we need an array or object
          current[key] = isNaN(path[i + 1]) ? {} : [];
        }
      }
      current = current[key];
    }

    const lastKey = path[path.length - 1];
    if (current[lastKey]) {
      current[lastKey] = { ...current[lastKey], ...metadata };
    } else {
      current[lastKey] = metadata;
    }
  }

  // Update the getter methods to work with nested structure
  getPropertyMetadata(propertyPath) {
    if (!this._metadata) {
      this.extractMetadata();
    }
    if (!propertyPath) return null;
    const parts = propertyPath.split('.');
    let current = this._metadata;

    for (const part of parts) {
      if (!current || !current[part]) return null;
      current = current[part];
    }

    return current;
  }

  getAllMetadata() {
    if (!this._metadata) {
      this.extractMetadata();
    }
    return this._metadata;
  }

  getPropertyDefault(propertyPath) {
    const metadata = this.getPropertyMetadata(propertyPath);
    return metadata?.default;
  }

  getPropertyType(propertyPath) {
    const metadata = this.getPropertyMetadata(propertyPath);
    return metadata?.type;
  }

  getPropertyConstraints(propertyPath) {
    const metadata = this.getPropertyMetadata(propertyPath);
    if (!metadata) return {};

    return {
      minimum: metadata.minimum,
      maximum: metadata.maximum,
      minItems: metadata.minItems,
      maxItems: metadata.maxItems,
      minLength: metadata.minLength,
      maxLength: metadata.maxLength,
      pattern: metadata.pattern,
      required: metadata.required,
    };
  }

  isPropertyRequired(propertyPath) {
    const metadata = this.getPropertyMetadata(propertyPath);
    return metadata?.required || false;
  }

  getPropertyEnum(propertyPath) {
    const metadata = this.getPropertyMetadata(propertyPath);
    return metadata?.enum;
  }

  findContextWithDefs(schema) {
    // Start with the immediate parent context
    let context = schema;

    // Keep looking up until we find a context with $defs or reach the root
    while (context && !context.$defs) {
      if (context === this._schema) {
        break;
      }
      context = this.findParentContext(context);
    }

    return context || this._schema;
  }

  findParentContext(schema, currentContext = this._schema) {
    if (!currentContext || typeof currentContext !== 'object') {
      return null;
    }

    // Check all properties of the current context
    for (const [key, value] of Object.entries(currentContext)) {
      if (value === schema) {
        return currentContext;
      }
      if (typeof value === 'object') {
        const result = this.findParentContext(schema, value);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  // Add this helper method to find the path to a context
  findPathToContext(targetContext, currentContext = this._schema, currentPath = []) {
    if (currentContext === targetContext) {
      return currentPath;
    }

    if (typeof currentContext !== 'object' || currentContext === null) {
      return null;
    }

    for (const [key, value] of Object.entries(currentContext)) {
      if (typeof value === 'object' && value !== null) {
        const newPath = [...currentPath, key];
        const result = this.findPathToContext(targetContext, value, newPath);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  extractConstraints() {
    this._constraints = {};
    this._extractConstraints(this._schema);
  }

  _extractConstraints(schema, path = []) {
    const constraintKeys = [
      'minimum', 'maximum', 'minItems', 'maxItems',
      'minLength', 'maxLength', 'pattern',
      'exclusiveMinimum', 'exclusiveMaximum',
      'minProperties', 'maxProperties',
      'type', 'enum'
    ];

    // Get constraints at current level
    const constraints = constraintKeys.reduce((acc, key) => {
      if (schema[key] !== undefined) {
        acc[key] = schema[key];
      }
      return acc;
    }, {});
    // Store constraints if found
    if (Object.keys(constraints).length > 0) {
      const propertyName = path.join('.');
      if (propertyName) {
        this._constraints[propertyName] = constraints;
      }
    }

    // Handle $ref to definitions
    if (schema.$ref) {
      const refPath = schema.$ref.replace(/^#\//, '').split('/');
      let refSchema = this._schema;

      // Special handling for $defs references
      if (refPath[0] === '$defs') {
        // If the reference is to a $defs definition, look in the current context
        const currentContext = this.findContextWithDefs(schema);
        if (currentContext && currentContext.$defs) {
          refSchema = currentContext.$defs[refPath[1]];
        }
      } else {
        // For other references, traverse the path
        for (const part of refPath) {
          if (refSchema && typeof refSchema === 'object') {
            refSchema = refSchema[part];
          } else {
            console.warn(`Unable to resolve reference path: ${schema.$ref}`);
            return;
          }
        }
      }

      if (refSchema) {
        // Process the referenced schema with the same path
        this._extractConstraints(refSchema, path);
      }
      return; // Stop processing this branch after handling $ref
    }

    // Process nested properties
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        this._extractConstraints(value, [...path, key]);
      });
    } else if (schema.anyOf || schema.oneOf || schema.allOf) {
      const schemas = schema.anyOf || schema.oneOf || schema.allOf;
      schemas.forEach(subSchema => {
        this._extractConstraints(subSchema, path);
      });
    }

    // Process array items
    if (schema.items) {
      this._extractConstraints(schema.items, [...path, 'items']);
    }
  }

  getConstraints() {
    if (!this._constraints) {
      this.extractConstraints();
    }
    return this._constraints;
  }
}

export default JSPydanticModel;
