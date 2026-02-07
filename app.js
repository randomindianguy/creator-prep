/**
 * Confidence Coach - Integrated Frontend
 * Combines marketing site with live recording demo
 */

// === CONFIGURATION ===
const API_URL = 'http://localhost:5001'; // Change this to your Railway URL after deployment

// === DOM ELEMENTS ===
const preview = document.getElementById('preview');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const status = document.getElementById('status');
const results = document.getElementById('results');
const resultVideo = document.getElementById('resultVideo');
const transcriptDiv = document.getElementById('transcript');
const promptsDiv = document.getElementById('prompts');
const videoStats = document.getElementById('videoStats');
const resetBtn = document.getElementById('resetBtn');
const recordingIndicator = document.getElementById('recording-indicator');

// === STATE ===
let mediaRecorder;
let videoChunks = [];
let videoBlob;
let stream;

// === INITIALIZE CAMERA ===
async function initCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 720 },    
                height: { ideal: 1280 },
                facingMode: 'user'
            },
            audio: true
        });
        preview.srcObject = stream;
        preview.play();
        setStatus('Camera ready. Click "Start Recording" when ready.');
    } catch (err) {
        setStatus('Camera access denied. Please allow camera access.', 'error');
        console.error('Camera error:', err);
    }
}

// === STATUS HELPER ===
function setStatus(message, type = '') {
    status.textContent = message;
    status.className = 'status ' + type;
}

// === START RECORDING ===
recordBtn.onclick = async () => {
    if (!stream) {
        await initCamera();
        if (!stream) return;
    }

    videoChunks = [];

    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
    }

    try {
        mediaRecorder = new MediaRecorder(stream, options);
    } catch (err) {
        setStatus('Recording not supported in this browser', 'error');
        return;
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
            videoChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = () => {
        videoBlob = new Blob(videoChunks, { type: 'video/webm' });
        console.log('Recording stopped. Blob size:', videoBlob.size, 'bytes');
        console.log('Video chunks:', videoChunks.length);

        if (videoBlob.size === 0) {
            setStatus('Recording failed - no data captured. Please try again.', 'error');
            analyzeBtn.disabled = true;
            return;
        }

        analyzeBtn.disabled = false;
        setStatus('Recording saved! Click "Analyze with AI" to get coaching prompts.');
        recordingIndicator.classList.add('hidden');
    };

    mediaRecorder.start(1000);

    recordBtn.disabled = true;
    stopBtn.disabled = false;
    analyzeBtn.disabled = true;
    recordingIndicator.classList.remove('hidden');
    setStatus('Recording... Speak naturally, it\'s okay to pause!');
};

// === STOP RECORDING ===
stopBtn.onclick = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    recordBtn.disabled = false;
    stopBtn.disabled = true;
};

// === ANALYZE WITH AI ===
analyzeBtn.onclick = async () => {
    console.log('Analyze clicked. VideoBlob:', videoBlob);
    console.log('VideoBlob size:', videoBlob ? videoBlob.size : 'null');

    if (!videoBlob) {
        setStatus('No recording to analyze', 'error');
        return;
    }

    if (videoBlob.size === 0) {
        setStatus('Recording is empty - please record again', 'error');
        return;
    }

    setStatus('Analyzing with Whisper + Claude...', 'loading');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="loading-spinner"></span> Analyzing...';

    const formData = new FormData();
    formData.append('audio', videoBlob, 'recording.webm');
    console.log('FormData created, sending to backend...');

    try {
        const response = await fetch(`${API_URL}/analyze`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Analysis failed');
        }

        const data = await response.json();
        displayResults(data);

    } catch (err) {
        setStatus('Error: ' + err.message, 'error');
        console.error('Analysis error:', err);
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<span class="icon">⚡</span> Analyze with AI';
    }
};

// === DISPLAY RESULTS ===
function displayResults(data) {
    setStatus('');
    results.classList.remove('hidden');

    resultVideo.src = URL.createObjectURL(videoBlob);

    const duration = data.stats?.duration || 0;
    const wordCount = data.stats?.word_count || 0;
    const pauseCount = data.stats?.pause_count || 0;

    videoStats.innerHTML = `
        <span>⏱️ ${duration.toFixed(1)}s</span>
        <span>💬 ${wordCount} words</span>
        <span>⏸️ ${pauseCount} pause${pauseCount !== 1 ? 's' : ''}</span>
    `;

    if (data.transcript) {
        transcriptDiv.innerHTML = `<p>${escapeHtml(data.transcript)}</p>`;
    } else {
        transcriptDiv.innerHTML = '<p class="no-content">No speech detected</p>';
    }

    if (data.pauses && data.pauses.length > 0) {
        promptsDiv.innerHTML = data.pauses.map((p, i) => `
            <div class="prompt-card">
                <div class="pause-info">
                    <span>⏸️ ${p.duration}s pause at ${p.pause_start.toFixed(1)}s</span>
                    <button class="jump-btn" onclick="jumpTo(${p.pause_start})">
                        ▶ Watch
                    </button>
                </div>
                <div class="ai-prompt">"${escapeHtml(p.ai_prompt)}"</div>
            </div>
        `).join('');
    } else {
        promptsDiv.innerHTML = `
            <div class="no-pauses">
                <div class="emoji">🎉</div>
                <p>No long pauses detected!</p>
                <p>You maintained great flow throughout.</p>
            </div>
        `;
    }

    analyzeBtn.innerHTML = '<span class="icon">⚡</span> Analyze with AI';
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// === JUMP TO TIME IN VIDEO ===
function jumpTo(time) {
    resultVideo.currentTime = Math.max(0, time - 1);
    resultVideo.play();
}
window.jumpTo = jumpTo;

// === RESET ===
resetBtn.onclick = () => {
    results.classList.add('hidden');
    videoBlob = null;
    videoChunks = [];
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<span class="icon">⚡</span> Analyze with AI';
    transcriptDiv.innerHTML = '';
    promptsDiv.innerHTML = '';
    videoStats.innerHTML = '';
    setStatus('Ready to record another video!');

    // Scroll back to demo section
    document.getElementById('demo').scrollIntoView({ behavior: 'smooth' });
};

// === ESCAPE HTML ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === INITIALIZE ON LOAD ===
document.addEventListener('DOMContentLoaded', () => {
    // Initialize camera when demo section is scrolled into view
    const demoSection = document.getElementById('demo');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !stream) {
                initCamera();
            }
        });
    }, { threshold: 0.3 });

    observer.observe(demoSection);
});
