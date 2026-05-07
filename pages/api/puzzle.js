// pages/api/puzzle.js
const CLUE_SYSTEM = `You are the puzzle designer for Whilo, a mindful daily word game.
CLUE RULES: Concept = philosophical essence without naming the word. Context = specific vivid real-world scene, never vague. Behavior = what the word actively does to people or situations.
RIDDLE: Poetic, metaphorical, 2-4 guesses average. No clichés. No greeting-card wisdom.
REFLECTION: 260-300 words. Word used 5 times. Honest and grounded tone.
Return ONLY raw JSON. No markdown fences.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { date, weekTheme, type } = req.body;

  try {
    if (type === 'weekTheme') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          system: 'Return ONLY raw JSON, no markdown.',
          messages: [{ role: 'user', content: 'Generate a weekly theme for Whilo (mindful word game). Return ONLY: {"theme_name":"Patience","theme_description":"A week on waiting"}' }]
        })
      });
      const d = await r.json();
      if (d.error) return res.status(500).json({ error: d.error.message });
      const parsed = JSON.parse(d.content[0].text.trim().replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    }

    const parsedDate = new Date(date + 'T12:00:00');
    const dateLabel = parsedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const isSunday = parsedDate.getDay() === 0;
    const theme = weekTheme || 'Reflection';
    const useWorld = Math.random() > 0.55;
    const worldInstruction = useWorld
      ? 'Include "world_note": 1-2 sentences grounding the word in a real universal human or natural observation — never political.'
      : 'Set "world_note": null.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1200,
        system: CLUE_SYSTEM,
        messages: [{
          role: 'user',
          content: `Date: ${dateLabel}. Theme: "${theme}". ${isSunday ? 'Sunday — hardest puzzle of week.' : ''} ${worldInstruction}\nReturn ONLY raw JSON:\n{"word":"WORD","riddle":"riddle","concept_clue":"clue","context_clue":"clue","behavior_clue":"clue","reflection":"260-300w using word 5x","world_note":null,"challenge":"Today sentence","journal_prompt":"open question","solved_subtitle":"short poetic line","week_theme":"${theme}"}`
        }]
      })
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const puzzle = JSON.parse(d.content[0].text.trim().replace(/```json|```/g, '').trim());
    return res.status(200).json({ ...puzzle, date, guesses: [], cluesUsed: [] });

  } catch (e) {
    console.error('Puzzle error:', e);
    return res.status(500).json({ error: e.message });
  }
}
