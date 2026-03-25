const chatStream = document.getElementById('chat-stream');
const chatForm = document.getElementById('chat-form');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const charCounter = document.getElementById('char-counter');
const newChatBtn = document.getElementById('new-chat-btn');
const historyList = document.getElementById('history-list');

// Models configuration
const providers = [
    {
        name: 'Hugging Face', badge: '🤗', key: 'huggingface',
        models: [
            { id: 'Qwen/Qwen2.5-VL-7B-Instruct', name: 'qwen2.5-vl-7b', caps: '👁 📁', capTitle: 'Vision, File' }
        ]
    },
    {
        name: 'OpenAI', badge: '🔵', key: 'openai',
        models: [
            { id: 'gpt-4o', name: 'gpt-4o', caps: '👁', capTitle: 'Vision' },
            { id: 'gpt-4o-mini', name: 'gpt-4o-mini', caps: '👁', capTitle: 'Vision', ft: true },
            { id: 'o3-mini', name: 'o3-mini', caps: '', capTitle: '' }
        ]
    },
    {
        name: 'Google Gemini', badge: '🟢', key: 'gemini',
        models: [
            { id: 'gemini-3.1-pro-preview', name: 'gemini-3.1-pro-preview', caps: '👁 📁', capTitle: 'Vision, File' },
            { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash', caps: '👁 📁', capTitle: 'Vision, File' }
        ]
    },
    {
        name: 'Anthropic', badge: '🟣', key: 'anthropic',
        models: [
            { id: 'claude-3-5-sonnet-20241022', name: 'claude-sonnet-4-6', caps: '👁', capTitle: 'Vision' },
            { id: 'claude-3-opus-20240229', name: 'claude-opus-4-6', caps: '👁', capTitle: 'Vision' }
        ]
    },
    {
        name: 'DeepSeek', badge: '🐋', key: 'deepseek',
        models: [
            { id: 'deepseek-chat', name: 'deepseek-chat', caps: '', capTitle: '' },
            { id: 'deepseek-reasoner', name: 'deepseek-reasoner', caps: '', capTitle: '' }
        ]
    },
    {
        name: 'Meta (via Groq)', badge: '♾️', key: 'groq',
        models: [
            { id: 'llama-3.3-70b-versatile', name: 'llama-3.3-70b', caps: '', capTitle: '' },
            { id: 'llama-3.2-11b-vision-preview', name: 'llama-3.2-11b-vision', caps: '👁', capTitle: 'Vision' }
        ]
    }
];

let selectedModel = localStorage.getItem('nova_selected_model') || 'gpt-4o-mini';
let selectedProvider = localStorage.getItem('nova_selected_provider') || 'openai';
let selectedCaps = localStorage.getItem('nova_selected_caps') || '👁';
let selectedBadge = localStorage.getItem('nova_selected_badge') || '🔵';

if (selectedProvider === 'gemini' || selectedProvider === 'huggingface') {
    selectedProvider = 'openai';
    selectedModel = 'gpt-4o-mini';
    selectedCaps = '👁';
    selectedBadge = '🔵';
    localStorage.setItem('nova_selected_provider', selectedProvider);
    localStorage.setItem('nova_selected_model', selectedModel);
    localStorage.setItem('nova_selected_caps', selectedCaps);
    localStorage.setItem('nova_selected_badge', selectedBadge);
}

let messages = [];
let currentChatId = Date.now().toString();

// Initialize custom dropdown
const modelSelectHeader = document.getElementById('model-select-header');
const modelOptionsContainer = document.getElementById('model-options');
const selectedProviderBadgeEl = document.getElementById('selected-provider-badge');
const selectedModelNameEl = document.getElementById('selected-model-name');
const selectedModelCapsEl = document.getElementById('selected-model-caps');

function initModelSelector() {
    // Populate options
    let html = '';
    providers.forEach(p => {
        html += `<div class="provider-group">${p.badge} ${p.name}</div>`;
        p.models.forEach(m => {
            const isActive = m.id === selectedModel ? 'active' : '';
            const ftBadge = m.ft ? `<span class="fine-tune-badge" title="Supports Fine-tuning">ℹ️ FT</span>` : '';
            html += `<div class="model-option ${isActive}" data-id="${m.id}" data-name="${m.name}" data-caps="${m.caps}" data-badge="${p.badge}" data-provider="${p.key}">
                        <span class="model-name">${m.name}${ftBadge}</span>
                        ${m.caps ? `<span class="model-caps" title="${m.capTitle}">${m.caps}</span>` : ''}
                     </div>`;
        });
    });
    modelOptionsContainer.innerHTML = html;
    
    // Set active header
    selectedModelNameEl.textContent = selectedModel;
    selectedProviderBadgeEl.textContent = selectedBadge;
    selectedModelCapsEl.textContent = selectedCaps;

    updateUIForModelCaps();

    // Toggle dropdown
    modelSelectHeader.addEventListener('click', () => {
        modelOptionsContainer.classList.toggle('open');
    });

    // Handle selection
    modelOptionsContainer.querySelectorAll('.model-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            // Update UI
            document.querySelectorAll('.model-option.active').forEach(el => el.classList.remove('active'));
            opt.classList.add('active');
            
            selectedModel = opt.getAttribute('data-id');
            selectedModelNameEl.textContent = opt.getAttribute('data-name');
            selectedProvider = opt.getAttribute('data-provider');
            selectedBadge = opt.getAttribute('data-badge');
            selectedCaps = opt.getAttribute('data-caps');
            
            selectedProviderBadgeEl.textContent = selectedBadge;
            selectedModelCapsEl.textContent = selectedCaps;
            
            // Persist
            localStorage.setItem('nova_selected_model', selectedModel);
            localStorage.setItem('nova_selected_provider', selectedProvider);
            localStorage.setItem('nova_selected_badge', selectedBadge);
            localStorage.setItem('nova_selected_caps', selectedCaps);
            
            updateUIForModelCaps();
            modelOptionsContainer.classList.remove('open');
        });
    });
    
    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.model-selector-container')) {
            modelOptionsContainer.classList.remove('open');
        }
    });
}
function updateUIForModelCaps() {
    const visionBtn = document.getElementById('vision-btn');
    if (selectedCaps.includes('👁')) {
        visionBtn.disabled = false;
        visionBtn.title = "Attach Image";
    } else {
        visionBtn.disabled = true;
        visionBtn.title = "This model doesn't support images";
        clearAttachment('image');
    }
}
initModelSelector();

// Globals for Attachments
let attachedImage = null; // base64 string
let attachedFileText = null; 
let attachedFileName = null;
let isImageGenMode = false;

// UI Elements for features
const visionBtn = document.getElementById('vision-btn');
const imageUpload = document.getElementById('image-upload');
const fileBtn = document.getElementById('file-btn');
const fileUpload = document.getElementById('file-upload');
const sttBtn = document.getElementById('stt-btn');
const imageGenToggle = document.getElementById('image-gen-toggle');
const attachmentPreview = document.getElementById('attachment-preview');
const sttWaveform = document.getElementById('stt-waveform');
const sttStatus = document.getElementById('stt-status');

// Vision Logic
visionBtn.addEventListener('click', () => { if (!visionBtn.disabled) imageUpload.click(); });
imageUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            attachedImage = ev.target.result;
            showAttachmentPreview('image', attachedImage, file.name);
        };
        reader.readAsDataURL(file);
    }
});

// File Extraction Logic
fileBtn.addEventListener('click', () => fileUpload.click());
fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    attachedFileName = file.name;
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'txt' || ext === 'csv') {
        const reader = new FileReader();
        reader.onload = (ev) => { attachedFileText = ev.target.result; };
        reader.readAsText(file);
        showAttachmentPreview('file', null, file.name);
    } else if (ext === 'pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(s => s.str).join(' ') + '\n';
        }
        attachedFileText = fullText;
        showAttachmentPreview('file', null, file.name);
    } else {
        alert("Unsupported file format for pure frontend extraction (for demo limits).");
        e.target.value = '';
    }
});

function showAttachmentPreview(type, dataUrl, name) {
    attachmentPreview.classList.remove('hidden');
    const div = document.createElement('div');
    div.className = 'preview-item';
    div.dataset.type = type;
    
    if (type === 'image') {
        div.innerHTML = `<img src="${dataUrl}" alt="${name}"> <button type="button" class="remove-btn" onclick="clearAttachment('image', this)">✕</button>`;
    } else {
        div.innerHTML = `📄 ${name} <button type="button" class="remove-btn" onclick="clearAttachment('file', this)">✕</button>`;
    }
    
    // Clear existing of same type to easily manage 1 of each
    const existing = attachmentPreview.querySelector(`.preview-item[data-type="${type}"]`);
    if (existing) existing.remove();
    
    attachmentPreview.appendChild(div);
}

function clearAttachment(type, btnEl = null) {
    if (type === 'image') {
        attachedImage = null;
        imageUpload.value = '';
    } else {
        attachedFileText = null;
        attachedFileName = null;
        fileUpload.value = '';
    }
    if (btnEl) btnEl.parentElement.remove();
    else {
        const el = attachmentPreview.querySelector(`.preview-item[data-type="${type}"]`);
        if (el) el.remove();
    }
    if (attachmentPreview.children.length === 0) {
        attachmentPreview.classList.add('hidden');
    }
}

// Image Gen Toggle
imageGenToggle.addEventListener('click', () => {
    isImageGenMode = !isImageGenMode;
    imageGenToggle.classList.toggle('active', isImageGenMode);
    if(isImageGenMode) promptInput.placeholder = "Describe the image to generate...";
    else promptInput.placeholder = "Enter command sequence...";
});

// STT Logic
let recognition = null;
let keepRecording = false;
let baseTranscript = '';
let speechDetected = false;
let noSpeechTimeout = null;
let fallbackRecorder = null;
let fallbackStream = null;
let fallbackChunks = [];
let usingFallbackRecorder = false;

function updateInputFromSpeech(text) {
    promptInput.value = text.trim();
    promptInput.style.height = 'auto';
    promptInput.style.height = `${promptInput.scrollHeight}px`;
    charCounter.textContent = `${promptInput.value.length} chars`;
}

function setSttStatus(text, state = 'idle') {
    if (!sttStatus) return;
    sttStatus.textContent = text;
    sttStatus.classList.remove('idle', 'listening', 'transcribing', 'error');
    sttStatus.classList.add(state);
}

function stopMicUI() {
    sttBtn.classList.remove('active');
    sttWaveform.classList.add('hidden');
    sttBtn.title = 'Speech to Text';
    setSttStatus('Mic ready', 'idle');
}

async function ensureMicPermission() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone is not supported in this browser.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
}

async function startFallbackRecorder() {
    setSttStatus('Switching to audio capture...', 'transcribing');
    fallbackStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    fallbackChunks = [];
    usingFallbackRecorder = true;
    fallbackRecorder = new MediaRecorder(fallbackStream);

    fallbackRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
            fallbackChunks.push(event.data);
        }
    };

    fallbackRecorder.onstop = async () => {
        try {
            setSttStatus('Transcribing audio...', 'transcribing');
            const mimeType = fallbackRecorder.mimeType || 'audio/webm';
            const blob = new Blob(fallbackChunks, { type: mimeType });
            const formData = new FormData();
            formData.append('audio', blob, 'recording.webm');

            const response = await fetch('/api/stt', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();

            if (data.text) {
                const combined = `${baseTranscript}${data.text}`;
                updateInputFromSpeech(combined);
                setSttStatus('Speech captured', 'idle');
            } else if (data.error) {
                alert(data.error);
                setSttStatus('Transcription failed', 'error');
            }
        } catch (err) {
            alert('Unable to transcribe recorded audio. Please try again.');
            setSttStatus('Transcription error', 'error');
        } finally {
            usingFallbackRecorder = false;
            if (fallbackStream) {
                fallbackStream.getTracks().forEach(track => track.stop());
                fallbackStream = null;
            }
            stopMicUI();
        }
    };

    sttBtn.classList.add('active');
    sttWaveform.classList.remove('hidden');
    sttBtn.title = 'Stop recording';
    setSttStatus('Listening (recorder)...', 'listening');
    fallbackRecorder.start();
}

function stopFallbackRecorder() {
    if (fallbackRecorder && fallbackRecorder.state !== 'inactive') {
        fallbackRecorder.stop();
    }
}

const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognitionClass) {
    recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';

    recognition.onstart = () => {
        sttBtn.classList.add('active');
        sttWaveform.classList.remove('hidden');
        sttBtn.title = 'Stop recording';
        setSttStatus('Listening...', 'listening');
    };

    recognition.onresult = (e) => {
        speechDetected = true;
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
        }

        let finalPart = '';
        let interimPart = '';

        for (let i = e.resultIndex; i < e.results.length; i++) {
            const transcript = e.results[i][0].transcript;
            if (e.results[i].isFinal) {
                finalPart += transcript + ' ';
            } else {
                interimPart += transcript;
            }
        }

        const composed = `${baseTranscript}${finalPart}${interimPart}`.trim();
        updateInputFromSpeech(composed);

        if (finalPart) {
            baseTranscript = `${baseTranscript}${finalPart}`;
        }
    };

    recognition.onend = () => {
        if (keepRecording) {
            try {
                recognition.start();
                return;
            } catch (err) {
                setTimeout(() => {
                    if (keepRecording) {
                        try { recognition.start(); } catch (e) {}
                    }
                }, 250);
                return;
            }
        }
        stopMicUI();
    };

    recognition.onerror = async (event) => {
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
            keepRecording = false;
            stopMicUI();
            setSttStatus('Mic permission blocked', 'error');
            alert('Microphone permission is blocked. Please enable microphone access for localhost.');
            return;
        }

        if (keepRecording && !speechDetected) {
            keepRecording = false;
            try {
                await startFallbackRecorder();
            } catch (err) {
                stopMicUI();
                setSttStatus('Speech detection unavailable', 'error');
                alert('Speech recognition unavailable and recorder fallback failed.');
            }
            return;
        }
    };
}

sttBtn.addEventListener('click', async () => {
    if (usingFallbackRecorder) {
        stopFallbackRecorder();
        return;
    }

    if (keepRecording) {
        keepRecording = false;
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
        }
        recognition.stop();
        return;
    }

    baseTranscript = promptInput.value ? `${promptInput.value.trim()} ` : '';

    try {
        await ensureMicPermission();
    } catch (err) {
        setSttStatus('Mic permission required', 'error');
        alert('Microphone permission is required. Please allow mic access and try again.');
        return;
    }

    if (!recognition) {
        try {
            await startFallbackRecorder();
        } catch (err) {
            alert('Web Speech is not supported and recorder fallback failed.');
        }
        return;
    }

    keepRecording = true;
    speechDetected = false;
    setSttStatus('Listening...', 'listening');
    recognition.start();

    noSpeechTimeout = setTimeout(async () => {
        if (keepRecording && !speechDetected) {
            keepRecording = false;
            try {
                recognition.stop();
            } catch (err) {}
            try {
                await startFallbackRecorder();
            } catch (err) {
                stopMicUI();
                setSttStatus('No voice detected', 'error');
                alert('No voice detected. Check your mic input device and browser microphone permissions.');
            }
        }
    }, 4000);
});

// Auto-resize textarea
promptInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    charCounter.textContent = `${this.value.length} chars`;
});

// Submit on Enter (Shift+Enter for newline)
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

function saveHistory() {
    if (messages.length === 0) return;
    
    let titleContent = messages[0].content;
    if (Array.isArray(titleContent)) {
        titleContent = titleContent.find(c => c.type === 'text')?.text || 'Image Input';
    }

    const history = JSON.parse(localStorage.getItem('nova_history') || '{}');
    history[currentChatId] = {
        title: titleContent.substring(0, 30) + '...',
        messages: messages,
        timestamp: Date.now()
    };
    localStorage.setItem('nova_history', JSON.stringify(history));
    loadSidebar();
}

function loadSidebar() {
    const history = JSON.parse(localStorage.getItem('nova_history') || '{}');
    const sortedKeys = Object.keys(history).sort((a, b) => history[b].timestamp - history[a].timestamp);
    
    historyList.innerHTML = '';
    sortedKeys.forEach(key => {
        const li = document.createElement('li');
        li.textContent = history[key].title;
        li.onclick = () => loadChat(key, history[key].messages);
        historyList.appendChild(li);
    });
}

function loadChat(chatId, loadedMessages) {
    currentChatId = chatId;
    messages = loadedMessages;
    chatStream.innerHTML = '';
    
    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;

        let displayContent = msg.content;
        let generatedImageUrl = msg.generatedImageUrl || null;

        // Backward compatibility: older saved chats used a text marker with base64 URL.
        if (!generatedImageUrl && typeof msg.content === 'string' && msg.content.startsWith('[Generated Image: ')) {
            generatedImageUrl = msg.content.replace('[Generated Image: ', '').replace(/\]$/, '');
        }

        if (Array.isArray(msg.content)) {
            displayContent = escapeHtml(msg.content.find(c=>c.type==='text')?.text || '');
            const imgContent = msg.content.find(c=>c.type==='image_url');
            if (imgContent) displayContent += `<br><img src="${imgContent.image_url.url}" class="message-image" alt="attached picture">`;
        } else if (generatedImageUrl) {
            displayContent = `<img src="${generatedImageUrl}" class="message-image" alt="Generated Image"><br><a href="${generatedImageUrl}" target="_blank" download class="download-img-btn">Download</a>`;
        } else {
            displayContent = escapeHtml(displayContent);
        }

        let contentHtml = `<div class="content">${displayContent}</div>`;
        if (msg.role === 'assistant') {
            if (!generatedImageUrl) {
                contentHtml += `<button class="copy-btn" onclick="copyText(this)">Copy</button>`;
                contentHtml += `<button class="tts-btn" onclick="playTTS(this)">🔊</button>`;
            }
        }
        messageDiv.innerHTML = contentHtml;
        chatStream.appendChild(messageDiv);
    });
    chatStream.scrollTop = chatStream.scrollHeight;
}

newChatBtn.addEventListener('click', () => {
    currentChatId = Date.now().toString();
    messages = [];
    chatStream.innerHTML = '<div class="welcome-message">System Initialized. Awaiting Input...</div>';
});

// Escape HTML utility
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

window.copyText = function(btn) {
    const text = btn.parentElement.querySelector('.content').innerText;
    navigator.clipboard.writeText(text);
    const originalText = btn.innerText;
    btn.innerText = 'Copied!';
    setTimeout(() => { btn.innerText = originalText; }, 2000);
}

let currentAudio = null;
window.playTTS = async function(btn) {
    const textContext = btn.parentElement.querySelector('.content').innerText;
    if (!textContext) return;

    if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        btn.classList.remove('playing');
        btn.innerText = '🔊';
        return;
    }

    try {
        btn.classList.add('playing');
        btn.innerText = '⏸';
        
        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textContext })
        });
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (currentAudio) currentAudio.pause();
        currentAudio = new Audio(url);
        
        currentAudio.onended = () => {
            btn.classList.remove('playing');
            btn.innerText = '🔊';
        };
        currentAudio.play();
    } catch (err) {
        console.error("TTS Error:", err);
        btn.classList.remove('playing');
        btn.innerText = '🔊';
    }
}

chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const promptText = promptInput.value.trim();
    if (!promptText && !attachedImage && !attachedFileText) return;

    let finalPromptText = promptText;
    let displayPromptHTML = escapeHtml(promptText);

    if (attachedFileText) {
        finalPromptText = `[File: ${attachedFileName}]\n${attachedFileText}\n\n${promptText}`;
        displayPromptHTML = `<div class="file-badge">📄 ${attachedFileName}</div>` + displayPromptHTML;
    }

    let messageContent = finalPromptText;
    if (attachedImage && selectedCaps.includes('👁')) {
        messageContent = [
            { type: "text", text: finalPromptText || "What is in this image?" },
            { type: "image_url", image_url: { url: attachedImage } }
        ];
        displayPromptHTML += `<br><img src="${attachedImage}" class="message-image" alt="attached picture">`;
    }

    // Add user message
    messages.push({ role: 'user', content: messageContent });
    
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'message user';
    userMsgDiv.innerHTML = `<div class="content">${displayPromptHTML}</div>`;
    
    if (document.querySelector('.welcome-message')) {
        document.querySelector('.welcome-message').remove();
    }
    chatStream.appendChild(userMsgDiv);
    
    promptInput.value = '';
    promptInput.style.height = 'auto';
    charCounter.textContent = '0 chars';
    chatStream.scrollTop = chatStream.scrollHeight;
    sendBtn.classList.add('pulsing');
    sendBtn.disabled = true;

    // Reset attachments
    clearAttachment('image');
    clearAttachment('file');

    // Handle Image Generation Route
    if (isImageGenMode) {
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'message ai';
        aiMsgDiv.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
        chatStream.appendChild(aiMsgDiv);
        chatStream.scrollTop = chatStream.scrollHeight;

        try {
            const res = await fetch('/api/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: finalPromptText || "Creative AI abstraction" })
            });
            const data = await res.json();
            
            if (data.url) {
                aiMsgDiv.innerHTML = `<div class="content"><img src="${data.url}" class="message-image" alt="Generated Image"><br><a href="${data.url}" target="_blank" download class="download-img-btn">Download</a></div>`;
                messages.push({ role: 'assistant', content: '[Generated Image]', generatedImageUrl: data.url });
                saveHistory();
            } else {
                aiMsgDiv.innerHTML = `<div class="content"><span style="color: red;">Failed to generate image.</span></div>`;
            }
        } catch (err) {
            aiMsgDiv.innerHTML = `<div class="content"><span style="color: red;">Error generating image.</span></div>`;
        } finally {
            sendBtn.classList.remove('pulsing');
            sendBtn.disabled = false;
            promptInput.focus();
        }
        return;
    }

    // AI Response placeholder (Chat Logic)
    const aiMsgDiv = document.createElement('div');
    aiMsgDiv.className = 'message ai';
    aiMsgDiv.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    chatStream.appendChild(aiMsgDiv);
    chatStream.scrollTop = chatStream.scrollHeight;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, provider: selectedProvider, model: selectedModel })
        });

        // Setup streaming reader
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let aiFullContent = '';
        aiMsgDiv.innerHTML = `<div class="content"></div><span class="cursor"></span><button class="tts-btn" onclick="playTTS(this)">🔊</button><button class="copy-btn" onclick="copyText(this)">Copy</button>`;
        const contentBox = aiMsgDiv.querySelector('.content');

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const parsed = JSON.parse(line.slice(6));
                        if (parsed.text) {
                            aiFullContent += parsed.text;
                            contentBox.innerHTML = escapeHtml(aiFullContent);
                            chatStream.scrollTop = chatStream.scrollHeight;
                        } else if (parsed.error) {
                            contentBox.innerHTML = `<span style="color: red;">${escapeHtml(parsed.error)}</span>`;
                        }
                    } catch (err) {}
                }
            }
        }
        
        // Remove cursor
        const cursor = aiMsgDiv.querySelector('.cursor');
        if (cursor) cursor.remove();
        
        messages.push({ role: 'assistant', content: aiFullContent });
        saveHistory();

    } catch (error) {
        console.error('Error:', error);
        aiMsgDiv.innerHTML = `<div class="content"><span style="color: red;">Connection lost. Sequence terminated.</span></div>`;
    } finally {
        sendBtn.classList.remove('pulsing');
        sendBtn.disabled = false;
        promptInput.focus();
    }
});

// Init
loadSidebar();

