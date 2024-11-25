import { WorkflowLinkSchema } from "@/api/generated";
import { RJSFSchema } from "@rjsf/utils";
import { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";

export type NodeTypeCategory = "llm" | "primitives" | "python";

export type LLMNode = {
  name: string;
  input: {
    properties?: Record<string, any>;
    required?: string[];
    title?: string;
    type?: "object";
  };
  output: {
    properties?: Record<string, any>;
    required?: string[];
    title?: string;
    type?: "object";
  };
  config: {
    $defs?: RJSFSchema["$defs"];
    properties: {
      input_schema?: {
        additionalProperties: {
          type: "string";
        };
        default: Record<string, any>;
        title: string;
        type: "object";
      };
      output_schema?: {
        additionalProperties: {
          type: "string";
        };
        default: Record<string, any>;
        title: string;
        type: "object";
      };
      llm_info: {
        $ref: string;
        default: Record<string, any>;
        description: string;
      };
      system_message: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      user_message: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      num_simulations?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "number";
      };
      simulation_depth?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "number";
      };
      exploration_weight?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "number";
      };
      few_shot_examples: {
        anyOf: any[];
        default: string | null;
        title: string;
      };
      samples?: {
        default: number;
        description?: string | null;
        maximum?: number;
        minimum?: number;
        title: string;
        type: "number" | "integer";
      };
      rating_prompt?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      rating_temperature?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "string";
      };
      rating_max_tokens?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "string";
      };
      system_prompt?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      branch_prompt?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      solve_prompt?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      merge_prompt?: {
        default: string;
        title: string;
        type: "string";
      };
      json_mode?: {
        default: false;
        description: string;
        title: string;
        type: "boolean";
      };
      critique_prompt_template?: {
        default: string;
        title: string;
        type: "string";
      };
      final_prompt_template?: {
        default: string;
        title: string;
        type: "string";
      };
      similarity_threshold?: {
        default: number;
        description: string | null;
        maximum: number;
        minimum: number;
        title: string;
        type: "number";
      };
      steps?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "integer";
      };
      n_generate_sample?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "integer";
      };
      n_evaluate_sample?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "integer";
      };
      n_select_sample?: {
        default: number;
        description: string;
        maximum: number;
        minimum: number;
        title: string;
        type: "integer";
      };
      method_generate?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      method_evaluate?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      method_select?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      prompt_sample?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
      stops?: {
        default: string[];
        items: {
          type: "string";
        };
        title: string;
        type: "array";
      };
      search_method?: {
        default: string;
        description: string;
        title: string;
        type: "string";
      };
    };
    title: string;
    type: "object";
  };
  visual_tag: {
    acronym: string;
    color: string;
  };
};

export type PrimitiveNode = {
  name: string;
  input: {
    properties: RJSFSchema["properties"];
    title: string;
    type: "object";
  };
  output: {
    properties: RJSFSchema["properties"];
    title: string;
    type: "object";
  };
  config: {
    $defs?: RJSFSchema["$defs"];
    properties: {
      input_schema?: {
        additionalProperties: {
          type: "string";
        };
        title: string;
        type: "object";
      };
      output_schema?: {
        additionalProperties: {
          type: "string";
        };
        default: Record<string, any>;
        title: string;
        type: "object";
      };
      values?: {
        title: string;
        type: "object";
      };
    };
    required: string[];
    title: string;
    type: "object";
  };
  visual_tag: {
    acronym: string;
    color: string;
  };
};

export type PythonNode = {
  name: string;
  input: {
    properties: RJSFSchema["properties"];
    title: string;
    type: "object";
  };
  output: {
    properties: RJSFSchema["properties"];
    title: string;
    type: "object";
  };
  config: {
    $defs?: RJSFSchema["$defs"];
    properties: {
      code: {
        title: string;
        type: "string";
      };
      input_schema: {
        additionalProperties: {
          type: "string";
        };
        title: string;
        type: "object";
      };
      output_schema: {
        additionalProperties: {
          type: "string";
        };
        title: string;
        type: "object";
      };
    };
    required: string[];
    title: string;
    type: "object";
  };
  visual_tag: {
    acronym: string;
    color: string;
  };
};

export type NodeSchema = {
  llm: LLMNode[];
  primitives: PrimitiveNode[];
  python: PythonNode[];
};

interface NodeMeasured {
  width: number;
  height: number;
}

export type Node = ReactFlowNode<{
  title: string;
  acronym: string;
  color: string;
  config: RJSFSchema;
  input: any;
  output: any;
}> & {
  measured?: NodeMeasured;
};
export type Edge = ReactFlowEdge;
export type Link = WorkflowLinkSchema;
