/**
 * Platform Detection and API Configuration
 * Handles different API endpoints for Web, Electron, Android, and iOS
 */

export type Platform = 'web' | 'electron' | 'android' | 'ios';
export type ApiService = 'app' | 'f5' | 'vieneu' | 'whisper' | 'bgremove';

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  // File protocol indicates Electron shell
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'electron';
  }
  
  // Check if running on actual mobile device (not emulated in desktop browser)
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || navigator.vendor || '';
    
    // Skip mobile detection if running in Electron or desktop browser
    // Desktop browsers on Windows/Mac/Linux should return 'web'
    const isDesktop = /Windows|Macintosh|Linux/.test(userAgent) && !/Mobile|Android/.test(userAgent);
    
    if (!isDesktop) {
      // Only check for mobile if not clearly a desktop
      if (/android/i.test(userAgent) && /Mobile/.test(userAgent)) {
        return 'android';
      }
      
      if (/iPad|iPhone|iPod/.test(userAgent) && !('MSStream' in window)) {
        return 'ios';
      }
    }
  }
  
  return 'web';
}

/**
 * Get the appropriate API URL based on platform
 */
export function getServiceApiUrl(service: ApiService): string {
  const env = import.meta.env;
  const specific = {
    app: env.VITE_APP_API_URL,
    f5: env.VITE_F5_API_URL,
    vieneu: env.VITE_VIENEU_API_URL,
    whisper: env.VITE_WHISPER_API_URL,
    bgremove: env.VITE_BGREMOVE_API_URL,
  } as const;

  if (specific[service]) {
    return specific[service];
  }

  if (env.VITE_API_URL) {
    return env.VITE_API_URL;
  }

  switch (service) {
    case 'app':
      return 'http://127.0.0.1:6901';
    case 'f5':
      return 'http://127.0.0.1:6902';
    case 'vieneu':
      return 'http://127.0.0.1:6903';
    case 'whisper':
      return 'http://127.0.0.1:6904';
    case 'bgremove':
      return 'http://127.0.0.1:6905';
    default:
      return 'http://127.0.0.1:6901';
  }
}

export function getApiUrl(): string {
  return getServiceApiUrl('app');
}

/**
 * Check if local API is available (Web/Electron only)
 */
export function isLocalApiAvailable(): boolean {
  const platform = detectPlatform();
  return platform === 'web' || platform === 'electron';
}

/**
 * Check if running in production mode
 */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/**
 * Get platform-specific configuration
 */
export function getPlatformConfig() {
  const platform = detectPlatform();
  const apiUrl = getApiUrl();
  const isLocal = isLocalApiAvailable();
  const isProd = isProduction();
  
  return {
    platform,
    apiUrl,
    isLocal,
    isProd,
    features: {
      // Features that work on all platforms
      videoDownload: true,
      audioExtract: true,
      audioConvert: true,
      videoTrim: true,
      videoSpeed: true,
      
      // Features that might be limited on mobile
      largeFiles: isLocal, // Local API can handle larger files
      offlineMode: isLocal, // Only local API works offline
    },
    limits: {
      // File size limits (in MB)
      maxFileSize: isLocal ? 1000 : 100, // 1GB local, 100MB cloud
      maxDuration: isLocal ? 3600 : 600, // 1 hour local, 10 min cloud
    }
  };
}

/**
 * Check API health
 */
export async function checkApiHealth(apiUrl?: string): Promise<boolean> {
  const url = apiUrl || getServiceApiUrl('app');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${url}/api/v1/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('API health check failed:', error);
    return false;
  }
}

/**
 * Get user-friendly platform name
 */
export function getPlatformName(): string {
  const platform = detectPlatform();
  
  switch (platform) {
    case 'web':
      return 'Web Browser';
    case 'electron':
      return 'Desktop App';
    case 'android':
      return 'Android';
    case 'ios':
      return 'iOS';
    default:
      return 'Unknown';
  }
}

/**
 * Check if platform supports feature
 */
export function supportsFeature(feature: string): boolean {
  const config = getPlatformConfig();
  const features: Record<string, boolean> = config.features;
  return features[feature] ?? false;
}
