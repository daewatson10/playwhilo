# Whilo

> One word · one reflection · one day

A daily mindful word game at [playwhilo.com](https://playwhilo.com)

---

## Deploy in 5 steps

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/whilo.git
cd whilo
npm install
```

### 2. Add your API key
```bash
cp .env.example .env.local
# Open .env.local and replace 'your_anthropic_api_key_here' with your real key
# Get it at: https://console.anthropic.com
```

### 3. Run locally
```bash
npm run dev
# Open http://localhost:3000
```

### 4. Push to GitHub
```bash
git add .
git commit -m "Initial Whilo deploy"
git push origin main
```

### 5. Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → Import your GitHub repo
2. In **Environment Variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
3. Click **Deploy**
4. Go to **Settings → Domains** → add `playwhilo.com`

---

## Project structure

```
whilo/
├── pages/
│   ├── index.js        ← The entire app
│   ├── _app.js         ← Global styles
│   ├── _document.js    ← HTML head / meta tags
│   └── api/
│       └── puzzle.js   ← Anthropic API (server-side, key stays secret)
├── lib/
│   └── useWhilo.js     ← All game state and localStorage logic
├── styles/
│   └── globals.css     ← Fonts and animations
├── public/
│   └── favicon.ico     ← Add your own
├── .env.example        ← Copy to .env.local, add your key
└── .gitignore
``` 

## Tech stack

- **Next.js** on Vercel — hosting and deploys
- **Anthropic API** — puzzle generation (server-side only)
- **localStorage** — saves progress per day, no database needed at launch
- **Web Speech API** — browser-native audio read-aloud
