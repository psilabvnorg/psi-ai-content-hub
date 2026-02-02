/**
 * Platform Detection and API Configuration
 * Handles different API endpoints for Web, Tauri, Android, and iOS
 */

export type Platform = 'web' | 'tauri' | 'android' | 'ios';

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  // Check if running in Tauri
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    return 'tauri';
  }
  
  // Check if running on mobile
  if (typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent || (navigator as any).vendor || '';
    
    if (/android/i.test(userAgent)) {
      return 'android';
    }
    
    if (/iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream) {
      return 'ios';
    }
  }
  
  return 'web';
}

/**
 * Get the appropriate API URL based on platform
 */
export function getApiUrl(): string {
  const platform = detectPlatform();
  
  // Check for environment variable override
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  switch (platform) {
    case 'web':
    case 'tauri':
      // Use local Python API for web and desktop
      return 'http://localhost:8000';
    
    case 'android':
      // Android emulator uses 10.0.2.2 to access host machine
      // In production, this should be your cloud API URL
      return import.meta.env.PROD 
        ? 'https://api.yourapp.com'  // Replace with your cloud API
        : 'http://10.0.2.2:8000';
    
    case 'ios':
      // iOS simulator can use localhost
      // In production, this should be your cloud API URL
      return import.meta.env.PROD
        ? 'https://api.yourapp.com'  // Replace with your cloud API
        : 'http://localhost:8000';
    
    default:
      return 'http://localhost:8000';
  }
}

/**
 * Check if local API is available (Web/Tauri only)
 */
export function isLocalApiAvailable(): boolean {
  const platform = detectPlatform();
  return platform === 'web' || platform === 'tauri';
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
  const url = apiUrl || getApiUrl();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${url}/api/health`, {
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
    case 'tauri':
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
  return (config.features as any)[feature] ?? false;
}
