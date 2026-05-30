// pages/api/generate-week.js
// Runs every Sunday at 3pm ET (8pm UTC)
// Pre-generates all 7 puzzles for the coming week as drafts

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '').trim()
          : undefined,
      })
    })
  }
  return getFirestore()
}

function getNextWeekDates() {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const dow = today.getDay()
  // Get next Monday
  const nextMonday = new Date(today)
  nextMonday.setDate(today.getDate() + (dow === 0 ? 1 : 8 - dow))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nextMonday)
    d.setDate(nextMonday.getDate() + i)
    return d.toLocaleDateString('en-CA')
  })
}

const CLUE_SYSTEM = `CRITICAL: You are writing for a FUN WORD GAME, not a wellness app. Every riddle must sound like a game show host, not a therapist.

ABSOLUTE RULE — WORD BANK: You will be given a list of already-used words. Using ANY word from this list is a critical failure. Check every candidate word against this list before proceeding.

WORD SELECTION:
- The word can be ANYTHING: animal, object, food, weather, body part, sport, tool, vehicle, plant, clothing, place, action
- Pick randomly from one of these categories each day: Animal, Food/drink, Weather/nature, Tool/object, Human body, Sport/game, Clothing/accessory, Place/structure, Action/sound, Plant/growth
- The word should make someone say "oh of course!" when revealed
- NEVER pick abstract concepts, emotions, or states of mind
- 3-8 letters. NO common synonyms of similar length.
- NEVER use: bridge, roots, root, anchor, tide, ember, threshold, mirror, fog, echo, shadow, drift, bloom, harbor, clearing, current, gravity, weight, stillness, soil, dirt, pupil, honey, lens, scar, puddle, shell, bread, whisker, wrinkle

RIDDLE RULES:
- 3 sentences. Game show energy — punchy, confident, a little funny.
- The riddle speaks AS the word using "I" or "me"
- Vary the angle each day: sometimes lead with cause, sometimes where it shows up, sometimes what people do with it
- At least one sentence must include something unexpected or abstract alongside real specific things — this creates misdirection
- End with a short dry human truth that lands like a punchline
- NEVER describe the word directly or name its category
- NEVER be poetic, emotional, or motivational — this is a game not a wellness app
- The answer should feel obvious the moment they get it, impossible before
- Difficulty target: 4-5 guesses average

GOOD EXAMPLE (word: DENT):
"Something hit me hard enough to leave a mark but not hard enough to finish the job. I'm everywhere — your car, your trash can, your ego. Most people just learn to live with me."
This is correct because it's punchy, specific, funny, and the answer feels obvious in hindsight.

BAD EXAMPLE — NEVER write like this:
"I show up uninvited when you sleep, smile, or just exist long enough. I'm not a flaw — I'm evidence you've been alive."
This is wrong because it's poetic, emotional, and reads like a self-help quote.

HINT RULES:
- Write exactly 3 hints: hint_1, hint_2, hint_3
- Hint 1: Least helpful, most misdirecting — fits many wrong answers
- Hint 2: More specific, rules out more wrong answers
- Hint 3: Most specific — after this they should be down to 1-2 possible answers
- All 3 together feel like a fun game show not a meditation app
- NEVER write a hint that makes the answer obvious on its own

REFLECTION:
- 260-300 words. Use the word naturally exactly 5 times
- Tone: honest, warm, grounded. Occasionally wry. NOT motivational-poster language.
- Connect to real human experience

CHALLENGE RULES:
- One sentence starting with Today
- Completely free — no buying, no spending, no acquiring anything
- Doable in under 5 minutes
- Connected to the word in a genuine way

Return ONLY raw JSON. No markdown fences.`

export default async function handler(req, res) {
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const apiKey = process.env.ANTHROPIC_KEY
  if (!apiKey) return res.status(500).json({ error: 'No API key' })

  try {
    const db = getAdminDb()
    const dates = getNextWeekDates()

    // Get week theme for next week
    const weekKey = dates[0]
    let theme = 'Reflection'
    const themeSnap = await db.collection('weekThemes').doc(weekKey).get()
    if (themeSnap.exists) {
      theme = themeSnap.data().theme_name
    } else {
      // Generate new week theme
      const tr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          messages: [{ role: 'user', content: 'Generate a weekly theme for Whilo (a mindful word game). Universal and human. Return ONLY raw JSON: {"theme_name":"Patience","theme_description":"A week on waiting"}' }]
        })
      })
      const td = await tr.json()
      const themeData = JSON.parse(td.content[0].text.trim().replace(/```json|```/g, '').trim())
      await db.collection('weekThemes').doc(weekKey).set({ ...themeData, weekKey, createdAt: new Date() })
      theme = themeData.theme_name
    }

    // Get used words bank
    let usedWords = []
    try {
      const snap = await db.collection('dailyPuzzles').orderBy('createdAt', 'desc').limit(200).get()
      usedWords = snap.docs.map(d => d.data().word).filter(Boolean)
    } catch (e) {
      console.error('Could not fetch used words:', e)
    }

    const results = []
    for (const date of dates) {
      // Skip if already generated
      const existing = await db.collection('dailyPuzzles').doc(date).get()
      if (existing.exists) {
        results.push({ date, status: 'skipped', word: existing.data().word })
        continue
      }

      const parsedDate = new Date(date + 'T12:00:00')
      const dateLabel = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      const isSunday = parsedDate.getDay() === 0
      const useWorld = Math.random() > 0.6
      const worldInstruction = useWorld
        ? 'Include "world_note": 1-2 sentences connecting the word to a real universal observation — never political.'
        : 'Set "world_note": null.'

      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5',
            max_tokens: 1400,
            system: CLUE_SYSTEM,
            messages: [{
              role: 'user',
              content: `Create a Whilo daily puzzle.
Date: ${dateLabel}
Week theme: "${theme}"
${isSunday ? 'Sunday — word should connect to the week theme.' : ''}
${worldInstruction}
BANNED WORDS — DO NOT USE ANY OF THESE: ${[...usedWords, ...results.map(r => r.word)].filter(Boolean).join(', ')}.

Return ONLY raw JSON:
{
  "word": "WORD",
  "riddle": "2-3 sentence punchy game-show riddle",
  "concept_clue": "witty narrowing clue",
  "context_clue": "specific real-world scene",
  "behavior_clue": "what it does with dry wit",
  "reflection": "260-300 words using word exactly 5 times",
  "world_note": null,
  "challenge": "Today do one specific free action",
  "journal_prompt": "One honest open-ended question",
  "solved_subtitle": "Short line for word reveal",
  "week_theme": "${theme}",
  "synonyms": ["2-3 common synonyms"]
}`
            }]
          })
        })

        const d = await r.json()
        if (d.error) throw new Error(d.error.message)
        const puzzle = JSON.parse(d.content[0].text.trim().replace(/```json|```/g, '').trim())

        await db.collection('dailyPuzzles').doc(date).set({
          ...puzzle,
          date,
          approved: false,
          createdAt: new Date()
        })

        usedWords.push(puzzle.word)
        results.push({ date, status: 'generated', word: puzzle.word })

        // Small delay between generations
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (e) {
        console.error('Error generating for', date, e)
        results.push({ date, status: 'error', error: e.message })
      }
    }

    return res.status(200).json({ success: true, theme, results })

  } catch (e) {
    console.error('Generate week error:', e)
    return res.status(500).json({ error: e.message })
  }
}
