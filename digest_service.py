# digest_service.py
# ClinIQ AI — Daily Health Digest Email Service
# Groq generates content → HTML email → sent via SMTP

import os
import json
import smtplib
import traceback
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────
SMTP_HOST      = os.getenv("SMTP_HOST",  "smtp.gmail.com")
SMTP_PORT      = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER      = os.getenv("SMTP_USER",  "")
SMTP_PASS      = os.getenv("SMTP_PASS",  "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "ClinIQ AI")
SMTP_FROM      = os.getenv("SMTP_FROM",  SMTP_USER)
GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")

SUBSCRIBERS_FILE = Path(__file__).parent / "subscribers.json"
APP_URL          = os.getenv("APP_URL", "http://localhost:3000")


# ── Subscriber Storage ─────────────────────────────────────────────────────────

def _load_subscribers() -> List[Dict]:
    if not SUBSCRIBERS_FILE.exists():
        return []
    try:
        return json.loads(SUBSCRIBERS_FILE.read_text())
    except Exception:
        return []

def _save_subscribers(subs: List[Dict]):
    SUBSCRIBERS_FILE.write_text(json.dumps(subs, indent=2))

def add_subscriber(email: str, prefs: Dict) -> Dict:
    """Add or update a subscriber."""
    subs = _load_subscribers()
    existing = next((s for s in subs if s["email"].lower() == email.lower()), None)
    if existing:
        existing.update({"prefs": prefs, "updated_at": datetime.now().isoformat()})
        _save_subscribers(subs)
        return {"status": "updated", "email": email}
    subs.append({
        "email":      email,
        "prefs":      prefs,
        "subscribed_at": datetime.now().isoformat(),
        "active":     True,
    })
    _save_subscribers(subs)
    return {"status": "subscribed", "email": email}

def remove_subscriber(email: str) -> Dict:
    """Remove a subscriber."""
    subs = _load_subscribers()
    before = len(subs)
    subs = [s for s in subs if s["email"].lower() != email.lower()]
    _save_subscribers(subs)
    return {"status": "unsubscribed" if len(subs) < before else "not_found", "email": email}

def get_subscribers() -> List[Dict]:
    return [s for s in _load_subscribers() if s.get("active", True)]

def subscriber_count() -> int:
    return len(get_subscribers())


# ── Content Generation (Groq) ──────────────────────────────────────────────────

def generate_digest_content() -> Dict:
    """Generate today's health digest content using Groq Llama 3."""
    if not GROQ_API_KEY:
        return _fallback_content()

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_API_KEY)

        today = date.today().strftime("%B %d, %Y")
        prompt = f"""You are the ClinIQ AI health digest generator. Today is {today}.

Generate a daily health digest in valid JSON (no markdown, no extra text):
{{
  "date": "{today}",
  "headline": "one compelling health headline for today (max 12 words)",
  "outbreak_alert": {{
    "disease": "disease name",
    "region": "affected region",
    "severity": "critical|high|moderate",
    "trend": "rising|stable|declining",
    "summary": "2-sentence factual summary of current situation",
    "action": "one specific action patients should take (max 15 words)"
  }},
  "health_tip": {{
    "title": "tip title (max 8 words)",
    "body": "practical health tip in 2-3 sentences. Actionable and specific.",
    "category": "nutrition|exercise|sleep|mental health|prevention|hygiene"
  }},
  "disease_spotlight": {{
    "name": "disease name",
    "fact": "surprising or important fact about this disease (1 sentence)",
    "prevention": "one key prevention tip (max 15 words)",
    "icon": "single emoji"
  }},
  "prevention_reminder": "one sentence preventive health reminder for today",
  "did_you_know": "interesting medical fact (1 sentence, surprising but factual)"
}}

Make it informative, accurate, and genuinely useful. Be specific about real current health situations."""

        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=800,
        )
        raw = resp.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = "\n".join(raw.split("\n")[1:])
        if raw.endswith("```"):
            raw = "\n".join(raw.split("\n")[:-1])
        return json.loads(raw)

    except Exception as e:
        print(f"[Digest] Groq content generation failed: {e}")
        return _fallback_content()


def _fallback_content() -> Dict:
    today = date.today().strftime("%B %d, %Y")
    return {
        "date": today,
        "headline": "Stay protected — check today's health alerts",
        "outbreak_alert": {
            "disease": "Mpox (Clade Ib)",
            "region": "Central Africa (DRC)",
            "severity": "critical",
            "trend": "rising",
            "summary": "Mpox Clade Ib continues to spread in the DRC with a WHO public health emergency declared. Cases have been reported across borders in neighbouring countries.",
            "action": "Get vaccinated if eligible and avoid close contact with infected individuals"
        },
        "health_tip": {
            "title": "Drink water before every meal",
            "body": "Drinking 500ml of water 30 minutes before meals can reduce calorie intake by up to 13% and improves digestion. Most adults are chronically mildly dehydrated without realising it.",
            "category": "nutrition"
        },
        "disease_spotlight": {
            "name": "Tuberculosis",
            "fact": "TB kills more people each year than any other single infectious disease, yet it is curable with a 6-month antibiotic course.",
            "prevention": "Get BCG vaccine as an infant and avoid prolonged exposure to infectious cases",
            "icon": ""
        },
        "prevention_reminder": "Wash your hands with soap for at least 20 seconds — especially before eating and after using the bathroom.",
        "did_you_know": "Your gut microbiome contains approximately 38 trillion bacteria — roughly the same number as all the human cells in your body."
    }


# ── HTML Email Renderer ────────────────────────────────────────────────────────

def render_html_email(content: Dict, subscriber_email: str) -> str:
    """Build HTML email using list-join — no f-string escaping issues."""
    ob   = content.get("outbreak_alert", {})
    tip  = content.get("health_tip", {})
    spot = content.get("disease_spotlight", {})

    date_str   = content.get("date", "")
    headline   = content.get("headline", "Today's Health Digest")
    prevention = content.get("prevention_reminder", "")
    did_u_know = content.get("did_you_know", "")

    ob_disease = ob.get("disease", "Disease Alert")
    ob_region  = ob.get("region", "")
    ob_summary = ob.get("summary", "")
    ob_action  = ob.get("action", "")
    ob_sev     = ob.get("severity", "moderate")

    tip_title  = tip.get("title", "")
    tip_body   = tip.get("body", "")
    tip_cat    = tip.get("category", "prevention")

    spot_icon  = spot.get("icon", "")
    spot_name  = spot.get("name", "")
    spot_fact  = spot.get("fact", "")
    spot_prev  = spot.get("prevention", "")

    sev_color = {"critical":"#dc2626","high":"#d97706","moderate":"#ca8a04"}.get(ob_sev,"#d97706")
    sev_bg    = {"critical":"#fee2e2","high":"#fff7ed","moderate":"#fefce8"}.get(ob_sev,"#fff7ed")
    trend_lbl = {"rising":"&#8593; Rising","declining":"&#8595; Declining","stable":"&#8594; Stable"}.get(ob.get("trend","stable"),"")
    cat_icon  = {"nutrition":"&#127793;","exercise":"&#127939;","sleep":"&#128564;","mental health":"&#129504;","prevention":"&#128737;","hygiene":"&#129532;"}.get(tip_cat,"&#128161;")
    unsub_url = APP_URL + "/unsubscribe?email=" + subscriber_email

    H = []
    def a(s): H.append(s)

    a('<!DOCTYPE html><html><head><meta charset="UTF-8"></head>')
    a('<body style="margin:0;padding:0;background:#f0fdfe;font-family:Arial,sans-serif;color:#0f172a;">')
    a('<div style="max-width:600px;margin:0 auto;padding:20px 16px;">')

    # Header
    a('<div style="background:#22d3ee;border-radius:16px;padding:24px 28px;margin-bottom:20px;text-align:center;">')
    a('<div style="display:inline-block;background:rgba(255,255,255,0.25);border-radius:10px;padding:4px 16px;margin-bottom:10px;">')
    a('<span style="color:white;font-size:12px;font-weight:700;letter-spacing:0.08em;">DAILY HEALTH DIGEST</span></div>')
    a('<h1 style="margin:0;color:white;font-size:26px;font-weight:800;">ClinIQ AI</h1>')
    a('<p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">' + date_str + '</p>')
    a('<p style="margin:12px 24px 0;color:white;font-size:15px;font-weight:500;">' + headline + '</p></div>')

    sev_color = {"critical":"#dc2626","high":"#d97706","moderate":"#ca8a04"}.get(ob_sev,"#d97706")
    sev_bg    = {"critical":"#fee2e2","high":"#fff7ed","moderate":"#fefce8"}.get(ob_sev,"#fff7ed")
    trend_lbl = {"rising":"Rising","declining":"Declining","stable":"Stable"}.get(ob.get("trend","stable"),"")
    cat_icon  = {"nutrition":"&#127793;","exercise":"&#127939;","sleep":"&#128564;","mental health":"&#129504;","prevention":"&#128737;","hygiene":"&#129532;"}.get(tip_cat,"&#128161;")
    unsub_url = APP_URL + "/unsubscribe?email=" + subscriber_email

    H = []
    def a(s): H.append(s)

    a('<!DOCTYPE html><html><head><meta charset="UTF-8"></head>')
    a('<body style="margin:0;padding:0;background:#f0fdfe;font-family:Arial,sans-serif;color:#0f172a;">')
    a('<div style="max-width:600px;margin:0 auto;padding:20px 16px;">')
    a('<div style="background:#22d3ee;border-radius:16px;padding:24px 28px;margin-bottom:20px;text-align:center;">')
    a('<h1 style="margin:0;color:white;font-size:26px;font-weight:800;">ClinIQ AI</h1>')
    a('<p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">' + date_str + '</p>')
    a('<p style="margin:12px 0 0;color:white;font-size:15px;font-weight:500;">' + headline + '</p></div>')
    a('<div style="background:' + sev_bg + ';border-left:4px solid ' + sev_color + ';border-radius:12px;padding:18px 20px;margin-bottom:16px;">')
    a('<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:' + sev_color + ';margin-bottom:10px;">OUTBREAK ALERT: ' + ob_sev.upper() + ' / ' + trend_lbl + '</div>')
    a('<h2 style="margin:0 0 6px;font-size:17px;font-weight:700;">' + ob_disease + ' / ' + ob_region + '</h2>')
    a('<p style="margin:0 0 10px;font-size:13.5px;color:#374151;line-height:1.6;">' + ob_summary + '</p>')
    a('<div style="background:white;border-radius:8px;padding:10px 14px;"><strong style="color:' + sev_color + ';">ACTION: </strong>' + ob_action + '</div></div>')
    a('<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;"><tr>')
    a('<td width="49%" valign="top" style="padding-right:8px;"><div style="background:white;border:1px solid #e0f2fe;border-radius:12px;padding:16px;">')
    a('<div style="font-size:22px;margin-bottom:8px;">' + cat_icon + '</div>')
    a('<div style="font-size:10px;font-weight:700;color:#0891b2;text-transform:uppercase;margin-bottom:5px;">Health Tip</div>')
    a('<h3 style="margin:0 0 7px;font-size:14px;font-weight:700;">' + tip_title + '</h3>')
    a('<p style="margin:0;font-size:12.5px;color:#475569;line-height:1.6;">' + tip_body + '</p></div></td><td width="2%"></td>')
    a('<td width="49%" valign="top" style="padding-left:8px;"><div style="background:white;border:1px solid #e0f2fe;border-radius:12px;padding:16px;">')
    a('<div style="font-size:22px;margin-bottom:8px;">' + spot_icon + '</div>')
    a('<div style="font-size:10px;font-weight:700;color:#0891b2;text-transform:uppercase;margin-bottom:5px;">Disease Spotlight</div>')
    a('<h3 style="margin:0 0 7px;font-size:14px;font-weight:700;">' + spot_name + '</h3>')
    a('<p style="margin:0 0 8px;font-size:12px;color:#475569;line-height:1.5;">' + spot_fact + '</p>')
    a('<div style="background:#dcfce7;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;color:#166534;">' + spot_prev + '</div>')
    a('</div></td></tr></table>')
    a('<div style="background:#d9f8fd;border-radius:12px;padding:14px 18px;margin-bottom:16px;">')
    a('<div style="font-size:10px;font-weight:700;color:#0891b2;text-transform:uppercase;margin-bottom:4px;">Prevention Reminder</div>')
    a('<p style="margin:0;font-size:13.5px;color:#0e7490;font-weight:500;">' + prevention + '</p></div>')
    a('<div style="background:white;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin-bottom:20px;">')
    a('<strong style="font-size:11px;color:#64748b;text-transform:uppercase;">Did You Know?</strong>')
    a('<p style="margin:5px 0 0;font-size:13px;color:#374151;line-height:1.6;font-style:italic;">' + did_u_know + '</p></div>')
    a('<div style="text-align:center;margin-bottom:20px;"><a href="' + APP_URL + '" style="display:inline-block;background:#22d3ee;color:white;font-size:14px;font-weight:700;padding:12px 32px;border-radius:10px;text-decoration:none;">Open ClinIQ AI</a></div>')
    a('<div style="text-align:center;padding-top:16px;border-top:1px solid #e0f7fa;">')
    a('<p style="margin:0 0 6px;font-size:11px;color:#94a3b8;">ClinIQ AI Daily Health Digest</p>')
    a('<a href="' + unsub_url + '" style="font-size:11px;color:#94a3b8;text-decoration:underline;">Unsubscribe</a>')
    a('<p style="margin:8px 0 0;font-size:10.5px;color:#cbd5e1;">For informational purposes only.</p>')
    a('</div></div></body></html>')
    return "\n".join(H)


# -- Email Sender --

def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send HTML email via SMTP. Returns True on success."""
    if not SMTP_USER or not SMTP_PASS:
        print("[Email] SMTP_USER or SMTP_PASS not configured")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM_NAME + " <" + (SMTP_FROM or SMTP_USER) + ">"
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        if SMTP_PORT == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, to_email, msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.ehlo()
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_USER, to_email, msg.as_string())
        print("[Email] Sent to " + to_email)
        return True
    except Exception as e:
        print("[Email] Failed: " + str(e))
        return False


# -- Daily Digest Runner --

def send_daily_digest() -> Dict:
    """Called by APScheduler. Generates content once, sends to all subscribers."""
    print("[Digest] Starting " + datetime.now().isoformat())
    subscribers = get_subscribers()
    if not subscribers:
        print("[Digest] No subscribers")
        return {"sent": 0, "failed": 0}
    content = generate_digest_content()
    subject = "ClinIQ AI Health Digest - " + content.get("date", "")
    sent = failed = 0
    for sub in subscribers:
        email = sub.get("email", "")
        if not email:
            continue
        try:
            html = render_html_email(content, email)
            if send_email(email, subject, html):
                sent += 1
            else:
                failed += 1
        except Exception as e:
            print("[Digest] Error for " + email + ": " + str(e))
            failed += 1
    print("[Digest] Done: sent=" + str(sent) + " failed=" + str(failed))
    return {"sent": sent, "failed": failed, "date": content.get("date")}


def send_digest_to_one(email: str) -> Dict:
    """Send digest to a single email for testing."""
    content = generate_digest_content()
    subject = "ClinIQ AI Health Digest - " + content.get("date", "")
    html    = render_html_email(content, email)
    ok      = send_email(email, subject, html)
    return {"sent": ok, "email": email, "subject": subject, "content": content}
