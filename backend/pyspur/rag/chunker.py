import os
import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import BinaryIO, Dict, List, Tuple

import tiktoken
from jinja2 import Template

from .parser import extract_text_from_file
from .schemas.document_schemas import (
    ChunkingConfigSchema,
    DocumentChunkMetadataSchema,
    DocumentChunkSchema,
    DocumentSchema,
)

# Global variables
tokenizer = tiktoken.get_encoding("cl100k_base")  # The encoding scheme to use for tokenization


def apply_template(
    text: str, template: str, metadata_template: Dict[str, str]
) -> Tuple[str, Dict[str, str]]:
    """Apply Jinja template to chunk text and metadata."""
    try:
        # Create template context
        context = {
            "text": text,
            # Add more context variables as needed
        }

        # Process text template
        text_template = Template(template)
        processed_text = text_template.render(**context)

        # Process metadata templates
        processed_metadata: Dict[str, str] = {}
        for key, template_str in metadata_template.items():
            metadata_template_obj = Template(template_str)
            processed_metadata[key] = metadata_template_obj.render(**context)

        return processed_text, processed_metadata
    except Exception as e:
        # Log error and return original text with basic metadata
        print(f"Error applying template: {e}")
        return text, {"type": "text_chunk", "error": str(e)}


def get_text_chunks(text: str, config: ChunkingConfigSchema) -> List[str]:
    """
    Split a text into chunks based on the provided configuration.

    Args:
        text: The text to split into chunks.
        config: ChunkingConfig containing the chunking parameters.

    Returns:
        A list of text chunks.
    """
    if not text or text.isspace():
        return []

    tokens = tokenizer.encode(text, disallowed_special=())
    chunks: List[str] = []
    num_chunks = 0

    while tokens and num_chunks < config.max_num_chunks:
        chunk = tokens[: config.chunk_token_size]
        chunk_text = tokenizer.decode(chunk)

        if not chunk_text or chunk_text.isspace():
            tokens = tokens[len(chunk) :]
            continue

        last_punctuation = max(
            chunk_text.rfind("."),
            chunk_text.rfind("?"),
            chunk_text.rfind("!"),
            chunk_text.rfind("\n"),
        )

        if last_punctuation != -1 and last_punctuation > config.min_chunk_size_chars:
            chunk_text = chunk_text[: last_punctuation + 1]

        chunk_text_to_append = chunk_text.replace("\n", " ").strip()

        if len(chunk_text_to_append) > config.min_chunk_length_to_embed:
            chunks.append(chunk_text_to_append)

        tokens = tokens[len(tokenizer.encode(chunk_text, disallowed_special=())) :]
        num_chunks += 1

    if tokens:
        remaining_text = tokenizer.decode(tokens).replace("\n", " ").strip()
        if len(remaining_text) > config.min_chunk_length_to_embed:
            chunks.append(remaining_text)

    return chunks


def create_document_chunks(
    doc: DocumentSchema, config: ChunkingConfigSchema
) -> Tuple[List[DocumentChunkSchema], str]:
    """
    Create a list of document chunks from a document object.

    Args:
        doc: The document object to create chunks from.
        config: ChunkingConfig containing the chunking parameters.

    Returns:
        A tuple of (doc_chunks, doc_id).
    """
    if not doc.text or doc.text.isspace():
        return [], doc.id or str(uuid.uuid4())

    doc_id = doc.id or str(uuid.uuid4())
    text_chunks = get_text_chunks(doc.text, config)

    metadata = (
        DocumentChunkMetadataSchema(**doc.metadata.model_dump())
        if doc.metadata is not None
        else DocumentChunkMetadataSchema()
    )
    metadata.document_id = doc_id

    doc_chunks: List[DocumentChunkSchema] = []
    for i, text_chunk in enumerate(text_chunks):
        chunk_id = f"{doc_id}_{i}"

        # Apply template if enabled
        if config.template.enabled:
            processed_text, processed_metadata = apply_template(
                text_chunk,
                config.template.template,
                config.template.metadata_template or {},
            )
            # Update metadata with processed metadata
            chunk_metadata = metadata.model_copy()
            chunk_metadata.custom_metadata = processed_metadata
        else:
            processed_text = text_chunk
            chunk_metadata = metadata

        doc_chunk = DocumentChunkSchema(
            id=chunk_id,
            text=processed_text,
            metadata=chunk_metadata,
        )
        doc_chunks.append(doc_chunk)

    return doc_chunks, doc_id


async def preview_document_chunk(
    file: BinaryIO,
    filename: str,
    mime_type: str,
    config: ChunkingConfigSchema,
) -> Tuple[List[Dict[str, str]], int]:
    """
    Preview how a document will be chunked and formatted.

    Args:
        file: The file object to process
        filename: Name of the file
        mime_type: MIME type of the file
        config: Chunking configuration

    Returns:
        Tuple containing:
        - List of preview chunks, each containing original_text, processed_text, and metadata
        - Total number of chunks
    """
    try:
        # Create temporary file
        with NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as temp_file:
            temp_file.write(file.read())
            temp_file.flush()

            # Extract text using document processing logic
            with open(temp_file.name, "rb") as f:
                extracted_text = extract_text_from_file(f, mime_type or "text/plain", None)

            # Clean up temp file
            os.unlink(temp_file.name)

        # Create a temporary Document object to use create_document_chunks
        temp_doc = DocumentSchema(text=extracted_text)
        doc_chunks, _ = create_document_chunks(temp_doc, config)

        if not doc_chunks:
            raise ValueError("No chunks could be generated with the provided configuration")

        # Take up to 3 chunks for preview: beginning, middle, and end
        preview_indices = []
        if len(doc_chunks) == 1:
            preview_indices = [0]
        elif len(doc_chunks) == 2:
            preview_indices = [0, 1]
        else:
            preview_indices = [0, len(doc_chunks) // 2, len(doc_chunks) - 1]

        preview_chunks = []
        for idx in preview_indices:
            chunk = doc_chunks[idx]
            preview_chunks.append(
                {
                    "original_text": chunk.text,  # This will already be processed if template is enabled
                    "processed_text": chunk.text,
                    "metadata": chunk.metadata.custom_metadata
                    if chunk.metadata
                    else {"type": "text_chunk"},
                    "chunk_index": idx + 1,  # 1-based index for display
                }
            )

        return preview_chunks, len(doc_chunks)

    except Exception as e:
        raise ValueError(f"Error previewing chunk: {str(e)}")
