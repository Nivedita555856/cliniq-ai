# check_milvus_data.py
# Complete verification of data stored in Milvus

from pymilvus import connections, Collection, utility
import numpy as np
import pandas as pd

print("="*70)
print("MILVUS DATA VERIFICATION")
print("="*70)

# ============================================
# 1. CONNECT TO MILVUS
# ============================================

print("\n[1] Connecting to Milvus...")

try:
    connections.connect(host='localhost', port='19530')
    print(" Connected to Milvus successfully")
except Exception as e:
    print(f" Cannot connect to Milvus: {e}")
    exit(1)

# ============================================
# 2. LIST ALL COLLECTIONS
# ============================================

print("\n[2] Listing all collections...")

collections = utility.list_collections()
print(f"Collections found: {collections}")

if len(collections) == 0:
    print(" No collections found in Milvus")
    exit(1)

# ============================================
# 3. CHECK EACH COLLECTION
# ============================================

for col_name in collections:
    print(f"\n{'='*60}")
    print(f" Collection: {col_name}")
    print(f"{'='*60}")
    
    collection = Collection(col_name)
    collection.load()
    
    # Get entity count
    count = collection.num_entities
    print(f" Total entities: {count}")
    
    if count == 0:
        print("️ Collection is empty")
        continue
    
    # Get schema
    schema = collection.schema
    field_names = [f.name for f in schema.fields]
    print(f" Schema fields: {field_names}")
    
    # ============================================
    # 4. SAMPLE RECORDS
    # ============================================
    
    print("\n Sample records (first 3):")
    results = collection.query(
        expr="id >= 0",
        limit=3,
        output_fields=["*"]
    )
    
    for i, r in enumerate(results):
        print(f"\n  Record {i+1}:")
        for key, value in r.items():
            if 'embedding' in key.lower():
                if value and len(value) > 0:
                    print(f"    {key}: shape {len(value)} dims, first 3 values: {value[:3]}...")
                else:
                    print(f"    {key}: None or empty")
            elif key == 'narrative' and value and len(str(value)) > 100:
                print(f"    {key}: {str(value)[:100]}...")
            else:
                print(f"    {key}: {value}")
    
    # ============================================
    # 5. EMBEDDING QUALITY CHECK
    # ============================================
    
    print("\n Embedding Quality Check:")
    
    # Find embedding fields
    text_field = None
    image_field = None
    
    for f in field_names:
        if 'text_embedding' in f.lower():
            text_field = f
        if 'image_embedding' in f.lower():
            image_field = f
    
    # Check text embeddings
    if text_field:
        sample = collection.query(
            expr="id >= 0",
            limit=10,
            output_fields=[text_field]
        )
        
        valid_count = 0
        zero_count = 0
        for r in sample:
            emb = r.get(text_field)
            if emb:
                if np.sum(np.abs(emb)) > 0:
                    valid_count += 1
                else:
                    zero_count += 1
        
        print(f"   Text embeddings ({text_field}):")
        print(f"     - Valid (non-zero): {valid_count}/{len(sample)}")
        print(f"     - Zero vectors: {zero_count}/{len(sample)}")
        
        if valid_count > 0:
            print(f"      Text embeddings are WORKING")
        else:
            print(f"      Text embeddings are ZEROS")
    
    # Check image embeddings
    if image_field:
        sample = collection.query(
            expr="id >= 0",
            limit=10,
            output_fields=[image_field]
        )
        
        valid_count = 0
        zero_count = 0
        for r in sample:
            emb = r.get(image_field)
            if emb:
                if np.sum(np.abs(emb)) > 0:
                    valid_count += 1
                else:
                    zero_count += 1
        
        print(f"  ️ Image embeddings ({image_field}):")
        print(f"     - Valid (non-zero): {valid_count}/{len(sample)}")
        print(f"     - Zero vectors: {zero_count}/{len(sample)}")
        
        if valid_count > 0:
            print(f"      Image embeddings are WORKING")
        else:
            print(f"      Image embeddings are ZEROS")
    
    # ============================================
    # 6. REPORT TYPE BREAKDOWN
    # ============================================
    
    if 'report_type' in field_names:
        print("\n Report Type Breakdown:")
        results = collection.query(
            expr="id >= 0",
            limit=count,
            output_fields=["report_type"]
        )
        
        type_counts = {}
        for r in results:
            rtype = r.get('report_type', 'unknown')
            type_counts[rtype] = type_counts.get(rtype, 0) + 1
        
        for rtype, cnt in type_counts.items():
            print(f"  - {rtype.upper()}: {cnt}")
    
    # ============================================
    # 7. RISK LEVEL BREAKDOWN (if exists)
    # ============================================
    
    if 'risk_level' in field_names:
        print("\n️ Risk Level Breakdown:")
        results = collection.query(
            expr="id >= 0",
            limit=count,
            output_fields=["risk_level"]
        )
        
        risk_counts = {}
        for r in results:
            risk = r.get('risk_level', 'unknown')
            risk_counts[risk] = risk_counts.get(risk, 0) + 1
        
        for risk, cnt in risk_counts.items():
            print(f"  - {risk}: {cnt}")
    
    # ============================================
    # 8. CONSULTATION BREAKDOWN (if exists)
    # ============================================
    
    if 'consultation' in field_names or 'consultation_required' in field_names:
        consult_field = 'consultation' if 'consultation' in field_names else 'consultation_required'
        print("\n Doctor Consultation Required:")
        results = collection.query(
            expr="id >= 0",
            limit=count,
            output_fields=[consult_field]
        )
        
        consult_counts = {}
        for r in results:
            consult = r.get(consult_field, 'unknown')
            consult_counts[consult] = consult_counts.get(consult, 0) + 1
        
        for consult, cnt in consult_counts.items():
            print(f"  - {consult}: {cnt}")

# ============================================
# 9. FINAL SUMMARY
# ============================================

print("\n" + "="*70)
print(" VERIFICATION COMPLETE!")
print("="*70)

# Show which collection to use
print("\n RECOMMENDED COLLECTION FOR APP:")
for col in collections:
    if 'complete' in col or 'v2' in col:
        print(f"    Use: '{col}' (latest with image embeddings)")
        break
else:
    if len(collections) > 0:
        print(f"   Use: '{collections[0]}'")

print("\n" + "="*70)