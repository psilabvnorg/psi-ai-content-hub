/**
 * API Client with Platform Detection
 * Automatically uses the correct API endpoint based on platform
 */

import { getApiUrl, isLocalApiAvailable, getPlatformConfig } from './platform';

export const API_URL = getApiUrl();

export interface ApiResponse<T = any> {
  status: string;
  data?: T;
  error?: string;
}

export interface DownloadVideoRequest {
  url: string;
  platform: 'youtube' | 'tiktok' | 'facebook' | 'instagram';
}

export interface ExtractAudioRequest {
  video_path: string;
  format: 'mp3' | 'wav';
}

export interface ConvertAudioRequest {
  audio_path: string;
  output_format: 'mp3' | 'wav';
}

export interface TrimVideoRequest {
  video_path: string;
  start_time: string;
  end_time?: string;
  duration?: string;
}

export interface AdjustSpeedRequest {
  video_path: string;
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
  async health(): Promise<{ status: string; timestamp: string }> {
    return this.request('/api/health');
  }
  
  /**
   * Download video
   */
  async downloadVideo(data: DownloadVideoRequest) {
    return this.request('/api/download/video', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Extract audio from video
   */
  async extractAudio(data: ExtractAudioRequest) {
    return this.request('/api/extract/audio', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Convert audio format
   */
  async convertAudio(data: ConvertAudioRequest) {
    return this.request('/api/convert/audio', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Trim video
   */
  async trimVideo(data: TrimVideoRequest) {
    return this.request('/api/trim/video', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Adjust video speed
   */
  async adjustSpeed(data: AdjustSpeedRequest) {
    return this.request('/api/adjust/speed', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  
  /**
   * Get file download URL
   */
  getFileUrl(filename: string): string {
    return `${this.baseUrl}/api/files/${filename}`;
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
