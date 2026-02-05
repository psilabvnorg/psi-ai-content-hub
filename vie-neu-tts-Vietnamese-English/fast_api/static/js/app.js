// App State
let currentLanguage = localStorage.getItem('language') || 'vi';
let selectedVoiceId = localStorage.getItem('selectedVoiceId') || null;
let voices = [];
let generatedAudioUrl = null;

// DOM Elements
const langToggleBtn = document.getElementById('lang-toggle-btn');
const voiceSelect = document.getElementById('voice-select');
const voiceInfo = document.getElementById('voice-info');
const voiceInfoIcon = document.getElementById('voice-info-icon');
const voiceInfoText = document.getElementById('voice-info-text');
const textInput = document.getElementById('text-input');
const charCount = document.getElementById('char-count');
const maxChars = document.getElementById('max-chars');
const warningMessage = document.getElementById('warning-message');
const warningText = document.getElementById('warning-text');
const generateBtn = document.getElementById('generate-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const audioSection = document.getElementById('audio-section');
const audioPlayer = document.getElementById('audio-player');
const downloadBtn = document.getElementById('download-btn');
const samplesGrid = document.getElementById('samples-grid');

// Voice icons mapping (gender-based)
const voiceIcons = {
    male: '👨',
    female: '👩'
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    // Set initial language
    updateLanguage(currentLanguage);
    
    // Load voices
    await loadVoices();
    
    // Restore saved text
    const savedText = localStorage.getItem('lastText');
    if (savedText) {
        textInput.value = savedText;
        updateCharCount();
    }
    
    // Load sample audios
    loadSamples();
    
    // Add event listeners
    setupEventListeners();
    
    // Validate form
    validateForm();
});

// Setup Event Listeners
function setupEventListeners() {
    langToggleBtn.addEventListener('click', toggleLanguage);
    voiceSelect.addEventListener('change', handleVoiceChange);
    textInput.addEventListener('input', handleTextInput);
    generateBtn.addEventListener('click', generateSpeech);
    downloadBtn.addEventListener('click', downloadAudio);
}

// Language Toggle
function toggleLanguage() {
    currentLanguage = currentLanguage === 'vi' ? 'en' : 'vi';
    localStorage.setItem('language', currentLanguage);
    updateLanguage(currentLanguage);
    loadVoices(); // Reload voices with new language
}

function updateLanguage(lang) {
    const t = translations[lang];
    
    // Update all text elements
    document.getElementById('app-title').textContent = t.appTitle;
    document.getElementById('app-subtitle').textContent = t.appSubtitle;
    document.getElementById('voice-section-title').textContent = t.voiceSectionTitle;
    document.getElementById('voice-placeholder').textContent = t.voicePlaceholder;
    document.getElementById('text-section-title').textContent = t.textSectionTitle;
    document.getElementById('text-input').placeholder = t.textPlaceholder;
    document.getElementById('generate-btn-text').textContent = t.generateBtnText;
    document.getElementById('audio-section-title').textContent = t.audioSectionTitle;
    document.getElementById('download-btn-text').textContent = t.downloadBtnText;
    document.getElementById('samples-section-title').textContent = t.samplesSectionTitle;
    document.getElementById('samples-description').textContent = t.samplesDescription;
    document.getElementById('footer-text').textContent = t.footerText;
    document.getElementById('loading-text').textContent = t.loadingText;
    
    // Update language button
    langToggleBtn.dataset.lang = lang;
    langToggleBtn.querySelector('.flag').textContent = lang === 'vi' ? '🇻🇳' : '🇺🇸';
    langToggleBtn.querySelector('.lang-text').textContent = t.langButtonText;
    
    // Update HTML lang attribute
    document.documentElement.lang = lang;
}

// Load Voices from API
async function loadVoices() {
    try {
        const response = await fetch(`/api/voices?language=${currentLanguage}`);
        const data = await response.json();
        voices = data.voices;
        renderVoices();
    } catch (error) {
        console.error('Error loading voices:', error);
    }
}

// Render Voice Dropdown Options
function renderVoices() {
    // Clear existing options except placeholder
    const placeholder = voiceSelect.querySelector('#voice-placeholder');
    voiceSelect.innerHTML = '';
    voiceSelect.appendChild(placeholder);
    
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = `${voice.name} - ${voice.description}`;
        option.dataset.description = voice.description;
        
        // Mark as selected if it matches saved voice
        if (voice.id === selectedVoiceId) {
            option.selected = true;
            updateVoiceInfo(voice);
        }
        
        voiceSelect.appendChild(option);
    });
}

// Handle Voice Change
function handleVoiceChange() {
    const voiceId = voiceSelect.value;
    if (voiceId) {
        selectedVoiceId = voiceId;
        localStorage.setItem('selectedVoiceId', voiceId);
        
        // Find selected voice and update info
        const voice = voices.find(v => v.id === voiceId);
        if (voice) {
            updateVoiceInfo(voice);
        }
    }
    
    validateForm();
}

// Update Voice Info Display
function updateVoiceInfo(voice) {
    // Determine icon based on voice description
    const isMale = voice.description.toLowerCase().includes('nam') || 
                   voice.description.toLowerCase().includes('male');
    const icon = isMale ? voiceIcons.male : voiceIcons.female;
    
    voiceInfoIcon.textContent = icon;
    voiceInfoText.textContent = voice.description;
    voiceInfo.style.display = 'flex';
}

// Handle Text Input
function handleTextInput() {
    updateCharCount();
    validateForm();
    
    // Save text to localStorage
    localStorage.setItem('lastText', textInput.value);
}

// Update Character Count
function updateCharCount() {
    const length = textInput.value.length;
    const max = 500;
    charCount.textContent = length;
    
    // Update color based on length
    charCount.classList.remove('warning', 'danger');
    if (length > max) {
        charCount.classList.add('danger');
        showWarning(translations[currentLanguage].warningExceeded);
    } else if (length > max * 0.9) {
        charCount.classList.add('warning');
        hideWarning();
    } else {
        hideWarning();
    }
}

// Show/Hide Warning
function showWarning(message) {
    warningText.textContent = message;
    warningMessage.style.display = 'block';
}

function hideWarning() {
    warningMessage.style.display = 'none';
}

// Validate Form
function validateForm() {
    const text = textInput.value.trim();
    const isValid = text.length > 0 && text.length <= 500 && selectedVoiceId;
    generateBtn.disabled = !isValid;
}

// Generate Speech
async function generateSpeech() {
    const text = textInput.value.trim();
    const t = translations[currentLanguage];
    
    // Validate
    if (!text) {
        alert(t.errorEmpty);
        return;
    }
    
    if (!selectedVoiceId) {
        alert(t.errorNoVoice);
        return;
    }
    
    if (text.length > 500) {
        alert(t.warningExceeded);
        return;
    }
    
    // Show loading
    generateBtn.style.display = 'none';
    loadingSpinner.style.display = 'flex';
    audioSection.style.display = 'none';
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                voice_id: selectedVoiceId,
                language: currentLanguage
            })
        });
        
        if (!response.ok) {
            throw new Error('Generation failed');
        }
        
        const data = await response.json();
        
        // Display audio player
        generatedAudioUrl = data.audio_url;
        audioPlayer.src = generatedAudioUrl;
        audioSection.style.display = 'block';
        
        // Auto-play
        audioPlayer.play();
        
    } catch (error) {
        console.error('Error generating speech:', error);
        alert(t.errorGeneration);
    } finally {
        // Hide loading
        loadingSpinner.style.display = 'none';
        generateBtn.style.display = 'inline-flex';
    }
}

// Download Audio
function downloadAudio() {
    if (generatedAudioUrl) {
        const a = document.createElement('a');
        a.href = generatedAudioUrl;
        a.download = `vieneu-tts-${Date.now()}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Load Sample Audios
function loadSamples() {
    // Sample data (these would be loaded from your actual sample files)
    const samples = [
        { id: 'binh', title: 'Bình (Nam miền Bắc)', src: '/static/audio/samples/binh.wav' },
        { id: 'doan', title: 'Đoan (Nữ miền Nam)', src: '/static/audio/samples/doan.wav' },
        { id: 'huong', title: 'Hương (Nữ miền Bắc)', src: '/static/audio/samples/huong.wav' },
        { id: 'nguyen', title: 'Nguyên (Nam miền Nam)', src: '/static/audio/samples/nguyen.wav' }
    ];
    
    samplesGrid.innerHTML = '';
    
    samples.forEach(sample => {
        const sampleCard = document.createElement('div');
        sampleCard.className = 'sample-card';
        sampleCard.innerHTML = `
            <div class="sample-title">${sample.title}</div>
            <audio controls>
                <source src="${sample.src}" type="audio/wav">
                Your browser does not support the audio element.
            </audio>
        `;
        samplesGrid.appendChild(sampleCard);
    });
}
