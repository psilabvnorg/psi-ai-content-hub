// Translations for Vietnamese and English
const translations = {
    vi: {
        appTitle: "VieNeu-TTS",
        appSubtitle: "Vietnamese Text-to-Speech with Instant Voice Cloning",
        voiceSectionTitle: "Chọn giọng nói",
        voicePlaceholder: "Chọn giọng nói...",
        textSectionTitle: "Nhập văn bản",
        textPlaceholder: "Nhập văn bản bạn muốn chuyển thành giọng nói...",
        generateBtnText: "Tạo giọng nói",
        audioSectionTitle: "Kết quả",
        downloadBtnText: "Tải xuống",
        samplesSectionTitle: "Các mẫu âm thanh",
        samplesDescription: "Nghe các mẫu giọng nói có sẵn",
        footerText: "Made with ❤️ for the Vietnamese TTS community",
        loadingText: "Đang tạo giọng nói...",
        warningExceeded: "Văn bản vượt quá 500 ký tự. Vui lòng rút ngắn văn bản.",
        errorEmpty: "Vui lòng nhập văn bản",
        errorNoVoice: "Vui lòng chọn giọng nói",
        errorGeneration: "Có lỗi xảy ra khi tạo giọng nói. Vui lòng thử lại.",
        selectVoice: "Chọn giọng nói để tiếp tục",
        langButtonText: "VN"
    },
    en: {
        appTitle: "VieNeu-TTS",
        appSubtitle: "Vietnamese Text-to-Speech with Instant Voice Cloning",
        voiceSectionTitle: "Select Voice",
        voicePlaceholder: "Select a voice...",
        textSectionTitle: "Enter Text",
        textPlaceholder: "Enter the text you want to convert to speech...",
        generateBtnText: "Generate Voice",
        audioSectionTitle: "Result",
        downloadBtnText: "Download",
        samplesSectionTitle: "Audio Samples",
        samplesDescription: "Listen to available voice samples",
        footerText: "Made with ❤️ for the Vietnamese TTS community",
        loadingText: "Generating voice...",
        warningExceeded: "Text exceeds 500 characters. Please shorten your text.",
        errorEmpty: "Please enter text",
        errorNoVoice: "Please select a voice",
        errorGeneration: "An error occurred while generating voice. Please try again.",
        selectVoice: "Select a voice to continue",
        langButtonText: "EN"
    }
};

// Export for use in app.js
window.translations = translations;
