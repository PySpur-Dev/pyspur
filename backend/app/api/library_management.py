from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from datetime import datetime, timezone

from ..database import get_db
from ..models.library_model import LibraryItem, LibraryCollection, LibraryTag, LibraryItemVersion
from ..schemas.library_schemas import (
    LibraryItemCreateSchema,
    LibraryItemUpdateSchema,
    LibraryItemResponseSchema,
    CollectionCreateSchema,
    CollectionResponseSchema,
    TagSchema,
    LibrarySearchParams,
)

router = APIRouter()

# Collection endpoints
@router.post("/collections/", response_model=CollectionResponseSchema)
def create_collection(
    collection: CollectionCreateSchema,
    db: Session = Depends(get_db)
) -> CollectionResponseSchema:
    if collection.parent_id:
        parent = db.query(LibraryCollection).filter(LibraryCollection.id == collection.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent collection not found")

    new_collection = LibraryCollection(**collection.model_dump())
    db.add(new_collection)
    db.commit()
    db.refresh(new_collection)
    return new_collection

@router.get("/collections/", response_model=List[CollectionResponseSchema])
def list_collections(
    db: Session = Depends(get_db)
) -> List[CollectionResponseSchema]:
    return db.query(LibraryCollection).all()

@router.get("/collections/{collection_id}", response_model=CollectionResponseSchema)
def get_collection(
    collection_id: str,
    db: Session = Depends(get_db)
) -> CollectionResponseSchema:
    collection = db.query(LibraryCollection).filter(LibraryCollection.id == collection_id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    return collection

# Tag endpoints
@router.post("/tags/", response_model=TagSchema)
def create_tag(
    name: str,
    db: Session = Depends(get_db)
) -> TagSchema:
    existing = db.query(LibraryTag).filter(LibraryTag.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")

    tag = LibraryTag(name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag

@router.get("/tags/", response_model=List[TagSchema])
def list_tags(
    db: Session = Depends(get_db)
) -> List[TagSchema]:
    return db.query(LibraryTag).all()

# Library item endpoints
@router.post("/items/", response_model=LibraryItemResponseSchema)
def create_library_item(
    item: LibraryItemCreateSchema,
    db: Session = Depends(get_db)
) -> LibraryItemResponseSchema:
    # Validate collection if provided
    if item.collection_id:
        collection = db.query(LibraryCollection).filter(LibraryCollection.id == item.collection_id).first()
        if not collection:
            raise HTTPException(status_code=404, detail="Collection not found")

    # Validate tags
    tags = []
    for tag_id in item.tag_ids:
        tag = db.query(LibraryTag).filter(LibraryTag.id == tag_id).first()
        if not tag:
            raise HTTPException(status_code=404, detail=f"Tag with id {tag_id} not found")
        tags.append(tag)

    # Create the item
    new_item = LibraryItem(
        name=item.name,
        description=item.description,
        type=item.type,
        content=item.content,
        collection_id=item.collection_id,
        tags=tags
    )

    # Create initial version
    version = LibraryItemVersion(
        version=1,
        content=item.content
    )
    new_item.versions.append(version)

    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.get("/items/", response_model=List[LibraryItemResponseSchema])
def search_library_items(
    params: LibrarySearchParams = Depends(),
    db: Session = Depends(get_db)
) -> List[LibraryItemResponseSchema]:
    query = db.query(LibraryItem)

    # Apply filters
    if params.type:
        query = query.filter(LibraryItem.type == params.type)
    if params.collection_id:
        query = query.filter(LibraryItem.collection_id == params.collection_id)
    if params.tag_ids:
        query = query.filter(LibraryItem.tags.any(LibraryTag.id.in_(params.tag_ids)))
    if params.query:
        query = query.filter(
            or_(
                LibraryItem.name.ilike(f"%{params.query}%"),
                LibraryItem.description.ilike(f"%{params.query}%")
            )
        )

    # Apply pagination
    offset = (params.page - 1) * params.page_size
    query = query.offset(offset).limit(params.page_size)

    return query.all()

@router.get("/items/{item_id}", response_model=LibraryItemResponseSchema)
def get_library_item(
    item_id: str,
    db: Session = Depends(get_db)
) -> LibraryItemResponseSchema:
    item = db.query(LibraryItem).filter(LibraryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")
    return item

@router.put("/items/{item_id}", response_model=LibraryItemResponseSchema)
def update_library_item(
    item_id: str,
    update: LibraryItemUpdateSchema,
    db: Session = Depends(get_db)
) -> LibraryItemResponseSchema:
    item = db.query(LibraryItem).filter(LibraryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")

    # Update basic fields
    update_data = update.model_dump(exclude_unset=True)

    # Handle collection update
    if 'collection_id' in update_data:
        if update_data['collection_id']:
            collection = db.query(LibraryCollection).filter(
                LibraryCollection.id == update_data['collection_id']
            ).first()
            if not collection:
                raise HTTPException(status_code=404, detail="Collection not found")

    # Handle tags update
    if update.tag_ids is not None:
        tags = []
        for tag_id in update.tag_ids:
            tag = db.query(LibraryTag).filter(LibraryTag.id == tag_id).first()
            if not tag:
                raise HTTPException(status_code=404, detail=f"Tag with id {tag_id} not found")
            tags.append(tag)
        item.tags = tags
        del update_data['tag_ids']

    # Handle content update and versioning
    if 'content' in update_data:
        # Create new version
        version = LibraryItemVersion(
            version=len(item.versions) + 1,
            content=update_data['content']
        )
        item.versions.append(version)

    # Update the item
    for key, value in update_data.items():
        setattr(item, key, value)

    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item

@router.delete("/items/{item_id}")
def delete_library_item(
    item_id: str,
    db: Session = Depends(get_db)
):
    item = db.query(LibraryItem).filter(LibraryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Library item not found")

    db.delete(item)
    db.commit()
    return {"status": "success"}