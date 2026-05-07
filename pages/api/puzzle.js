// pages/api/puzzle.js
// This runs on the SERVER — the Anthropic API key never reaches the browser

const CLUE_SYSTEM = `You are the puzzle designer for Whilo, a mindful daily word game.

CLUE QUALITY RULES — critical:
- CONCEPT CLUE: Philosophical essence of the word WITHOUT naming it or any synonym. Creates an "aha" on reflection, not immediately. Example for SILENCE: "The thing a room holds when everyone is listening for something that never comes."
- CONTEXT CLUE: Specific, vivid, grounded real-world scene. NOT vague. NOT "found in nature." Example for SILENCE: "What fills a recording studio the moment the engineer signals stop."
- BEHAVIOR CLUE: What the word actively DOES to a person or situation. An effect or action. Example for SILENCE: "It expands when you try to fill it, and shrinks when you stop trying."

RIDDLE RULES:
- Poetic, layered, uses metaphor and paradox. NOT a dictionary definition.
- Should take an average person 2-4 guesses. Not a 1-guess giveaway, not impossible.
- Avoid: common 5-letter game words (CRANE, LIGHT, MUSIC, STARE, etc.)
- Choose words that are conceptually rich: emotions, states, phenomena, abstract nouns
- NO clichés. NO greeting-card wisdom. Write like a sharp essayist who loves puzzles.

REFLECTION (Today's Thread) RULES:
- 260-300 words. Use the word naturally exactly 5 times.
- Tone: honest, grounded, occasionally wry. NOT motivational-poster language.
- Write like something you'd underline in a good book, not something on a calendar.
- If world_note is included: one real, universal human/natural observation. Never political.

Return ONLY a raw JSON object. No markdown fences. No extra text before or after.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date, weekTheme, type } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const parsedDate = new Date(date + 'T12:00:00');
    const dateLabel = parsedDate.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });
    const isSunday = parsedDate.getDay() === 0;
    const theme = weekTheme || 'Reflection';
    const useWorld = Math.random() > 0.55;

    let prompt;

    if (type === 'weekTheme') {
      // Generate weekly theme
      prompt = 'Generate a weekly theme for Whilo (a mindful word game). Return ONLY raw JSON: {"theme_name":"Patience","theme_description":"A week on the quiet art of waiting"}';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: 'You create weekly themes for Whilo. Themes: universal, human, non-political, not clichéd. One to two words max for theme_name. Return ONLY raw JSON.',
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const text = data.content[0].text.trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(text);
      return res.status(200).json(parsed);
    }

    // Generate full daily puzzle
    const worldInstruction = useWorld
      ? 'Include "world_note": 1-2 sentences grounding the word in a real, universally observable human or natural phenomenon — never political, never divisive.'
      : 'Set "world_note": null.';

    prompt = `Date: ${dateLabel}. Week theme: "${theme}". ${isSunday ? 'This is Sunday — make this the hardest puzzle of the week. The word should touch on what ties this week\'s theme together.' : ''}
${worldInstruction}

Return ONLY this raw JSON (no markdown fences):
{
  "word": "WORD_HERE",
  "riddle": "poetic riddle",
  "concept_clue": "abstract essence without naming the word",
  "context_clue": "specific vivid real-world scene",
  "behavior_clue": "what the word does to people or situations",
  "reflection": "260-300 word reflection using the word exactly 5 times",
  "world_note": null,
  "challenge": "One sentence starting with Today — a gentle real-world action tied to the word",
  "journal_prompt": "One honest open-ended question for personal reflection",
  "solved_subtitle": "A short poetic line for the word reveal moment",
  "week_theme": "${theme}"
}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system: CLUE_SYSTEM,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const text = data.content[0].text.trim().replace(/```json|```/g, '');
    const puzzle = JSON.parse(text);

    return res.status(200).json({
      ...puzzle,
      date,
      guesses: [],
      cluesUsed: []
    });

  } catch (error) {
    console.error('Puzzle generation error:', error);
    return res.status(500).json({ error: 'Failed to generate puzzle', details: error.message });
  }
}
