Live demo here: [creator-prep.vercel.app](https://creator-prep.vercel.app/)

---

# Creator Prep

**AI-powered creator activation for TikTok** — helps first-time creators go from "I have an opinion" to "I just posted my first video."

Not by telling them what to say — by helping them figure out what they already think.

---

## The Problem

95% of TikTok users never post. The instinct is to call that a confidence problem — but it's not.

Through user research with daily TikTok consumers who've never posted, the consistent finding was: **"I know what I think. I just freeze when I try to say it."**

That's not a confidence gap. It's not a content gap (which is what AI script generators assume). It's an **articulation gap** — the thoughts are there, they just can't get organized when the camera turns on.

**B=MAT framing:**

- ✅ **Motivation** — they want to post
- ✅ **Trigger** — trends, sounds, opinions on things they care about
- ❌ **Ability** — articulating clearly in the moment

Creator Prep solves for ability.

## How It Works

**Phase 1: Clarify** — AI generates disambiguation questions with tappable options. Each option represents a genuinely different angle on the topic. 4 questions, 3 options each, ~30 seconds. No typing, no blank-page anxiety.

**Phase 2: Structure** — Answers become a blueprint: Hook → Talking Beats → Closer. The AI reorganizes the creator's thoughts into a natural flow — but every idea is theirs. No AI-generated scripts.

**Phase 3: Record + Coach** — Record with talking points overlaid as a teleprompter. If you freeze, the system detects the pause and nudges you forward with your own next point.

**Phase 4: Practice Loop** — Post-recording analysis via Whisper transcription + Claude coaching. Specific feedback on where you stumbled. Hit "Practice Again" and coaching prompts merge into the teleprompter as new beats. Each take gets tighter.

### Key Design Insight

**Disambiguation before generation.** Every other AI creator tool generates the same generic scripts. Creator Prep extracts the creator's unique take first, then organizes it. Two creators with the same topic get completely different blueprints — because they have different opinions.

## Tech Stack


| Layer            | Tool               | Why                                                                                                                                  |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| LLM              | Claude (Anthropic) | Precise instruction-following for structured JSON output — disambiguation questions need genuinely divergent options, not variations |
| Transcription    | OpenAI Whisper API | Word-level timestamps enable pause detection and context-aware coaching. API keeps the deploy lightweight (~200MB vs ~8GB local)     |
| Backend          | Flask + Python     | Lightweight, 4 endpoints, fast to iterate                                                                                            |
| Frontend         | Vanilla JS         | No framework overhead, TikTok-native camera UI needs direct DOM/media control                                                        |
| Backend Hosting  | Railway            | Simple Python deploys with env var management                                                                                        |
| Frontend Hosting | Vercel             | Static deploy, instant cache invalidation                                                                                            |


## API Endpoints

```
POST /generate-questions   → Niche + topic → 4 disambiguation questions with 3 options each
POST /generate-blueprint   → Questions + answers → Hook, beats, closer blueprint
POST /coach-nudge          → Blueprint context → Continuation prompt for pause moments
POST /analyze              → Audio file → Whisper transcription + pause detection + coaching prompts
GET  /health               → Status check

```

## Local Development

### Prerequisites

- Python 3.10+
- `ANTHROPIC_API_KEY` in `.env`
- `OPENAI_API_KEY` in `.env` (for Whisper transcription)

### Backend

```bash
pip install flask flask-cors anthropic openai python-dotenv
python app.py
# Runs on http://localhost:5001

```

### Frontend

```bash
python3 -m http.server 8000
# Opens at http://localhost:8000

```

Update `API_URL` in `app.js` to point to your backend (`http://localhost:5001` for local, or your Railway URL for production).

## Project Structure

```
├── index.html          # Landing page + phone mockup demo
├── style.css           # TikTok design system (Plus Jakarta Sans, cyan/red palette)
├── app.js              # Demo flow, camera, teleprompter, practice loop
├── app.py              # Flask API — Claude + Whisper API integration
├── requirements.txt    # Python dependencies
├── Procfile            # Gunicorn config for Railway
├── .env.example        # Required API keys
└── README.md

```

## What I Learned

My v1 went straight to the recording step — teleprompter, silence detection, coaching nudges. When I gave it to people, the reaction was lukewarm. They'd open the camera and still freeze, because the teleprompter was showing them talking points that didn't feel like *theirs*.

That's when the real insight clicked: **the hard part isn't the recording — it's everything before you hit record.** If a creator doesn't know exactly what angle they're taking, no amount of in-the-moment coaching will help.

This version — the disambiguation flow, the questions, the blueprint — is the deeper solve. By the time they open the camera, they've already figured out what they think. The teleprompter is just a safety net.

## Strategic Context

**Why now** — AI hit the quality threshold for real-time coaching. Creator activation is TikTok's biggest growth lever. The bottleneck isn't user acquisition — it's getting existing users to start creating.

**Why TikTok** — Watch history already knows your niche. The camera is already open. Distribution is built in. This is a platform feature that only TikTok can build.

**The data flywheel** — Every completed flow generates signal: which question patterns lead to posted videos, which niches need which types of disambiguation. The tool compounds over time.

**North star metric** — Net new first-time posts per week. Creators who would have stayed silent, now posting.

---

Built by [Sidharth Sundaram](https://www.linkedin.com/in/sidharthsundaram/) · Not affiliated with TikTok Inc.
