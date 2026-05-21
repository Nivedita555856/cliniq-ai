# check_embeddings.py
from pymilvus import connections, Collection, utility
import numpy as np

print("="*50)
print("CHECKING IMAGE EMBEDDINGS")
print("="*50)

connections.connect(host='localhost', port='19530')

# Check your collections
collections = utility.list_collections()
print(f"Collections found: {collections}\n")

for col_name in collections:
    collection = Collection(col_name)
    collection.load()
    
    print(f"Collection: {col_name}")
    print(f"  Total records: {collection.num_entities}")
    
    # Check image embeddings - use correct field name
    sample = collection.query(
        expr="modality == 'multimodal'",
        limit=5,
        output_fields=["patient_id", "image_embedding"]
    )
    
    if len(sample) == 0:
        # Try checking any record for image_embedding
        sample = collection.query(
            expr="id >= 0",
            limit=5,
            output_fields=["image_embedding"]
        )
    
    valid = 0
    for r in sample:
        emb = r.get('image_embedding')
        if emb and len(emb) > 0 and np.sum(np.abs(emb)) > 0:
            valid += 1
    
    print(f"  Valid image embeddings: {valid}/{len(sample)}")
    
    if valid > 0:
        print("   IMAGE EMBEDDINGS ARE WORKING!\n")
    else:
        print("   Image embeddings are still ZEROS\n") 
        