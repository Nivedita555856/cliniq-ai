// supabase.js — ClinIQ AI Supabase client
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL  || ''
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

//  Auth helpers 
export async function signUp(email, password, role, name, phone, city) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { role, name, phone, city } }
  })
  if (error) throw error
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id, email, role, name, phone, city,
      created_at: new Date().toISOString()
    })
  }
  return data
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single()
  if (error) return null
  return data
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

//  Appointments 
export async function bookAppointment(appt) {
  const { data, error } = await supabase.from('appointments').insert([appt]).select()
  if (error) throw error
  return data[0]
}

export async function getMyAppointments(userId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, doctors(*)')
    .eq('patient_id', userId)
    .order('appointment_date', { ascending: true })
  if (error) throw error
  return data || []
}

//  Analysis history 
export async function saveAnalysis(userId, analysisData) {
  const { data, error } = await supabase.from('analysis_history').insert([{
    user_id: userId,
    report_type:  analysisData.report_type,
    risk_level:   analysisData.risk_level,
    analysis_data: analysisData,
    created_at:   new Date().toISOString()
  }])
  if (error) console.warn('[Supabase] Could not save analysis:', error.message)
  return data
}

export async function getAnalysisHistory(userId) {
  const { data, error } = await supabase
    .from('analysis_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) return []
  return data || []
}
