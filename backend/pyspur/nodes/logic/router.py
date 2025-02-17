from typing import Any, Dict, Optional

from pydantic import BaseModel, create_model

from ...schemas.router_schemas import (
    ComparisonOperator,
    RouteConditionGroupSchema,
    RouteConditionRuleSchema,
)
from ..base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput


class RouterNodeConfig(BaseNodeConfig):
    """Configuration for the router node."""

    route_map: Dict[str, RouteConditionGroupSchema] = {
        "route1": RouteConditionGroupSchema(
            conditions=[
                RouteConditionRuleSchema(
                    variable="", operator=ComparisonOperator.CONTAINS, value=""
                )
            ]
        )
    }


class RouterNodeInput(BaseNodeInput):
    """Input model for the router node."""

    pass


class RouterNodeOutput(BaseNodeOutput):
    """Output model for the router node."""

    class Config:
        arbitrary_types_allowed = True

    pass


class RouterNode(BaseNode):
    """
    A routing node that directs input data to different routes
    based on the evaluation of conditions. The first route acts as the default
    if no other conditions match.
    """

    name = "router_node"
    display_name = "Router"
    input_model = RouterNodeInput
    config_model = RouterNodeConfig

    def _evaluate_single_condition(
        self, input: BaseModel, condition: RouteConditionRuleSchema
    ) -> bool:
        """Evaluate a single condition against a specific input variable"""

        def get_nested_value(data: Dict[str, Any], target_key: str) -> Any:
            """Get value from nested dictionary using dot notation path."""
            keys = target_key.split(".")
            current = data

            for key in keys:
                if not isinstance(current, dict):
                    return None
                if key not in current:
                    return None
                current = current[key]

            return current

        try:
            if not condition.variable:
                return False

            # Retrieve the variable value, including support for nested paths
            variable_value = get_nested_value(input.model_dump(), condition.variable)

            if variable_value is None:
                if condition.operator != ComparisonOperator.IS_EMPTY:
                    return False
                else:
                    return True
            if condition.operator == ComparisonOperator.CONTAINS:
                return str(condition.value) in str(variable_value)
            elif condition.operator == ComparisonOperator.EQUALS:
                return str(variable_value) == str(condition.value)
            elif condition.operator == ComparisonOperator.NUMBER_EQUALS:
                return float(variable_value) == float(condition.value)
            elif condition.operator == ComparisonOperator.GREATER_THAN:
                return float(variable_value) > float(condition.value)
            elif condition.operator == ComparisonOperator.LESS_THAN:
                return float(variable_value) < float(condition.value)
            elif condition.operator == ComparisonOperator.STARTS_WITH:
                return str(variable_value).startswith(str(condition.value))
            elif condition.operator == ComparisonOperator.NOT_STARTS_WITH:
                return not str(variable_value).startswith(str(condition.value))
            elif condition.operator == ComparisonOperator.IS_EMPTY:
                return not bool(variable_value)
            elif condition.operator == ComparisonOperator.IS_NOT_EMPTY:
                return bool(variable_value)
            else:
                return False
        except (ValueError, TypeError, AttributeError):
            return False

    def _evaluate_route_conditions(
        self, input: BaseModel, route: RouteConditionGroupSchema
    ) -> bool:
        """Evaluate all conditions in a route with AND/OR logic"""
        if not route.conditions:
            # If no conditions, consider it always matches
            return True

        result = self._evaluate_single_condition(input, route.conditions[0])

        for i in range(1, len(route.conditions)):
            condition = route.conditions[i]
            current_result = self._evaluate_single_condition(input, condition)

            if condition.logicalOperator == "OR":
                result = result or current_result
            else:  # AND is default
                result = result and current_result

        return result

    async def run(self, input: BaseModel) -> BaseModel:
        """
        Evaluates conditions for each route in order. The first route that matches
        gets the input data. If no routes match, the first route acts as a default.
        """
        output_model = create_model(
            f"{self.name}",
            __config__=None,
            __base__=RouterNodeOutput,
            __doc__=f"Output model for {self.name} node",
            __module__=self.__module__,
            __validators__=None,
            __cls_kwargs__=None,
            **{
                field_name: (field_type, None)
                for field_name, field_type in input.model_fields.items()
            },
        )
        # Create fields for each route with Optional[input type]
        route_fields = {
            route_name: (Optional[output_model], None)
            for route_name in self.config.route_map.keys()
        }
        new_output_model = create_model(
            f"{self.name}CompositeOutput",
            __base__=RouterNodeOutput,
            __config__=None,
            __doc__=f"Composite output model for {self.name} node",
            __module__=self.__module__,
            __validators__=None,
            __cls_kwargs__=None,
            **route_fields,
        )
        self.output_model = new_output_model

        output: Dict[str, Optional[BaseModel]] = {}

        for route_name, route in self.config.route_map.items():
            if self._evaluate_route_conditions(input, route):
                output[route_name] = output_model(**input.model_dump())

        return self.output_model(**output)


if __name__ == "__main__":
    # Test the RouterNode
    import asyncio

    from pydantic import BaseModel

    class TestInput(RouterNodeInput):
        name: str
        age: int
        is_student: bool
        grade: str

    config = RouterNodeConfig(
        route_map={
            "route1": RouteConditionGroupSchema(
                conditions=[
                    RouteConditionRuleSchema(
                        variable="age",
                        operator=ComparisonOperator.GREATER_THAN,
                        value=18,
                    ),
                    RouteConditionRuleSchema(
                        variable="is_student",
                        operator=ComparisonOperator.EQUALS,
                        value=True,
                    ),
                ]
            ),
            "route2": RouteConditionGroupSchema(
                conditions=[
                    RouteConditionRuleSchema(
                        variable="grade",
                        operator=ComparisonOperator.EQUALS,
                        value="A",
                    ),
                ]
            ),
        }
    )

    node = RouterNode(config=config, name="router_node")

    input_data = TestInput(name="Alice", age=20, is_student=True, grade="B")
    output = asyncio.run(node(input_data))
    import json

    print(json.dumps(output.model_json_schema(), indent=2))
    print(json.dumps(output.model_dump(), indent=2))
