import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { PydanticSchema, NodeMetadata, CategoryMetadata, PropertyConstraints, isPydanticSchema, isNodeMetadata } from '../types/pydantic/schema';

class JSPydanticModel {
  private _schema: PydanticSchema;
  private _metadata: CategoryMetadata;
  private _constraints: Record<string, PropertyConstraints>;
  private ajv: Ajv;

  constructor(schema: PydanticSchema) {
    this._schema = schema;
    this._metadata = {};
    this._constraints = {};
    this.ajv = new Ajv({
      useDefaults: true,
      coerceTypes: true,
      removeAdditional: true,
      allErrors: true,
    });
    addFormats(this.ajv);

    const categories = Object.keys(this._schema).filter(key => Array.isArray(this._schema[key]));
    categories.forEach(category => {
      this._metadata[category] = [];
    });

    this._extractMetadata(this._schema);
    this._extractConstraints(this._schema);
  }

  excludeSchemaKeywords(obj: unknown): unknown {
    const schemaKeywords = ['$defs', 'properties', 'anyOf', 'oneOf', 'allOf', 'items', 'additionalProperties', '$ref'];
    if (Array.isArray(obj)) {
      return obj.map(item => this.excludeSchemaKeywords(item));
    } else if (obj && typeof obj === 'object') {
      return Object.keys(obj as Record<string, unknown>).reduce((acc: Record<string, unknown>, key) => {
        if (!schemaKeywords.includes(key)) {
          acc[key] = this.excludeSchemaKeywords((obj as Record<string, unknown>)[key]);
        }
        return acc;
      }, {});
    }
    return obj;
  }

  extractMetadata(): void {
    this._metadata = {};
    const categories = Object.keys(this._schema).filter(key => Array.isArray(this._schema[key]));
    categories.forEach(category => {
      this._metadata[category] = [];
    });

    this._extractMetadata(this._schema);
  }

  private _extractMetadata(schema: PydanticSchema, path: string[] = []): void {
    if (!isPydanticSchema(schema)) {
      return;
    }

    if (schema.anyOf || schema.oneOf) {
      const variants = schema.anyOf || schema.oneOf;
      if (variants && Array.isArray(variants)) {
        const nonNullVariant = variants.find(v => isPydanticSchema(v) && v.type !== 'null');
        if (nonNullVariant) {
          const mergedSchema: PydanticSchema = {
            ...schema,
            ...nonNullVariant
          };
          delete mergedSchema.anyOf;
          delete mergedSchema.oneOf;
          this._extractMetadata(mergedSchema, path);
          return;
        }
      }
    }

    const metadataKeys = [
      'type', 'title', 'description', 'default',
      'minimum', 'maximum', 'minItems', 'maxItems',
      'minLength', 'maxLength', 'pattern', 'enum',
      'required', 'additionalProperties', 'name', 'description',
      'visual_tag'
    ];

    const metadata = metadataKeys.reduce<NodeMetadata>((acc, key) => {
      const value = schema[key];
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (Object.keys(metadata).length > 0) {
      this.setNestedMetadata(path, metadata);
    }

    const categories = Object.keys(schema).filter(key => Array.isArray(schema[key]));
    categories.forEach(category => {
      if (!this._metadata[category]) {
        this._metadata[category] = [];
      }

      const categoryArray = schema[category];
      if (Array.isArray(categoryArray)) {
        categoryArray.forEach((node, index) => {
          if (isPydanticSchema(node)) {
            const metadataArray = this._metadata[category];
            if (!Array.isArray(metadataArray)) {
              this._metadata[category] = [];
              return;
            }

            if (!metadataArray[index]) {
              metadataArray[index] = {
                name: node.name,
                visual_tag: node.visual_tag,
                input: {},
                output: {},
                config: {}
              };
            } else {
              const metadataNode = metadataArray[index];
              if (isNodeMetadata(metadataNode)) {
                metadataNode.name = node.name;
                metadataNode.visual_tag = node.visual_tag;
              }
            }

            ['input', 'output', 'config'].forEach(schemaType => {
              const schemaValue = node[schemaType];
              if (isPydanticSchema(schemaValue)) {
                const newPath = [category, String(index), schemaType];
                this._extractMetadata(schemaValue, newPath);

                if (schemaType === 'config' && schemaValue.$defs) {
                  Object.entries(schemaValue.$defs).forEach(([key, value]) => {
                    if (isPydanticSchema(value)) {
                      this._extractMetadata(value, [...newPath, key]);
                    }
                  });
                }

                if (schemaValue.properties) {
                  Object.entries(schemaValue.properties).forEach(([key, value]) => {
                    if (isPydanticSchema(value)) {
                      this._extractMetadata(value, [...newPath, key]);
                    }
                  });
                }
              }
            });
          }
        });
      }
    });

    if (schema.$ref) {
      const refPath = schema.$ref.replace(/^#\//, '').split('/');
      let refSchema: PydanticSchema | undefined = this._schema;

      if (refPath[0] === '$defs') {
        const currentContext = this.findContextWithDefs(schema);
        if (currentContext && currentContext.$defs) {
          const defSchema = currentContext.$defs[refPath[1]];
          if (isPydanticSchema(defSchema)) {
            this._extractMetadata(defSchema, path);
          }
        }
      } else {
        for (const part of refPath) {
          if (refSchema && typeof refSchema === 'object') {
            const nextSchema: unknown = refSchema[part];
            if (isPydanticSchema(nextSchema)) {
              refSchema = nextSchema;
            } else {
              refSchema = undefined;
              break;
            }
          }
        }
        if (refSchema) {
          this._extractMetadata(refSchema, path);
        }
      }
      return;
    }

    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        this._extractMetadata(value, [...path, key]);
      });
    }

    if (schema.items) {
      this._extractMetadata(schema.items, [...path, 'items']);
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this._extractMetadata(schema.additionalProperties, [...path, 'additionalProperties']);
    }
  }

  setNestedMetadata(path: string[], metadata: NodeMetadata): void {
    let current: Record<string, unknown> = this._metadata;
    const lastKey = path[path.length - 1];

    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key]) {
        current[key] = isNaN(Number(path[i + 1])) ? {} : [];
      }
      const next = current[key];
      if (next && typeof next === 'object') {
        current = next as Record<string, unknown>;
      }
    }

    if (current[lastKey] && typeof current[lastKey] === 'object') {
      current[lastKey] = { ...(current[lastKey] as NodeMetadata), ...metadata };
    } else {
      current[lastKey] = metadata;
    }
  }

  getAllMetadata(): CategoryMetadata {
    return this._metadata;
  }

  private findContextWithDefs(schema: PydanticSchema): PydanticSchema | undefined {
    let currentContext: PydanticSchema | undefined = this._schema;
    const path = schema.$ref?.replace(/^#\//, '').split('/') || [];

    for (const part of path) {
      if (currentContext && typeof currentContext === 'object') {
        const nextContext: unknown = currentContext[part];
        if (isPydanticSchema(nextContext)) {
          currentContext = nextContext;
        }
      }
    }

    return currentContext;
  }

  private _extractConstraints(schema: PydanticSchema, path: string[] = []): void {
    if (!isPydanticSchema(schema)) {
      return;
    }

    const constraintKeys = ['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'required'];
    const constraints = constraintKeys.reduce((acc: PropertyConstraints, key) => {
      const value = schema[key];
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {});

    if (Object.keys(constraints).length > 0) {
      this._constraints[path.join('.')] = constraints;
    }

    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        this._extractConstraints(value, [...path, key]);
      });
    }

    if (schema.items) {
      this._extractConstraints(schema.items, [...path, 'items']);
    }

    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      this._extractConstraints(schema.additionalProperties, [...path, 'additionalProperties']);
    }
  }
}

export default JSPydanticModel;
