const translations = {
  vi: {
    // Header
    appTitle: 'F5-TTS Nhân Bản Giọng Nói',
    apiStatus: 'API: không xác định',
    apiStatusOnline: 'Trạng thái API: trực tuyến',
    apiStatusOffline: 'Trạng thái API: ngoại tuyến',
    
    // Main Form
    generateAudio: 'Tạo Audio',
    selectVoice: 'Chọn giọng (voice)',
    loading: 'Đang tải...',
    noVoices: 'Không có giọng nào',
    errorLoadingVoices: 'Lỗi tải giọng',
    
    // Voice Info
    male: 'Nam',
    female: 'Nữ',
    
    // Text Input
    enterText: 'Nhập đoạn văn bản (dưới 500 kí tự)',
    textPlaceholder: 'Nhập text cần clone giọng...',
    charCount: '{{count}} / 500',
    charLimitWarning: 'Văn bản của bạn vượt quá 500 ký tự. Chỉ 500 ký tự đầu tiên sẽ được sử dụng để tạo giọng nói.\nBạn cần đăng nhập để có thể tạo với văn bản dài hơn.',
    
    // Advanced Options
    advancedOptions: '⚙️ Tùy chọn nâng cao',
    speed: 'Tốc độ (0.5 - 2.0)',
    default: 'Mặc định',
    cfgStrength: 'CFG Strength (1.0 - 5.0)',
    nfeSteps: 'NFE Steps',
    removeSilence: 'Loại bỏ khoảng lặng',
    
    // Buttons
    generateWav: 'Tạo file giọng nói (WAV)',
    reset: 'Đặt lại',
    
    // Result Section
    result: '✅ Kết quả',
    downloadWav: 'Tải xuống file giọng nói (WAV)',
    
    // Samples Section
    listenSamples: 'Nghe thử mẫu',
    noSamples: 'Chưa có mẫu audio nào',
    errorLoadingSamples: 'Lỗi tải mẫu audio',
    
    // Messages
    enterTextError: 'Vui lòng nhập text.',
    textTooLongError: 'Văn bản không được vượt quá 5000 ký tự.',
    selectVoiceError: 'Vui lòng chọn giọng.',
    errorOccurred: 'Có lỗi xảy ra. Vui lòng thử lại.',
    cannotLoadVoices: 'Không thể tải danh sách giọng',
    successGenerated: 'Tạo audio thành công!',
    duration: 'Độ dài',
    fileSize: 'Kích thước',
    
    // Loading Modal
    initializing: 'Đang khởi tạo...',
    processingText: 'Đang xử lý văn bản...',
    generatingAudio: 'Đang tạo audio',
    generatingResult: 'Đang tạo kết quả',
    finalizingResult: 'Đang hoàn thiện kết quả...',
    complete: 'Hoàn thành!',
    error: 'Lỗi',
    generationFailed: 'Tạo audio thất bại',
    outputFileNotCreated: 'File đầu ra không được tạo',
    pleaseWait: 'Vui lòng chờ trong giây lát...',
    completed: 'Đã hoàn thành tạo file, kiểm tra ở phần Kết quả bên dưới.',
    ok: 'OK'
  },
  
  en: {
    // Header
    appTitle: 'F5-TTS Voice Cloning',
    apiStatus: 'API: unknown',
    apiStatusOnline: 'API status: online',
    apiStatusOffline: 'API status: offline',
    
    // Main Form
    generateAudio: 'Generate Audio',
    selectVoice: 'Select Voice',
    loading: 'Loading...',
    noVoices: 'No voices available',
    errorLoadingVoices: 'Error loading voices',
    
    // Voice Info
    male: 'Male',
    female: 'Female',
    
    // Text Input
    enterText: 'Enter Text (under 500 characters)',
    textPlaceholder: 'Enter text to synthesize...',
    charCount: '{{count}} / 500',
    charLimitWarning: 'Your text exceeds 500 characters. Only the first 500 characters will be used to generate audio.\nYou need to log in to generate with longer text.',
    
    // Advanced Options
    advancedOptions: '⚙️ Advanced Options',
    speed: 'Speed (0.5 - 2.0)',
    default: 'Default',
    cfgStrength: 'CFG Strength (1.0 - 5.0)',
    nfeSteps: 'NFE Steps',
    removeSilence: 'Remove Silence',
    
    // Buttons
    generateWav: 'Generate WAV',
    reset: 'Reset',
    
    // Result Section
    result: '✅ Result',
    downloadWav: 'Download WAV',
    
    // Samples Section
    listenSamples: 'Sample Previews',
    noSamples: 'No audio samples available',
    errorLoadingSamples: 'Error loading audio samples',
    
    // Messages
    enterTextError: 'Please enter text.',
    textTooLongError: 'Text cannot exceed 5000 characters.',
    selectVoiceError: 'Please select a voice.',
    errorOccurred: 'An error occurred. Please try again.',
    cannotLoadVoices: 'Cannot load voice list',
    successGenerated: 'Audio generated successfully!',
    duration: 'Duration',
    fileSize: 'File size',
    
    // Loading Modal
    initializing: 'Initializing...',
    processingText: 'Processing text...',
    generatingAudio: 'Generating audio',
    generatingResult: 'Generating result',
    finalizingResult: 'Finalizing result...',
    complete: 'Complete!',
    error: 'Error',
    generationFailed: 'Audio generation failed',
    outputFileNotCreated: 'Output file was not created',
    pleaseWait: 'Please wait a moment...',
    completed: 'Generation completed, check the Result section below.',
    ok: 'OK'
  }
};

// Get current language from localStorage or default to Vietnamese
let currentLanguage = localStorage.getItem('language') || 'vi';

// Translation function
function translate(key) {
  // Always read from localStorage to ensure we have the latest language
  const lang = localStorage.getItem('language') || 'vi';
  const keys = key.split('.');
  let value = translations[lang];
  
  for (const k of keys) {
    value = value?.[k];
  }
  
  return value || key;
}

// Update all text content with data-i18n attributes
function updatePageLanguage() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = translate(key);
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      if (element.hasAttribute('placeholder')) {
        element.placeholder = translation;
      }
    } else {
      element.textContent = translation;
    }
  });
  
  // Update elements with data-i18n-placeholder attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    const translation = translate(key);
    element.placeholder = translation;
  });
  
  // Update HTML lang attribute
  const lang = localStorage.getItem('language') || 'vi';
  document.documentElement.lang = lang;
  
  // Save preference (already set by switchLanguage)
  localStorage.setItem('language', lang);
  
  // Update toggle button state
  updateToggleButton();
}

// Update toggle button appearance
function updateToggleButton() {
  const vnBtn = document.getElementById('lang-vn');
  const enBtn = document.getElementById('lang-en');
  const lang = localStorage.getItem('language') || 'vi';
  
  if (vnBtn && enBtn) {
    if (lang === 'vi') {
      vnBtn.classList.add('btn-primary');
      vnBtn.classList.remove('btn-ghost');
      enBtn.classList.remove('btn-primary');
      enBtn.classList.add('btn-ghost');
    } else {
      enBtn.classList.add('btn-primary');
      enBtn.classList.remove('btn-ghost');
      vnBtn.classList.remove('btn-primary');
      vnBtn.classList.add('btn-ghost');
    }
  }
}

// Switch language
function switchLanguage(lang) {
  const currentLang = localStorage.getItem('language') || 'vi';
  if (lang !== currentLang && (lang === 'vi' || lang === 'en')) {
    currentLanguage = lang; // Keep for backward compatibility
    localStorage.setItem('language', lang);
    updatePageLanguage();
    
    // Dispatch event for dynamic content
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  updatePageLanguage();
});
