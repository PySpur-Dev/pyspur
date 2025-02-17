from enum import Enum
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class ComparisonOperator(str, Enum):
    CONTAINS = "contains"
    EQUALS = "equals"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    STARTS_WITH = "starts_with"
    NOT_STARTS_WITH = "not_starts_with"
    IS_EMPTY = "is_empty"
    IS_NOT_EMPTY = "is_not_empty"
    NUMBER_EQUALS = "number_equals"


LogicalOperator = Literal["AND", "OR"]


class RouteConditionRuleSchema(BaseModel):
    """Configuration for a single condition"""

    variable: str
    operator: ComparisonOperator = Field(default=ComparisonOperator.CONTAINS)
    value: Any
    logicalOperator: Optional[LogicalOperator] = Field(default="AND")


class RouteConditionGroupSchema(BaseModel):
    """Configuration for a route with multiple conditions"""

    conditions: List[RouteConditionRuleSchema]
