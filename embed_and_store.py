# embed_and_store.py
# Medical Report Analyzer - Complete Embedding Solution with Image Fix

import os
import pandas as pd
import numpy as np
from tqdm import tqdm
from PIL import Image
from sentence_transformers import SentenceTransformer
import torch
import torchvision.transforms as transforms
import torchvision.models as models
from pymilvus import connections, Collection, CollectionSchema, FieldSchema, DataType, utility
import warnings
warnings.filterwarnings('ignore')
from dotenv import load_dotenv
load_dotenv()

print("="*70)
print("CLINIQ AI — EMBED & STORE (BioBERT + ResNet50 → Milvus / Zilliz Cloud)")
print("="*70)

# ============================================
# CONFIGURATION  (all from environment)
# ============================================

BASE_DIR            = "./data"
DATA_PATH           = f"{BASE_DIR}/processed/all_multimodal_data.csv"
IMAGES_PATH         = f"{BASE_DIR}/images"
COLLECTION_NAME     = os.getenv("MILVUS_COLLECTION", "medical_reports_final")
TEXT_MODEL          = os.getenv("TEXT_MODEL", "dmis-lab/biobert-v1.1")
TEXT_EMBEDDING_DIM  = 768
IMAGE_EMBEDDING_DIM = 2048
BATCH_SIZE          = int(os.getenv("BATCH_SIZE", "100"))

# ── Milvus connection (local or Zilliz Cloud) ──────────────────────────────
ZILLIZ_URI   = os.getenv("ZILLIZ_CLOUD_URI",   "")
ZILLIZ_TOKEN = os.getenv("ZILLIZ_CLOUD_TOKEN", "")
MILVUS_HOST  = os.getenv("MILVUS_HOST", "localhost")
MILVUS_PORT  = os.getenv("MILVUS_PORT", "19530")

def connect_milvus():
    if ZILLIZ_URI and ZILLIZ_TOKEN:
        print(f"  Connecting to Zilliz Cloud: {ZILLIZ_URI}")
        connections.connect("default", uri=ZILLIZ_URI, token=ZILLIZ_TOKEN)
    else:
        print(f"  Connecting to local Milvus {MILVUS_HOST}:{MILVUS_PORT}")
        connections.connect("default", host=MILVUS_HOST, port=MILVUS_PORT)
    print("   Connected")

# ============================================
# STEP 1: LOAD DATA
# ============================================

print("\n[1/6] Loading data...")

if not os.path.exists(DATA_PATH):
    print(f"ERROR: Data file not found at {DATA_PATH}")
    print("Please run data_collection.py first")
    exit(1)

data = pd.read_csv(DATA_PATH)
print(f"Loaded {len(data)} records")

# ============================================
# STEP 2: FIX IMAGE PATHS - CRITICAL FIX
# ============================================

print("\n[2/6] Fixing image paths...")

# First, check what images actually exist
if not os.path.exists(IMAGES_PATH):
    os.makedirs(IMAGES_PATH, exist_ok=True)
    print(f"Created images directory: {IMAGES_PATH}")

existing_images = os.listdir(IMAGES_PATH) if os.path.exists(IMAGES_PATH) else []
print(f"Found {len(existing_images)} existing images in {IMAGES_PATH}")

# Create a mapping from index to image file
image_index_map = {}
for img_file in existing_images:
    if img_file.endswith('.png'):
        # Extract number from filename like xr_000000.png or xr_0.png
        try:
            if 'xr_' in img_file:
                num_str = img_file.replace('xr_', '').replace('.png', '')
                # Handle both formats: xr_000000.png and xr_0.png
                if '_' in num_str:
                    num_str = num_str.split('_')[0]
                img_num = int(num_str)
                image_index_map[img_num] = img_file
        except:
            pass

print(f"Mapped {len(image_index_map)} images by index")

# Now fix image paths in the dataframe
fixed_count = 0
image_paths_list = []

for idx, row in data.iterrows():
    if row['type'] == 'chestxray':
        # Try to find matching image by index
        img_file = None
        
        # Try different index formats
        for try_idx in [idx, idx % 500, idx // 1]:
            if try_idx in image_index_map:
                img_file = image_index_map[try_idx]
                break
        
        # Also try by study_id if available
        if not img_file and 'study_id' in data.columns:
            study_id = row.get('study_id', '')
            for img_file_name in existing_images:
                if study_id in img_file_name:
                    img_file = img_file_name
                    break
        
        if img_file:
            img_path = os.path.join(IMAGES_PATH, img_file)
            if os.path.exists(img_path):
                image_paths_list.append(img_path)
                fixed_count += 1
            else:
                image_paths_list.append("")
        else:
            # Last resort: try to generate image name
            img_path = os.path.join(IMAGES_PATH, f"xr_{idx:06d}.png")
            if os.path.exists(img_path):
                image_paths_list.append(img_path)
                fixed_count += 1
            else:
                image_paths_list.append("")
    else:
        image_paths_list.append("")

# Update dataframe
data['image_path'] = image_paths_list
print(f"Fixed {fixed_count} image paths out of {len(data[data['type'] == 'chestxray'])} chest X-rays")

# Show sample of fixed paths
sample_fixed = data[data['image_path'] != ''][['id', 'image_path']].head(3)
if len(sample_fixed) > 0:
    print("\nSample fixed image paths:")
    for _, row in sample_fixed.iterrows():
        print(f"  {row['id']} -> {row['image_path']}")

# Save fixed CSV
data.to_csv(DATA_PATH, index=False)
print(f"Saved fixed CSV with {fixed_count} valid image paths")

# ============================================
# STEP 3: GENERATE TEXT EMBEDDINGS (BioBERT)
# ============================================

print("\n[3/6] Generating text embeddings with BioBERT...")

try:
    text_model = SentenceTransformer(TEXT_MODEL)
    print("BioBERT model loaded successfully")
except Exception as e:
    print(f"Error loading BioBERT: {e}")
    exit(1)

narratives = data['narrative'].fillna('').tolist()
text_embeddings = text_model.encode(narratives, show_progress_bar=True, convert_to_numpy=True)
print(f"Text embeddings shape: {text_embeddings.shape}")

# ============================================
# STEP 4: GENERATE IMAGE EMBEDDINGS (ResNet50)
# ============================================

print("\n[4/6] Generating image embeddings with ResNet50...")

class ResNetImageEmbedder:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {self.device}")
        
        self.model = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V1)
        self.model = torch.nn.Sequential(*list(self.model.children())[:-1])
        self.model.to(self.device)
        self.model.eval()
        
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        print("ResNet50 model ready")
    
    def embed_single(self, image_path):
        try:
            if not image_path or not os.path.exists(image_path):
                return np.zeros(IMAGE_EMBEDDING_DIM)
            
            image = Image.open(image_path).convert("RGB")
            tensor = self.transform(image).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                embedding = self.model(tensor)
                embedding = embedding.squeeze().cpu().numpy()
                if np.linalg.norm(embedding) > 0:
                    embedding = embedding / np.linalg.norm(embedding)
            return embedding
        except Exception as e:
            return np.zeros(IMAGE_EMBEDDING_DIM)
    
    def embed_batch(self, image_paths):
        embeddings = []
        for img_path in tqdm(image_paths, desc="Embedding images"):
            embeddings.append(self.embed_single(img_path))
        return np.array(embeddings)

image_embedder = ResNetImageEmbedder()

# Get all image paths
all_image_paths = data['image_path'].tolist()
valid_images = [p for p in all_image_paths if p and os.path.exists(p)]
print(f"Found {len(valid_images)} valid images to embed out of {len(data[data['type'] == 'chestxray'])} chest X-rays")

# Generate image embeddings
image_embeddings = image_embedder.embed_batch(all_image_paths)
print(f"Image embeddings shape: {image_embeddings.shape}")
valid_embeddings = np.sum(np.linalg.norm(image_embeddings, axis=1) > 0)
print(f"Valid image embeddings: {valid_embeddings} out of {len(image_embeddings)}")

# ============================================
# STEP 5: CONNECT TO MILVUS
# ============================================

print("\n[5/6] Connecting to Milvus...")

try:
    connect_milvus()
except Exception as e:
    print(f"ERROR: Cannot connect to Milvus/Zilliz: {e}")
    exit(1)

# ============================================
# STEP 6: CREATE NEW COLLECTION
# ============================================

print("\n[6/6] Creating new Milvus collection...")

if utility.has_collection(COLLECTION_NAME):
    utility.drop_collection(COLLECTION_NAME)
    print(f"Dropped existing collection: {COLLECTION_NAME}")

fields = [
    FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
    FieldSchema(name="patient_id", dtype=DataType.VARCHAR, max_length=100),
    FieldSchema(name="report_type", dtype=DataType.VARCHAR, max_length=50),
    FieldSchema(name="modality", dtype=DataType.VARCHAR, max_length=50),
    FieldSchema(name="narrative", dtype=DataType.VARCHAR, max_length=10000),
    FieldSchema(name="risk_level", dtype=DataType.VARCHAR, max_length=50),
    FieldSchema(name="consultation", dtype=DataType.VARCHAR, max_length=50),
    FieldSchema(name="image_path", dtype=DataType.VARCHAR, max_length=500),
    FieldSchema(name="text_embedding", dtype=DataType.FLOAT_VECTOR, dim=TEXT_EMBEDDING_DIM),
    FieldSchema(name="image_embedding", dtype=DataType.FLOAT_VECTOR, dim=IMAGE_EMBEDDING_DIM),
]

schema = CollectionSchema(fields)
collection = Collection(COLLECTION_NAME, schema)

text_index = {"metric_type": "COSINE", "index_type": "IVF_FLAT", "params": {"nlist": 128}}
collection.create_index("text_embedding", text_index)

image_index = {"metric_type": "COSINE", "index_type": "IVF_FLAT", "params": {"nlist": 128}}
collection.create_index("image_embedding", image_index)

print(f"Created collection '{COLLECTION_NAME}'")

# ============================================
# STEP 7: INSERT DATA
# ============================================

print("\n[7/7] Inserting data into Milvus...")

patient_ids = data['id'].astype(str).tolist()
report_types = data['type'].astype(str).tolist()
modalities = data['modality'].fillna('text_only').astype(str).tolist()
narratives_list = data['narrative'].fillna('').astype(str).tolist()
risk_levels = data['risk_level'].fillna('Not assessed').astype(str).tolist()
consultations = data['consultation_required'].fillna('Monitor').astype(str).tolist()
image_paths_list = data['image_path'].fillna('').astype(str).tolist()

total_inserted = 0
batch_size = 100

for i in range(0, len(patient_ids), batch_size):
    end_idx = min(i + batch_size, len(patient_ids))
    
    insert_data = [
        patient_ids[i:end_idx],
        report_types[i:end_idx],
        modalities[i:end_idx],
        narratives_list[i:end_idx],
        risk_levels[i:end_idx],
        consultations[i:end_idx],
        image_paths_list[i:end_idx],
        text_embeddings[i:end_idx].tolist(),
        image_embeddings[i:end_idx].tolist()
    ]
    
    collection.insert(insert_data)
    total_inserted += (end_idx - i)
    print(f"  Inserted {total_inserted}/{len(patient_ids)} records")

collection.flush()
print(f"Successfully inserted {total_inserted} records")

# ============================================
# VERIFICATION
# ============================================

print("\n" + "="*70)
print("VERIFICATION")
print("="*70)

collection.load()
print(f"Total records in Milvus: {collection.num_entities}")

# Check text search
print("\n[TEST] Text Search...")
test_query = "patient with low hemoglobin and fever"
test_embedding = text_model.encode([test_query])

search_params = {"metric_type": "COSINE", "params": {"nprobe": 10}}
text_results = collection.search(
    data=test_embedding.tolist(),
    anns_field="text_embedding",
    param=search_params,
    limit=3,
    output_fields=["report_type", "risk_level"]
)

print(f"Query: '{test_query}'")
for i, hit in enumerate(text_results[0]):
    print(f"  {i+1}. {hit.entity.get('report_type')} - Score: {hit.score:.4f}")

# Check image embeddings
print("\n[TEST] Image Embeddings Verification...")
sample = collection.query(
    expr="modality == 'multimodal'",
    limit=5,
    output_fields=["patient_id", "image_path", "image_embedding"]
)

valid_count = 0
for r in sample:
    img_emb = r.get('image_embedding')
    if img_emb and np.sum(np.abs(img_emb)) > 0:
        valid_count += 1
        print(f"   {r.get('patient_id')}: Valid image embedding")
    else:
        print(f"   {r.get('patient_id')}: Zero embedding - Image path: {r.get('image_path')}")

print(f"\nValid image embeddings: {valid_count}/{len(sample)}")

# ============================================
# FINAL SUMMARY
# ============================================

print("\n" + "="*70)
print("EMBED & STORE COMPLETE!")
print("="*70)
backend = "Zilliz Cloud" if (ZILLIZ_URI and ZILLIZ_TOKEN) else f"Local Milvus ({MILVUS_HOST}:{MILVUS_PORT})"
print(f"  Collection : {COLLECTION_NAME}")
print(f"  Backend    : {backend}")
print(f"  Text model : {TEXT_MODEL} (768-dim)")
print(f"  Image model: ResNet50 (2048-dim)")
print("\nYou can now start the API:  uvicorn api:app --reload --port 8000")
print("="*70)
