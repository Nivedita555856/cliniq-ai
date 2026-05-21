# fix_all_in_one.py
# Complete fix for image paths - One file does everything

import pandas as pd
import os
import re

print("="*70)
print("COMPLETE IMAGE PATH FIXER")
print("="*70)

# ============================================
# STEP 1: LOAD DATA
# ============================================

print("\n[1/4] Loading data...")
data = pd.read_csv("./data/processed/all_multimodal_data.csv")
print(f"Loaded {len(data)} records")

# Check what values are in the type column
print(f"Unique types in CSV: {data['type'].unique()}")

# ============================================
# STEP 2: CHECK IMAGES
# ============================================

print("\n[2/4] Checking images...")
images = os.listdir("./data/images") if os.path.exists("./data/images") else []
print(f"Found {len(images)} images in ./data/images/")

if len(images) > 0:
    print(f"Sample image names: {images[:5]}")
else:
    print("WARNING: No images found in ./data/images/")
    print("Make sure data_collection.py ran successfully")

# ============================================
# STEP 3: FIX IMAGE PATHS
# ============================================

print("\n[3/4] Fixing image paths...")

# Create a mapping of image indices
image_map = {}
for img in images:
    if img.endswith('.png'):
        # Extract number from filename
        numbers = re.findall(r'\d+', img)
        if numbers:
            img_index = int(numbers[0])
            image_map[img_index] = img

print(f"Created mapping for {len(image_map)} images")

fixed_count = 0
image_paths_list = []

for idx, row in data.iterrows():
    should_have_image = False
    
    # Check if this record should have an image
    if 'type' in data.columns and str(row['type']).lower() in ['chestxray', 'chest_xray', 'xray']:
        should_have_image = True
    if str(row['id']).startswith('XR_'):
        should_have_image = True
    if 'modality' in data.columns and str(row['modality']) == 'multimodal':
        should_have_image = True
    
    if should_have_image:
        # Extract index from ID (e.g., XR_000123 -> 123)
        img_index = None
        if 'XR_' in str(row['id']):
            try:
                img_index = int(str(row['id']).split('_')[1])
            except:
                pass
        
        # Also try using the dataframe index
        if img_index is None:
            img_index = idx
        
        # Find matching image
        if img_index in image_map:
            img_path = f"./data/images/{image_map[img_index]}"
            image_paths_list.append(img_path)
            fixed_count += 1
        else:
            # Try direct path as fallback
            test_path = f"./data/images/xr_{img_index:06d}.png"
            if os.path.exists(test_path):
                image_paths_list.append(test_path)
                fixed_count += 1
            else:
                image_paths_list.append("")
    else:
        image_paths_list.append("")

# Update dataframe
data['image_path'] = image_paths_list
print(f"Fixed {fixed_count} image paths")

# ============================================
# STEP 4: VERIFY
# ============================================

print("\n[4/4] Verifying...")

fixed_records = data[data['image_path'] != '']
print(f"Records with image paths now: {len(fixed_records)}")

if len(fixed_records) > 0:
    print("\nSample fixed paths:")
    for _, row in fixed_records.head(5).iterrows():
        print(f"  {row['id']} -> {row['image_path']}")
        
        # Verify file actually exists
        if os.path.exists(row['image_path']):
            print(f"       File exists")
        else:
            print(f"       File NOT found")
else:
    print("\n No image paths were fixed!")
    print("\nPossible issues:")
    print("  1. Images are in a different folder")
    print("  2. Image naming pattern is different")
    print("  3. CSV type column has different values")
    
    # Show first few rows to debug
    print("\nFirst 5 rows of CSV for debugging:")
    print(data[['id', 'type', 'modality']].head(10))

# ============================================
# SAVE FIXED CSV
# ============================================

data.to_csv("./data/processed/all_multimodal_data.csv", index=False)
print("\n Fixed CSV saved to ./data/processed/all_multimodal_data.csv")

# ============================================
# FINAL SUMMARY
# ============================================

print("\n" + "="*70)
print("SUMMARY")
print("="*70)
print(f"""
Total records: {len(data)}
Records with image paths: {len(fixed_records)}
Images in folder: {len(images)}

Next steps:
1. Run: python embed_and_store.py
2. This will create embeddings with proper image paths
""")