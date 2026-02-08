// Translations for the Transcribe Audio application
const translations = {
  vi: {
    appTitle: "Phiên Âm Audio",
    online: "Trực tuyến",
    uploadAudio: "Tải lên Audio",
    audioFile: "File Audio",
    supportedFormats: "Định dạng hỗ trợ: .wav, .mp3",
    play: "Phát",
    pause: "Tạm dừng",
    language: "Ngôn ngữ",
    vietnameseVi: "Tiếng Việt (vi)",
    generateTranscript: "Tạo Phiên Âm",
    reset: "Đặt lại",
    transcribing: "Đang phiên âm…",
    transcribedText: "Văn bản đã phiên âm",
    downloadTxt: "Tải TXT",
    copy: "Sao chép",
    copied: "Đã sao chép!",
    notTranscribedYet: "Chưa phiên âm",
    copyright: "Psi Technology © 2025",
    errorSelectFile: "Vui lòng chọn một file audio để phiên âm.",
    errorUnsupportedFormat: "Chỉ hỗ trợ file .wav và .mp3 bởi API.",
    errorTranscriptionFailed: "Phiên âm thất bại.",
    errorNetwork: "Lỗi mạng:"
  },
  en: {
    appTitle: "Audio Transcription",
    online: "Online",
    uploadAudio: "Upload Audio",
    audioFile: "Audio File",
    supportedFormats: "Supported formats: .wav, .mp3",
    play: "Play",
    pause: "Pause",
    language: "Language",
    vietnameseVi: "Vietnamese (vi)",
    generateTranscript: "Generate Transcript",
    reset: "Reset",
    transcribing: "Transcribing…",
    transcribedText: "Transcribed Text",
    downloadTxt: "Download TXT",
    copy: "Copy",
    copied: "Copied!",
    notTranscribedYet: "Not transcribed yet",
    copyright: "Psi Technology © 2025",
    errorSelectFile: "Please select an audio file to transcribe.",
    errorUnsupportedFormat: "Only .wav and .mp3 files are supported by the API.",
    errorTranscriptionFailed: "Transcription failed.",
    errorNetwork: "Network error:"
  }
};

// Get current language from localStorage or default to English
let currentLanguage = localStorage.getItem('transcribe_language') || 'en';

// Function to switch language
function switchLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('transcribe_language', lang);
  
  // Update UI
  updateLanguageUI();
  applyTranslations();
}

// Function to update language toggle button styles
function updateLanguageUI() {
  const langVnBtn = document.getElementById('lang-vn');
  const langEnBtn = document.getElementById('lang-en');
  
  if (currentLanguage === 'vi') {
    langVnBtn.classList.add('bg-white', 'text-gray-900');
    langVnBtn.classList.remove('text-gray-400', 'hover:bg-gray-600');
    langEnBtn.classList.remove('bg-white', 'text-gray-900');
    langEnBtn.classList.add('text-gray-400', 'hover:bg-gray-600');
  } else {
    langEnBtn.classList.add('bg-white', 'text-gray-900');
    langEnBtn.classList.remove('text-gray-400', 'hover:bg-gray-600');
    langVnBtn.classList.remove('bg-white', 'text-gray-900');
    langVnBtn.classList.add('text-gray-400', 'hover:bg-gray-600');
  }
}

// Function to apply translations to all elements
function applyTranslations() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    if (translations[currentLanguage][key]) {
      element.textContent = translations[currentLanguage][key];
    }
  });
  
  // Handle placeholder translations
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    if (translations[currentLanguage][key]) {
      element.placeholder = translations[currentLanguage][key];
    }
  });
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', () => {
  updateLanguageUI();
  applyTranslations();
});

// Function to get translated text (for use in JavaScript)
function t(key) {
  return translations[currentLanguage][key] || key;
}
