import { getStaticFiles, staticFile } from 'remotion';

// File type categories
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.aac', '.m4a'];

type AssetType = 'image' | 'video' | 'audio' | 'all';

/**
 * Get all static files from a specific directory path
 * @param directory - The directory path relative to public folder (e.g., 'main/video_1')
 * @param type - Filter by asset type: 'image', 'video', 'audio', or 'all'
 * @returns Array of file paths ready for use with staticFile()
 */
export const getAssetsFromDirectory = (
  directory: string,
  type: AssetType = 'all'
): string[] => {
  try {
    const allFiles = getStaticFiles();


    // Normalize directory path (remove leading/trailing slashes)
    const normalizedDir = directory.replace(/^\/|\/$/g, '');

    // Filter files by directory using file.name (relative path from public/)
    const filesInDir = allFiles.filter((file) => {
      return file.name.startsWith(normalizedDir + '/');
    });

    // Filter by type if specified
    let filteredFiles = filesInDir;
    if (type !== 'all') {
      const extensions = getExtensionsForType(type);
      filteredFiles = filesInDir.filter((file) => {
        const ext = getFileExtension(file.name).toLowerCase();
        return extensions.includes(ext);
      });
    }

    // Sort files alphabetically and return paths
    const result = filteredFiles
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((file) => {
        return staticFile(file.name);
      });

    return result;
  } catch (error) {
    console.error(`[getStaticAssets] Error loading assets from ${directory}:`, error);
    return [];
  }
};

/**
 * Get images from a directory
 */
export const getImagesFromDirectory = (directory: string): string[] => {
  return getAssetsFromDirectory(directory, 'image');
};

/**
 * Get slider images for a content directory.
 * Prefers `${contentDirectory}/image` and falls back to `${contentDirectory}`.
 */
export const getSliderImagesForContentDirectory = (contentDirectory: string): string[] => {
  const imagesInSubdirectory = getImagesFromDirectory(`${contentDirectory}/image`);
  if (imagesInSubdirectory.length > 0) {
    return imagesInSubdirectory;
  }

  return getImagesFromDirectory(contentDirectory);
};

/**
 * Get videos from a directory
 */
export const getVideosFromDirectory = (directory: string): string[] => {
  return getAssetsFromDirectory(directory, 'video');
};

/**
 * Get audio files from a directory
 */
export const getAudioFromDirectory = (directory: string): string[] => {
  return getAssetsFromDirectory(directory, 'audio');
};

/**
 * Get the first audio file from a directory (useful for main audio track)
 */
export const getFirstAudioFromDirectory = (directory: string): string | null => {
  const audioFiles = getAudioFromDirectory(directory);
  return audioFiles.length > 0 ? audioFiles[0] : null;
};

/**
 * Get the caption JSON file that matches the audio file name
 */
export const getCaptionFileForAudio = (audioPath: string | null, directory: string): string | null => {
  if (!audioPath) return null;
  
  try {
    const allFiles = getStaticFiles();
    const audioFileName = audioPath.split('/').pop();
    if (!audioFileName) return null;
    
    const baseName = audioFileName.replace(/\.[^.]+$/, '');
    const expectedJsonName = `${baseName}.json`;
    const normalizedDir = directory.replace(/^\//, '').replace(/^public\//, '').replace(/\/$/g, '');
    
    const jsonFile = allFiles.find((file) => {
      return file.name.startsWith(normalizedDir + '/') && file.name.endsWith(expectedJsonName);
    });

    if (jsonFile) {
      return staticFile(jsonFile.name);
    }
    
    return null;
  } catch (error) {
    console.error(`[getStaticAssets] Error finding caption file:`, error);
    return null;
  }
};

/**
 * Get all assets organized by type from a directory
 */
export const getAllAssetsFromDirectory = (directory: string) => {
  return {
    images: getImagesFromDirectory(directory),
    videos: getVideosFromDirectory(directory),
    audio: getAudioFromDirectory(directory),
  };
};

/**
 * Get the first image from a directory (useful for single logo, background, etc.)
 */
export const getFirstImageFromDirectory = (directory: string): string | null => {
  const images = getImagesFromDirectory(directory);
  return images.length > 0 ? images[0] : null;
};

/**
 * Get template assets organized by subfolder
 * Dynamically discovers all assets in a template directory
 */
export const getTemplateAssets = (templateId: string) => {
  const basePath = `templates/${templateId}`;

  return {
    // Logos - get all images from logo folder
    logos: getImagesFromDirectory(`${basePath}/logo`),
    // Icons - get all images from icons folder
    icons: getImagesFromDirectory(`${basePath}/icons`),
    // Decorative elements - get all images from elements folder
    elements: getImagesFromDirectory(`${basePath}/elements`),
    // Audio/sound files
    sounds: getAudioFromDirectory(`${basePath}/sound`),
    // Background patterns (root level images)
    backgrounds: getImagesFromDirectory(basePath),
  };
};

/**
 * Get content assets for a video (images, videos, audio from a content directory)
 */
export const getContentAssets = (contentDirectory: string) => {
  return {
    images: getImagesFromDirectory(contentDirectory),
    videos: getVideosFromDirectory(contentDirectory),
    audio: getAudioFromDirectory(`${contentDirectory}/audio`),
    // Get first image as potential intro background
    introBackground: getFirstImageFromDirectory(contentDirectory),
  };
};

// Helper functions
const getExtensionsForType = (type: AssetType): string[] => {
  switch (type) {
    case 'image':
      return IMAGE_EXTENSIONS;
    case 'video':
      return VIDEO_EXTENSIONS;
    case 'audio':
      return AUDIO_EXTENSIONS;
    default:
      return [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
  }
};

const getFileExtension = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.slice(lastDot) : '';
};
