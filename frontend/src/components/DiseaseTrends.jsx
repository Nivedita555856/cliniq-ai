'use client'
import { useState, useEffect } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

// ── 2010–2025 disease trend data (realistic patterns) ─────────────────────────
const YEARS = Array.from({length: 16}, (_, i) => 2010 + i)

const DISEASES = {
  'COVID-19':    { color:'#ef4444', data:[0,0,0,0,0,0,0,0,0,0,2841,12450,9800,4200,1800,890] },
  'Dengue':      { color:'#f59e0b', data:[890,1020,1240,1560,1820,2100,2450,2780,3100,3450,1200,3900,4500,5200,6100,7200] },
  'Malaria':     { color:'#16a34a', data:[3200,3050,2890,2710,2600,2480,2350,2200,2050,1890,1650,1420,1200,980,820,680] },
  'Tuberculosis':{ color:'#7c3aed', data:[2800,2680,2550,2420,2300,2180,2070,1960,1850,1740,1500,1350,1200,1050,920,800] },
  'Diabetes':    { color:'#0891b2', data:[6100,6480,6900,7350,7840,8300,8820,9380,9950,10560,10200,11200,12100,13100,14200,15400] },
  'Hypertension':{ color:'#dc2626', data:[7200,7680,8150,8680,9200,9780,10350,10980,11600,12300,12100,13200,14400,15700,17100,18600] },
  'Pneumonia':   { color:'#d97706', data:[1850,1920,1980,2060,2150,2240,2340,2450,2580,2700,3200,2900,2650,2400,2180,2000] },
  'Cholera':     { color:'#64748b', data:[420,380,340,310,280,250,220,200,180,160,140,120,130,150,110,90] },
}

const DISEASE_NAMES = Object.keys(DISEASES)

// Build chart data
function buildChartData(yearRange, selected) {
  const [start, end] = yearRange
  return YEARS
    .filter(y => y >= start && y <= end)
    .map((year, i) => {
      const row = { year: String(year) }
      selected.forEach(name => {
        const raw = DISEASES[name].data
        const idx = YEARS.indexOf(year)
        row[name] = raw[idx] || 0
      })
      return row
    })
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card p-3 text-xs min-w-[140px]">
      <p className="font-bold text-slate-700 mb-2"> {label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <span style={{color: p.color}}>● {p.name}</span>
          <span className="font-bold text-slate-800">{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Trend stat card ────────────────────────────────────────────────────────────
function TrendCard({ name, data, color }) {
  const latest    = data[data.length - 1] || 0
  const prev      = data[data.length - 2] || 1
  const change    = ((latest - prev) / prev * 100).toFixed(1)
  const isUp      = change > 0
  const peak      = Math.max(...data)
  const peakYear  = 2010 + data.indexOf(peak)

  return (
    <div className="glass-card p-3 border-l-4" style={{borderColor: color}}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-700">{name}</span>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: isUp ? '#fee2e2' : '#dcfce7',
                color: isUp ? '#dc2626' : '#16a34a'
              }}>
          {isUp ? '↑' : '↓'} {Math.abs(change)}%
        </span>
      </div>
      <p className="text-lg font-extrabold" style={{color}}>{latest.toLocaleString()}</p>
      <p className="text-xs text-slate-400">cases · Peak: {peak.toLocaleString()} ({peakYear})</p>
    </div>
  )
}

// ── Main DiseaseTrends ─────────────────────────────────────────────────────────
export default function DiseaseTrends() {
  const [selected,   setSelected]   = useState(['COVID-19','Dengue','Diabetes','Hypertension'])
  const [yearRange,  setYearRange]  = useState([2015, 2025])
  const [chartType,  setChartType]  = useState('line')  // 'line' | 'area'
  const [animKey,    setAnimKey]    = useState(0)

  // Re-animate when selection changes
  useEffect(() => { setAnimKey(k => k + 1) }, [selected, yearRange])

  const chartData = buildChartData(yearRange, selected)

  const toggleDisease = (name) => {
    setSelected(prev =>
      prev.includes(name)
        ? prev.length > 1 ? prev.filter(n => n !== name) : prev
        : [...prev, name]
    )
  }

  const Chart = chartType === 'area' ? AreaChart : LineChart

  return (
    <section className="max-w-6xl mx-auto px-4 py-10">

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-extrabold text-slate-800">Disease Trends</h2>
        <p className="text-xs text-slate-400 mt-0.5">Historical disease prevalence · India · 2010–2025 (cases per 100K)</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {selected.map(name => (
          <TrendCard key={name} name={name} data={DISEASES[name].data} color={DISEASES[name].color}/>
        ))}
      </div>

      {/* Chart controls */}
      <div className="glass-card p-4 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Chart:</span>
            {['line','area'].map(t => (
              <button key={t} onClick={() => setChartType(t)}
                className="text-xs px-3 py-1.5 rounded-full border capitalize transition-all"
                style={{
                  borderColor: chartType === t ? '#22d3ee' : '#e2e8f0',
                  background:  chartType === t ? '#d9f8fd' : 'white',
                  color:       chartType === t ? '#0e7490' : '#64748b'
                }}>
                {t === 'line' ? '' : ''} {t}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500">From:</span>
            <select value={yearRange[0]} onChange={e => setYearRange([+e.target.value, yearRange[1]])}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              {YEARS.filter(y => y < yearRange[1]).map(y => <option key={y}>{y}</option>)}
            </select>
            <span className="text-xs text-slate-400">to</span>
            <select value={yearRange[1]} onChange={e => setYearRange([yearRange[0], +e.target.value])}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              {YEARS.filter(y => y > yearRange[0]).map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={300} key={animKey}>
          <Chart data={chartData} margin={{top:5,right:20,left:10,bottom:5}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
            <XAxis dataKey="year" tick={{fontSize:11, fill:'#94a3b8'}}/>
            <YAxis tick={{fontSize:11, fill:'#94a3b8'}} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:'11px'}}/>
            {selected.map(name => {
              const color = DISEASES[name].color
              return chartType === 'area'
                ? <Area key={name} type="monotone" dataKey={name} stroke={color} fill={color}
                    fillOpacity={0.15} strokeWidth={2} dot={false} animationDuration={800}/>
                : <Line  key={name} type="monotone" dataKey={name} stroke={color}
                    strokeWidth={2.5} dot={false} activeDot={{r:4}} animationDuration={800}/>
            })}
          </Chart>
        </ResponsiveContainer>
      </div>

      {/* Disease selector */}
      <div className="glass-card p-4">
        <p className="text-xs font-semibold text-slate-500 mb-3">Select diseases to display:</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DISEASE_NAMES.map(name => {
            const active = selected.includes(name)
            const color  = DISEASES[name].color
            return (
              <button key={name} onClick={() => toggleDisease(name)}
                className="flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all"
                style={{
                  borderColor: active ? color : '#e2e8f0',
                  background:  active ? color + '18' : 'white',
                }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{background: active ? color : '#e2e8f0'}}/>
                <span className="text-xs font-medium" style={{color: active ? color : '#64748b'}}>
                  {name}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3 text-center">
          Data source: Indicative figures based on WHO/ICMR public health reports · For educational purposes
        </p>
      </div>
    </section>
  )
}
