'use client'
import { useState, useEffect } from 'react'
import { getDiseases, getOutbreaks } from '../lib/api'

/*  Trend arrow  */
const TrendIcon = ({ trend }) => {
  if (trend === 'rising')   return <span className="text-red-500 font-bold text-base">↑</span>
  if (trend === 'declining') return <span className="text-green-500 font-bold text-base">↓</span>
  return <span className="text-amber-400 font-bold text-base">→</span>
}

/*  Severity dot  */
const SevDot = ({ sev }) => {
  const c = sev === 'critical' ? '#dc2626' : sev === 'high' ? '#d97706' : sev === 'moderate' ? '#ca8a04' : '#16a34a'
  return <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: c }} />
}

/*  Outbreak Strip  */
function OutbreakStrip() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [idx,     setIdx]     = useState(0)   // scroll index

  useEffect(() => {
    getOutbreaks()
      .then(r => { setData(r.data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="rounded-2xl p-4 mb-6 flex items-center gap-3 animate-pulse"
         style={{ background:'#fef3c7', border:'1px solid #fde68a' }}>
      <span className="text-xl"></span>
      <span className="text-sm font-medium text-amber-700">Loading outbreak intelligence…</span>
    </div>
  )

  if (error || !data) return null

  const outbreaks = data.outbreaks || []
  const alerts    = data.global_alerts || []

  return (
    <div className="mb-6 space-y-3">
      {/* Global alerts */}
      {alerts.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl text-xs font-medium"
             style={{ background:'#fff7ed', border:'1px solid #fed7aa', color:'#c2410c' }}>
          <span className="text-base shrink-0"></span>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {alerts.map((a, i) => <span key={i}>• {a}</span>)}
          </div>
        </div>
      )}

      {/* Outbreak cards - horizontal scroll */}
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
            Active Outbreaks — Groq Intelligence
          </span>
          <span className="text-xs text-slate-400">{outbreaks.length} regions tracked</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {outbreaks.map((ob, i) => (
            <div key={i} className="rounded-xl p-3 border transition-shadow hover:shadow-md cursor-default"
                 style={{
                   background: ob.severity === 'critical' ? '#fff1f2' : ob.severity === 'high' ? '#fff7ed' : '#fffbeb',
                   borderColor: ob.severity === 'critical' ? '#fecdd3' : ob.severity === 'high' ? '#fed7aa' : '#fde68a'
                 }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{ob.icon}</span>
                <TrendIcon trend={ob.trend} />
              </div>
              <p className="text-xs font-bold text-slate-800 leading-tight">{ob.disease}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{ob.region}</p>
              <p className="text-[10px] text-slate-400 leading-tight">{ob.country_examples}</p>
              <div className="flex items-center gap-1 mt-1.5 pt-1.5 border-t border-white/60">
                <SevDot sev={ob.severity} />
                <span className="text-[10px] text-slate-500 leading-tight">{ob.patient_advice}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/*  Disease Detail Modal  */
function DiseaseModal({ disease, onClose }) {
  if (!disease) return null
  const cm = disease.category_meta || {}
  const sm = disease.severity_meta || {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background:'rgba(0,0,0,0.45)', backdropFilter:'blur(4px)' }}
         onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl bg-white"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 z-10 rounded-t-2xl px-5 py-4 flex items-start justify-between"
             style={{ background: cm.bg || '#d9f8fd', borderBottom:`2px solid ${cm.color || '#22d3ee'}` }}>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{disease.icon}</span>
            <div>
              <h2 className="font-bold text-slate-800 text-lg leading-tight">{disease.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: cm.bg, color: cm.color, border:`1px solid ${cm.color}44` }}>
                  {cm.label}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{ background: sm.bg, color: sm.color, border:`1px solid ${sm.color}44` }}>
                  {sm.label} risk
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors rounded-full w-8 h-8 flex items-center justify-center hover:bg-white/60">x</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Description */}
          <p className="text-sm text-slate-600 leading-relaxed">{disease.description}</p>

          {/* Quick facts row */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label:'Incubation', val: disease.incubation },
              { label:'Transmission', val: disease.transmission },
            ].map(f => (
              <div key={f.label} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{f.label}</p>
                <p className="text-xs text-slate-700 font-medium">{f.val}</p>
              </div>
            ))}
          </div>

          {/* Symptoms */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"> Symptoms</h3>
            <div className="flex flex-wrap gap-1.5">
              {disease.symptoms.map((s, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full border font-medium"
                      style={{ background: cm.bg, color: cm.color, borderColor: cm.color + '44' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Risk factors */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"> Risk Factors</h3>
            <div className="flex flex-wrap gap-1.5">
              {disease.risk_factors.map((r, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 font-medium">{r}</span>
              ))}
            </div>
          </div>

          {/* Prevention */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"> Prevention</h3>
            <ul className="space-y-1.5">
              {disease.prevention.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-green-500 mt-0.5 shrink-0"></span>{p}
                </li>
              ))}
            </ul>
          </div>

          {/* Treatment */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"> Treatment</h3>
            <p className="text-sm text-slate-700 leading-relaxed">{disease.treatment}</p>
          </div>

          {/* Affected regions */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2"> Affected Regions</h3>
            <div className="flex flex-wrap gap-1.5">
              {disease.affected_regions.map((r, i) => (
                <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">{r}</span>
              ))}
            </div>
          </div>

          {/* When to see doctor */}
          <div className="p-3 rounded-xl flex items-start gap-2"
               style={{ background: sm.bg, border:`1px solid ${sm.color}44` }}>
            <span className="text-lg shrink-0"></span>
            <div>
              <p className="text-xs font-bold mb-1" style={{ color: sm.color }}>See a doctor if:</p>
              <p className="text-xs text-slate-700">{disease.when_to_see_doctor}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/*  Disease Card  */
function DiseaseCard({ disease, onClick }) {
  const cm = disease.category_meta || {}
  const sm = disease.severity_meta || {}
  return (
    <button onClick={() => onClick(disease)}
      className="glass-card p-4 text-left w-full hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 group">
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl group-hover:scale-110 transition-transform inline-block">{disease.icon}</span>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: cm.bg, color: cm.color }}>{cm.label}</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: sm.bg, color: sm.color }}>{sm.label}</span>
        </div>
      </div>
      <h3 className="font-bold text-slate-800 text-sm leading-tight mb-1.5">{disease.name}</h3>
      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{disease.description}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {disease.symptoms.slice(0, 3).map((s, i) => (
          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md"
                style={{ background: cm.bg, color: cm.color }}>{s}</span>
        ))}
        {disease.symptoms.length > 3 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">
            +{disease.symptoms.length - 3} more
          </span>
        )}
      </div>
    </button>
  )
}

/*  Main DiseasesSection  */
export default function DiseasesSection() {
  const [diseases,  setDiseases]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [selected,  setSelected]  = useState(null)   // opened disease
  const [filter,    setFilter]    = useState('all')   // category filter
  const [search,    setSearch]    = useState('')

  useEffect(() => {
    getDiseases()
      .then(r => { setDiseases(r.diseases || []); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const categories = ['all', 'viral', 'bacterial', 'parasitic', 'chronic', 'mixed']

  const catColors = {
    viral:     { color:'#0891b2', bg:'#d9f8fd' },
    bacterial: { color:'#dc2626', bg:'#fee2e2' },
    parasitic: { color:'#16a34a', bg:'#dcfce7' },
    chronic:   { color:'#7c3aed', bg:'#ede9fe' },
    mixed:     { color:'#d97706', bg:'#fef3c7' },
  }

  const filtered = diseases.filter(d => {
    const matchCat  = filter === 'all' || d.category === filter
    const matchSrch = !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
                      d.symptoms.some(s => s.toLowerCase().includes(search.toLowerCase()))
    return matchCat && matchSrch
  })

  return (
    <section className="max-w-6xl mx-auto px-4 py-10">

      {/* Outbreak tracker */}
      <OutbreakStrip />

      {/* Page heading + search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800">Disease Encyclopedia</h2>
          <p className="text-xs text-slate-400 mt-0.5">20 most common diseases — tap any card to learn more</p>
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search disease or symptom…"
          className="w-full sm:w-60 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300"
        />
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap mb-6">
        {categories.map(cat => {
          const meta = cat === 'all' ? { color:'#22d3ee', bg:'#d9f8fd' } : (catColors[cat] || {})
          const active = filter === cat
          return (
            <button key={cat} onClick={() => setFilter(cat)}
              className="px-3 py-1.5 rounded-full text-xs font-bold capitalize border transition-all"
              style={active
                ? { background: meta.bg, color: meta.color, borderColor: meta.color + '66', boxShadow:`0 0 0 2px ${meta.color}33` }
                : { background:'white', color:'#64748b', borderColor:'#e2e8f0' }
              }>
              {cat === 'all' ? `All (${diseases.length})` : cat}
            </button>
          )
        })}
      </div>

      {/* Disease grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({length: 8}).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="glass-card p-6 text-center text-red-600">
          <p className="text-lg mb-1"></p>
          <p className="text-sm">{error}</p>
          <p className="text-xs text-slate-400 mt-1">Make sure the backend is running</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(d => (
              <DiseaseCard key={d.id} disease={d} onClick={setSelected} />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-3xl mb-2"></p>
              <p className="text-sm">No diseases found for "{search}"</p>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {selected && <DiseaseModal disease={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
