import { Node } from "@/types";
import { NodeProps } from "@xyflow/react";
import { CustomHandle } from "../CustomHandle";
import { NodeBase } from "./NodeBase";

export function SelfConsistencyNode({ data, ...props }: NodeProps<Node>) {
  return (
    <NodeBase defaultTitle="Self Consistency Node" data={data} {...props}>
      <div className="flex justify-between -mx-1">
        <div className="flex flex-col flex-1 gap-2">
          {Object.keys(data.config.input_schema).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <CustomHandle type="target" id={key} isConnectableStart={false} />
              <p className="text-xs flex-1 font-medium">{key}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col flex-1 gap-2">
          {Object.keys(data.config.output_schema).map((key) => (
            <div
              key={key}
              className="flex items-center justify-end text-right gap-2"
            >
              <p className="text-xs flex-1 font-medium">{key}</p>
              <CustomHandle type="source" id={key} />
            </div>
          ))}
        </div>
      </div>
    </NodeBase>
  );
}
