# data_collection.py
# Medical Report Analyzer - COMPLETE DATA COLLECTION (NO EMOJIS)

import os
import pandas as pd
import numpy as np
from tqdm import tqdm
import matplotlib.pyplot as plt
import warnings
warnings.filterwarnings('ignore')

# ============================================
# CREATE DIRECTORIES
# ============================================

BASE_DIR = "./data"

directories = [
    BASE_DIR,
    f"{BASE_DIR}/raw",
    f"{BASE_DIR}/processed",
    f"{BASE_DIR}/images",
    f"{BASE_DIR}/reports",
    f"{BASE_DIR}/metadata",
]

for d in directories:
    os.makedirs(d, exist_ok=True)

print("="*70)
print("MEDICAL REPORT DATA COLLECTION")
print(f"Data directory: {BASE_DIR}")
print("CBC | Thyroid | Chest X-ray (with Images & Risk Levels)")
print("="*70)

# ============================================
# HELPER FUNCTIONS FOR RISK CALCULATION
# ============================================

def calculate_cbc_risk(hemoglobin, wbc, platelets):
    """Calculate risk level based on CBC values"""
    risk_score = 0
    
    if hemoglobin < 10:
        risk_score += 3
    elif hemoglobin < 12:
        risk_score += 2
    elif hemoglobin > 18:
        risk_score += 2
    
    if wbc > 15:
        risk_score += 3
    elif wbc > 11:
        risk_score += 2
    elif wbc < 3:
        risk_score += 2
    
    if platelets > 600:
        risk_score += 2
    elif platelets < 100:
        risk_score += 2
    
    if risk_score >= 5:
        return "HIGH RISK"
    elif risk_score >= 3:
        return "MODERATE RISK"
    elif risk_score >= 1:
        return "LOW TO MODERATE RISK"
    else:
        return "LOW RISK"

def calculate_thyroid_risk(tsh):
    """Calculate risk level based on TSH value"""
    if tsh > 10:
        return "HIGH RISK"
    elif tsh > 4.5:
        return "MODERATE RISK"
    elif tsh < 0.1:
        return "HIGH RISK"
    elif tsh < 0.4:
        return "MODERATE RISK"
    else:
        return "LOW RISK"

def get_consultation_status(risk):
    """Determine if doctor consultation is needed"""
    if risk in ["HIGH RISK", "MODERATE RISK", "MODERATE TO HIGH RISK"]:
        return "YES - Consult Doctor"
    else:
        return "MONITOR ONLY"

def get_recommendation(risk, report_type):
    """Get recommendation based on risk level"""
    if "HIGH" in risk:
        return "URGENT: Please consult a doctor immediately for further evaluation."
    elif "MODERATE" in risk:
        if report_type == "cbc":
            return "Schedule an appointment with your healthcare provider within 1 week."
        elif report_type == "thyroid":
            return "Consult your doctor for thyroid function testing."
        else:
            return "Clinical correlation advised. Follow up with your doctor."
    else:
        return "Routine follow-up as clinically indicated. No urgent action needed."

# ============================================
# 1. CBC DATA COLLECTOR
# ============================================

print("\n[1/3] Generating CBC Reports...")

np.random.seed(42)
n_cbc = 500
cbc_records = []

for i in tqdm(range(n_cbc), desc="Generating CBC reports"):
    hemoglobin = np.random.uniform(12.0, 17.0)
    wbc = np.random.uniform(4.0, 11.0)
    platelets = np.random.uniform(150, 450)
    
    rand = np.random.random()
    if rand < 0.10:
        hemoglobin = np.random.uniform(7.0, 10.0)
        wbc = np.random.uniform(14.0, 22.0)
    elif rand < 0.20:
        hemoglobin = np.random.uniform(10.0, 11.9)
        wbc = np.random.uniform(11.0, 13.0)
    
    risk = calculate_cbc_risk(hemoglobin, wbc, platelets)
    consultation = get_consultation_status(risk)
    recommendation = get_recommendation(risk, "cbc")
    
    if hemoglobin < 12:
        hgb_status = f"LOW: {hemoglobin:.1f} g/dL"
    elif hemoglobin > 17:
        hgb_status = f"HIGH: {hemoglobin:.1f} g/dL"
    else:
        hgb_status = f"NORMAL: {hemoglobin:.1f} g/dL"
    
    if wbc > 11:
        wbc_status = f"HIGH: {wbc:.1f} x10^3/uL"
    elif wbc < 4:
        wbc_status = f"LOW: {wbc:.1f} x10^3/uL"
    else:
        wbc_status = f"NORMAL: {wbc:.1f} x10^3/uL"
    
    narrative = f"""================================================================================
CBC MEDICAL REPORT
================================================================================
Patient ID: CBC_{i:05d}
Age: {np.random.randint(18, 90)} years
Gender: {np.random.choice(['Male', 'Female'])}
Date: {np.random.choice(['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05'])}

================================================================================
LABORATORY RESULTS
================================================================================
Parameter                Value                 Reference Range        Status
--------------------------------------------------------------------------------
Hemoglobin               {hemoglobin:.1f} g/dL         12.0 - 17.0          {hgb_status}
WBC Count                {wbc:.1f} x10^3/uL         4.0 - 11.0           {wbc_status}
Platelet Count           {platelets:.0f} x10^3/uL        150 - 450            NORMAL

================================================================================
RISK ASSESSMENT
================================================================================
Risk Level: {risk}
Doctor Consultation Required: {consultation}

================================================================================
RECOMMENDATION
================================================================================
{recommendation}

================================================================================
"""
    
    cbc_records.append({
        "id": f"CBC_{i:05d}",
        "type": "cbc",
        "modality": "text_only",
        "narrative": narrative,
        "image_path": "",
        "report_path": "",
        "hemoglobin": round(hemoglobin, 1),
        "wbc": round(wbc, 1),
        "platelets": round(platelets, 0),
        "risk_level": risk,
        "consultation_required": consultation
    })

cbc_df = pd.DataFrame(cbc_records)
cbc_df.to_csv(f"{BASE_DIR}/processed/cbc_data.csv", index=False)
print(f"   Generated {len(cbc_df)} CBC reports")

# ============================================
# 2. THYROID DATA COLLECTOR
# ============================================

print("\n[2/3] Generating Thyroid Reports...")

n_thyroid = 500
thyroid_records = []

for i in tqdm(range(n_thyroid), desc="Generating Thyroid reports"):
    tsh = np.random.uniform(0.4, 4.0)
    t4 = np.random.uniform(4.5, 12.0)
    t3 = np.random.uniform(0.8, 2.0)
    
    rand = np.random.random()
    if rand < 0.10:
        tsh = np.random.uniform(4.5, 15.0)
        t4 = np.random.uniform(2.0, 4.0)
        t3 = np.random.uniform(0.5, 0.8)
        diagnosis = "HYPOTHYROIDISM"
    elif rand < 0.20:
        tsh = np.random.uniform(0.01, 0.3)
        t4 = np.random.uniform(12.0, 18.0)
        t3 = np.random.uniform(2.0, 3.5)
        diagnosis = "HYPERTHYROIDISM"
    else:
        diagnosis = "NORMAL"
    
    risk = calculate_thyroid_risk(tsh)
    consultation = get_consultation_status(risk)
    recommendation = get_recommendation(risk, "thyroid")
    
    if tsh > 4.5:
        tsh_status = f"HIGH: {tsh:.2f} mIU/L"
    elif tsh < 0.4:
        tsh_status = f"LOW: {tsh:.2f} mIU/L"
    else:
        tsh_status = f"NORMAL: {tsh:.2f} mIU/L"
    
    narrative = f"""================================================================================
THYROID FUNCTION REPORT
================================================================================
Patient ID: THY_{i:05d}
Age: {np.random.randint(18, 85)} years
Gender: {np.random.choice(['Male', 'Female'])}
Date: {np.random.choice(['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05'])}

================================================================================
LABORATORY RESULTS
================================================================================
Parameter                Value                 Reference Range        Status
--------------------------------------------------------------------------------
TSH                      {tsh:.2f} mIU/L             0.4 - 4.0            {tsh_status}
T4                       {t4:.2f} mcg/dL            4.5 - 12.0           NORMAL
T3                       {t3:.2f} ng/dL             0.8 - 2.0            NORMAL

================================================================================
DIAGNOSIS: {diagnosis}

================================================================================
RISK ASSESSMENT
================================================================================
Risk Level: {risk}
Doctor Consultation Required: {consultation}

================================================================================
RECOMMENDATION
================================================================================
{recommendation}

================================================================================
"""
    
    thyroid_records.append({
        "id": f"THY_{i:05d}",
        "type": "thyroid",
        "modality": "text_only",
        "narrative": narrative,
        "image_path": "",
        "report_path": "",
        "tsh": round(tsh, 2),
        "t4": round(t4, 2),
        "t3": round(t3, 2),
        "diagnosis": diagnosis,
        "risk_level": risk,
        "consultation_required": consultation
    })

thyroid_df = pd.DataFrame(thyroid_records)
thyroid_df.to_csv(f"{BASE_DIR}/processed/thyroid_data.csv", index=False)
print(f"   Generated {len(thyroid_df)} Thyroid reports")

# ============================================
# 3. CHEST X-RAY DATA COLLECTOR (WITH IMAGES)
# ============================================

print("\n[3/3] Generating Chest X-ray Reports with Images...")

def generate_xray_image(output_path, condition):
    """Generate synthetic chest X-ray image"""
    size = 512
    image = np.random.normal(0.5, 0.08, (size, size))
    
    y, x = np.ogrid[:size, :size]
    
    left_lung = ((x - size*0.35)**2 / (size*0.15)**2 + (y - size*0.45)**2 / (size*0.25)**2) < 1
    right_lung = ((x - size*0.65)**2 / (size*0.15)**2 + (y - size*0.45)**2 / (size*0.25)**2) < 1
    
    image[left_lung] += 0.3
    image[right_lung] += 0.3
    
    if condition == "pneumonia":
        patch = ((x - size*0.7)**2 / (size*0.12)**2 + (y - size*0.6)**2 / (size*0.1)**2) < 1
        image[patch] += 0.4
    elif condition == "effusion":
        corner = (x > size*0.8) & (y > size*0.8)
        image[corner] += 0.25
    elif condition == "cardiomegaly":
        heart = ((x - size*0.5)**2 / (size*0.18)**2 + (y - size*0.55)**2 / (size*0.2)**2) < 1
        image[heart] -= 0.2
    
    image = np.clip(image, 0, 1)
    plt.imsave(output_path, image, cmap='gray')

conditions_list = [
    {
        "name": "normal",
        "findings": "Lungs are clear bilaterally. No focal consolidation, mass, or effusion. Cardiac silhouette is within normal limits. No pneumothorax.",
        "impression": "Normal chest X-ray",
        "risk": "LOW RISK"
    },
    {
        "name": "pneumonia",
        "findings": "Right lower lobe consolidation with air bronchograms. Left lung is clear. No pleural effusion.",
        "impression": "Community acquired pneumonia, right lower lobe",
        "risk": "HIGH RISK"
    },
    {
        "name": "effusion",
        "findings": "Left pleural effusion is present. Blunting of the left costophrenic angle. Right lung is clear.",
        "impression": "Left pleural effusion, likely reactive",
        "risk": "MODERATE RISK"
    },
    {
        "name": "cardiomegaly",
        "findings": "Cardiomegaly is present. Mild pulmonary vascular congestion. Lungs are otherwise clear.",
        "impression": "Cardiomegaly with mild pulmonary congestion",
        "risk": "MODERATE TO HIGH RISK"
    }
]

n_xray = 500
xray_records = []

for i in tqdm(range(n_xray), desc="Generating X-ray images"):
    condition_info = conditions_list[i % len(conditions_list)]
    
    img_path = f"{BASE_DIR}/images/xr_{i:06d}.png"
    report_path = f"{BASE_DIR}/reports/xr_{i:06d}.txt"
    
    generate_xray_image(img_path, condition_info["name"])
    
    risk = condition_info["risk"]
    consultation = get_consultation_status(risk)
    recommendation = get_recommendation(risk, "xray")
    
    narrative = f"""================================================================================
CHEST X-RAY REPORT
================================================================================
Study ID: XR_{i:06d}
Patient Age: {np.random.randint(18, 90)} years
Patient Gender: {np.random.choice(['Male', 'Female'])}
Date: {np.random.choice(['2024-01-15', '2024-02-20', '2024-03-10', '2024-04-05'])}

================================================================================
FINDINGS
================================================================================
{condition_info['findings']}

================================================================================
IMPRESSION
================================================================================
{condition_info['impression']}

================================================================================
RISK ASSESSMENT
================================================================================
Risk Level: {risk}
Doctor Consultation Required: {consultation}

================================================================================
RECOMMENDATION
================================================================================
{recommendation}

================================================================================
"""
    
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(narrative)
    
    xray_records.append({
        "id": f"XR_{i:06d}",
        "type": "chestxray",
        "modality": "multimodal",
        "narrative": narrative,
        "image_path": img_path,
        "report_path": report_path,
        "condition": condition_info["name"],
        "findings": condition_info["findings"],
        "impression": condition_info["impression"],
        "risk_level": risk,
        "consultation_required": consultation
    })

xray_df = pd.DataFrame(xray_records)
xray_df.to_csv(f"{BASE_DIR}/reports/chestxray_metadata.csv", index=False)
print(f"   Generated {len(xray_df)} Chest X-ray reports with images")
print(f"      Images saved in: {BASE_DIR}/images/")

# ============================================
# 4. COMBINE ALL DATA
# ============================================

print("\nCombining all data into master file...")

all_data = pd.concat([cbc_df, thyroid_df, xray_df], ignore_index=True)
all_data['image_path'] = all_data['image_path'].fillna('')
all_data['report_path'] = all_data['report_path'].fillna('')

master_csv_path = f"{BASE_DIR}/processed/all_multimodal_data.csv"
all_data.to_csv(master_csv_path, index=False)
print(f"   Master CSV saved: {master_csv_path}")

rag_file_path = f"{BASE_DIR}/processed/rag_narratives.txt"
with open(rag_file_path, "w", encoding='utf-8') as f:
    for _, row in all_data.iterrows():
        f.write(f"[{row['type'].upper()}] ID: {row['id']}\n")
        f.write(row['narrative'])
        f.write("\n" + "="*80 + "\n\n")
print(f"   RAG narratives saved: {rag_file_path}")

# ============================================
# VERIFICATION
# ============================================

print("\nVerifying data integrity...")

image_files = os.listdir(f"{BASE_DIR}/images")
print(f"   Images found: {len(image_files)} files")

report_files = os.listdir(f"{BASE_DIR}/reports")
print(f"   Reports found: {len(report_files)} files")

loaded_data = pd.read_csv(master_csv_path)
print(f"   CSV records: {len(loaded_data)}")

print(f"\n   Report breakdown:")
print(f"      - CBC: {len(loaded_data[loaded_data['type'] == 'cbc'])}")
print(f"      - Thyroid: {len(loaded_data[loaded_data['type'] == 'thyroid'])}")
print(f"      - Chest X-ray: {len(loaded_data[loaded_data['type'] == 'chestxray'])}")

print(f"\n   Risk level breakdown:")
for risk in loaded_data['risk_level'].value_counts().index:
    count = len(loaded_data[loaded_data['risk_level'] == risk])
    print(f"      - {risk}: {count}")

# ============================================
# FINAL SUMMARY
# ============================================

print("\n" + "="*70)
print("DATA COLLECTION COMPLETE!")
print("="*70)
print(f"""
FINAL SUMMARY:
   - CBC Reports: {len(cbc_df)}
   - Thyroid Reports: {len(thyroid_df)}
   - Chest X-ray Reports: {len(xray_df)}
   - TOTAL: {len(all_data)} reports

OUTPUT FILES:
   - Master CSV: {BASE_DIR}/processed/all_multimodal_data.csv
   - RAG Text: {BASE_DIR}/processed/rag_narratives.txt
   - Images: {BASE_DIR}/images/ ({len(image_files)} PNG files)
   - Reports: {BASE_DIR}/reports/ ({len(report_files)} TXT files)

RISK LEVELS INCLUDED:
   - LOW RISK
   - LOW TO MODERATE RISK
   - MODERATE RISK
   - MODERATE TO HIGH RISK
   - HIGH RISK

DOCTOR CONSULTATION FLAG INCLUDED

NEXT STEPS:
   1. Run: python embed_and_store.py
   2. Run: streamlit run app_complete.py
""")