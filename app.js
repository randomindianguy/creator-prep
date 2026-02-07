/**
 * Creator Prep — Frontend Logic
 * Full flow: Topic → Disambiguation → Blueprint → Camera + Teleprompter + Coach
 */

// ═══════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════
const API_URL = 'http://localhost:5001'; // TODO: Change to Railway URL for production

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════
let state = {
  niche: null,
  topic: '',
  questions: [],
  currentQ: 0,
  answers: {},
  blueprint: null,
  // Camera
  stream: null,
  mediaRecorder: null,
  chunks: [],
  recording: false,
  seconds: 0,
  timerInterval: null,
  currentBeat: 0,
  // Coach
  silenceTimer: null,
  silenceThreshold: 4000, // 4 seconds
  nudgeVisible: false,
  audioContext: null,
  analyser: null,
  silenceStart: null,
  videoBlob: null,
  coachingPrompts: [],
  practiceCount: 0,
};

// All talking points (derived from blueprint)
let allPoints = [];

// ═══════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.demo-screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// SCREEN 1: TOPIC INPUT
// ═══════════════════════════════════════════════════════════
function initTopicScreen() {
  const nicheGrid = document.getElementById('niche-grid');
  const topicGroup = document.getElementById('topic-group');
  const topicInput = document.getElementById('topic-input');
  const btnStart = document.getElementById('btn-start');

  // Niche selection
  nicheGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.niche-btn');
    if (!btn) return;

    document.querySelectorAll('.niche-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.niche = btn.dataset.niche;

    topicGroup.classList.add('enabled');
    topicInput.focus();
    updateStartBtn();
  });

  // Topic input
  topicInput.addEventListener('input', () => {
    state.topic = topicInput.value.trim();
    updateStartBtn();
  });

  topicInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && state.topic && state.niche) startFlow();
  });

  btnStart.addEventListener('click', () => {
    if (state.topic && state.niche) startFlow();
  });

  function updateStartBtn() {
    const ready = state.niche && state.topic;
    btnStart.disabled = !ready;
    btnStart.classList.toggle('disabled', !ready);
  }
}

async function startFlow() {
  // Hide the annotation arrow
  const ann = document.getElementById('demo-annotation');
  if (ann) ann.classList.add('fadeout');

  showScreen('screen-loading');

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API_URL}/generate-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: state.niche, topic: state.topic }),
      });

      if (!res.ok) throw new Error('Failed to generate questions');
      const data = await res.json();

      state.questions = data.questions;
      state.currentQ = 0;
      state.answers = {};

      showQuestionScreen();
      return;
    } catch (err) {
      console.warn(`Attempt ${attempt + 1} failed:`, err);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1500));
      } else {
        console.error(err);
        alert('Failed to generate questions. Make sure the backend is running.');
        showScreen('screen-topic');
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SCREEN 2: DISAMBIGUATION QUESTIONS
// ═══════════════════════════════════════════════════════════
function showQuestionScreen() {
  showScreen('screen-questions');
  renderQuestion();
}

function renderQuestion() {
  const q = state.questions[state.currentQ];
  if (!q) return;

  // Context
  document.getElementById('q-context').textContent = `${state.niche} · ${state.topic}`;
  document.getElementById('q-counter').textContent = `${state.currentQ + 1}/${state.questions.length}`;

  // Progress bars
  document.querySelectorAll('.q-bar').forEach((bar, i) => {
    bar.classList.toggle('filled', i <= state.currentQ);
  });

  // Previous answers
  const prevDiv = document.getElementById('q-prev-answers');
  prevDiv.innerHTML = '';
  for (let i = 0; i < state.currentQ; i++) {
    if (state.answers[i]) {
      const el = document.createElement('div');
      el.className = 'q-prev-answer';
      el.innerHTML = `<span class="check">✓</span><span>${escapeHtml(state.answers[i])}</span>`;
      prevDiv.appendChild(el);
    }
  }

  // Question text
  document.getElementById('q-text').textContent = q.question;

  // Options
  const optDiv = document.getElementById('q-options');
  optDiv.innerHTML = '';

  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'q-option';
    btn.innerHTML = `<span class="q-option-num">${i + 1}</span> ${escapeHtml(opt)}`;
    btn.onclick = () => selectAnswer(opt);
    optDiv.appendChild(btn);
  });

  // "Something else" custom option
  const customBtn = document.createElement('button');
  customBtn.className = 'q-option q-custom';
  customBtn.innerHTML = `<span class="q-option-num">✎</span>Something else...`;
  customBtn.onclick = () => showCustomInput(optDiv, customBtn);
  optDiv.appendChild(customBtn);

  // Back button
  const backBtn = document.getElementById('q-back');
  backBtn.classList.toggle('hidden', state.currentQ === 0);
  backBtn.onclick = () => {
    if (state.currentQ > 0) {
      state.currentQ--;
      renderQuestion();
    }
  };
}

function showCustomInput(container, customBtn) {
  customBtn.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'q-custom-input';

  const input = document.createElement('input');
  input.placeholder = 'Type your own take...';
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && input.value.trim()) selectAnswer(input.value.trim());
  };

  const send = document.createElement('button');
  send.textContent = '→';
  send.onclick = () => { if (input.value.trim()) selectAnswer(input.value.trim()); };

  wrapper.appendChild(input);
  wrapper.appendChild(send);
  container.appendChild(wrapper);
  input.focus();
}

function selectAnswer(answer) {
  state.answers[state.currentQ] = answer;

  if (state.currentQ < state.questions.length - 1) {
    state.currentQ++;
    setTimeout(renderQuestion, 250);
  } else {
    generateBlueprint();
  }
}

// ═══════════════════════════════════════════════════════════
// GENERATING SCREEN
// ═══════════════════════════════════════════════════════════
async function generateBlueprint() {
  showScreen('screen-generating');

  // Set a simple summary line
  const summary = document.getElementById('gen-summary');
  summary.textContent = `${state.questions.length} answers about "${state.topic}" → building your blueprint`;

  try {
    const qaPairs = state.questions.map((q, i) => ({
      question: q.question,
      answer: state.answers[i],
    }));

    const res = await fetch(`${API_URL}/generate-blueprint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche: state.niche, topic: state.topic, qa_pairs: qaPairs }),
    });

    if (!res.ok) throw new Error('Failed to generate blueprint');
    const data = await res.json();
    state.blueprint = data;

    showBlueprintScreen();
  } catch (err) {
    console.error(err);
    alert('Failed to generate blueprint. Check backend connection.');
    showScreen('screen-questions');
  }
}

// ═══════════════════════════════════════════════════════════
// SCREEN 3: BLUEPRINT
// ═══════════════════════════════════════════════════════════
function showBlueprintScreen() {
  showScreen('screen-blueprint');

  const bp = state.blueprint;
  document.getElementById('bp-meta').textContent = `${state.niche} · ~${bp.duration}s · Your thoughts, organized.`;

  const content = document.getElementById('bp-content');
  content.innerHTML = '';

  // Hook
  content.innerHTML += `
    <div class="bp-card hook">
      <div class="bp-card-label">🎯 Hook — Open with this</div>
      <div class="bp-card-text">"${escapeHtml(bp.hook)}"</div>
    </div>
  `;

  // Beats
  bp.beats.forEach((beat, i) => {
    content.innerHTML += `
      <div class="bp-card">
        <div class="bp-card-label">Beat ${i + 1}</div>
        <div class="bp-card-text">${escapeHtml(beat)}</div>
      </div>
    `;
  });

  // Closer
  content.innerHTML += `
    <div class="bp-card closer">
      <div class="bp-card-label">💬 Closer</div>
      <div class="bp-card-text">"${escapeHtml(bp.closer)}"</div>
    </div>
  `;

  // Tip
  if (bp.tip) {
    content.innerHTML += `<div class="bp-tip">💡 ${escapeHtml(bp.tip)}</div>`;
  }

  // Build allPoints for teleprompter
  allPoints = [
    { label: 'HOOK', text: bp.hook, color: '#fe2c55' },
    ...bp.beats.map((b, i) => ({ label: `BEAT ${i + 1}`, text: b, color: '#fff' })),
    { label: 'CLOSER', text: bp.closer, color: '#25f4ee' },
  ];

  // Buttons
  document.getElementById('btn-restart').onclick = restart;
  document.getElementById('btn-record').onclick = showCameraScreen;
}

function restart() {
  state.niche = null;
  state.topic = '';
  state.questions = [];
  state.answers = {};
  state.blueprint = null;
  state.currentQ = 0;

  // Reset UI
  document.querySelectorAll('.niche-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('topic-input').value = '';
  document.getElementById('topic-group').classList.remove('enabled');

  showScreen('screen-topic');
}

// ═══════════════════════════════════════════════════════════
// SCREEN 4: CAMERA + TELEPROMPTER + COACH
// ═══════════════════════════════════════════════════════════
async function showCameraScreen() {
  showScreen('screen-camera');
  state.currentBeat = 0;
  state.recording = false;

  // Stop any previous review video playback
  const reviewVideo = document.getElementById('review-video');
  if (reviewVideo) {
    reviewVideo.pause();
    reviewVideo.src = '';
  }

  // Stop previous camera stream if any
  stopCamera();

  // Reset UI
  document.getElementById('tp-preview').style.display = '';
  document.getElementById('tp-recording').classList.add('hidden');
  document.getElementById('cam-timer').classList.add('hidden');
  document.getElementById('cam-progress').classList.add('hidden');
  document.getElementById('cam-tabs').classList.remove('hidden');
  document.getElementById('cam-sound').classList.remove('hidden');
  document.getElementById('cam-rec-inner').className = 'cam-rec-inner circle';
  document.getElementById('coach-nudge').classList.add('hidden');

  // Build preview dots
  const previewDots = document.getElementById('tp-dots-preview');
  previewDots.innerHTML = '';
  allPoints.forEach(() => {
    const dot = document.createElement('div');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.15);display:inline-block;margin:0 2px';
    previewDots.appendChild(dot);
  });

  // Start camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
      audio: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    state.stream = stream;
    const video = document.getElementById('cam-video');
    video.srcObject = stream;
    video.muted = true;

    // Setup audio analysis for silence detection
    setupAudioAnalysis(stream);
  } catch (e) {
    console.warn('Camera not available:', e);
  }

  // Button handlers
  document.getElementById('cam-rec-btn').onclick = () => {
    if (state.recording) stopRecording();
    else startCountdown();
  };

  document.getElementById('cam-close').onclick = () => {
    stopCamera();
    showScreen('screen-blueprint');
  };
}

function setupAudioAnalysis(stream) {
  try {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = state.audioContext.createMediaStreamSource(stream);
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 512;
    source.connect(state.analyser);
  } catch (e) {
    console.warn('Audio analysis not available:', e);
  }
}

function startCountdown() {
  const overlay = document.getElementById('cam-countdown');
  const numEl = document.getElementById('cam-count-num');
  overlay.classList.remove('hidden');

  let count = 3;
  numEl.textContent = count;
  // Re-trigger animation
  numEl.style.animation = 'none';
  void numEl.offsetHeight;
  numEl.style.animation = '';

  const interval = setInterval(() => {
    count--;
    if (count <= 0) {
      clearInterval(interval);
      overlay.classList.add('hidden');
      beginRecording();
    } else {
      numEl.textContent = count;
      numEl.style.animation = 'none';
      void numEl.offsetHeight;
      numEl.style.animation = '';
    }
  }, 900);
}

function beginRecording() {
  state.recording = true;
  state.currentBeat = 0;
  state.seconds = 0;

  // UI updates
  document.getElementById('tp-preview').style.display = 'none';
  document.getElementById('tp-recording').classList.remove('hidden');
  document.getElementById('cam-timer').classList.remove('hidden');
  document.getElementById('cam-progress').classList.remove('hidden');
  document.getElementById('cam-tabs').classList.add('hidden');
  document.getElementById('cam-sound').classList.add('hidden');
  document.getElementById('cam-rec-inner').className = 'cam-rec-inner square';

  // Build teleprompter beats
  renderBeats();

  // Timer
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    state.seconds++;
    updateTimerDisplay();
  }, 1000);

  // Start MediaRecorder
  if (state.stream) {
    state.chunks = [];
    const mimeTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4',
    ];
    let mimeType = '';
    for (const mt of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mt)) { mimeType = mt; break; }
    }
    console.log('Using mimeType:', mimeType || 'default');
    try {
      const options = mimeType ? { mimeType, audioBitsPerSecond: 192000 } : { audioBitsPerSecond: 192000 };
      const mr = new MediaRecorder(state.stream, options);
      mr.ondataavailable = (e) => {
        console.log('Chunk received:', e.data.size, 'bytes');
        if (e.data.size > 0) state.chunks.push(e.data);
      };
      mr.onerror = (e) => console.error('MediaRecorder error:', e);
      mr.start(); // single blob on stop — cleanest audio
      state.mediaRecorder = mr;
      console.log('MediaRecorder started, state:', mr.state);
    } catch (e) {
      console.warn('MediaRecorder failed:', e);
      state.mediaRecorder = null;
    }
  }

  // Start silence detection
  startSilenceDetection();
}

function stopRecording() {
  state.recording = false;
  clearInterval(state.timerInterval);
  stopSilenceDetection();
  document.getElementById('coach-nudge').classList.add('hidden');

  const recordingDuration = state.seconds;

  console.log('Stopping recording. MediaRecorder:', state.mediaRecorder?.state, 'Chunks:', state.chunks.length);

  if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
    state.mediaRecorder.onstop = () => {
      console.log('MediaRecorder stopped. Chunks:', state.chunks.length, 'Total size:', state.chunks.reduce((s, c) => s + c.size, 0));
      const mimeType = state.mediaRecorder.mimeType || 'video/webm';
      const blob = new Blob(state.chunks, { type: mimeType });
      state.videoBlob = blob;
      showReviewScreen(blob, recordingDuration);
    };
    state.mediaRecorder.stop();
  } else if (state.chunks.length > 0) {
    // MediaRecorder already stopped but we have chunks
    const blob = new Blob(state.chunks, { type: 'video/webm' });
    state.videoBlob = blob;
    showReviewScreen(blob, recordingDuration);
  } else {
    showReviewScreen(null, recordingDuration);
  }

  state.seconds = 0;
  state.currentBeat = 0;
}

function showReviewScreen(blob, duration) {
  showScreen('screen-review');

  const meta = document.getElementById('review-meta');
  meta.textContent = `${state.niche} · ${duration}s recorded`;

  const video = document.getElementById('review-video');
  const videoWrap = document.getElementById('review-video-wrap');
  const analyzing = document.getElementById('review-analyzing');
  const results = document.getElementById('review-results');
  const downloadBtn = document.getElementById('btn-download');

  results.classList.add('hidden');
  analyzing.style.display = '';

  if (blob && blob.size > 0) {
    video.src = URL.createObjectURL(blob);
    videoWrap.style.display = '';

    // Enable download
    downloadBtn.classList.remove('hidden');
    downloadBtn.onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'creator-prep-recording.webm';
      a.click();
    };

    // Send to /analyze for Confidence Coach
    analyzeRecording(blob);
  } else {
    videoWrap.style.display = 'none';
    downloadBtn.classList.add('hidden');
    analyzing.style.display = 'none';
    results.classList.remove('hidden');
    document.getElementById('review-transcript').innerHTML = '<p style="color:#555;text-align:center">No recording data — camera may not be available in this environment.</p>';
    document.getElementById('review-prompts').innerHTML = '';
  }

  // Retake button
  document.getElementById('btn-retake').onclick = () => {
    showCameraScreen();
  };
}

async function analyzeRecording(blob) {
  const analyzing = document.getElementById('review-analyzing');
  const results = document.getElementById('review-results');

  try {
    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm');

    const res = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Analysis failed');
    }

    const data = await res.json();

    // Hide loading, show results
    analyzing.style.display = 'none';
    results.classList.remove('hidden');

    // Transcript
    const transcriptDiv = document.getElementById('review-transcript');
    if (data.transcript) {
      transcriptDiv.innerHTML = `
        <h4>📝 Transcript</h4>
        <p>${escapeHtml(data.transcript)}</p>
      `;
    } else {
      transcriptDiv.innerHTML = '<h4>📝 Transcript</h4><p style="color:#444">No speech detected</p>';
    }

    // Coaching prompts
    const promptsDiv = document.getElementById('review-prompts');
    const practiceBtn = document.getElementById('btn-practice-again');

    if (data.pauses && data.pauses.length > 0) {
      // Store coaching prompts for the practice loop
      state.coachingPrompts = data.pauses.map(p => p.ai_prompt);

      promptsDiv.innerHTML = data.pauses.map((p) => `
        <div class="review-prompt">
          <div class="review-prompt-pause">
            <span>⏸ ${p.duration}s pause at ${p.pause_start.toFixed(1)}s</span>
            <button class="watch-btn" onclick="document.getElementById('review-video').currentTime=${Math.max(0, p.pause_start - 1)};document.getElementById('review-video').play()">▶ Watch</button>
          </div>
          <div class="review-prompt-text">"${escapeHtml(p.ai_prompt)}"</div>
        </div>
      `).join('');

      // Show Practice Again button
      if (practiceBtn) {
        practiceBtn.classList.remove('hidden');
        practiceBtn.onclick = () => practiceAgain();
      }
    } else {
      state.coachingPrompts = [];
      promptsDiv.innerHTML = `
        <div class="review-no-pauses">
          <div class="emoji">🎉</div>
          <p>No long pauses detected! Great flow.</p>
        </div>
      `;
      if (practiceBtn) practiceBtn.classList.add('hidden');
    }

  } catch (err) {
    console.error('Analysis error:', err);
    analyzing.style.display = 'none';
    results.classList.remove('hidden');
    document.getElementById('review-transcript').innerHTML = `<p style="color:#fe2c55">Analysis failed: ${escapeHtml(err.message)}</p><p style="color:#444;font-size:12px;margin-top:8px">Make sure the backend is running with Whisper available.</p>`;
    document.getElementById('review-prompts').innerHTML = '';
  }
}

// ═══════════════════════════════════════════════════════════
// PRACTICE LOOP: Merge coaching prompts into teleprompter
// ═══════════════════════════════════════════════════════════
async function practiceAgain() {
  state.practiceCount++;

  if (state.coachingPrompts.length > 0 && state.blueprint) {
    // Show generating screen while we refine
    showScreen('screen-generating');
    const summary = document.getElementById('gen-summary');
    summary.textContent = `Weaving coaching insights into your blueprint...`;

    try {
      const res = await fetch(`${API_URL}/refine-blueprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook: state.blueprint.hook,
          beats: state.blueprint.beats,
          closer: state.blueprint.closer,
          coaching_prompts: state.coachingPrompts,
          topic: state.topic,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Refine response:', data);
        if (data.beats && data.beats.length > 0) {
          // Update the blueprint with refined beats
          state.blueprint.beats = data.beats;

          // Rebuild allPoints with same structure, richer content
          allPoints = [
            { label: 'HOOK', text: state.blueprint.hook, color: '#fe2c55' },
            ...data.beats.map((b, i) => ({ label: `BEAT ${i + 1}`, text: b, color: '#fff' })),
            { label: 'CLOSER', text: state.blueprint.closer, color: '#25f4ee' },
          ];

          console.log(`Practice loop #${state.practiceCount}: beats refined with ${state.coachingPrompts.length} coaching insights`);
        }
      }
    } catch (e) {
      console.warn('Refine failed, keeping original beats:', e);
    }
  }

  // Clear prompts so they don't stack
  state.coachingPrompts = [];

  // Go to camera with updated teleprompter
  showCameraScreen();
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
  stopSilenceDetection();
  clearInterval(state.timerInterval);
}

function updateTimerDisplay() {
  const m = Math.floor(state.seconds / 60);
  const s = (state.seconds % 60).toString().padStart(2, '0');
  document.getElementById('cam-time').textContent = `${m}:${s}`;

  // Progress bar
  const bar = document.querySelector('.cam-progress .bar');
  if (bar) {
    bar.style.width = `${Math.min((state.seconds / 60) * 100, 100)}%`;
  } else {
    const progress = document.getElementById('cam-progress');
    progress.innerHTML = `<div class="bar" style="width:${Math.min((state.seconds / 60) * 100, 100)}%"></div>`;
  }
}

function renderBeats() {
  const container = document.getElementById('tp-beats');
  container.innerHTML = '';

  allPoints.forEach((pt, i) => {
    const isCurrent = i === state.currentBeat;
    const isNext = i === state.currentBeat + 1;
    const isPast = i < state.currentBeat;

    if (isPast || (!isCurrent && !isNext)) {
      // Hidden
      const el = document.createElement('div');
      el.className = 'tp-beat hidden';
      el.dataset.index = i;
      container.appendChild(el);
      return;
    }

    const el = document.createElement('div');
    el.className = `tp-beat ${isCurrent ? 'current' : ''} ${pt.isCoach ? 'coach-beat' : ''}`;
    el.dataset.index = i;
    el.onclick = () => { state.currentBeat = i; renderBeats(); hideNudge(); };

    el.innerHTML = `
      <div class="tp-beat-label" style="color:${isCurrent ? pt.color : ''}">${pt.label}</div>
      <div class="tp-beat-text">${escapeHtml(pt.text)}</div>
    `;
    container.appendChild(el);
  });

  // Dots
  const dotsContainer = document.getElementById('tp-dots');
  dotsContainer.innerHTML = '';
  allPoints.forEach((pt, i) => {
    const dot = document.createElement('button');
    const isCoach = pt.isCoach;
    let cls = i === state.currentBeat ? 'current' : i < state.currentBeat ? 'past' : 'future';
    dot.className = `tp-dot ${cls}`;
    if (isCoach && cls === 'future') dot.style.background = 'rgba(37,244,238,0.3)';
    dot.onclick = () => { state.currentBeat = i; renderBeats(); hideNudge(); };
    dotsContainer.appendChild(dot);
  });
}

// ═══════════════════════════════════════════════════════════
// SILENCE DETECTION + COACH NUDGES
// ═══════════════════════════════════════════════════════════
function startSilenceDetection() {
  if (!state.analyser) return;

  const bufferLength = state.analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  state.silenceStart = null;

  function checkAudio() {
    if (!state.recording) return;

    state.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
    const avg = sum / bufferLength;

    const isSilent = avg < 15; // Threshold for silence

    if (isSilent) {
      if (!state.silenceStart) {
        state.silenceStart = Date.now();
      } else if (Date.now() - state.silenceStart > state.silenceThreshold && !state.nudgeVisible) {
        showCoachNudge();
      }
    } else {
      state.silenceStart = null;
      if (state.nudgeVisible) {
        hideNudge();
      }
    }

    state.silenceTimer = requestAnimationFrame(checkAudio);
  }

  checkAudio();
}

function stopSilenceDetection() {
  if (state.silenceTimer) {
    cancelAnimationFrame(state.silenceTimer);
    state.silenceTimer = null;
  }
}

async function showCoachNudge() {
  state.nudgeVisible = true;

  const currentPt = allPoints[state.currentBeat];
  const nextPt = allPoints[state.currentBeat + 1];

  // Show immediate nudge with next beat text
  const nudgeEl = document.getElementById('coach-nudge');
  const nudgeText = document.getElementById('nudge-text');

  // Quick local nudge first (instant)
  if (nextPt) {
    nudgeText.textContent = `→ ${nextPt.text}`;
  } else {
    nudgeText.textContent = `Wrap it up: "${currentPt.text}"`;
  }
  nudgeEl.classList.remove('hidden');

  // Then try to get a smarter nudge from the backend
  try {
    const res = await fetch(`${API_URL}/coach-nudge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_beat: currentPt.text,
        next_beat: nextPt ? nextPt.text : '',
        context: state.topic,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.nudge && state.nudgeVisible) {
        nudgeText.textContent = data.nudge;
      }
    }
  } catch (e) {
    // Keep the local nudge — it's good enough
  }
}

function hideNudge() {
  state.nudgeVisible = false;
  document.getElementById('coach-nudge').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS (for demo recording convenience)
// ═══════════════════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (!state.recording) return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.currentBeat < allPoints.length - 1) {
      state.currentBeat++;
      renderBeats();
      hideNudge();
    }
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.currentBeat > 0) {
      state.currentBeat--;
      renderBeats();
      hideNudge();
    }
  }
});

// ═══════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// NAV SCROLL EFFECT
// ═══════════════════════════════════════════════════════════
window.addEventListener('scroll', () => {
  const nav = document.getElementById('nav');
  nav.style.borderBottomColor = window.scrollY > 50 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)';
});

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initTopicScreen();
});