'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { analyzeText, analyzeComplete, checkHealth } from '../lib/api'
import DiseasesSection    from '../components/DiseasesSection'
import DigestSubscribe    from '../components/DigestSubscribe'
import VoiceSymptomLogger from '../components/VoiceSymptomLogger'
import AppointmentSystem  from '../components/AppointmentSystem'
import DiseaseTrends      from '../components/DiseaseTrends'
import CameraCapture      from '../components/CameraCapture'
import AuthModal          from '../components/AuthModal'
import { supabase }       from '../lib/supabase'

/* 
   SAMPLE REPORTS
 */
const SAMPLES = [
  {
    label: 'CBC — Severe Anemia', icon: '',
    text: `CBC REPORT:\nHemoglobin: 6.5 g/dL (Low)\nRBC: 1.8 M/mcL (Low)\nHematocrit: 19.5% (Low)\nMCV: 109.6 fL (High)\nMCH: 36.5 pg (High)\nRDW: 16.0% (High)\nWBC: 18.5 x10^3/uL (High)\nPlatelets: 210 x10^3/uL\nPatient presents with severe fatigue, pallor, and tachycardia.`,
  },
  {
    label: 'CBC — Elevated WBC', icon: '',
    text: `CBC REPORT:\nHemoglobin: 13.2 g/dL\nWBC: 22.4 x10^3/uL (High)\nPlatelets: 340 x10^3/uL\nRBC: 4.6 M/mcL\nHematocrit: 40%\nPatient has high fever, chills and productive cough for 5 days.`,
  },
  {
    label: 'Thyroid — Hypothyroidism', icon: '',
    text: `THYROID FUNCTION TEST:\nTSH: 12.5 mIU/L (High)\nT4: 3.2 mcg/dL (Low)\nT3: 80 ng/dL (Low)\nFree T4: 0.6 ng/dL (Low)\nPatient reports weight gain of 8 kg over 4 months, fatigue, cold intolerance, and constipation.`,
  },
  {
    label: 'Thyroid — Hyperthyroidism', icon: '',
    text: `THYROID FUNCTION TEST:\nTSH: 0.05 mIU/L (Low)\nT4: 18.6 mcg/dL (High)\nT3: 340 ng/dL (High)\nFree T4: 3.8 ng/dL (High)\nPatient presents with palpitations, heat intolerance, weight loss, and anxiety.`,
  },
  {
    label: 'Chest X-ray — Pneumonia', icon: '',
    text: `CHEST X-RAY REPORT\n\nCLINICAL CONTEXT:\n65-year-old male with productive cough, high fever (102°F), shortness of breath for 4 days. Smoker with diabetes.\n\nFINDINGS:\nRight lower lobe consolidation with air bronchograms. Increased opacity in the right lower lung field.\n\nIMPRESSION:\nCommunity acquired pneumonia — right lower lobe.`,
  },
  {
    label: 'Chest X-ray — Cardiomegaly', icon: '',
    text: `CHEST X-RAY REPORT\n\nCLINICAL CONTEXT:\n72-year-old female with orthopnea, bilateral leg swelling, and progressive shortness of breath. History of heart failure.\n\nFINDINGS:\nCardiomegaly with cardiothoracic ratio > 0.55. Pulmonary vascular congestion. Small bilateral pleural effusions.\n\nIMPRESSION:\nCongestive heart failure with cardiomegaly.`,
  },
  {
    label: 'Normal CBC', icon: '',
    text: `CBC REPORT:\nHemoglobin: 14.2 g/dL (Normal)\nWBC: 7.1 x10^3/uL (Normal)\nPlatelets: 245 x10^3/uL (Normal)\nRBC: 4.8 M/mcL (Normal)\nHematocrit: 42% (Normal)\nMCV: 88 fL (Normal)\nRoutine annual health check. No complaints.`,
  },
]

/* 
   NORMAL REFERENCE RANGES
 */
const RANGES = {
  Hemoglobin: { min: 12,   max: 17,   unit: 'g/dL',    display: '12–17' },
  WBC:        { min: 4,    max: 11,   unit: 'x10³/µL', display: '4–11' },
  RBC:        { min: 4.2,  max: 5.4,  unit: 'M/µL',    display: '4.2–5.4' },
  Platelets:  { min: 150,  max: 400,  unit: 'x10³/µL', display: '150–400' },
  Hematocrit: { min: 36,   max: 52,   unit: '%',       display: '36–52' },
  MCV:        { min: 80,   max: 100,  unit: 'fL',      display: '80–100' },
  MCH:        { min: 27,   max: 33,   unit: 'pg',      display: '27–33' },
  RDW:        { min: 11.5, max: 14.5, unit: '%',       display: '11.5–14.5' },
  TSH:        { min: 0.4,  max: 4.5,  unit: 'mIU/L',  display: '0.4–4.5' },
  T3:         { min: 80,   max: 200,  unit: 'ng/dL',   display: '80–200' },
  T4:         { min: 5,    max: 12,   unit: 'mcg/dL',  display: '5–12' },
  'Free T4':  { min: 0.8,  max: 1.8,  unit: 'ng/dL',  display: '0.8–1.8' },
}

/* 
   RISK HELPERS
 */
function getRiskMeta(risk = '') {
  const r = risk.toUpperCase()
  if (r.includes('HIGH'))
    return { color:'#ef4444', bg:'#fee2e2', border:'#fca5a5', label:'HIGH RISK',     icon:'!', badge:'risk-badge-high' }
  if (r.includes('MODERATE'))
    return { color:'#f59e0b', bg:'#fef3c7', border:'#fde68a', label:'MODERATE RISK', icon:'', badge:'risk-badge-moderate' }
  if (r.includes('LOW') || r.includes('NORMAL'))
    return { color:'#22c55e', bg:'#dcfce7', border:'#86efac', label:'LOW RISK',      icon:'', badge:'risk-badge-low' }
  return   { color:'#64748b', bg:'#f1f5f9', border:'#cbd5e1', label:'UNKNOWN',       icon:'', badge:'risk-badge-unknown' }
}

/* 
   MODALITY META
 */
function getModalityMeta(mode = '') {
  const m = (mode || '').toLowerCase()
  if (m === 'hybrid') return { label:'Hybrid',    color:'#7c3aed', bg:'#ede9fe', icon:'',  desc:'Hybrid' }
  if (m === 'image')  return { label:'Image',     color:'#0891b2', bg:'#cffafe', icon:'',  desc:'Image' }
  return                     { label:'Text',      color:'#0284c7', bg:'#e0f2fe', icon:'',  desc:'Text' }
}

/* 
   INLINE SVG ICONS
 */
const IconUpload  = () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
const IconText    = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>
const IconSample  = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>
const IconSpinner = () => <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
const IconClose   = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
const IconCopy    = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.375"/></svg>
const IconChevron = ({ open }) => <svg className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
const IconArrow   = () => <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>

/* 
   PIPELINE STRIP  — shows the retrieval flow for this query
 */
function RAGPipelineStrip({ searchMode, searchModel, caseCount, ragActive = true }) {
  const modMeta = getModalityMeta(searchMode)

  // RAG strip hidden when offline — no banner shown

  const steps = [
    { icon: searchMode === 'image' ? '' : searchMode === 'hybrid' ? '' : '', label: 'Input' },
    { icon: '', label: searchMode === 'hybrid' ? 'Hybrid' : 'AI Analysis' },
    
    { icon: '', label: `${caseCount} cases` },
    { icon: '', label: 'AI Analysis' },
  ]

  return (
    <div className="glass-card px-4 py-3 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Analysis Pipeline</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: modMeta.bg, color: modMeta.color }}>
          {modMeta.icon} {modMeta.label} retrieval
        </span>
      </div>
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <span className="text-sm">{s.icon}</span>
              <span className="text-[10px] text-slate-400 leading-none mt-0.5 whitespace-nowrap">{s.label}</span>
            </div>
            {i < steps.length - 1 && <IconArrow />}
          </div>
        ))}
      </div>
    </div>
  )
}

/* 
   RISK GAUGE  (SVG half-arc)
 */
function RiskGauge({ risk = '' }) {
  const r = risk.toUpperCase()
  let pct = 0.1; let color = '#22c55e'
  if (r.includes('HIGH'))     { pct = 0.88; color = '#ef4444' }
  else if (r.includes('MODERATE')) { pct = 0.52; color = '#f59e0b' }
  else if (r.includes('LOW'))  { pct = 0.12; color = '#22c55e' }
  const cx = 60, cy = 60, radius = 48
  const arcLen = Math.PI * radius
  const filled = arcLen * pct
  return (
    <svg viewBox="0 0 120 70" className="w-40">
      <path d={`M ${cx-radius},${cy} A ${radius},${radius} 0 0 1 ${cx+radius},${cy}`}
            fill="none" stroke="#e0f7fa" strokeWidth="12" strokeLinecap="round"/>
      <path d={`M ${cx-radius},${cy} A ${radius},${radius} 0 0 1 ${cx+radius},${cy}`}
            fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${filled} ${arcLen}`}
            style={{ transition:'stroke-dasharray 1s ease, stroke 0.5s ease' }}/>
      {(() => {
        const angle = Math.PI * (1 - pct)
        const nx = cx + 36 * Math.cos(angle)
        const ny = cy - 36 * Math.sin(angle)
        return <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="3" strokeLinecap="round"
                     style={{ transition:'all 0.8s ease' }}/>
      })()}
      <circle cx={cx} cy={cy} r="4" fill={color}/>
      <text x="14"  y="68" fontSize="7" fill="#94a3b8" textAnchor="middle">LOW</text>
      <text x={cx}  y="68" fontSize="7" fill="#94a3b8" textAnchor="middle">MOD</text>
      <text x="106" y="68" fontSize="7" fill="#94a3b8" textAnchor="middle">HIGH</text>
    </svg>
  )
}

/* 
   LAB VALUE BAR
 */
function LabBar({ name, value }) {
  const range = RANGES[name]
  if (!range) return null
  const { min, max, unit, display } = range
  const padMin = min - (max - min) * 0.3
  const padMax = max + (max - min) * 0.3
  const total  = padMax - padMin
  const valPct = Math.min(Math.max(((value - padMin) / total) * 100, 2), 98)
  const normL  = ((min - padMin) / total) * 100
  const normW  = ((max - min) / total) * 100
  const isLow  = value < min, isHigh = value > max
  const dotColor  = isHigh ? '#ef4444' : isLow ? '#3b82f6' : '#22c55e'
  const status    = isHigh ? 'HIGH' : isLow ? 'LOW' : 'NORMAL'
  const statusCls = isHigh ? 'text-red-600 bg-red-50' : isLow ? 'text-blue-600 bg-blue-50' : 'text-green-600 bg-green-50'
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{value} <span className="font-normal text-xs text-slate-400">{unit}</span></span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${statusCls}`}>{status}</span>
        </div>
      </div>
      <div className="lab-bar-track">
        <div className="lab-bar-normal" style={{ left:`${normL}%`, width:`${normW}%` }}/>
        <div className="lab-bar-value"  style={{ left:`${valPct}%`, background:dotColor }}/>
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-slate-400">{padMin.toFixed(1)}</span>
        <span className="text-xs text-cyan-600">Ref: {display}</span>
        <span className="text-xs text-slate-400">{padMax.toFixed(1)}</span>
      </div>
    </div>
  )
}

/* 
   SIMILAR CASES — shows retrieved Milvus results with modality tags
 */
function SimilarCases({ cases = [], searchMode = 'text' }) {
  const [open, setOpen] = useState(false)
  if (!cases.length) return null

  return (
    <div className="glass-card overflow-hidden animate-slide-up">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-cyan-50 transition-colors">
        <span className="font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-600 flex items-center justify-center text-xs font-bold">
            {cases.length}
          </span>
          Retrieved Cases
          <span className="text-xs font-normal text-slate-400"></span>
        </span>
        <IconChevron open={open}/>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {cases.slice(0, 5).map((c, i) => {
            const riskMeta = getRiskMeta(c.risk_level || '')
            const caseMode = c.modality || searchMode
            const modMeta  = getModalityMeta(caseMode)
            const pct      = Math.round((c.score || 0) * 100)

            return (
              <div key={i} className="p-3 rounded-xl border border-slate-100 bg-white">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">
                      {c.report_type || 'Unknown'}
                    </span>
                    {/* Modality badge */}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                          style={{ background: modMeta.bg, color: modMeta.color,
                                   borderColor: modMeta.color + '44' }}>
                      {modMeta.icon} {modMeta.desc}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${riskMeta.badge}`}>
                      {riskMeta.label}
                    </span>
                    <span className="text-xs font-bold" style={{ color:'#22d3ee' }}>{pct}%</span>
                  </div>
                </div>

                {/* Similarity bar */}
                <div className="progress-bar mb-2">
                  <div className="progress-fill"
                       style={{ width:`${pct}%`,
                                background: caseMode === 'hybrid'
                                  ? 'linear-gradient(90deg,#22d3ee,#7c3aed)'
                                  : caseMode === 'image'
                                  ? 'linear-gradient(90deg,#0891b2,#0e7490)'
                                  : 'linear-gradient(90deg,#22d3ee,#0891b2)' }}/>
                </div>

                {/* Consultation */}
                {c.consultation && (
                  <p className="text-xs text-slate-500 mb-1">
                    <span className="font-medium">Consult:</span> {c.consultation}
                  </p>
                )}

                {/* Narrative snippet */}
                {c.narrative && (
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1">
                    {c.narrative.slice(0, 160)}…
                  </p>
                )}
              </div>
            )
          })}

          <p className="text-xs text-center text-slate-400 pt-1">
            Similar cases retrieved
          </p>
        </div>
      )}
    </div>
  )
}

/* 
   RESULT PANEL
 */
function ResultPanel({ result, loading }) {
  const [copied, setCopied] = useState(false)

  /*  Loading state  */
  if (loading) return (
    <div className="glass-card p-8 flex flex-col items-center justify-center gap-6 min-h-[400px]">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border-4 border-cyan-100"/>
        <div className="absolute inset-0 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin"/>
        <div className="absolute inset-4 rounded-full bg-cyan-50 flex items-center justify-center">
          <span className="text-2xl"></span>
        </div>
      </div>
      <div className="text-center">
        <p className="font-semibold text-slate-700">Analysis in progress…</p>
        <p className="text-sm text-slate-400 mt-1">AI is analysing your report…</p>
      </div>
      <div className="w-56 space-y-2">
        {[
          'Parsing report',
          'Processing report',
          'Running analysis',
          'Retrieving similar cases',
          'Generating result',
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse"
                 style={{ animationDelay:`${i * 0.3}s` }}/>
            <span className="text-xs text-slate-400">{s}</span>
          </div>
        ))}
      </div>
    </div>
  )

  /*  Empty state  */
  if (!result) return (
    <div className="glass-card p-8 flex flex-col items-center justify-center gap-4 min-h-[400px] text-center">
      <div className="relative w-24 h-24 opacity-25">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <rect x="10" y="20" width="80" height="60" rx="6" fill="none" stroke="#22d3ee" strokeWidth="3"/>
          <line x1="25" y1="40" x2="75" y2="40" stroke="#22d3ee" strokeWidth="2"/>
          <line x1="25" y1="52" x2="60" y2="52" stroke="#22d3ee" strokeWidth="2"/>
          <line x1="25" y1="64" x2="50" y2="64" stroke="#22d3ee" strokeWidth="2"/>
          <polyline points="10,78 28,78 33,60 38,90 43,70 48,78 90,78"
            fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="text-slate-400 font-medium">Analysis will appear here</p>
      <p className="text-sm text-slate-300">Paste or upload a report and press Analyse</p>
    </div>
  )

  /*  Results  */
  const meta       = getRiskMeta(result.risk_level || '')
  const values     = result.extracted_values || {}
  const hasValues  = Object.keys(values).length > 0
  const caseCount  = (result.similar_cases || []).length
  const searchMode = result.search_mode || 'text'
  const modMeta    = getModalityMeta(searchMode)

  const copyAll = () => {
    const txt = [
      'ClinIQ AI Report',
      `Report Type: ${result.report_type}`,
      `Risk Level: ${result.risk_level}`,
      `Consultation: ${result.consultation}`,
      `Search Mode: ${searchMode} (${result.search_model || ''})`,
      '',
      result.groq_analysis || result.analysis || '',
    ].join('\n')
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-4 animate-fade-in">

      {/*  Risk Card  */}
      <div className="glass-card p-5 flex flex-col sm:flex-row items-center gap-5 animate-slide-up">
        <RiskGauge risk={result.risk_level}/>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            {result.report_type || 'Medical Report'}
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-lg mb-2 ${meta.badge}`}
               style={{ borderWidth:'1.5px', borderStyle:'solid' }}>
            <span>{meta.icon}</span>
            <span>{result.risk_level || 'UNKNOWN'}</span>
          </div>
          <p className="text-sm text-slate-600 mt-1">{result.consultation}</p>
        </div>
        <button onClick={copyAll}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-cyan-600 transition-colors self-start sm:self-center">
          <IconCopy/> {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/*  Pipeline Strip — only show when RAG is active  */}
      {result.rag_active !== false && (
        <RAGPipelineStrip
          searchMode={searchMode}
          searchModel={result.search_model}
          caseCount={caseCount}
          ragActive={true}
        />
      )}

      {/*  Lab Values  */}
      {hasValues && (
        <div className="glass-card p-5 animate-slide-up" style={{ animationDelay:'0.1s' }}>
          <h3 className="text-sm font-semibold text-slate-600 mb-4 uppercase tracking-wider">Lab Values</h3>
          {Object.entries(values).map(([k, v]) => (
            <LabBar key={k} name={k} value={v}/>
          ))}
        </div>
      )}

      {/*  Findings  */}
      {(result.interpretation || []).length > 0 && (
        <div className="glass-card p-5 animate-slide-up" style={{ animationDelay:'0.15s' }}>
          <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">Findings</h3>
          <ul className="space-y-2">
            {result.interpretation.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-cyan-500 font-bold">›</span>{item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*  AI-Enhanced AI Analysis  */}
      {result.groq_analysis && (
        <div className="glass-card p-5 animate-slide-up" style={{ animationDelay:'0.2s' }}>
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base"></span>
              <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">AI Analysis</h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {/* AI-Enhanced badge */}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ background:'#d9f8fd', color:'#0e7490', borderColor:'#a5f3fc' }}>
                 AI-Enhanced
              </span>
              {/* Modality badge */}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ background: modMeta.bg, color: modMeta.color,
                             borderColor: modMeta.color + '55' }}>
                {modMeta.icon} {modMeta.label}
              </span>
              {caseCount > 0 && (
                <span className="text-[10px] text-slate-400 font-medium">
                  {caseCount} cases used as context
                </span>
              )}
            </div>
          </div>

          {/* Context hint */}
          {caseCount > 0 && (
            <div className="mb-3 px-3 py-2 rounded-lg text-xs text-slate-500 flex items-center gap-1.5"
                 style={{ background:'#f0fdfe', border:'1px solid #a5f3fc' }}>
              <span></span>
              <span>
                Analysis based on <strong>{caseCount} similar cases</strong>
              </span>
            </div>
          )}

          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {result.groq_analysis}
          </p>
        </div>
      )}

      {/*  Retrieved Cases (Milvus)  */}
      {caseCount > 0 && (
        <div style={{ animationDelay:'0.25s' }}>
          <SimilarCases cases={result.similar_cases} searchMode={searchMode}/>
        </div>
      )}

      {/*  Disclaimer  */}
      <p className="text-xs text-center text-slate-400 py-2">
         For informational purposes only. Consult a qualified healthcare provider for medical decisions.
      </p>
    </div>
  )
}

/* 
   HEADER
 */
function Header({ view, setView, health, user, onLogin, onLogout, onCamera }) {
  return (
    <header className="sticky top-0 z-50 w-full"
      style={{ background:'rgba(255,255,255,0.9)', backdropFilter:'blur(12px)',
               borderBottom:'1px solid rgba(34,211,238,0.15)' }}>
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <button onClick={() => setView('home')}
          className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-lg shadow-md
                          group-hover:shadow-cyan-glow transition-shadow"
               style={{ background:'linear-gradient(135deg,#22d3ee,#0891b2)' }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4.5 12.75l6 6 9-13.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
            </svg>
          </div>
          <div>
            <span className="font-bold text-slate-800 text-lg leading-none">ClinIQ</span>
            <span className="font-bold text-lg leading-none" style={{ color:'#22d3ee' }}> AI</span>
          </div>
        </button>

        {/* Nav */}
        <nav className="flex items-center gap-1 p-1 rounded-full bg-slate-50 border border-slate-100">
          {[
            { id:'home',     label:'Home'      },
            { id:'analyze',  label:'Analyse'   },
            { id:'diseases',    label:'Diseases' },
            { id:'voice',       label:'Symptoms' },
            { id:'appointments',label:'Book' },
            { id:'trends',      label:'Trends' },
          ].map(v => (
            <button key={v.id} onClick={() => setView(v.id)}
              className={`tab-btn ${view === v.id ? 'active' : ''}`}>
              {v.label}
            </button>
          ))}
        </nav>

        {/* status */}
        <div className="hidden sm:flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${
            health === null ? 'bg-slate-300 animate-pulse'
            :                'bg-green-400'}`}/>
          <span className="text-xs text-slate-400">
            {health === null ? 'Connecting…' : 'Live'}
          </span>
        </div>
        {/* Camera button */}
        <button onClick={onCamera}
          className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all hover:shadow-sm"
          style={{borderColor:'#22d3ee', color:'#0e7490', background:'#d9f8fd'}}>
           Scan
        </button>
        {/* Auth */}
        {user ? (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-slate-600 font-medium">
              {user.user_metadata?.name?.split(' ')[0] || user.email?.split('@')[0]}
            </span>
            <button onClick={onLogout}
              className="text-xs text-slate-400 hover:text-red-400 transition-colors">Sign out</button>
          </div>
        ) : (
          <button onClick={onLogin}
            className="hidden sm:block text-xs font-semibold px-3 py-1.5 rounded-full text-white transition-all"
            style={{background:'linear-gradient(135deg,#22d3ee,#0891b2)'}}>
            Login
          </button>
        )}
      </div>
    </header>
  )
}

/* 
   HERO
 */
function HeroSection({ onStart, onDigest }) {
  return (
    <section className="relative overflow-hidden py-20 px-4 text-center">
      {/* Blobs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20 blur-3xl pointer-events-none"
           style={{ background:'radial-gradient(circle,#22d3ee,transparent)' }}/>
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none"
           style={{ background:'radial-gradient(circle,#0891b2,transparent)' }}/>

      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 animate-fade-in"
           style={{ background:'#d9f8fd', color:'#0e7490', border:'1px solid #a5f3fc' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"/>
        AI-Powered Medical Analysis
      </div>

      {/* Heading */}
      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-4 animate-slide-up">
        Clinical Intelligence<br/>
        <span style={{ background:'linear-gradient(135deg,#22d3ee,#0891b2)',
                       WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
          Powered by AI
        </span>
      </h1>
      <p className="text-base sm:text-lg text-slate-500 max-w-xl mx-auto mb-10 animate-fade-in">
        Upload CBC, Thyroid, or Chest X-ray reports for instant AI-powered analysis.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-slide-up">
        <button onClick={onStart} className="btn-primary text-lg px-8 py-4">
          Start Analysis →
        </button>
        <button onClick={onDigest}
          className="flex items-center gap-2 px-6 py-4 rounded-xl text-sm font-semibold border-2 transition-all hover:-translate-y-0.5"
          style={{borderColor:'#22d3ee', color:'#0e7490', background:'white'}}>
          Daily Digest
        </button>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto mt-16">
        {[
          { icon:'', title:'CBC Analysis',   sub:'AI-powered analysis' },
          { icon:'', title:'Thyroid Panel',  sub:'Semantic similarity' },
          { icon:'', title:'Chest X-ray',    sub:'Image recognition' },
          { icon:'', title:'Combined',     sub:'Combined analysis' },
        ].map(f => (
          <div key={f.title}
               className="glass-card p-4 text-center hover:shadow-lg transition-shadow cursor-pointer group"
               onClick={onStart}>
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform inline-block">{f.icon}</div>
            <div className="text-sm font-semibold text-slate-700">{f.title}</div>
            <div className="text-xs text-slate-400 mt-0.5">{f.sub}</div>
          </div>
        ))}
      </div>

      {/* pipeline diagram */}
      <div className="glass-card max-w-2xl mx-auto mt-12 px-6 py-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">How It Works</p>
        <div className="flex items-center justify-center gap-2 flex-wrap text-sm">
          {[
            ['','Input'],
            ['','AI\nModels'],
            ['','Knowledge\nBase'],
            ['','Top-k\nCases'],
            ['','AI\nAnalysis'],
            ['','Report'],
          ].map(([icon, label], i, arr) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <span className="text-xl">{icon}</span>
                <span className="text-[10px] text-slate-400 text-center leading-tight mt-0.5 whitespace-pre">{label}</span>
              </div>
              {i < arr.length - 1 && (
                <svg className="w-4 h-4 text-cyan-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tech tags */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {['FastAPI','Next.js','AI Engine','Supabase','Python 3.11'].map(t => (
          <span key={t} className="text-xs font-medium text-slate-400 border border-slate-200 rounded-full px-3 py-1">{t}</span>
        ))}
      </div>
    </section>
  )
}

/* 
   ANALYSE SECTION
 */
function AnalyseSection() {
  const [inputMode,  setInputMode]  = useState('text')
  const [reportText, setReportText] = useState('')
  const [file,       setFile]       = useState(null)
  const [imgPreview, setImgPreview] = useState(null)
  const [clinCtx,    setClinCtx]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState(null)
  const [error,      setError]      = useState(null)
  const [dragging,   setDragging]   = useState(false)

  const fileRef   = useRef(null)
  const resultRef = useRef(null)

  const isImageFile = f => f && ['image/png','image/jpeg','image/jpg'].includes(f.type)

  const acceptFile = useCallback((f) => {
    if (!f) return
    setFile(f); setError(null)
    if (isImageFile(f)) setImgPreview(URL.createObjectURL(f))
    else setImgPreview(null)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) acceptFile(f)
  }, [acceptFile])

  const clearFile = () => {
    setFile(null); setImgPreview(null); setClinCtx('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleAnalyse = async () => {
    setError(null); setResult(null); setLoading(true)
    try {
      let res
      if (inputMode === 'upload' && file) {
        res = await analyzeComplete({ file, clinicalContext: clinCtx })
      } else {
        const txt = reportText.trim()
        if (!txt) { setError('Please enter or paste a medical report.'); setLoading(false); return }
        res = await analyzeText(txt)
      }
      if (!res.success) throw new Error(res.detail || 'Analysis failed')
      setResult(res)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 100)
    } catch (e) {
      setError(e.message || 'Could not connect to backend. Is it running?')
    } finally {
      setLoading(false)
    }
  }

  const loadSample = (s) => {
    setReportText(s.text); setInputMode('text')
    setFile(null); setImgPreview(null); setResult(null); setError(null)
  }

  const canAnalyse = !loading && (
    (inputMode === 'text'   && reportText.trim().length > 20) ||
    (inputMode === 'upload' && file !== null) ||
    (inputMode === 'sample' && reportText.trim().length > 20)
  )

  return (
    <section className="max-w-6xl mx-auto px-4 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/*  Left: Input  */}
        <div className="space-y-4">

          {/* Mode tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white border border-slate-100 shadow-sm w-fit">
            {[
              { id:'text',   icon:<IconText/>,   label:'Text'    },
              { id:'upload', icon:<IconUpload/>, label:'Upload'  },
              { id:'sample', icon:<IconSample/>, label:'Samples' },
            ].map(m => (
              <button key={m.id} onClick={() => setInputMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all
                  ${inputMode === m.id
                    ? 'bg-cyan-500 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-cyan-50 hover:text-cyan-700'}`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {/* path hint */}
          {inputMode !== 'sample' && (
            <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
              <span>Analysis:</span>
              {inputMode === 'upload' && file && isImageFile(file)
                ? <span className="font-semibold" style={{color:'#0891b2'}}>
                     Image + context analysis
                  </span>
                : <span className="font-semibold" style={{color:'#22d3ee'}}>
                     Text analysis
                  </span>
              }
            </div>
          )}

          {/*  Text / Sample  */}
          {(inputMode === 'text' || inputMode === 'sample') && (
            <div className="glass-card p-4 space-y-3">
              {inputMode === 'sample' ? (
                <div>
                  <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Choose a sample report</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SAMPLES.map(s => (
                      <button key={s.label} onClick={() => loadSample(s)}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100 bg-white hover:border-cyan-300 hover:bg-cyan-50 transition-all text-left group">
                        <span className="text-xl">{s.icon}</span>
                        <span className="text-xs font-medium text-slate-600 group-hover:text-cyan-700 leading-snug">{s.label}</span>
                      </button>
                    ))}
                  </div>
                  {reportText && (
                    <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-500 font-medium mb-1">Selected preview:</p>
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-auto">{reportText}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <textarea
                  value={reportText}
                  onChange={e => setReportText(e.target.value)}
                  placeholder={`Paste your medical report here…\n\nExample:\nCBC REPORT:\nHemoglobin: 10.2 g/dL\nWBC: 14.5 x10^3/uL\nPlatelets: 180 x10^3/uL`}
                  rows={12}
                  className="w-full text-sm text-slate-700 placeholder-slate-300 bg-slate-50 border border-slate-100 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-transparent font-mono leading-relaxed"
                />
              )}
            </div>
          )}

          {/*  Upload  */}
          {inputMode === 'upload' && (
            <div className="glass-card p-4 space-y-3">
              {!file ? (
                <div
                  className={`drop-zone rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer ${dragging ? 'dragging' : ''}`}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}>
                  <div className="text-cyan-400"><IconUpload/></div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-600 text-sm">Drop file here or click to browse</p>
                    <p className="text-xs text-slate-400 mt-1">PDF · DOCX · TXT · PNG · JPG</p>
                    <p className="text-xs mt-2 font-medium" style={{color:'#0891b2'}}>
                      Images and documents supported
                    </p>
                  </div>
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                    className="hidden" onChange={e => { if (e.target.files[0]) acceptFile(e.target.files[0]) }}/>
                </div>
              ) : (
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{isImageFile(file) ? '' : ''}</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-700">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size/1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button onClick={clearFile} className="text-slate-400 hover:text-red-400 transition-colors p-1"><IconClose/></button>
                  </div>

                  <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg text-xs font-medium"
                       style={{ background: isImageFile(file) ? '#cffafe' : '#e0f2fe',
                                color:      isImageFile(file) ? '#0e7490' : '#0284c7' }}>
                    {isImageFile(file)
                      ? <>Image analysis with AI</>
                      : <>Text analysis with AI</>
                    }
                  </div>

                  {imgPreview && (
                    <div className="relative mt-2 rounded-lg overflow-hidden border border-white shadow-sm" style={{maxHeight:200}}>
                      <img src={imgPreview} alt="X-ray preview" className="w-full object-cover" style={{maxHeight:200}}/>
                      <div className="scan-overlay"/>
                    </div>
                  )}

                  {isImageFile(file) && (
                    <div className="mt-3">
                      <label className="text-xs font-semibold text-slate-500 block mb-1">
                        Clinical Context
                        
                      </label>
                      <textarea
                        value={clinCtx} onChange={e => setClinCtx(e.target.value)}
                        placeholder="e.g. 65-year-old male, productive cough, fever 102°F, shortness of breath for 4 days…"
                        rows={3}
                        className="w-full text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-300"/>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2 text-sm text-red-700 animate-fade-in">
              <span className="mt-0.5 shrink-0">!</span>
              <span>{error}</span>
            </div>
          )}

          {/* Analyse button */}
          <button onClick={handleAnalyse} disabled={!canAnalyse} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><IconSpinner/> Analysing…</> : 'Analyse Report'}
          </button>
        </div>

        {/*  Right: Results  */}
        <div ref={resultRef}>
          <ResultPanel result={result} loading={loading}/>
        </div>

      </div>
    </section>
  )
}

/* 
   FOOTER
 */
function Footer({ onDigest }) {
  return (
    <footer className="border-t mt-16 py-8 px-4" style={{borderColor:'rgba(34,211,238,0.12)'}}>
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-xs"
               style={{background:'linear-gradient(135deg,#22d3ee,#0891b2)'}}></div>
          <span className="text-sm font-bold text-slate-700">ClinIQ AI</span>
        </div>
        <p className="text-xs text-slate-400 text-center">
          Research preview · Not for clinical diagnosis · Always consult a qualified healthcare provider
        </p>
        <div className="flex items-center gap-3">
          <button onClick={onDigest}
            className="text-xs font-semibold px-3 py-1.5 rounded-full border transition-all hover:shadow-sm"
            style={{borderColor:'#22d3ee', color:'#0e7490', background:'#d9f8fd'}}>
             Daily Digest
          </button>
          {['FastAPI','Next.js','AI Engine','Supabase'].map(t => (
            <span key={t} className="text-xs text-slate-400">{t}</span>
          ))}
        </div>
      </div>
    </footer>
  )
}

/* 
   ROOT APP
 */
export default function ClinIQApp() {
  const [view,       setView]       = useState('home')
  const [health,     setHealth]     = useState(null)
  const [showDigest, setShowDigest] = useState(false)
  const [user,       setUser]       = useState(null)
  const [showAuth,   setShowAuth]   = useState(false)
  const [showCamera, setShowCamera] = useState(false)

  useEffect(() => {
    checkHealth()
      .then(h => setHealth(h.rag_active === true))
      .catch(() => setHealth(false))
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null)
    })
    return () => subscription?.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <div className="min-h-screen flex flex-col"
         style={{background:'linear-gradient(160deg,#f0fdfe 0%,#ffffff 60%,#f0fdfe 100%)'}}>
      <Header
        view={view} setView={setView} health={health}
        user={user}
        onLogin={()  => setShowAuth(true)}
        onLogout={handleLogout}
        onCamera={() => setShowCamera(true)}
      />
      <main className="flex-1">
        {view === 'home'         && <HeroSection onStart={() => setView('analyze')} onDigest={() => setShowDigest(true)}/>}
        {view === 'analyze'      && <AnalyseSection/>}
        {view === 'diseases'     && <DiseasesSection/>}
        {view === 'voice'        && <VoiceSymptomLogger/>}
        {view === 'appointments' && <AppointmentSystem user={user}/>}
        {view === 'trends'       && <DiseaseTrends/>}
      </main>
      <Footer onDigest={() => setShowDigest(true)}/>
      {showDigest  && <DigestSubscribe onClose={() => setShowDigest(false)}/>}
      {showAuth    && <AuthModal       onClose={() => setShowAuth(false)}   onSuccess={u => { setUser(u); setShowAuth(false) }}/>}
      {showCamera  && <CameraCapture  onClose={() => setShowCamera(false)}  onResult={() => setShowCamera(false)}/>}
    </div>
  )
}
