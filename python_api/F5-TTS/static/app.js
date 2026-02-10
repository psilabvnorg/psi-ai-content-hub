(() => {
  const form = document.getElementById('tts-form');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const audioEl = document.getElementById('audio-player');
  const downloadEl = document.getElementById('download-link');
  const messageEl = document.getElementById('message');
  const samplesEl = document.getElementById('samples');
  const generateBtn = document.getElementById('generate-btn');
  const voiceSelect = document.getElementById('voice-select');
  const voiceInfoEl = document.getElementById('voice-info');
  const voiceNameEl = document.getElementById('voice-name');
  const voiceDescEl = document.getElementById('voice-description');
  const voiceMetaEl = document.getElementById('voice-meta');
  
  // Loading modal elements
  const loadingModal = document.getElementById('loading-modal');
  const progressPercent = document.getElementById('progress-percent');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  // Track remaining rate limit across SSE lifecycle
  let remainingLimit = null;

  function showLoadingModal() {
    resetLoadingModal();
    loadingModal.classList.remove('hidden');
  }

  function hideLoadingModal() {
    loadingModal.classList.add('hidden');
  }

  function updateProgress(percent, text = '', translationKey = '') {
    progressPercent.textContent = `${Math.round(percent)}%`;
    progressBar.style.width = `${percent}%`;
    if (text) {
      progressText.textContent = text;
      if (translationKey) {
        progressText.setAttribute('data-i18n', translationKey);
      } else {
        progressText.removeAttribute('data-i18n');
      }
    }
  }

  function showCompletionState() {
    const spinner = document.getElementById('spinner');
    const progressPercent = document.getElementById('progress-percent');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const loadingSubtitle = document.getElementById('loading-subtitle');
    const okBtn = document.getElementById('modal-ok-btn');
    
    // Hide spinner and progress elements
    spinner.style.display = 'none';
    progressBar.parentElement.style.display = 'none';
    loadingSubtitle.style.display = 'none';
    
    // Show completion message
    progressPercent.textContent = '✓';
    progressPercent.classList.add('text-success');
    progressText.textContent = translate('completed');
    
    // Show OK button
    okBtn.classList.remove('hidden');
  }

  function resetLoadingModal() {
    const spinner = document.getElementById('spinner');
    const progressPercent = document.getElementById('progress-percent');
    const progressBar = document.getElementById('progress-bar');
    const loadingSubtitle = document.getElementById('loading-subtitle');
    const okBtn = document.getElementById('modal-ok-btn');
    
    // Reset all elements to initial state
    spinner.style.display = 'block';
    progressBar.parentElement.style.display = 'block';
    loadingSubtitle.style.display = 'block';
    progressPercent.classList.remove('text-success');
    okBtn.classList.add('hidden');
    
    updateProgress(0, translate('initializing'), 'initializing');
  }

  async function checkHealth() {
    try {
      const res = await fetch('/api/v1/health/');
      if (res.ok) {
        const data = await res.json();
        statusEl.textContent = `${translate('apiStatusOnline')} (v${data.version || '1.0.0'})`;
      } else {
        statusEl.textContent = translate('apiStatusOffline');
      }
    } catch (e) {
      statusEl.textContent = translate('apiStatusOffline');
    }
  }

  function setMessage(text, type = 'info') {
    if (!text) {
      messageEl.textContent = '';
      messageEl.className = '';
      return;
    }
    
    // Map types to DaisyUI alert classes
    const alertClasses = {
      'info': 'alert alert-info',
      'success': 'alert alert-success',
      'error': 'alert alert-error'
    };
    
    messageEl.textContent = text;
    messageEl.className = alertClasses[type] || 'alert';
  }

  async function loadVoices() {
    try {
      const res = await fetch('/api/v1/voices/');
      if (!res.ok) {
        throw new Error('Failed to load voices');
      }
      
      const data = await res.json();
      voiceSelect.innerHTML = '';
      
      if (data.voices && data.voices.length > 0) {
        data.voices.forEach(voice => {
          const option = document.createElement('option');
          option.value = voice.id;
          option.textContent = `${voice.name} (${voice.gender})`;
          option.title = voice.description;
          voiceSelect.appendChild(option);
        });
        
        // Load samples from backend
        loadSamplesFromBackend();
        
        // Load detail for first voice
        if (data.voices.length > 0) {
          loadVoiceDetail(data.voices[0].id);
        }
      } else {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = translate('noVoices');
        voiceSelect.appendChild(option);
      }
    } catch (e) {
      console.error('Error loading voices:', e);
      const option = document.createElement('option');
      option.value = '';
      option.textContent = translate('errorLoadingVoices');
      voiceSelect.appendChild(option);
      setMessage(translate('cannotLoadVoices'), 'error');
    }
  }

  async function loadSamplesFromBackend() {
    samplesEl.innerHTML = '';
    try {
      const res = await fetch('/api/v1/samples');
      if (!res.ok) throw new Error('Failed to load samples');
      const data = await res.json();
      const samples = data.samples || [];
      if (samples.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-center opacity-50';
        p.setAttribute('data-i18n', 'noSamples');
        p.textContent = translate('noSamples');
        samplesEl.appendChild(p);
        return;
      }
      samples.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card bg-base-200 shadow-md';
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body p-4';
        const title = document.createElement('h3');
        title.className = 'card-title text-base';
        title.textContent = item.voice.replace(/_/g, ' ');
        const sub = document.createElement('p');
        sub.className = 'text-xs opacity-70';
        sub.textContent = item.filename;
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.className = 'w-full mt-2';
        audio.src = item.url;
        cardBody.appendChild(title);
        cardBody.appendChild(sub);
        cardBody.appendChild(audio);
        card.appendChild(cardBody);
        samplesEl.appendChild(card);
      });
    } catch (e) {
      console.error('Error loading samples:', e);
      const p = document.createElement('p');
      p.className = 'text-center text-error';
      p.setAttribute('data-i18n', 'errorLoadingSamples');
      p.textContent = translate('errorLoadingSamples');
      samplesEl.appendChild(p);
    }
  }

  async function loadSamples() {
    // This function is now replaced by loadSamplesFromVoices
    // Kept for backward compatibility if needed
  }

  async function loadVoiceDetail(voiceId) {
    if (!voiceId) {
      voiceInfoEl.classList.add('hidden');
      return;
    }

    try {
      const res = await fetch(`/api/v1/voices/${voiceId}`);
      if (!res.ok) {
        throw new Error('Failed to load voice details');
      }

      const voice = await res.json();
      
      // Update voice info display
      voiceNameEl.textContent = voice.name;
      voiceDescEl.textContent = voice.description;
      const genderText = voice.gender === 'male' ? translate('male') : translate('female');
      voiceMetaEl.textContent = `${voice.language.toUpperCase()} • ${genderText}`;
      
      voiceInfoEl.classList.remove('hidden');
    } catch (e) {
      console.error('Error loading voice details:', e);
      voiceInfoEl.classList.add('hidden');
    }
  }

  // Listen for voice selection change
  voiceSelect.addEventListener('change', (e) => {
    loadVoiceDetail(e.target.value);
  });

  // Character counter and warning
  const textInput = document.getElementById('text-input');
  const charCount = document.getElementById('char-count');
  const charWarning = document.getElementById('char-warning');
  const charWarningText = document.getElementById('char-warning-text');
  
  textInput.addEventListener('input', () => {
    const len = textInput.value.length;
    charCount.textContent = `${len} / 500`;
    
    if (len > 500) {
      charCount.classList.add('text-error', 'font-semibold');
      charWarning.classList.remove('hidden');
      // Update warning text with translation
      charWarningText.textContent = translate('charLimitWarning');
    } else {
      charCount.classList.remove('text-error', 'font-semibold');
      charWarning.classList.add('hidden');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMessage('');
    generateBtn.disabled = true;
    
    // Show loading modal
    showLoadingModal();

    try {
      const fd = new FormData(form);
      const text = fd.get('text');
      const voiceId = fd.get('voice_id');
      const speed = fd.get('speed') || '1.0';
      const cfgStrength = fd.get('cfg_strength') || '2.0';
      const nfeStep = fd.get('nfe_step') || '32';
      const removeSilence = fd.get('remove_silence') === 'on';

      if (!text) {
        setMessage(translate('enterTextError'), 'error');
        generateBtn.disabled = false;
        hideLoadingModal();
        return;
      }

      // Note: We allow text > 500, but only first 500 chars will be used
      // The warning is already shown in the UI

      if (!voiceId) {
        setMessage(translate('selectVoiceError'), 'error');
        generateBtn.disabled = false;
        hideLoadingModal();
        return;
      }

      // Build SSE request URL
      const params = new URLSearchParams();
      params.append('text', text);
      params.append('voice_id', voiceId);
      params.append('speed', speed);
      params.append('cfg_strength', cfgStrength);
      params.append('nfe_step', nfeStep);
      params.append('remove_silence', removeSilence);

      // Use Server-Sent Events for real-time progress
      const eventSource = new EventSource(`/api/v1/tts/generate-audio?${params.toString()}`);
      
      eventSource.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.error || data.error_key) {
            eventSource.close();
            hideLoadingModal();
            const errorMsg = data.error_key ? translate(data.error_key) : data.error;
            setMessage(errorMsg, 'error');
            generateBtn.disabled = false;
            return;
          }

          // // Check rate limit info from initial payload
          // if (data.rate_limit && typeof data.rate_limit.remaining !== 'undefined') {
          //   if (parseInt(data.rate_limit.remaining) <= 0) {
          //     // Inform user and stop further processing
          //     eventSource.close();
          //     hideLoadingModal();
          //     setMessage('Số lượt tạo audio của bạn đã quá 5 lần. Hãy login để có thể tạo thêm file audio.', 'error');
          //     generateBtn.disabled = false;
          //     return;
          //   }
          //   // Store remaining limit for later display in completion message
          //   remainingLimit = parseInt(data.rate_limit.remaining);
          //   // Inform user about remaining limit if still available
          //   const remaining_limit = parseInt(data.rate_limit.remaining);
          //   if (remaining_limit > 0) {
          //     setMessage(`Số lượt tạo audio của bạn còn ${remaining_limit}`, 'info');
          //   }
          // }
          
          // Translate status message if status_key is provided
          let statusText = data.status || '';
          if (data.status_key) {
            statusText = translate(data.status_key);
            // Handle messages with variables like "Generating audio 1/10..."
            if (data.current && data.total) {
              statusText = `${statusText} ${data.current}/${data.total}...`;
            }
          }
          
          // Update progress with translated backend data
          updateProgress(data.progress, statusText, data.status_key || '');
          
          // If complete, handle audio URL
          if (data.progress === 100 && data.audio_url) {
            eventSource.close();
            
            // Use the audio URL directly from backend
            audioEl.src = data.audio_url;
            downloadEl.href = data.audio_url;
            downloadEl.download = data.filename || 'output.wav';
            
            // Show completion state with OK button
            showCompletionState();
            
            // When modal closes (via OK button), show results
            const okBtn = document.getElementById('modal-ok-btn');
            okBtn.onclick = () => {
              hideLoadingModal();
              resetLoadingModal();
              resultEl.classList.remove('hidden');
              
              // Show success with metrics
              let successMsg = translate('successGenerated');
              if (data.duration) successMsg += ` • ${translate('duration')}: ${data.duration.toFixed(1)}s`;
              if (data.file_size) successMsg += ` • ${translate('fileSize')}: ${(data.file_size / 1024).toFixed(0)}KB`;
              setMessage(successMsg, 'success');
            };
            
            generateBtn.disabled = false;
          }
        } catch (err) {
          console.error('Error parsing SSE data:', err);
        }
      };
      
      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        eventSource.close();
        hideLoadingModal();
        setMessage(translate('errorOccurred'), 'error');
        generateBtn.disabled = false;
      };
      
    } catch (err) {
      console.error(err);
      hideLoadingModal();
      setMessage(err.message || translate('errorOccurred'), 'error');
      generateBtn.disabled = false;
    }
  });

  // Init
  checkHealth();
  loadVoices();
  
  // Listen for language changes
  window.addEventListener('languageChanged', () => {
    // Reload dynamic content with new language
    checkHealth();
    loadVoices();
    
    // Update placeholder for text input
    textInput.placeholder = translate('textPlaceholder');
    
    // Update warning if visible
    if (!charWarning.classList.contains('hidden')) {
      charWarningText.textContent = translate('charLimitWarning');
    }
    
    // Update character count
    const len = textInput.value.length;
    charCount.textContent = `${len} / 500`;
    
    // Re-translate modal if visible
    if (!loadingModal.classList.contains('hidden')) {
      const progressTextEl = document.getElementById('progress-text');
      const loadingSubtitle = document.getElementById('loading-subtitle');
      if (progressTextEl && progressTextEl.hasAttribute('data-i18n')) {
        progressTextEl.textContent = translate(progressTextEl.getAttribute('data-i18n'));
      }
      if (loadingSubtitle && loadingSubtitle.hasAttribute('data-i18n')) {
        loadingSubtitle.textContent = translate(loadingSubtitle.getAttribute('data-i18n'));
      }
    }
  });
})();
