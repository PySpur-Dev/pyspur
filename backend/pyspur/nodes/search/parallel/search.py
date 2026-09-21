import asyncio
import json
from importlib.metadata import PackageNotFoundError, version
from typing import Any, AsyncIterator, Dict, List, Optional

import httpx
from jinja2 import StrictUndefined, Template
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from pydantic import BaseModel, Field

from ...base import BaseNode, BaseNodeConfig, BaseNodeInput, BaseNodeOutput

ENDPOINT = "https://search.parallel.ai/mcp"
MAX_RESPONSE_BYTES = 1_000_000


class ParallelSearchNodeInput(BaseNodeInput):
    model_config = {"extra": "allow"}


class ParallelSearchResult(BaseModel):
    url: str
    title: Optional[str] = None
    excerpts: List[str]
    publish_date: Optional[str] = None


class ParallelSearchNodeOutput(BaseNodeOutput):
    results: List[ParallelSearchResult]
    warnings: Optional[List[Any]] = None
    session_id: Optional[str] = None
    truncated: bool = False


class ParallelSearchNodeConfig(BaseNodeConfig):
    query_template: str = Field(
        "{{input_1}}", description="Search query; supports {{variable}} templates."
    )
    objective_template: str = Field(
        "", description="Information to find; defaults to the rendered query."
    )
    max_results: int = Field(10, ge=1, le=100, description="Locally limit returned results.")
    max_characters: int = Field(
        1000, ge=1, le=25000, description="Locally limit excerpt characters per result."
    )
    timeout_seconds: float = Field(60, gt=0, le=300, description="Total search deadline.")
    has_fixed_output: bool = True
    output_json_schema: str = json.dumps(ParallelSearchNodeOutput.model_json_schema())


class _BoundedStream(httpx.AsyncByteStream):
    def __init__(self, stream: httpx.AsyncByteStream):
        self.stream = stream

    async def __aiter__(self) -> AsyncIterator[bytes]:
        size = 0
        async for chunk in self.stream:
            size += len(chunk)
            if size > MAX_RESPONSE_BYTES:
                raise ValueError("Parallel MCP response exceeds the 1 MB limit")
            yield chunk

    async def aclose(self) -> None:
        await self.stream.aclose()


def _http_client_factory(
    headers: Optional[Dict[str, str]] = None,
    timeout: Optional[httpx.Timeout] = None,
    auth: Optional[httpx.Auth] = None,
) -> httpx.AsyncClient:
    async def bound_response(response: httpx.Response) -> None:
        # Reject compression so the streamed byte limit also bounds decoded JSON.
        if response.headers.get("content-encoding", "identity") != "identity":
            raise ValueError("Parallel MCP returned an unsupported compressed response")
        response.stream = _BoundedStream(response.stream)
        if response.headers.get("content-type", "").startswith("application/json"):
            # Read under the cap before SDK JSON parsing, so limit failures abort its pending call.
            await response.aread()

    return httpx.AsyncClient(
        headers={**(headers or {}), "Accept-Encoding": "identity"},
        timeout=timeout,
        auth=auth,
        follow_redirects=False,
        event_hooks={"response": [bound_response]},
    )


class ParallelSearchNode(BaseNode):
    """Keyless web search via Parallel's hosted Search MCP service."""

    name = "parallel_search_node"
    display_name = "Parallel Search"
    category = "Search"
    config_model = ParallelSearchNodeConfig
    input_model = ParallelSearchNodeInput
    output_model = ParallelSearchNodeOutput

    def setup(self) -> None:
        # Keep the fixed nested result model and optional service metadata intact.
        self.output_model = ParallelSearchNodeOutput

    async def run(self, input: BaseModel) -> BaseModel:
        data = input.model_dump()
        query = (
            Template(self.config.query_template, undefined=StrictUndefined).render(**data).strip()
        )
        objective = (
            Template(self.config.objective_template, undefined=StrictUndefined)
            .render(**data)
            .strip()
            or query
        )
        if not query:
            raise ValueError("Parallel search requires a nonempty query")
        if len(query) > 200:
            raise ValueError("Parallel search queries must be at most 200 characters")

        try:
            product = f"pyspur/{version('pyspur')}"
        except PackageNotFoundError:
            product = "pyspur"
        # Identify aggregate project usage; never add user or installation identifiers.
        headers = {"User-Agent": f"{product} python-httpx/{httpx.__version__}"}
        async with asyncio.timeout(self.config.timeout_seconds):
            async with streamablehttp_client(
                ENDPOINT,
                headers=headers,
                timeout=self.config.timeout_seconds,
                sse_read_timeout=self.config.timeout_seconds,
                terminate_on_close=False,
                httpx_client_factory=_http_client_factory,
            ) as (read, write, _):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    cursor = None
                    while True:
                        tools = await session.list_tools(cursor=cursor)
                        if any(tool.name == "web_search" for tool in tools.tools):
                            break
                        cursor = tools.nextCursor
                        if not cursor:
                            raise ValueError("Parallel MCP does not expose web_search")
                    result = await session.call_tool(
                        "web_search", {"objective": objective, "search_queries": [query]}
                    )
                    if result.isError:
                        message = " ".join(
                            item.text for item in result.content if item.type == "text"
                        )
                        raise ValueError(f"Parallel search failed: {message[:1000]}")
                    payload: Any = result.structuredContent
                    if payload is None:
                        text = next(
                            (item.text for item in result.content if item.type == "text"), None
                        )
                        if text is None:
                            raise ValueError("Parallel search returned no result payload")
                        payload = json.loads(text)
                    output = ParallelSearchNodeOutput.model_validate(payload)

        output.truncated = len(output.results) > self.config.max_results
        output.results = output.results[: self.config.max_results]
        for item in output.results:
            remaining = self.config.max_characters
            excerpts = []
            for excerpt in item.excerpts:
                if len(excerpt) > remaining:
                    output.truncated = True
                if remaining:
                    excerpts.append(excerpt[:remaining])
                    remaining -= len(excerpts[-1])
            item.excerpts = excerpts
        return output
