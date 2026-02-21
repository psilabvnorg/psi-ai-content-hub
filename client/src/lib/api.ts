/**
 * API Client with Platform Detection
 * Automatically uses the correct API endpoint based on platform
 */

import { getApiUrl, getServiceApiUrl, isLocalApiAvailable, getPlatformConfig } from './platform';

export const APP_API_URL = getServiceApiUrl('app');
export const IMAGE_SEARCH_API_URL = getServiceApiUrl('image-search');
export const TRANSLATION_API_URL = getServiceApiUrl('translation');
export const F5_API_URL = getServiceApiUrl('f5');
export const VIENEU_API_URL = getServiceApiUrl('vieneu');
export const WHISPER_API_URL = getServiceApiUrl('whisper');
export const BG_REMOVE_OVERLAY_API_URL = getServiceApiUrl('bg-remove-overlay');
export const IMAGE_FINDER_API_URL = IMAGE_SEARCH_API_URL;
export const BGREMOVE_API_URL = BG_REMOVE_OVERLAY_API_URL;

export const API_URL = getApiUrl();

export interface ApiResponse<T = unknown> {
  status: string;
  data?: T;
  error?: string;
}

export interface DownloadVideoRequest {
  url: string;
  platform: 'youtube' | 'tiktok' | 'facebook' | 'instagram';
  convert_to_h264?: boolean;
}

export interface ExtractAudioRequest {
  file: File;
  format: 'mp3' | 'wav';
}

export interface ConvertAudioRequest {
  file: File;
  output_format: 'mp3' | 'wav';
}

export interface TrimVideoRequest {
  file: File;
  start_time: string;
  end_time?: string;
}

export interface AdjustSpeedRequest {
  file: File;
  speed: number;
}

/**
 * API Client Class
 */
class ApiClient {
  private baseUrl: string;
  private isLocal: boolean;
  
  constructor() {
    this.baseUrl = API_URL;
    this.isLocal = isLocalApiAvailable();
  }
  
  /**
   * Get current API URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
  
  /**
   * Check if using local API
   */
  isLocalApi(): boolean {
    return this.isLocal;
  }
  
  /**
   * Make API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        detail: response.statusText 
      }));
      throw new Error(error.detail || 'API request failed');
    }
    
    return response.json();
  }
  
  /**
   * Health check
   */
  async health(): Promise<Record<string, unknown>> {
    return this.request('/api/v1/status');
  }
  
  /**
   * Download video
   */
  async downloadVideo(data: DownloadVideoRequest) {
    return this.request('/api/v1/video/download', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Extract audio from video
   */
  async extractAudio(data: ExtractAudioRequest) {
    const form = new FormData();
    form.append('file', data.file);
    form.append('format', data.format);
    return fetch(`${this.baseUrl}/api/v1/video/extract-audio`, { method: 'POST', body: form }).then(r => r.json());
  }
  
  /**
   * Convert audio format
   */
  async convertAudio(data: ConvertAudioRequest) {
    const form = new FormData();
    form.append('file', data.file);
    form.append('output_format', data.output_format);
    return fetch(`${this.baseUrl}/api/v1/audio/convert`, { method: 'POST', body: form }).then(r => r.json());
  }
  
  /**
   * Trim video
   */
  async trimVideo(data: TrimVideoRequest) {
    const form = new FormData();
    form.append('file', data.file);
    form.append('start_time', data.start_time);
    if (data.end_time) form.append('end_time', data.end_time);
    return fetch(`${this.baseUrl}/api/v1/video/trim`, { method: 'POST', body: form }).then(r => r.json());
  }
  
  /**
   * Adjust video speed
   */
  async adjustSpeed(data: AdjustSpeedRequest) {
    const form = new FormData();
    form.append('file', data.file);
    form.append('speed', String(data.speed));
    return fetch(`${this.baseUrl}/api/v1/video/speed`, { method: 'POST', body: form }).then(r => r.json());
  }
  
  /**
   * Get file download URL
   */
  getFileUrl(filename: string): string {
    return `${this.baseUrl}/api/v1/files/${filename}`;
  }
  
  /**
   * Get platform configuration
   */
  getPlatformInfo() {
    return {
      ...getPlatformConfig(),
      apiUrl: this.baseUrl,
      isLocal: this.isLocal,
    };
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export convenience functions
export const api = {
  health: () => apiClient.health(),
  downloadVideo: (data: DownloadVideoRequest) => apiClient.downloadVideo(data),
  extractAudio: (data: ExtractAudioRequest) => apiClient.extractAudio(data),
  convertAudio: (data: ConvertAudioRequest) => apiClient.convertAudio(data),
  trimVideo: (data: TrimVideoRequest) => apiClient.trimVideo(data),
  adjustSpeed: (data: AdjustSpeedRequest) => apiClient.adjustSpeed(data),
  getFileUrl: (filename: string) => apiClient.getFileUrl(filename),
  getPlatformInfo: () => apiClient.getPlatformInfo(),
};

export default apiClient;
