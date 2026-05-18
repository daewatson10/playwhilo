// lib/useWhilo.js
import { useState, useEffect } from 'react'
import {
  doc, getDoc, setDoc, updateDoc, collection,
  query, orderBy, getDocs, serverTimestamp
} from 'firebase/firestore'
import { db } from './firebase'

export function getTodayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function getWeekKeyET() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff)).toLocaleDateString('en-CA')
}

export function useWhilo(user) {
  const TODAY = getTodayET()
  const [state, setState] = useState({})
  const [activeDate, setActiveDate] = useState(TODAY)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [weekTheme, setWeekTheme] = useState(null)
  const [onboardDone, setOnboardDone] = useState(true)

  useEffect(() => {
    // Load onboard state
    const ob = localStorage.getItem('whilo_onboard')
    setOnboardDone(!!ob)

    // Load week theme
    loadWeekTheme()

    // Load today's progress
    if (user) {
      loadUserDay(user.uid, TODAY)
    } else {
      const saved = localStorage.getItem('whilo_' + TODAY)
      if (saved) setState(JSON.parse(saved))
    }
  }, [user])

  async function loadWeekTheme() {
    const weekKey = getWeekKeyET()
    // Check local cache first
    const cached = localStorage.getItem('whilo_week_' + weekKey)
    if (cached) { setWeekTheme(JSON.parse(cached)); return }
    // Fetch from Firestore
    try {
      const ref = doc(db, 'weekThemes', weekKey)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        localStorage.setItem('whilo_week_' + weekKey, JSON.stringify(data))
        setWeekTheme(data)
      } else {
        // Generate new week theme
        const res = await fetch('/api/puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'weekTheme', date: TODAY })
        })
        const data = await res.json()
        await setDoc(ref, { ...data, weekKey, createdAt: serverTimestamp() })
        localStorage.setItem('whilo_week_' + weekKey, JSON.stringify(data))
        setWeekTheme(data)
      }
    } catch (e) {
      console.error('Week theme error:', e)
      setWeekTheme({ theme_name: 'Reflection' })
    }
  }

  async function loadUserDay(uid, date) {
    try {
      const ref = doc(db, 'users', uid, 'days', date)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const data = snap.data()
        setState(data)
        return data
      }
    } catch (e) {
      console.error('Load user day error:', e)
    }
    return null
  }

  function getKey(date) {
    return user ? `whilo_${user.uid}_${date}` : `whilo_${date}`
  }

  function localSave(date, data) {
    localStorage.setItem(getKey(date), JSON.stringify(data))
    if (date === TODAY) setState(data)
  }

  async function cloudSave(date, data) {
    localSave(date, data)
    if (!user) return
    try {
      const ref = doc(db, 'users', user.uid, 'days', date)
      await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true })
    } catch (e) {
      console.error('Cloud save error:', e)
    }
  }

 function load(date) {
    try {
      const raw = localStorage.getItem(getKey(date))
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  async function startPuzzle(date) {
    setActiveDate(date)

    // Check local cache
    const existing = load(date)
    if (existing?.word) {
      if (date === TODAY) setState(existing)
      return existing
    }

    // Check if user has cloud data for this date
    if (user) {
      const cloudData = await loadUserDay(user.uid, date)
      if (cloudData?.word) return cloudData
    }

    const isToday = date === TODAY
    setLoadingText(isToday ? "Crafting today's puzzle..." : 'Generating this puzzle...')
    setLoading(true)

    try {
      // Check if daily puzzle already exists in Firestore
      const puzzleRef = doc(db, 'dailyPuzzles', date)
      const puzzleSnap = await getDoc(puzzleRef)

      let puzzle
      if (puzzleSnap.exists()) {
        // Use the shared daily puzzle
        puzzle = puzzleSnap.data()
      } else {
        // Generate new puzzle and store it for everyone
        const res = await fetch('/api/puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            weekTheme: weekTheme?.theme_name || 'Reflection',
            type: 'puzzle'
          })
        })
        puzzle = await res.json()
        if (puzzle.error) throw new Error(puzzle.error)
        // Store as the shared daily puzzle
        await setDoc(puzzleRef, { ...puzzle, createdAt: serverTimestamp() })
      }

      const userPuzzle = { ...puzzle, guesses: [], cluesUsed: [], date }
      await cloudSave(date, userPuzzle)
      return userPuzzle

    } catch (e) {
      console.error(e)
      throw e
    } finally {
      setLoading(false)
    }
  }

  function submitGuess(date, guess) {
    const s = load(date) || state
    if (!s?.word || s.solved) return null
    const correct = guess.toLowerCase() === s.word.toLowerCase()
    const updated = { ...s, guesses: [...(s.guesses || []), { text: guess, correct }] }
    const wrongCount = updated.guesses.filter(g => !g.correct).length
    if (correct || wrongCount >= 6) updated.solved = true
    cloudSave(date, updated)
    return updated
  }

  function submitGuessExact(date, guess, correct) {
    const s = load(date) || state
    if (!s?.word || s.solved) return null
    const updated = { ...s, guesses: [...(s.guesses || []), { text: guess, correct }] }
    const wrongCount = updated.guesses.filter(g => !g.correct).length
    if (correct || wrongCount >= 6) updated.solved = true
    cloudSave(date, updated)
    if (correct && user) updateUserStats(date, updated)
    return updated
  }

  async function updateUserStats(date, puzzleData) {
    if (!user) return
    try {
      const userRef = doc(db, 'users', user.uid)
      const userSnap = await getDoc(userRef)
      const userData = userSnap.data() || {}

      const streak = await calcStreakFirebase()
      const longestStreak = Math.max(streak, userData.longestStreak || 0)
      const wrongCount = (puzzleData.guesses || []).filter(g => !g.correct).length
      const solvedOn = (puzzleData.guesses || []).findIndex(g => g.correct) + 1

      await updateDoc(userRef, {
        streak,
        longestStreak,
        totalSolved: (userData.totalSolved || 0) + 1,
        totalPlayed: (userData.totalPlayed || 0) + 1,
        lastPlayed: date,
        updatedAt: serverTimestamp()
      })
    } catch (e) {
      console.error('Update stats error:', e)
    }
  }

  function revealClue(date, idx, isSolved) {
    const s = load(date) || state
    if (!s?.word) return
    const used = s.cluesUsed || []
    if (used.includes(idx)) return
    // If puzzle is solved, don't track clues in stats
    const updated = { ...s, cluesUsed: [...used, idx] }
    if (!isSolved) cloudSave(date, updated)
    else localSave(date, updated) // local only for post-solve curiosity clicks
    return updated
  }

  async function saveJournal(date, text) {
    const s = load(date) || state
    const updated = { ...s, journal_entry: text, done_journal: true }
    await cloudSave(date, updated)
    // Update journal count
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid)
        const userSnap = await getDoc(userRef)
        const userData = userSnap.data() || {}
        await updateDoc(userRef, {
          journalCount: (userData.journalCount || 0) + (s.journal_entry ? 0 : 1)
        })
      } catch (e) { console.error(e) }
    }
    return updated
  }

  function setDone(date, key) {
    const s = load(date) || state
    const updated = { ...s, ['done_' + key]: true }
    cloudSave(date, updated)
    if (date === TODAY) setState(updated)
  }

  async function calcStreakFirebase() {
    if (!user) return calcStreakLocal()
    let streak = 0
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    for (let i = 0; i < 365; i++) {
      const date = d.toLocaleDateString('en-CA')
      try {
        const ref = doc(db, 'users', user.uid, 'days', date)
        const snap = await getDoc(ref)
        if (snap.exists() && snap.data()?.solved) {
          streak++
          d.setDate(d.getDate() - 1)
        } else break
      } catch { break }
    }
    return streak
  }

  function calcStreakLocal() {
    let streak = 0
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    for (let i = 0; i < 365; i++) {
      const key = 'whilo_' + d.toLocaleDateString('en-CA')
      try {
        const e = JSON.parse(localStorage.getItem(key))
        if (e?.solved) { streak++; d.setDate(d.getDate() - 1) }
        else break
      } catch { break }
    }
    return streak
  }

  function calcStreak() { return calcStreakLocal() }

 function getArchiveDays() {
    const EARLIEST = '2025-05-01'
    const days = []
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    for (let i = 1; i <= 365; i++) {
      const d2 = new Date(d)
      d2.setDate(d.getDate() - i)
      const dateStr = d2.toLocaleDateString('en-CA')
      if (dateStr < EARLIEST) break
      days.push(dateStr)
    }
    return days.sort().reverse()
  }
    // Also include any extra saved entries from localStorage
    const prefix = user ? `whilo_${user.uid}_` : 'whilo_'
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) {
        const date = k.replace(prefix, '')
        if (date >= EARLIEST && !days.includes(date) && date !== TODAY) days.push(date)
      }
    }
    return days.sort().reverse()
  }

  async function getFutureDays(limit = 7) {
    const days = []
    const weekKey = getWeekKeyET()
    const wk = localStorage.getItem('whilo_week_' + weekKey)
    const theme = wk ? JSON.parse(wk)?.theme_name : 'Reflection'
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    for (let i = 1; i <= limit; i++) {
      const d2 = new Date(d)
      d2.setDate(d.getDate() + i)
      days.push({ date: d2.toLocaleDateString('en-CA'), theme, locked: true })
    }
    return days
  }

  async function getUserProfile() {
    if (!user) return null
    try {
      const ref = doc(db, 'users', user.uid)
      const snap = await getDoc(ref)
      return snap.exists() ? snap.data() : null
    } catch (e) {
      console.error(e)
      return null
    }
  }

  async function getUserWordHistory() {
    if (!user) return []
    try {
      const ref = collection(db, 'users', user.uid, 'days')
      const q = query(ref, orderBy('date', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => d.data()).filter(d => d.solved)
    } catch (e) {
      console.error(e)
      return []
    }
  }

  function completeOnboard() {
    localStorage.setItem('whilo_onboard', 'true')
    setOnboardDone(true)
  }

  return {
    state, activeDate, loading, loadingText, weekTheme, onboardDone,
    TODAY, load, localSave, cloudSave,
    startPuzzle, submitGuess, submitGuessExact, revealClue, saveJournal, setDone,
    calcStreak, calcStreakFirebase, getArchiveDays, getFutureDays,
    getUserProfile, getUserWordHistory, completeOnboard,
    loadWeekTheme
  }
}
