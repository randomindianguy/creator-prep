"""
Creator Prep + Confidence Coach — Backend API
Helps first-time TikTok creators go from idea to posted video.

Flow:
1. Creator Prep: Topic → Disambiguation Questions → Blueprint
2. Confidence Coach: During recording, detect pauses → nudge with their own words

Stack: Whisper API + Claude API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic
from dotenv import load_dotenv
import os
import tempfile
import subprocess
import time
import json

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize Claude client
claude = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Try to load Whisper (may not be available in all environments)
whisper_model = None
try:
    import whisper
    print("Loading Whisper model...")
    whisper_model = whisper.load_model("tiny")
    print("Whisper model loaded!")
except ImportError:
    print("Whisper not available — /analyze endpoint disabled")
except Exception as e:
    print(f"Whisper load failed: {e} — /analyze endpoint disabled")


# ============================================================
# CREATOR PREP ENDPOINTS
# ============================================================

QUESTIONS_SYSTEM = """You are an AI embedded in TikTok's creator tools. Your job is to help first-time creators clarify their OWN thoughts before recording a talking-to-camera video.

You will receive a niche and topic. Generate exactly 4 disambiguation questions that extract the creator's genuine opinions and angles. For each question, provide 3 tappable answer options.

CRITICAL RULES:
- Questions should uncover THEIR specific take, not generic knowledge
- Options should represent genuinely different angles/opinions, not just variations of the same thing
- Options should be short (under 12 words), punchy, and opinionated
- Questions should build on each other: start with their core take, then go deeper
- Never generate options that tell them what to think — each option should represent a real position someone might hold

Respond with ONLY this JSON (no markdown, no backticks, no extra text):
{"questions": [{"question": "question text", "options": ["option 1", "option 2", "option 3"]}, {"question": "question text", "options": ["option 1", "option 2", "option 3"]}, {"question": "question text", "options": ["option 1", "option 2", "option 3"]}, {"question": "question text", "options": ["option 1", "option 2", "option 3"]}]}"""

BLUEPRINT_SYSTEM = """You are an AI embedded in TikTok's creator tools. A creator has answered disambiguation questions about their video topic. Using ONLY their answers, generate a structured blueprint for their TikTok video.

CRITICAL RULES:
- Use THEIR words, opinions, and framing — reorganize, don't replace
- The hook should be their strongest/most provocative opinion rephrased as a punchy opener
- Beats should follow the natural logic of their argument
- The closer should invite comments/discussion
- Everything must sound like THEM, not like an AI wrote it

Respond with ONLY this JSON (no markdown, no backticks, no extra text):
{"hook": "their opening line", "beats": ["beat 1", "beat 2", "beat 3"], "closer": "closing thought", "duration": "estimated seconds as string", "tip": "one specific format tip for this niche"}"""

COACH_SYSTEM = """You're a thought partner helping a TikTok creator continue their train of thought. They were recording and froze.

Your job: suggest what they could say NEXT. Not a clarifying question. Not asking them to repeat. The next logical beat in their thought.

WRONG: "What's your company's mission?" (asks for info they already gave)
WRONG: "Can you give an example?" (generic)
RIGHT: "You could explain HOW that works — like what barrier it removes"
RIGHT: "Next you might say what that looks like in practice"

The prompt should feel like a friend saying "oh and then you could mention..."

Give ONE short continuation prompt (under 15 words). Just the prompt, no explanation."""


@app.route("/generate-questions", methods=["POST"])
def generate_questions():
    """
    Generate disambiguation questions for a given niche + topic.
    Returns 4 questions, each with 3 tappable options.
    """
    data = request.get_json()
    niche = data.get("niche", "")
    topic = data.get("topic", "")

    if not niche or not topic:
        return jsonify({"error": "niche and topic are required"}), 400

    try:
        message = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=QUESTIONS_SYSTEM,
            messages=[{"role": "user", "content": f"Niche: {niche}\nTopic: {topic}"}]
        )

        text = message.content[0].text.strip()
        print(f"Raw response: {text[:200]}...")

        # Robust JSON extraction: find the first { and last }
        text = text.replace("```json", "").replace("```", "").strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise json.JSONDecodeError("No JSON object found", text, 0)
        text = text[start:end]
        result = json.loads(text)

        return jsonify({"success": True, **result})

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}\nRaw text: {text}")
        return jsonify({"error": "Failed to parse AI response"}), 500
    except Exception as e:
        print(f"Question generation error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/generate-blueprint", methods=["POST"])
def generate_blueprint():
    """
    Generate a video blueprint from the creator's Q&A answers.
    Returns hook, beats, closer, duration, and tip.
    """
    data = request.get_json()
    niche = data.get("niche", "")
    topic = data.get("topic", "")
    qa_pairs = data.get("qa_pairs", [])

    if not qa_pairs:
        return jsonify({"error": "qa_pairs are required"}), 400

    qa_text = "\n\n".join([f"Q: {qa['question']}\nA: {qa['answer']}" for qa in qa_pairs])

    try:
        message = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1000,
            system=BLUEPRINT_SYSTEM,
            messages=[{"role": "user", "content": f"Niche: {niche}\nTopic: {topic}\n\nCreator's answers:\n{qa_text}"}]
        )

        text = message.content[0].text.strip()
        print(f"Blueprint raw: {text[:200]}...")
        text = text.replace("```json", "").replace("```", "").strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise json.JSONDecodeError("No JSON object found", text, 0)
        text = text[start:end]
        result = json.loads(text)

        return jsonify({"success": True, **result})

    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}\nRaw text: {text}")
        return jsonify({"error": "Failed to parse AI response"}), 500
    except Exception as e:
        print(f"Blueprint generation error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/coach-nudge", methods=["POST"])
def coach_nudge():
    """
    Generate a coaching nudge based on the creator's blueprint and current position.
    Used during recording when the creator pauses.
    """
    data = request.get_json()
    current_beat = data.get("current_beat", "")
    next_beat = data.get("next_beat", "")
    context = data.get("context", "")

    prompt_text = f"They were talking about: \"{current_beat}\""
    if next_beat:
        prompt_text += f"\nTheir next planned point is: \"{next_beat}\""
    if context:
        prompt_text += f"\nAdditional context from their prep: {context}"

    try:
        message = claude.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=100,
            system=COACH_SYSTEM,
            messages=[{"role": "user", "content": prompt_text}]
        )

        nudge = message.content[0].text.strip().strip('"')
        return jsonify({"success": True, "nudge": nudge})

    except Exception as e:
        print(f"Coach nudge error: {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# CONFIDENCE COACH ENDPOINTS (existing)
# ============================================================

def transcribe_audio(audio_path: str) -> dict:
    """Transcribe audio using Whisper with word-level timestamps."""
    if not whisper_model:
        raise Exception("Whisper model not available")

    wav_path = audio_path.replace(".webm", ".wav")
    result = subprocess.run([
        "ffmpeg", "-y", "-i", audio_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", wav_path
    ], capture_output=True, text=True)

    if result.returncode != 0:
        raise Exception(f"Audio conversion failed: {result.stderr}")

    result = whisper_model.transcribe(wav_path, word_timestamps=True, verbose=False)

    words = []
    for segment in result["segments"]:
        if "words" in segment:
            for word in segment["words"]:
                words.append({"word": word["word"], "start": word["start"], "end": word["end"]})

    if os.path.exists(wav_path):
        os.remove(wav_path)

    return {"text": result["text"], "words": words}


def detect_pauses(words: list, threshold: float = 3.0) -> list:
    """Find gaps > threshold seconds between words."""
    pauses = []
    for i in range(1, len(words)):
        gap = words[i]["start"] - words[i - 1]["end"]
        if gap >= threshold:
            context = get_context_before(words, i, seconds=15)
            pauses.append({
                "pause_start": round(words[i - 1]["end"], 2),
                "pause_end": round(words[i]["start"], 2),
                "duration": round(gap, 2),
                "word_before": words[i - 1]["word"],
                "word_after": words[i]["word"],
                "context_before": context
            })
    return pauses


def get_context_before(words: list, index: int, seconds: float = 15) -> str:
    """Extract transcript from ~15 seconds before a pause."""
    if index == 0:
        return ""
    pause_time = words[index]["start"]
    cutoff = pause_time - seconds
    return " ".join([w["word"] for w in words[:index] if w["start"] >= cutoff])


def generate_prompt(context: str) -> str:
    """Generate a continuation prompt using Claude."""
    if not context or len(context.strip()) < 10:
        return "What's the main point you want to make?"

    message = claude.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=100,
        system=COACH_SYSTEM,
        messages=[{"role": "user", "content": f'They were saying: "{context}"'}]
    )
    return message.content[0].text.strip().strip('"')


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "creator-prep",
        "whisper_available": whisper_model is not None
    })


@app.route("/analyze", methods=["POST"])
def analyze():
    """Full recording analysis: transcribe → detect pauses → generate prompts."""
    if not whisper_model:
        return jsonify({"error": "Whisper not available on this server"}), 503

    start_time = time.time()

    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files["audio"]

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        audio_path = tmp.name
        audio_file.save(audio_path)

    try:
        transcription = transcribe_audio(audio_path)
        pauses = detect_pauses(transcription["words"], threshold=3.0)

        for pause in pauses:
            if pause["context_before"]:
                pause["ai_prompt"] = generate_prompt(pause["context_before"])
            else:
                pause["ai_prompt"] = "What's the main point you want to make?"

        duration = transcription["words"][-1]["end"] if transcription["words"] else 0

        return jsonify({
            "success": True,
            "transcript": transcription["text"],
            "words": transcription["words"],
            "pauses": pauses,
            "stats": {
                "duration": round(duration, 1),
                "word_count": len(transcription["text"].split()),
                "pause_count": len(pauses)
            },
            "processing_time_seconds": round(time.time() - start_time, 2)
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    print("\n✦ Creator Prep + Confidence Coach API")
    print("=" * 50)
    print("Phase 1: Disambiguate → Blueprint (Claude)")
    print("Phase 2: Record with Teleprompter")
    print("Phase 3: Coach nudges on pause (Claude)")
    print("Phase 4: Post-recording analysis (Whisper + Claude)")
    print("=" * 50)
    print("\nEndpoints:")
    print("  POST /generate-questions  — Disambiguation questions")
    print("  POST /generate-blueprint  — Video blueprint from Q&A")
    print("  POST /coach-nudge         — Real-time coaching nudge")
    print("  POST /analyze             — Full recording analysis")
    print("  GET  /health              — Health check")
    print("=" * 50 + "\n")

    port = int(os.getenv("PORT", 5001))
    app.run(debug=False, host="0.0.0.0", port=port)