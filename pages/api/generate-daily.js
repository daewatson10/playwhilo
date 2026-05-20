// pages/api/generate-daily.js
// Called by Vercel cron at midnight ET every day
// Generates and stores the shared daily puzzle for all users

import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY
      .replace(/\\n/g, '\n')
      .replace(/^["']|["']$/g, '')
      .trim()
  : undefined,
      })
    })
  }
  return getFirestore()
}

const CLUE_SYSTEM = `You are the puzzle designer for Whilo, a mindful daily word game.

WORD SELECTION:
- The word can be ANYTHING: animal, object, food, weather, body part, sport, tool, vehicle, plant, clothing, place, action
- Pick randomly from one of these categories each day: Animal, Food/drink, Weather/nature, Tool/object, Human body, Sport/game, Clothing/accessory, Place/structure, Action/sound, Plant/growth
- The word should make someone say "oh of course!" when revealed
- NEVER pick abstract concepts or states of mind
- 3-8 letters
- NO common synonyms of similar length — pick words where only one answer fits
- NEVER use: bridge, roots, anchor, tide, ember, threshold, mirror, fog, echo, shadow, drift, bloom, harbor, clearing, current, gravity, weight, stillness

RIDDLE RULES:
- 2-3 sentences. Clever, witty, a little cheeky. Think puzzle not poem.
- The tone is a smart friend teasing you, not a philosopher musing
- Wordplay, misdirection, unexpected angles encouraged
- NO poetic language, NO "whispers", NO "arrives uninvited" phrasing
- Makes someone smile and want to guess

CLUE RULES:
- CONCEPT: Witty and specific. Like a good quiz question. NOT philosophical
- CONTEXT: Specific funny or unexpected real-world scene. Makes you go "oh obviously"  
- BEHAVIOR: What it does — stated plainly with dry wit. Not abstract.
- All three clues together should feel like a fun game show not a meditation app

REFLECTION (Today's Thread):
- 260-300 words. Use the word naturally exactly 5 times
- Tone: honest, warm, grounded. Occasionally wry
- NOT motivational-poster language
- Connect to real human experience

Return ONLY raw JSON. No markdown fences.`

export default async function handler(req, res) {
  // Verify this is called from cron or internally
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const apiKey = process.env.ANTHROPIC_KEY
  if (!apiKey) return res.status(500).json({ error: 'No API key' })

  try {
    const db = getAdminDb()

    // Get ET date for tomorrow (this runs at midnight ET)
    const tomorrow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
    tomorrow.setDate(tomorrow.getDate() + 1)
    const date = tomorrow.toLocaleDateString('en-CA')

    // Check if already generated
    const existing = await db.collection('dailyPuzzles').doc(date).get()
    if (existing.exists) {
      return res.status(200).json({ message: 'Already generated', date })
    }

    // Get week theme
    const weekStart = new Date(tomorrow)
    const day = weekStart.getDay()
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1)
    weekStart.setDate(diff)
    const weekKey = weekStart.toLocaleDateString('en-CA')

    const weekThemeDoc = await db.collection('weekThemes').doc(weekKey).get()
    const theme = weekThemeDoc.exists ? weekThemeDoc.data().theme_name : 'Reflection'

    // Get used words to avoid repeats
    const recentPuzzles = await db.collection('dailyPuzzles')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get()
    const usedWords = recentPuzzles.docs.map(d => d.data().word).filter(Boolean)

    const isSunday = tomorrow.getDay() === 0
    const useWorld = Math.random() > 0.6
    const worldInstruction = useWorld
      ? 'Include "world_note": 1-2 sentences connecting the word to a real universal human or natural observation — never political.'
      : 'Set "world_note": null.'

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1400,
        system: CLUE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Create a Whilo daily puzzle.
Date: ${tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
Week theme: "${theme}"
${isSunday ? 'Sunday — word should connect to the week theme.' : ''}
${worldInstruction}
NEVER use these already-used words: ${usedWords.slice(0, 50).join(', ')}

Return ONLY raw JSON:
{
  "word": "WORD",
  "riddle": "2-3 sentence clever witty riddle",
  "concept_clue": "witty specific clue",
  "context_clue": "specific real-world scene",
  "behavior_clue": "what it does with dry wit",
  "reflection": "260-300w using word 5x",
  "world_note": null,
  "challenge": "Today do one specific action",
  "journal_prompt": "One honest open question",
  "solved_subtitle": "Short poetic line",
  "week_theme": "${theme}",
  "synonyms": ["2-3 common synonyms players might guess"]
}`
        }]
      })
    })

    const data = await r.json()
    if (data.error) throw new Error(data.error.message)

    const puzzle = JSON.parse(data.content[0].text.trim().replace(/```json|```/g, '').trim())

    await db.collection('dailyPuzzles').doc(date).set({
      ...puzzle,
      date,
      createdAt: new Date()
    })

    return res.status(200).json({ success: true, date, word: puzzle.word })

  } catch (e) {
    console.error('Generate daily error:', e)
    return res.status(500).json({ error: e.message })
  }
}
