"""Exercise the normal node loader/caller against a portable MCP wire fixture."""

import asyncio
import json

import httpx
import pytest
from jinja2 import UndefinedError

from pyspur.nodes.factory import NodeFactory
from pyspur.nodes.node_types import get_all_node_types
from pyspur.nodes.search.parallel import search


class ResponseStream(httpx.AsyncByteStream):
    def __init__(self, payload):
        self.payload = payload

    async def __aiter__(self):
        data = json.dumps(self.payload).encode()
        for start in range(0, len(data), 4096):
            yield data[start : start + 4096]


@pytest.fixture
def mcp_wire(monkeypatch):
    calls = []
    behavior = {"payload": {"results": [{"url": "https://example.com", "excerpts": ["source"]}]}}

    async def handle(request):
        assert str(request.url) == search.ENDPOINT
        assert request.headers["accept-encoding"] == "identity"
        assert "authorization" not in request.headers
        assert "x-api-key" not in request.headers
        assert request.headers["user-agent"].startswith("pyspur")
        assert "python-httpx/0.27.2" in request.headers["user-agent"]
        if request.method == "GET":
            return httpx.Response(405)
        body = json.loads(request.content)
        calls.append(body)
        method = body["method"]
        if method == "notifications/initialized":
            return httpx.Response(202)
        if method == "initialize":
            result = {
                "protocolVersion": "2025-06-18",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "test", "version": "1"},
            }
        elif method == "tools/list":
            if behavior.get("paginate") and not body.get("params", {}).get("cursor"):
                result = {"tools": [], "nextCursor": "next"}
            else:
                result = {
                    "tools": [
                        {
                            "name": "web_search",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "objective": {"type": "string"},
                                    "search_queries": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                },
                                "required": ["objective", "search_queries"],
                            },
                        }
                    ]
                }
        else:
            assert method == "tools/call"
            if behavior.get("delay"):
                await asyncio.sleep(60)
            if behavior.get("http_error"):
                return httpx.Response(429)
            if behavior.get("rpc_error"):
                envelope = {
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "error": {"code": -32603, "message": "quota exceeded"},
                }
                return httpx.Response(
                    200,
                    headers={"content-type": "application/json"},
                    stream=ResponseStream(envelope),
                )
            result = {"content": [{"type": "text", "text": json.dumps(behavior["payload"])}]}
            if behavior.get("structured"):
                result["structuredContent"] = behavior["payload"]
                result["content"] = [{"type": "text", "text": "unused duplicate representation"}]
            if behavior.get("tool_error"):
                result["isError"] = True
        return httpx.Response(
            200,
            headers={"content-type": "application/json"},
            stream=ResponseStream({"jsonrpc": "2.0", "id": body["id"], "result": result}),
        )

    client_class = httpx.AsyncClient

    def client(**kwargs):
        return client_class(transport=httpx.MockTransport(handle), **kwargs)

    monkeypatch.setattr(search.httpx, "AsyncClient", client)
    return calls, behavior


def node(**config):
    return NodeFactory.create_node("parallel_search", "ParallelSearchNode", config)


def error_text(error):
    children = getattr(error, "exceptions", [])
    return str(error) + " ".join(error_text(child) for child in children)


def test_selection_templates_results_and_limits(mcp_wire):
    calls, behavior = mcp_wire
    behavior.update(
        paginate=True,
        structured=True,
        payload={
            "results": [
                {
                    "url": "https://example.com",
                    "title": "Evidence",
                    "publish_date": "2026-01-01",
                    "excerpts": ["first", "second"],
                },
                {"url": "https://example.org", "excerpts": ["another source"]},
            ],
            "warnings": [{"type": "notice", "message": "service warning", "detail": None}],
            "session_id": "returned-session",
        },
    )
    types = get_all_node_types()["Search"]
    assert [item.node_type_name for item in types] == ["ExaSearchNode", "ParallelSearchNode"]
    assert calls == []  # Listing the option does not send a search.
    output = asyncio.run(
        node(
            query_template="{{upstream.query}}",
            objective_template="Find {{upstream.query}}",
            max_results=1,
            max_characters=7,
        )({"upstream": {"query": "official documentation"}})
    )
    assert output.results[0].model_dump() == {
        "url": "https://example.com",
        "title": "Evidence",
        "publish_date": "2026-01-01",
        "excerpts": ["first", "se"],
    }
    assert output.truncated
    assert output.warnings == [{"type": "notice", "message": "service warning", "detail": None}]
    assert output.session_id == "returned-session"
    invocation = next(call for call in calls if call["method"] == "tools/call")
    assert invocation["params"] == {
        "name": "web_search",
        "arguments": {
            "objective": "Find official documentation",
            "search_queries": ["official documentation"],
        },
    }
    assert sum(call["method"] == "tools/list" for call in calls) == 2


def test_agent_tool_and_empty_success(mcp_wire):
    _, behavior = mcp_wire
    behavior["payload"] = {"results": []}
    output = asyncio.run(node().call_as_tool({"query_template": "official documentation"}))
    assert output.results == []
    assert not output.truncated


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"http_error": True}, "429"),
        ({"rpc_error": True}, "quota exceeded"),
        ({"tool_error": True}, "Parallel search failed"),
        ({"payload": {"unexpected": []}}, "validation error"),
        ({"payload": {"results": [{"url": "https://example.com"}]}}, "validation error"),
        ({"payload": {"results": [], "warnings": ["x" * 1_000_000]}}, "1 MB limit"),
    ],
)
def test_errors_remain_failures(mcp_wire, change, message):
    _, behavior = mcp_wire
    behavior.update(change)
    with pytest.raises(Exception) as caught:
        asyncio.run(node(query_template="documentation")({"input_1": "documentation"}))
    assert message in error_text(caught.value)


@pytest.mark.parametrize("query", ["   ", "x" * 201, "{{missing}}"])
def test_invalid_input_sends_nothing(mcp_wire, query):
    calls, _ = mcp_wire
    with pytest.raises((ValueError, UndefinedError)):
        asyncio.run(node(query_template=query)({"input_1": "documentation"}))
    assert calls == []


def test_timeout_and_cancellation(mcp_wire):
    _, behavior = mcp_wire
    behavior["delay"] = True
    with pytest.raises(TimeoutError):
        asyncio.run(node(query_template="documentation", timeout_seconds=0.05)({"input_1": "d"}))

    async def cancel():
        task = asyncio.create_task(node(query_template="documentation")({"input_1": "d"}))
        await asyncio.sleep(0.02)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(cancel())
