import { useEffect, useState, useRef } from 'react';
import { API_URL } from '@/lib/api';
import { isElectron, ipcApi } from '@/lib/ipc-client';

interface TTSProgressData {
  status: 'waiting' | 'starting' | 'initializing' | 'loading' | 'generating' | 'writing' | 'complete' | 'error';
  message?: string;
  percent?: number;
  filePath?: string;
  filename?: string;
  downloadUrl?: string;
  duration?: number;
}

interface TTSProgressProps {
  ttsId: string;
  onComplete?: (data: { filePath?: string; filename?: string; downloadUrl?: string; duration?: number }) => void;
  onError?: (error: string) => void;
}

const MAX_ERRORS = 2;
const TIMEOUT_MS = 180000; // 3 minutes timeout for TTS

export function TTSProgress({ ttsId, onComplete, onError }: TTSProgressProps) {
  const [progress, setProgress] = useState<TTSProgressData>({ status: 'waiting', percent: 0 });
  const closedRef = useRef(false);

  useEffect(() => {
    console.log('[TTSProgress] Starting progress tracking for:', ttsId);
    console.log('[TTSProgress] Mode:', isElectron() ? 'Electron (polling)' : 'Web (SSE)');
    
    closedRef.current = false;

    if (isElectron()) {
      // Electron mode: Poll for progress
      let errorCount = 0;
      
      const timeoutId = setTimeout(() => {
        if (!closedRef.current) {
          console.error('[TTSProgress] Timeout reached');
          closedRef.current = true;
          onError?.('Generation timeout');
        }
      }, TIMEOUT_MS);
      
      const pollInterval = setInterval(async () => {
        if (closedRef.current) return;
        
        try {
          const data = await ipcApi.getTtsProgress(ttsId);
          console.log('[TTSProgress] Poll result:', data);
          console.log('[TTSProgress] - ttsId:', ttsId);
          console.log('[TTSProgress] - status:', data.status);
          console.log('[TTSProgress] - percent:', data.percent);
          console.log('[TTSProgress] - message:', data.message);
          console.log('[TTSProgress] - filePath:', data.filePath);
          
          setProgress(data as TTSProgressData);

          if (data.status === 'complete') {
            console.log('[TTSProgress] Generation complete!');
            clearTimeout(timeoutId);
            clearInterval(pollInterval);
            closedRef.current = true;
            onComplete?.({
              filePath: data.filePath,
              filename: data.filename,
              downloadUrl: data.downloadUrl,
              duration: data.duration,
            });
          } else if (data.status === 'error') {
            console.error('[TTSProgress] Generation failed:', data.message);
            clearTimeout(timeoutId);
            clearInterval(pollInterval);
            closedRef.current = true;
            onError?.(data.message || 'Generation failed');
          }
        } catch (e) {
          console.error('[TTSProgress] Poll error:', e);
          errorCount++;
          if (errorCount >= MAX_ERRORS && !closedRef.current) {
            clearTimeout(timeoutId);
            clearInterval(pollInterval);
            closedRef.current = true;
            onError?.('Failed to get progress');
          }
        }
      }, 300); // Poll every 300ms
      
      return () => {
        console.log('[TTSProgress] Cleaning up (Electron)');
        clearTimeout(timeoutId);
        clearInterval(pollInterval);
        closedRef.current = true;
      };
    } else {
      // Web mode: Use SSE
      let errorCount = 0;
      
      const timeoutId = setTimeout(() => {
        if (!closedRef.current) {
          console.error('[TTSProgress] Timeout reached');
          closedRef.current = true;
          onError?.('Generation timeout');
        }
      }, TIMEOUT_MS);
      
      const eventSource = new EventSource(`${API_URL}/api/tts/progress/${ttsId}`);

      eventSource.onmessage = (event) => {
        if (closedRef.current) return;
        
        try {
          const data: TTSProgressData = JSON.parse(event.data);
          console.log('[TTSProgress] SSE data:', data);
          setProgress(data);

          if (data.status === 'complete') {
            console.log('[TTSProgress] Generation complete!');
            clearTimeout(timeoutId);
            closedRef.current = true;
            eventSource.close();
            onComplete?.({
              filePath: data.filePath,
              filename: data.filename,
              downloadUrl: data.downloadUrl,
              duration: data.duration,
            });
          } else if (data.status === 'error') {
            console.error('[TTSProgress] Generation failed:', data.message);
            clearTimeout(timeoutId);
            closedRef.current = true;
            eventSource.close();
            onError?.(data.message || 'Generation failed');
          }
        } catch (e) {
          console.error('[TTSProgress] Parse error:', e);
        }
      };

      eventSource.onerror = () => {
        errorCount++;
        console.error('[TTSProgress] SSE error, count:', errorCount);
        if (errorCount >= MAX_ERRORS && !closedRef.current) {
          clearTimeout(timeoutId);
          closedRef.current = true;
          eventSource.close();
          onError?.('Connection lost');
        }
      };

      return () => {
        console.log('[TTSProgress] Cleaning up (Web)');
        clearTimeout(timeoutId);
        closedRef.current = true;
        eventSource.close();
      };
    }
  }, [ttsId, onComplete, onError]);

  const getProgressPercentage = () => {
    return progress.percent || 0;
  };

  const getStatusDisplay = () => {
    switch (progress.status) {
      case 'waiting':
        return 'Waiting...';
      case 'starting':
        return 'Starting...';
      case 'initializing':
        return 'Initializing TTS pipeline...';
      case 'loading':
        return 'Loading model...';
      case 'generating':
        return 'Generating audio...';
      case 'writing':
        return 'Writing audio file...';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error';
      default:
        return progress.message || 'Processing...';
    }
  };

  const percentage = getProgressPercentage();

  return (
    <div className="w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
            {getStatusDisplay()}
          </span>
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {Math.round(percentage)}%
          </span>
        </div>
        
        <div className="w-full bg-blue-100 dark:bg-blue-900/40 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-600 dark:bg-blue-500 h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
      
      {progress.message && progress.message !== getStatusDisplay() && (
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
          {progress.message}
        </p>
      )}
    </div>
  );
}
