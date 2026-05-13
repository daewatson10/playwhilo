// lib/useWhilo.js
import { useState, useEffect, useCallback } from 'react'

const TODAY = new Date().toISOString().split('T')[0]

function getWeekKey() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(d.setDate(diff)).toISOString().split('T')[0]
}

export function useWhilo() {
  const [state, setState] = useState({})
  const [activeDate, setActiveDate] = useState(TODAY)
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [weekTheme, setWeekTheme] = useState(null)
  const [onboardDone, setOnboardDone] = useState(true)

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('whilo_' + TODAY)
    if (saved) setState(JSON.parse(saved))

    const ob = localStorage.getItem('whilo_onboard')
    setOnboardDone(!!ob)

    const wk = localStorage.getItem('whilo_week_' + getWeekKey())
    if (wk) {
      setWeekTheme(JSON.parse(wk))
    } else {
      generateWeekTheme()
    }
  }, [])

  function save(date, data) {
    localStorage.setItem('whilo_' + date, JSON.stringify(data))
    if (date === TODAY) setState(data)
  }

  function load(date) {
    try {
      const raw = localStorage.getItem('whilo_' + date)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }

  async function generateWeekTheme() {
    try {
      const res = await fetch('/api/puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'weekTheme', date: TODAY })
      })
      const data = await res.json()
      localStorage.setItem('whilo_week_' + getWeekKey(), JSON.stringify(data))
      setWeekTheme(data)
    } catch {
      setWeekTheme({ theme_name: 'Reflection' })
    }
  }

  async function startPuzzle(date) {
    setActiveDate(date)
    const existing = load(date)
    if (existing?.word) {
      if (date === TODAY) setState(existing)
      return existing
    }

    const isToday = date === TODAY
    setLoadingText(isToday ? "Crafting today's puzzle..." : 'Generating this puzzle...')
    setLoading(true)

    try {
      const res = await fetch('/api/puzzle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          weekTheme: weekTheme?.theme_name || 'Reflection',
          type: 'puzzle'
        })
      })
      const puzzle = await res.json()
      if (puzzle.error) throw new Error(puzzle.error)
      save(date, puzzle)
      return puzzle
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
    const updated = {
      ...s,
      guesses: [...(s.guesses || []), { text: guess, correct }],
    }
function submitGuessExact(date, guess, correct) {
    const s = load(date) || state
    if (!s?.word || s.solved) return null
    const updated = {
      ...s,
      guesses: [...(s.guesses || []), { text: guess, correct }],
    }
    const wrongCount = updated.guesses.filter(g => !g.correct).length
    if (correct || wrongCount >= 6) updated.solved = true
    save(date, updated)
    return updated
  }
    const wrongCount = updated.guesses.filter(g => !g.correct).length
    if (correct || wrongCount >= 6) {
      updated.solved = true
    }

    save(date, updated)
    return updated
  }

  function revealClue(date, idx) {
    const s = load(date) || state
    if (!s?.word) return
    const used = s.cluesUsed || []
    if (used.includes(idx)) return
    const updated = { ...s, cluesUsed: [...used, idx] }
    save(date, updated)
    return updated
  }

  function saveJournal(date, text) {
    const s = load(date) || state
    const updated = { ...s, journal_entry: text, done_journal: true }
    save(date, updated)
    return updated
  }

  function setDone(date, key) {
    const s = load(date) || state
    const updated = { ...s, ['done_' + key]: true }
    save(date, updated)
    if (date === TODAY) setState(updated)
  }

  function calcStreak() {
    let streak = 0
    const d = new Date()
    for (let i = 0; i < 365; i++) {
      const key = 'whilo_' + d.toISOString().split('T')[0]
      try {
        const e = JSON.parse(localStorage.getItem(key))
        if (e?.solved) { streak++; d.setDate(d.getDate() - 1) }
        else break
      } catch { break }
    }
    return streak
  }

  function getArchiveDays(limit = 30) {
    const days = []
    for (let i = 1; i <= limit; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(d.toISOString().split('T')[0])
    }
    // Also include any extra saved entries
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('whilo_2')) {
        const date = k.replace('whilo_', '')
        if (!days.includes(date) && date !== TODAY) days.push(date)
      }
    }
    return days.sort().reverse()
  }

  function completeOnboard() {
    localStorage.setItem('whilo_onboard', 'true')
    setOnboardDone(true)
  }

return {
    state, activeDate, loading, loadingText, weekTheme, onboardDone,
    TODAY, load, save,
    startPuzzle, submitGuess, submitGuessExact, revealClue, saveJournal, setDone,
    calcStreak, getArchiveDays, completeOnboard
  }
