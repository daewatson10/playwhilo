export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) return res.status(500).json({ error: 'NO KEY' });

  const { date, weekTheme, type } = req.body;
  const theme = weekTheme || 'Reflection';

  try {
    if (type === 'weekTheme') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          messages: [{ role: 'user', content: 'Generate a weekly theme for Whilo (a mindful word game). Return ONLY raw JSON no markdown: {"theme_name":"Patience","theme_description":"A week on waiting"}' }]
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

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1200,
        messages: [{
          role: 'user',
          content: `You are the puzzle designer for Whilo, a mindful daily word game.

Create a puzzle for ${dateLabel}. Week theme: "${theme}". ${isSunday ? 'Sunday — make it the hardest of the week.' : ''}

Rules:
- Pick a conceptually rich word (emotion, state, phenomenon)
- Riddle: poetic and metaphorical, 2-4 guesses average, no cliches
- Concept clue: philosophical essence without naming the word
- Context clue: specific vivid real-world scene
- Behavior clue: what the word does to people or situations
- Reflection: 270 words, honest grounded tone, use the word exactly 5 times
- No greeting-card wisdom

Return ONLY this raw JSON with no markdown fences:
{
  "word": "WORD",
  "riddle": "poetic riddle here",
  "concept_clue": "abstract clue",
  "context_clue": "specific scene clue",
  "behavior_clue": "effect clue",
  "reflection": "270 word reflection",
  "world_note": null,
  "challenge": "Today do something...",
  "journal_prompt": "An open question...",
  "solved_subtitle": "Short poetic line",
  "week_theme": "${theme}"
}`
        }]
      })
    });

    const d = await r.json();
    if (d.error) return res.status(500).json({ error: d.error.message });
    const text = d.content[0].text.trim().replace(/```json|```/g, '').trim();
    const puzzle = JSON.parse(text);
    return res.status(200).json({ ...puzzle, date, guesses: [], cluesUsed: [] });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
