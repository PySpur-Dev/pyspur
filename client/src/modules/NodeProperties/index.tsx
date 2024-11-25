import { WorkflowNodeSchema } from "@/api/generated";
import { useSelector } from "@/store";
import {
  Card,
  Input,
  Textarea,
  Switch,
  Slider,
  Select,
  SelectItem,
  Button,
} from "@nextui-org/react";
import { TrashIcon } from "@radix-ui/react-icons";
import { ThemeProps, withTheme } from "@rjsf/core";
import { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

interface NodePropertiesProps {
  node: WorkflowNodeSchema;
}

const NextUITheme: ThemeProps<any, RJSFSchema, any> = {
  widgets: {
    TextWidget: (props) =>
      ["number", "integer"].includes(String(props.schema.type)) ? (
        <Slider
          defaultValue={props.value}
          hideValue={false}
          getValue={(value) => `${value}`}
          onChange={(e) => props.onChange(e)}
          color="foreground"
          minValue={props.schema.minimum || 0}
          maxValue={props.schema.maximum || 100}
          step={
            props.schema.default &&
            Number(props.schema.default) > 0 &&
            Number(props.schema.default) < 1
              ? 0.1
              : 1
          }
        />
      ) : (
        <Input
          type="text"
          size="sm"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          isRequired={props.required}
          isDisabled={props.disabled}
          isReadOnly={props.readonly}
          description={props.schema.description}
          className="w-full"
        />
      ),
    TextAreaWidget: (props) => (
      <Textarea
        value={props.value}
        size="sm"
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        isRequired={props.required}
        isDisabled={props.disabled}
        isReadOnly={props.readonly}
        description={props.schema.description}
        className="w-full"
        minRows={3}
      />
    ),
    SelectWidget: (props) => (
      <Select
        size="sm"
        autoFocus={props.autoFocus}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        onBlur={() => props.onBlur(props.id, props.value)}
        onFocus={() => props.onFocus(props.id, props.value)}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        isRequired={props.required}
        description={props.schema.description}
        value={props.value}
        className="w-full"
        defaultSelectedKeys={[props.value]}
      >
        {(props.options?.enumOptions ?? []).map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </Select>
    ),
    BooleanWidget: (props) => (
      <div className="flex flex-col gap-1">
        {props.label && <span className="text-sm">{props.label}</span>}
        <Switch
          size="sm"
          isSelected={props.value}
          onValueChange={(checked) => props.onChange(checked)}
          isDisabled={props.disabled}
        />
        {props.schema.description && (
          <span className="text-xs text-gray-500">
            {props.schema.description}
          </span>
        )}
      </div>
    ),
    RangeWidget: (props) => (
      <div className="flex flex-col gap-1">
        {props.label && <span className="text-sm">{props.label}</span>}
        <Slider
          size="sm"
          value={props.value}
          onChange={(value) => props.onChange(value)}
          minValue={props.schema.minimum ?? 0}
          maxValue={props.schema.maximum ?? 100}
          step={1}
          aria-label={props.label}
          className="w-full"
        />
        {props.schema.description && (
          <span className="text-xs text-gray-500">
            {props.schema.description}
          </span>
        )}
      </div>
    ),
  },
  fields: {},
  templates: {
    ButtonTemplates: {
      SubmitButton: () => {
        return <Button radius="sm">Submit</Button>;
      },
      AddButton: (props) => {
        return (
          <Button
            size="sm"
            radius="sm"
            disabled={props.disabled}
            onClick={props.onClick}
          >
            Add
          </Button>
        );
      },
      RemoveButton: (props) => {
        return (
          <Button
            size="sm"
            radius="sm"
            isIconOnly
            color="danger"
            variant="light"
            disabled={props.disabled}
            onClick={props.onClick}
          >
            <TrashIcon />
          </Button>
        );
      },
    },
    ObjectFieldTemplate: (props) => {
      const { AddButton } = props.registry.templates.ButtonTemplates;
      return (
        <div className="flex flex-col gap-4 w-full">
          {props.title && (
            <h3 className="text-xl font-medium sticky -top-4 bg-white py-2 z-10 -mx-4 p-4">
              {props.title}
            </h3>
          )}
          <div className="flex flex-col gap-4">
            {props.properties.map((property) =>
              !property.hidden ? (
                <div key={property.name} className="flex flex-col gap-2 w-full">
                  {property.content}
                </div>
              ) : null
            )}
          </div>
          {props.schema.additionalProperties && (
            <div className="flex justify-end">
              <AddButton
                registry={props.registry}
                onClick={props.onAddClick(props.schema)}
              />
            </div>
          )}
        </div>
      );
    },
    WrapIfAdditionalTemplate: (props) => {
      const { RemoveButton } = props.registry.templates.ButtonTemplates;

      if (!props.schema.__additional_property) {
        return <>{props.children}</>;
      }
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-row gap-2">
            <div className="flex flex-col gap-2">
              <Input size="sm" radius="sm" defaultValue={props.label} />
            </div>
            <div className="custom-form-field flex flex-col gap-2">
              {props.children}
            </div>
            <RemoveButton
              registry={props.registry}
              onClick={props.onDropPropertyClick(props.label)}
            />
          </div>
        </div>
      );
    },
    UnsupportedFieldTemplate: (props) => {
      const { schema, reason } = props;
      return (
        <div>
          <p className="text-red-500">
            Unsupported field schema, reason = {reason}
          </p>
          <pre>{JSON.stringify(schema, null, 2)}</pre>
        </div>
      );
    },
  },
};

const CustomForm = withTheme(NextUITheme);

export function NodeProperties({ node }: NodePropertiesProps) {
  const supportedNodeTypes = useSelector(
    (state) => state.flow.supportedNodeTypes
  );

  const schema = supportedNodeTypes[node.node_type].config as RJSFSchema;

  return (
    <Card className="fixed top-4 bottom-4 right-4 w-96 p-4 bg-white rounded-xl border border-solid border-gray-200 overflow-auto">
      <CustomForm
        schema={schema}
        validator={validator}
        formData={node.config}
        onChange={(e) => {
          console.log("onChange", e);
        }}
      />
    </Card>
  );
}
