import asyncio
import atexit
import hashlib
import json
import os
import random
from collections import deque
from typing import Optional

import attrs
import redis.asyncio as redis
from tqdm.asyncio import tqdm_asyncio


def get_digest(data):
    """
    Compute MD5 digest of the JSON-serialized data.
    """
    return hashlib.md5(json.dumps(data).encode()).hexdigest()


def cache_key(input_data, func_key):
    """
    Generate a cache key by concatenating the function key with the MD5 hash of the input data.
    """
    return f"{func_key}:{get_digest(input_data)}"


def get_client_reader(reader_port: int, writer_port: int):
    """
    Get Redis client instances for reader and writer.

    If the reader and writer ports are the same, return the same client for both.
    """
    if reader_port == writer_port:
        redis_client = redis.Redis(host="localhost", port=reader_port)
        return redis_client, redis_client
    else:
        redis_writer = redis.Redis(host="localhost", port=writer_port)
        redis_reader = redis.Redis(host="localhost", port=reader_port)
        return redis_writer, redis_reader


def get_default_port():
    """
    Get the default Redis reader port from environment variables or use 6377.
    """
    return int(os.environ.get("REDIS_READER_PORT", 6377))


def get_event_loop():
    """
    Get the current event loop or create a new one if it doesn't exist.
    """
    try:
        return asyncio.get_event_loop()
    except RuntimeError:
        return asyncio.new_event_loop()


@attrs.define
class RedisWrapper:
    """
    A wrapper class for Redis operations with batching capabilities.

    Usage:
    # Connect to the remote server Redis instance with
    ssh -i ~/.ssh/rr_dev.pem exx@64.255.46.66 -fNT -L 6377:localhost:6377

    # Set up a local read replica with
    redis-server --port 6380 --slaveof 0.0.0.0 6377
    """

    port: int = attrs.field(default=get_default_port())
    batch_size: int = attrs.field(default=2000)
    batch_time: float = attrs.field(default=0.2)
    queue: deque = attrs.field(init=False, factory=deque)
    client: redis.Redis = attrs.field(init=False)
    loop: asyncio.AbstractEventLoop = attrs.field(init=False)
    has_items: asyncio.Event = attrs.field(init=False, factory=asyncio.Event)
    lock: asyncio.Lock = attrs.field(init=False, factory=asyncio.Lock)
    maximum_run_per_pipeline: int = 256  # Max commands per pipeline execution

    def __attrs_post_init__(self):
        """
        Post-initialization to set up Redis client and event loop.
        """
        self.client = redis.Redis(port=self.port)
        self.loop = get_event_loop()

    @classmethod
    def singleton(cls, port: Optional[int] = None):
        """
        Get a singleton instance of RedisWrapper.
        """
        if not hasattr(cls, "_instance"):
            if port is None:
                port = get_default_port()
            cls._instance = cls(port=port)
        return cls._instance

    async def enqueue(self, operation, *args):
        """
        Enqueue a Redis operation to be executed.

        Args:
            operation (str): The Redis operation (e.g., 'GET', 'SET').
            *args: Arguments for the Redis operation.

        Returns:
            The result of the Redis operation.
        """
        future = self.loop.create_future()
        self.queue.append((operation, args, future))

        async with self.lock:
            if future.done():
                return future.result()
            await self.flush()

        assert future.done()
        return future.result()

    async def read(self, key_str, converter=None):
        """
        Asynchronously read a value from Redis.

        Args:
            key_str (str): The key to read.
            converter (callable, optional): A function to convert the value.

        Returns:
            The value from Redis, converted if a converter is provided.
        """
        key = f"json_{key_str}"
        value = await self.enqueue("GET", key)
        if value:
            value = value.decode("utf-8")
            if converter:
                return converter(value)
            else:
                return json.loads(value)
        else:
            return None

    async def lrange(self, idx, start, end):
        """
        Get a range of elements from a Redis list.

        Args:
            idx (str): Index identifier for the list.
            start (int): Starting index.
            end (int): Ending index.

        Returns:
            A list of elements from the Redis list.
        """
        key = f"list_{idx}"
        values = await self.enqueue("LRANGE", key, start, end)
        return [json.loads(value) for value in values] if values else []

    async def rpush(self, idx, *values):
        """
        Append values to the end of a Redis list.

        Args:
            idx (str): Index identifier for the list.
            *values: Values to append.
        """
        key = f"list_{idx}"
        json_values = [json.dumps(value) for value in values]
        await self.enqueue("RPUSH", key, *json_values)

    async def write(self, key_str, value):
        """
        Asynchronously write a value to Redis.

        Args:
            key_str (str): The key to write.
            value: The value to write.
        """
        key = f"json_{key_str}"
        return await self.enqueue("MSET", {key: json.dumps(value)})

    async def clear(self, idx):
        """
        Clear a Redis list.

        Args:
            idx (str): Index identifier for the list.
        """
        key = f"list_{idx}"
        await self.enqueue("DELETE", key)

    async def flush(self):
        """
        Flush the queued Redis operations using a pipeline.
        """
        if not self.queue:
            return

        pipeline = self.client.pipeline()
        futures = []
        mset_futures = []
        mset_dict = {}

        # Collect operations up to maximum_run_per_pipeline
        while self.queue and len(futures) < self.maximum_run_per_pipeline:
            operation, args, future = self.queue.popleft()
            if operation == "MSET":
                mset_futures.append(future)
                (arg_dict,) = args
                mset_dict.update(arg_dict)
            else:
                getattr(pipeline, operation.lower())(*args)
                futures.append(future)

        if mset_dict:
            pipeline.mset(mset_dict)

        results = await pipeline.execute()
        assert len(results) == len(futures) + (1 if mset_dict else 0)

        # Handle MSET results
        if mset_dict:
            mset_result = results[-1]
            results = results[:-1]
            for future in mset_futures:
                future.set_result(mset_result)

        # Set results for other operations
        for future, result in zip(futures, results):
            future.set_result(result)


async def test_all_funcs(i):
    """
    Test all RedisWrapper functions.

    Args:
        i (int): Test identifier.
    """
    client = RedisWrapper.singleton()

    await asyncio.sleep(random.random())

    # Test read/write operations
    key = f"readwrite_{i}"
    write_read_val = {"hello": f"world_{i}"}
    await client.write(key, write_read_val)
    read_val = await client.read(key)
    assert read_val == write_read_val, f"read_val: {read_val}, write_read_val: {write_read_val}"

    await asyncio.sleep(random.random())

    # Test rpush and lrange
    key = f"rpushlrange_{i}"
    await client.rpush(key, "one", "two", "three")
    lrange_result = await client.lrange(key, 0, -1)
    assert set(lrange_result) == {"one", "two", "three"}
    print(f"Test {i} passed!")


async def run_big_tests():
    """
    Run a large number of tests concurrently.
    """
    await tqdm_asyncio.gather(*[test_all_funcs(i) for i in range(50000)])


if __name__ == "__main__":
    asyncio.run(run_big_tests())
