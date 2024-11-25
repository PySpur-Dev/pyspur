import { Node } from "@/types";
import { NodeProps } from "@xyflow/react";
import { CustomHandle } from "../CustomHandle";
import { NodeBase } from "./NodeBase";

export function InputNode({ data, ...props }: NodeProps<Node>) {
  return (
    <NodeBase defaultTitle="Input Node" data={data} {...props}>
      <div className="flex flex-col flex-1 gap-2 -mx-1">
        {Object.keys(data.config.input_schema).map((key) => (
          <div
            key={key}
            className="flex items-center justify-end text-right gap-2"
          >
            <p className="text-xs flex-1 font-medium">{key}</p>
            <CustomHandle type="source" id={key} />
          </div>
        ))}
      </div>
    </NodeBase>
  );
}
