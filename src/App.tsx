/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { motion, AnimatePresence } from "framer-motion";
import { get, set as idbSet, del as idbDel, clear as idbClear } from 'idb-keyval';
import { 
  Play, 
  Video, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles,
  Upload,
  Download,
  Volume2,
  Film,
  Copy,
  Check,
  Mic,
  Trash2,
  Users,
  Palette,
  Camera,
  FileText,
  UploadCloud,
  Library,
  History,
  X,
  Settings,
  FileArchive,
  Phone,
} from "lucide-react";

// --- Types ---

interface Scene {
  id: string;
  textSegment: string;
  description: string;
  imagePrompt: string;
  videoPrompt: string;
  characters: string[];
  visualKey: string;
  mediaUrl?: string;
  mediaBlob?: Blob | File;
  mediaType?: 'image' | 'video';
  durationRatio?: number;
  duration?: number;
  status: 'pending' | 'generating-image' | 'completed' | 'failed';
  error?: string;
}

interface SavedVideo {
  id: string;
  blob: Blob;
  url: string;
  timestamp: number;
  title: string;
}

interface SavedProject {
  id: string;
  timestamp: number;
  story: string;
  scenes: Scene[];
  refImage: string | null;
  projectMode: 'image' | 'video';
  visualStyle: '2D' | 'Realistic';
  audioBlob?: Blob;
}

// --- Constants ---
const SYSTEM_INSTRUCTION = `You are an expert cinematic director and AI story analyst.
Your goal is to transform a story into a perfectly synchronized visual experience.
Analyze the story deeply for:
1. Narrative Beats: Identify exactly when the visual context changes. Ensure every significant action or setting shift is captured as a new scene.
2. Emotional Sync: Match the visual description and image prompt to the emotional tone of the text segment.
3. Character Identification & Consistency: This is CRITICAL. 
   - Identify ALL characters in the story. 
   - For EACH scene, you MUST list the characters present in the 'characters' field.
   - The names MUST be in the same language as the story (e.g., if the story is in Bengali, use Bengali names).
   - Create a detailed visual profile for each character. Use these EXACT descriptions in every scene where the character appears. They must look identical from the first scene to the last.
4. Visual Continuity: Maintain consistent settings and environmental details across scenes.
5. Timing & Modeling: 
   - Ensure the 'textSegment' is a logical unit. 
   - If a text segment is longer than 5-7 seconds when spoken, break it into multiple scenes.
   - For these multiple scenes, use the SAME 'visualKey' (to reuse the same image) but DIFFERENT 'videoPrompt' values to create a "modeling" effect.
   - 'videoPrompt' MUST be one of these specific keywords: "CLOSE_UP", "WIDE_SHOT", "PAN_LEFT", "PAN_RIGHT", "PAN_UP", "PAN_DOWN", "ZOOM_IN", "ZOOM_OUT", "STATIC".
   - This allows the director to show the same image from different "camera" perspectives, making the video feel dynamic.
6. Thoroughness: Do not summarize. Every part of the story must be represented visually in the sequence of scenes.

For each scene, provide:
- 'textSegment': The exact sentences from the story.
- 'description': What is happening visually.
- 'characters': A MANDATORY array of names of the characters involved in this specific scene. Use the language of the story. If no specific character is visible, use an empty array [].
- 'imagePrompt': A highly detailed, cinematic prompt for an image generation AI. Include specific details about lighting, camera angle, character expressions, clothing textures, background elements, and artistic style.
- 'videoPrompt': Use one of the modeling keywords: "CLOSE_UP", "WIDE_SHOT", "PAN_LEFT", "PAN_RIGHT", "PAN_UP", "PAN_DOWN", "ZOOM_IN", "ZOOM_OUT", "STATIC".
- 'visualKey': A unique identifier for the visual context (e.g., "forest_intro", "hero_running"). If two segments share the exact same visual context, use the same 'visualKey' so the same image can be reused.

Style: "Strictly 2D cinematic animation, hand-drawn aesthetic, breathtakingly beautiful scenery, vibrant colors, expressive characters, professional lighting, masterpiece quality, 8k resolution, highly detailed textures."
Output the result as a JSON array of objects with 'textSegment', 'description', 'characters', 'imagePrompt', 'videoPrompt', and 'visualKey' fields.`;

export default function App() {
  const [story, setStory] = useState('');
  const [characterPrompts, setCharacterPrompts] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [history, setHistory] = useState<SavedProject[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [projectMode, setProjectMode] = useState<'image' | 'video'>('video');
  const [error, setError] = useState<string | null>(null);
  const [refImage, setRefImage] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [sceneCount, setSceneCount] = useState<number | string>(5);
  const [isCustomCountEnabled, setIsCustomCountEnabled] = useState(false);
  const [isAutoImageEnabled, setIsAutoImageEnabled] = useState(false);
  const [isAutoVoiceEnabled, setIsAutoVoiceEnabled] = useState(false);
  const [visualStyle, setVisualStyle] = useState<'2D' | 'Realistic'>('2D');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [statusText, setStatusText] = useState("প্রসেস করা হচ্ছে...");

  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResettingState, setIsResettingState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoLibrary, setVideoLibrary] = useState<SavedVideo[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isCancelled = useRef(false);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const isResetting = useRef(false);
  const [licenseExpiry, setLicenseExpiry] = useState<string | null>(null);
  const [maxVideoDuration, setMaxVideoDuration] = useState<number>(0);
  const [isLicenseSystemEnabled, setIsLicenseSystemEnabled] = useState(true);
  const [licenseNotification, setLicenseNotification] = useState('');
  const [isLicenseNotificationEnabled, setIsLicenseNotificationEnabled] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const expiry = localStorage.getItem('license_expiry');
    if (expiry) {
      setLicenseExpiry(expiry);
    }
    const maxDuration = localStorage.getItem('max_video_duration');
    if (maxDuration) {
      setMaxVideoDuration(parseInt(maxDuration, 10));
    }

    fetch('/api/licenses/status')
      .then(res => res.json())
      .then(data => setIsLicenseSystemEnabled(data.enabled))
      .catch(err => console.error(err));

    fetch('/api/admin/license-notification')
      .then(res => res.json())
      .then(data => {
        setLicenseNotification(data.message);
        setIsLicenseNotificationEnabled(data.enabled);
      })
      .catch(err => console.error(err));
  }, []);

  const getRemainingDays = () => {
    if (!licenseExpiry) return 0;
    const expiryDate = new Date(licenseExpiry);
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const saveToHistory = async () => {
    if (!story.trim() && scenes.length === 0) return;
    
    setIsSaving(true);
    setSaveSuccess(false);
    
    try {
      const currentAudioBlob = await get('story_video_gen_audio_blob');
      
      // Strip out mediaUrl from scenes ONLY if it's a blob URL (which is useless across sessions).
      // Keep it if it's a base64 data URL (generated images).
      const scenesToSave = scenes.map(scene => {
        const newScene = { ...scene };
        if (newScene.mediaUrl && newScene.mediaUrl.startsWith('blob:')) {
          delete newScene.mediaUrl;
        }
        return newScene;
      });

      const newProject: SavedProject = {
        id: `proj-${Date.now()}`,
        timestamp: Date.now(),
        story,
        scenes: scenesToSave as Scene[],
        refImage,
        projectMode,
        visualStyle,
        audioBlob: currentAudioBlob
      };
      
      let updatedHistory: SavedProject[];
      if (history.length > 0 && history[0].story === story && history[0].scenes.length === scenes.length) {
         updatedHistory = [...history];
         updatedHistory[0] = newProject;
      } else {
         updatedHistory = [newProject, ...history].slice(0, 20);
      }
      
      try {
        await idbSet('story_video_gen_history', updatedHistory);
        setHistory(updatedHistory);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (idbErr: any) {
        if (idbErr.name === 'QuotaExceededError' || idbErr.message?.toLowerCase().includes('quota')) {
          console.warn("Quota exceeded, trying to save fewer projects...");
          if (updatedHistory.length > 5) {
            updatedHistory = updatedHistory.slice(0, 5);
            await idbSet('story_video_gen_history', updatedHistory);
            setHistory(updatedHistory);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            return;
          }
        }
        throw idbErr;
      }
    } catch (err: any) {
      console.error("Failed to save history:", err);
      alert("প্রজেক্ট সেভ করতে সমস্যা হয়েছে: " + (err.message || err.toString()));
    } finally {
      setIsSaving(false);
    }
  };

  // --- Helper: Monitor Job Status ---
  const monitorJob = async (jobId: string, startTime: number, maxWaitTime: number) => {
    setIsRecording(true);
    isCancelled.current = false;
    setStatusText("ভিডিও রেন্ডার হচ্ছে...");
    let isDone = false;
    let errorCount = 0;
    let pollInterval = 3000;

    try {
      while (!isDone) {
        // Check for reset/cancellation
        if (isResetting.current || isCancelled.current) {
          console.log("Job monitoring cancelled.");
          setIsRecording(false);
          setActiveJobId(null);
          return;
        }

        try {
          const statusRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/status`);

          // Handle 429 Too Many Requests specifically (BEFORE JSON check)
          if (statusRes.status === 429) {
            console.warn("Rate limited (429), backing off...");
            pollInterval = Math.min(pollInterval * 2, 60000); // Double interval, max 60s for long videos
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue; // Retry without incrementing error count
          }
          
          if (statusRes.status === 404) {
            // Job is gone from server
            setActiveJobId(null);
            localStorage.removeItem('story_video_gen_active_job');
            setIsRecording(false);
            throw new Error("ভিডিও জেনারেশন বাতিল হয়েছে। সম্ভবত সার্ভার রিস্টার্ট হয়েছে বা সেশন শেষ হয়েছে। দয়া করে আবার চেষ্টা করুন।");
          }

          // Check for JSON content type
          const contentType = statusRes.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
             console.warn("Received non-JSON response, retrying...");
             throw new Error(`সার্ভার থেকে ভুল রেসপন্স এসেছে (Not JSON). Status: ${statusRes.status}`);
          }

          if (!statusRes.ok) {
            throw new Error(`সার্ভার এরর: ${statusRes.status}`);
          }
          
          const statusData = await statusRes.json();
          errorCount = 0; // Reset error count on success
          pollInterval = 3000; // Reset interval on success
          
          if (statusData.status === 'failed') {
            throw new Error(statusData.error || "ভিডিও রেন্ডার করতে সমস্যা হয়েছে।");
          } else if (statusData.status === 'completed') {
            isDone = true;
            setRecordingProgress(100);
            setStatusText("ভিডিও তৈরি সম্পন্ন!");
            break; 
          } else {
            // Use the raw progress from server (0-100)
            let rawProgress = statusData.progress || 0;
            if (rawProgress === 0 && statusData.totalScenes && statusData.totalScenes > 0) {
              rawProgress = Math.round(((statusData.currentScene || 0) / statusData.totalScenes) * 100);
            }
            
            // If job is processing but progress is 0, show at least 1% to indicate activity
            let progress = Math.round(rawProgress);
            if (progress === 0 && statusData.status === 'processing') {
              progress = 1;
            }
            setRecordingProgress(progress);
            
            if (statusData.totalScenes) {
               const current = statusData.currentScene || 0;
               const total = statusData.totalScenes;
               const scProg = statusData.sceneProgress || 0;
               
               if (progress >= 80 && progress < 100) {
                 setStatusText(`ভিডিও জোড়া লাগানো হচ্ছে... (${progress}%)`);
               } else if (current === 0) {
                 setStatusText(`ভিডিও প্রস্তুত হচ্ছে... (${progress}%)`);
               } else {
                 // Show Scene X/Y and the progress of THAT specific scene
                 setStatusText(`রেন্ডারিং: ${current}/${total} সিন চলছে (${scProg}% সম্পন্ন) - মোট ${progress}%`);
               }
            } else {
               setStatusText(`ভিডিও রেন্ডার হচ্ছে (${progress}%)...`);
            }
          }
        } catch (e: any) {
          console.warn("Status check failed, retrying...", e);
          errorCount++;
          if (errorCount > 50) { // Retry 50 times (consecutive errors)
            throw new Error("স্ট্যাটাস চেক করতে সমস্যা হয়েছে (Too many errors): " + e.message);
          }
          // Backoff on other errors too
          pollInterval = Math.min(pollInterval * 1.5, 15000);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }

        // Check total timeout ONLY if still processing
        if (!isDone && Date.now() - startTime > maxWaitTime) {
             throw new Error(`ভিডিও তৈরি করতে অনেক বেশি সময় লাগছে (Timeout after ${Math.round(maxWaitTime/60000)} mins).`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      // Use server URL for immediate playback
      const serverVideoUrl = `/api/jobs/${jobId}/download?action=view`;
      setFinalVideoUrl(serverVideoUrl);
      
      // Clear active job immediately so UI shows success state
      setActiveJobId(null);
      localStorage.removeItem('story_video_gen_active_job');
      setIsRecording(false);
      setRecordingProgress(100);
      setStatusText("ভিডিও তৈরি সম্পন্ন! লাইব্রেরিতে সেভ করা হচ্ছে...");

      // Attempt to save to library in background
      (async () => {
        try {
          // Fetch PREVIEW video (smaller size) for library storage
          const finalRes = await fetch(`/api/jobs/${jobId}/download?action=view`);
          if (finalRes.ok) {
            const finalBlob = await finalRes.blob();
            const localUrl = URL.createObjectURL(finalBlob);
            
            // Update to local URL if still viewing same video
            setFinalVideoUrl(prev => prev === serverVideoUrl ? localUrl : prev);
            await idbSet('story_video_gen_video_blob', finalBlob);

            // Add to library
            const newSavedVideo: SavedVideo = {
              id: jobId,
              blob: finalBlob,
              url: localUrl,
              timestamp: Date.now(),
              title: (localStorage.getItem('story_video_gen_data') ? JSON.parse(localStorage.getItem('story_video_gen_data')!).story.slice(0, 30) : 'Untitled Story')
            };
            
            setVideoLibrary(prev => {
              // Prevent duplicates by ID
              if (prev.some(v => v.id === jobId)) {
                console.log("Video already in library, skipping duplicate add.");
                return prev;
              }
              
              const updated = [newSavedVideo, ...prev];
              // Save to IDB (strip URLs before saving)
              // Fire-and-forget save to avoid blocking UI
              (async () => {
                try {
                  const libraryToSave = updated.map(({ url, ...rest }) => rest);
                  await idbSet('story_video_gen_library', libraryToSave);
                  console.log("Video saved to library IDB successfully");
                } catch (err) {
                  console.error("Failed to save video to library IDB:", err);
                }
              })();
              return updated;
            });
            
            // Show library automatically on success
            setStatusText("ভিডিও তৈরি সম্পন্ন! লাইব্রেরিতে সেভ করা হয়েছে।");
            setShowLibrary(true);
          } else {
             console.error("Failed to fetch video for library:", finalRes.status);
             setStatusText("ভিডিও তৈরি হয়েছে কিন্তু লাইব্রেরিতে সেভ করা যায়নি।");
          }
        } catch (e) {
          console.warn("Background library save failed (video might be too large):", e);
          setStatusText("ভিডিও তৈরি হয়েছে কিন্তু লাইব্রেরিতে সেভ করা যায়নি।");
        }
      })().catch(err => console.error("Unhandled error in background library save:", err));

    } catch (err: any) {
      console.error("Video assembly failed:", err);
      setError(err.message || "ভিডিও তৈরি করতে সমস্যা হয়েছে।");
      // Don't clear active job on error immediately, allow user to retry or reset? 
      // Actually, if it failed, we should probably clear it so they can start over.
      setActiveJobId(null);
      localStorage.removeItem('story_video_gen_active_job');
      setStatusText("সমস্যা হয়েছে");
    } finally {
      setIsRecording(false);
    }
  };

  // --- Persistence ---
  useEffect(() => {
    const loadSavedData = async () => {
      const loadTimeout = setTimeout(() => {
        if (!isLoaded) {
          console.warn("Loading timed out, forcing app to ready state");
          setIsLoaded(true);
        }
      }, 5000);

      try {
        // 1. Load from localStorage (Text and Settings)
        const savedData = localStorage.getItem('story_video_gen_data');
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData);
            if (parsed.story !== undefined) setStory(parsed.story);
            if (parsed.characterPrompts !== undefined) setCharacterPrompts(parsed.characterPrompts);
            if (parsed.sceneCount !== undefined) setSceneCount(parsed.sceneCount);
            if (parsed.isCustomCountEnabled !== undefined) setIsCustomCountEnabled(parsed.isCustomCountEnabled);
            if (parsed.isAutoImageEnabled !== undefined) setIsAutoImageEnabled(parsed.isAutoImageEnabled);
            if (parsed.isAutoVoiceEnabled !== undefined) setIsAutoVoiceEnabled(parsed.isAutoVoiceEnabled);
            if (parsed.apiKey !== undefined) setApiKey(parsed.apiKey);
          } catch (e) {
            console.error("Failed to load saved data from localStorage", e);
          }
        }

        // 2. Load from IndexedDB (Large Data: Scenes, Blobs, RefImage)
        try {
          const savedScenes = await get('story_video_gen_scenes');
          if (savedScenes) {
            const restoredScenes = savedScenes.map((s: any) => {
              if (s.mediaBlob && s.mediaBlob instanceof Blob) {
                return { ...s, mediaUrl: URL.createObjectURL(s.mediaBlob) };
              } else if (s.mediaUrl && s.mediaUrl.startsWith('blob:')) {
                return { ...s, mediaUrl: undefined, status: 'failed' as const, error: 'Media file missing. Please re-upload.' };
              }
              return s;
            });
            setScenes(restoredScenes);
          }

          const savedRefImage = await get('story_video_gen_ref_image');
          if (savedRefImage) setRefImage(savedRefImage);

          const savedAudioBlob = await get('story_video_gen_audio_blob');
          if (savedAudioBlob) {
            const url = URL.createObjectURL(savedAudioBlob);
            setAudioUrl(url);
          }

          const savedVideoBlob = await get('story_video_gen_video_blob');
          if (savedVideoBlob) {
            const url = URL.createObjectURL(savedVideoBlob);
            setFinalVideoUrl(url);
          }

          const savedLibrary = await get('story_video_gen_library');
          if (savedLibrary) {
            const libraryWithUrls = savedLibrary.map((item: any) => ({
              ...item,
              url: URL.createObjectURL(item.blob)
            }));
            setVideoLibrary(libraryWithUrls);
          }

          const savedHistory = await get('story_video_gen_history');
          if (savedHistory) {
            setHistory(savedHistory);
          }
        } catch (e) {
          console.error("Failed to load saved data from IndexedDB", e);
        }

        // 3. Check for active job to resume
        const savedActiveJob = localStorage.getItem('story_video_gen_active_job');
        if (savedActiveJob) {
          try {
            const { jobId, startTime, maxWaitTime } = JSON.parse(savedActiveJob);
            if (jobId && startTime && maxWaitTime) {
              console.log("Resuming active job:", jobId);
              setIsResuming(true);
              
              // Check status immediately before starting full monitor
              try {
                const statusRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/status`);
                if (statusRes.status === 404) {
                  console.log("Job not found on server, cleaning up local storage.");
                  localStorage.removeItem('story_video_gen_active_job');
                  setIsResuming(false);
                  return;
                }
                if (statusRes.ok) {
                  const statusData = await statusRes.json();
                  if (statusData.status === 'completed') {
                    console.log("Job already completed, loading video directly.");
                    const serverVideoUrl = `/api/jobs/${jobId}/download?action=view`;
                    setFinalVideoUrl(serverVideoUrl);
                    localStorage.removeItem('story_video_gen_active_job');
                    setIsResuming(false);
                    
                    // Still trigger monitorJob to handle library saving and cleanup
                    monitorJob(jobId, startTime, maxWaitTime).catch(err => {
                      console.error("Monitor job failed after completion:", err);
                    });
                    return;
                  }
                }
              } catch (e) {
                console.warn("Initial status check failed during resume:", e);
              }

              setActiveJobId(jobId);
              setIsResuming(false);
              // Resume monitoring
              monitorJob(jobId, startTime, maxWaitTime).catch(err => {
                console.error("Failed to resume job monitoring:", err);
                setError(err.message);
                setActiveJobId(null);
                localStorage.removeItem('story_video_gen_active_job');
                setIsRecording(false);
              });
            }
          } catch (e) {
            console.error("Failed to parse active job data", e);
            localStorage.removeItem('story_video_gen_active_job');
            setIsResuming(false);
          }
        }

      } finally {
        clearTimeout(loadTimeout);
        setIsLoaded(true);
      }
    };

    loadSavedData();
  }, []);

  // Save Text and Settings to localStorage
  useEffect(() => {
    if (!isLoaded || isResetting.current) return;

    const dataToSave = {
      story,
      characterPrompts,
      sceneCount,
      isCustomCountEnabled,
      isAutoImageEnabled,
      isAutoVoiceEnabled,
      apiKey
    };
    
    const timeout = setTimeout(() => {
      if (!isResetting.current && isLoaded) {
        localStorage.setItem('story_video_gen_data', JSON.stringify(dataToSave));
      }
    }, 1000);
    return () => clearTimeout(timeout);
  }, [story, characterPrompts, sceneCount, isCustomCountEnabled, isAutoImageEnabled, isAutoVoiceEnabled, apiKey, isLoaded]);

  // Save Scenes to IndexedDB
  useEffect(() => {
    if (!isLoaded || isResetting.current || scenes.length === 0) return;
    idbSet('story_video_gen_scenes', scenes).catch(e => console.error("Failed to save scenes to IndexedDB", e));
  }, [scenes, isLoaded]);

  // Save RefImage to IndexedDB
  useEffect(() => {
    if (!isLoaded || isResetting.current) return;
    if (refImage) {
      idbSet('story_video_gen_ref_image', refImage).catch(e => console.error("Failed to save refImage to IndexedDB", e));
    } else {
      idbDel('story_video_gen_ref_image');
    }
  }, [refImage, isLoaded]);

  const clearAllData = async () => {
    // 1. Stop any ongoing processes immediately
    isResetting.current = true;
    setIsGenerating(false);
    setIsGeneratingVoice(false);
    setActiveJobId(null);
    
    try {
      // 2. Show loading state
      setIsResettingState(true);
      setShowResetConfirm(false);

      // 3. Clear all storage but preserve license data
      const licenseKey = localStorage.getItem('license_key');
      const licenseExpiry = localStorage.getItem('license_expiry');
      const maxVideoDuration = localStorage.getItem('max_video_duration');
      const deviceId = localStorage.getItem('device_id');

      localStorage.clear();
      sessionStorage.clear();

      if (licenseKey) localStorage.setItem('license_key', licenseKey);
      if (licenseExpiry) localStorage.setItem('license_expiry', licenseExpiry);
      if (maxVideoDuration) localStorage.setItem('max_video_duration', maxVideoDuration);
      if (deviceId) localStorage.setItem('device_id', deviceId);
      
      // 4. Clear specific IndexedDB keys
      const keysToDelete = [
        'story_video_gen_scenes',
        'story_video_gen_ref_image',
        'story_video_gen_audio_blob',
        'story_video_gen_video_blob',
        'story_video_gen_data'
      ];
      
      for (const key of keysToDelete) {
        try {
          await idbDel(key);
        } catch (err) {
          console.error(`Failed to delete key ${key}`, err);
        }
      }
      
      // 5. Reset all states manually as a final fallback
      setStory('');
      setScenes([]);
      setAudioUrl(null);
      setFinalVideoUrl(null);
      setRefImage(null);
      setCharacterPrompts('');
      setProjectMode('video');
      setVisualStyle('2D');
      setSceneCount(5);
      setIsCustomCountEnabled(false);
      setIsAutoImageEnabled(false);
      setIsAutoVoiceEnabled(false);
      // Do NOT clear API key on reset, as it's a user setting
      // setApiKey(''); 
      setError(null);
      
      // 6. Wait for storage operations to settle
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 7. Force a hard reload with a cache-busting timestamp
      const cleanUrl = window.location.origin + window.location.pathname + '?reset=' + Date.now();
      window.location.replace(cleanUrl);
    } catch (e) {
      console.error("Clear failed", e);
      window.location.replace(window.location.origin + window.location.pathname + '?reset=' + Date.now());
    }
  };

  const deleteFromLibrary = async (id: string) => {
    const updatedLibrary = videoLibrary.filter(v => v.id !== id);
    setVideoLibrary(updatedLibrary);
    
    // Save to IDB (strip URLs before saving)
    const libraryToSave = updatedLibrary.map(({ url, ...rest }) => rest);
    await idbSet('story_video_gen_library', libraryToSave);
    
    // Also delete the actual video blob
    await idbDel(`story_video_gen_library_blob_${id}`);
  };

  // --- File Handling ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRefImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      await idbSet('story_video_gen_audio_blob', file);
    }
  };

  const deleteAudio = async () => {
    setAudioUrl(null);
    await idbDel('story_video_gen_audio_blob');
  };

  const handleBulkMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Sort files by name to maintain some order
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const newScenes = [...scenes];
    let updatedCount = 0;

    files.forEach((file, index) => {
      if (index < newScenes.length) {
        // Better type detection
        let mediaType: 'image' | 'video' = 'image';
        if (file.type.startsWith('video/')) {
            mediaType = 'video';
        } else if (file.type.startsWith('image/')) {
            mediaType = 'image';
        } else {
            // Fallback to extension check if mime type is missing or generic
            const ext = file.name.split('.').pop()?.toLowerCase();
            if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'm4v'].includes(ext || '')) {
                mediaType = 'video';
            }
        }

        const objectUrl = URL.createObjectURL(file);
        
        newScenes[index] = {
          ...newScenes[index],
          mediaUrl: objectUrl,
          mediaBlob: file,
          mediaType,
          status: 'completed',
          error: undefined 
        };
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      setScenes(newScenes);
    }
    
    // Reset input value to allow selecting the same files again if needed
    e.target.value = '';
  };

  // --- Helper: Create WAV Header for 24kHz Mono PCM ---
  const createWavBlob = (base64Data: string) => {
    const raw = atob(base64Data);
    const buffer = new ArrayBuffer(44 + raw.length);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    /* RIFF identifier */
    writeString(0, 'RIFF');
    /* file length */
    view.setUint32(4, 32 + raw.length, true);
    /* WAVE identifier */
    writeString(8, 'WAVE');
    /* format chunk identifier */
    writeString(12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, 24000, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, 48000, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(36, 'data');
    /* data chunk length */
    view.setUint32(40, raw.length, true);

    for (let i = 0; i < raw.length; i++) {
      view.setUint8(44 + i, raw.charCodeAt(i));
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  // Helper to create WAV from raw Uint8Array
  const createWavBlobFromRaw = (raw: Uint8Array) => {
    const buffer = new ArrayBuffer(44 + raw.length);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    /* RIFF identifier */
    writeString(0, 'RIFF');
    /* file length */
    view.setUint32(4, 32 + raw.length, true);
    /* WAVE identifier */
    writeString(8, 'WAVE');
    /* format chunk identifier */
    writeString(12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, 24000, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, 48000, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(36, 'data');
    /* data chunk length */
    view.setUint32(40, raw.length, true);

    // Copy raw data
    new Uint8Array(buffer, 44).set(raw);

    return new Blob([buffer], { type: 'audio/wav' });
  };

  // --- Generation Logic ---
  const generateFullStory = async () => {
    if (!story.trim()) return;
    setIsGenerating(true);
    setError(null);
    setScenes([]);
    setFinalVideoUrl(null);

    const count = isCustomCountEnabled ? (parseInt(sceneCount.toString()) || 5) : 5;

    const styleInstruction = visualStyle === '2D' 
      ? 'Strictly 2D cinematic animation, hand-drawn aesthetic, breathtakingly beautiful scenery, vibrant colors, expressive characters, professional lighting, masterpiece quality, 8k resolution, highly detailed textures.'
      : 'Cinematic realistic style, high-end film production, lifelike textures, professional cinematography, natural lighting, expressive faces, breathtaking scenery, 8k resolution, masterpiece quality, highly detailed.';

    const systemInstruction = `You are an expert cinematic director and AI story analyst.
Your goal is to transform a story into a perfectly synchronized visual experience.
${isCustomCountEnabled ? `CRITICAL RULE: You MUST generate EXACTLY ${count} scenes. No more, no less. This is the most important constraint.` : 'CRITICAL RULE: VISUALIZE EVERY MOMENT. Create a new scene for every distinct action, reaction, or narrative beat. Do not group multiple distinct actions into one scene. If the character does something new, or feels something new, it needs a new scene.'}
Analyze the story deeply for:
1. Narrative Beats: Identify every single moment that can be visualized.
2. Emotional Sync: Match the visual description and image prompt to the emotional tone of the text segment.
3. Character Identification & Consistency: This is CRITICAL. 
   - Identify ALL characters in the story. 
   - For EACH scene, you MUST list the characters present in the 'characters' field.
   - The names MUST be in the same language as the story (e.g., if the story is in Bengali, use Bengali names).
   - Create a detailed visual profile for each character. Use these EXACT descriptions in every scene where the character appears. They must look identical from the first scene to the last.
4. Visual Continuity & Reuse: Maintain consistent settings. If the location is the same, use the same 'visualKey' base but vary the camera angle or composition for the new moment.
5. Timing: Ensure the 'textSegment' corresponds to that specific moment.
6. Thoroughness: Do not summarize. Every sentence that contains a visualizable moment should likely be its own scene.
${isCustomCountEnabled ? `7. SCENE COUNT: You MUST generate EXACTLY ${count} scenes. Do not generate fewer or more. If the story is short, break it down into smaller, more detailed moments to meet this count.` : '7. SCENE COUNT: Generate as many scenes as necessary to fully visualize every moment of the story.'}

For each scene, provide:
- 'textSegment': The specific sentence(s) for this moment.
- 'description': What is happening visually in this specific moment.
- 'characters': A MANDATORY array of names of the characters involved in this specific scene. Use the language of the story. If no specific character is visible, use an empty array [].
- 'imagePrompt': A highly detailed, cinematic prompt for an image generation AI. Include specific details about lighting, camera angle, character expressions, clothing textures, background elements, and artistic style.
- 'videoPrompt': A detailed motion prompt for a text-to-video AI. Describe the camera movement (e.g., pan, zoom, tracking shot), subject motion, and dynamics of the scene.
- 'visualKey': A unique identifier for the visual context (e.g., "forest_intro", "hero_running"). If two segments share the exact same visual context, use the same 'visualKey' so the same image can be reused.

Style: "${styleInstruction}"
Output the result as a JSON object with a 'scene_count' field (integer) and a 'scenes' array containing the scene objects.`;

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("জেনারেশন অনেক সময় নিচ্ছে। অনুগ্রহ করে আবার চেষ্টা করুন।")), 3600000)
    );

    try {
      await Promise.race([
        (async () => {
          const keyToUse = apiKey || process.env.GEMINI_API_KEY;
          if (!keyToUse) {
            throw new Error("API Key পাওয়া যায়নি। অনুগ্রহ করে সেটিংস থেকে আপনার Google AI Studio API Key যুক্ত করুন।");
          }
          const ai = new GoogleGenAI({ apiKey: keyToUse });
          
          // 2. Break story into scenes
          const sceneCountPrompt = isCustomCountEnabled 
            ? `EXACTLY ${count} scenes` 
            : "a detailed sequence of scenes for every moment";

          const modeInstruction = projectMode === 'image' 
            ? "Focus heavily on 'imagePrompt' for static image generation. Describe the exact visual composition, lighting, and subject."
            : "Focus heavily on 'videoPrompt' for video generation. Describe the motion, camera movement, and dynamic action.";

          const promptParts: any[] = [
            { text: `Break this story into ${sceneCountPrompt} for a ${visualStyle === '2D' ? '2D animation' : 'realistic cinematic video'}. 
    
    ${isCustomCountEnabled 
      ? `STRICT REQUIREMENT: GENERATE EXACTLY ${count} SCENES. If the story is short, decompose actions into micro-moments. If long, group events efficiently. The output array MUST have length ${count}.` 
      : `COMPREHENSIVE COVERAGE RULE: You must analyze the entire story. Do not summarize or skip any part of the story. Every single sentence, dialogue, and narrative beat must be represented in the sequence of scenes. Create a scene for every distinct action, dialogue, or location change. The goal is a full visual adaptation of the text. Ensure every single narrative beat is visualized.
      
      CRITICAL INSTRUCTION: VISUALIZE EVERY MOMENT NATURALLY.
      - Create a scene for every distinct action or beat.
      - Do not group distinct actions into one scene.
      - Even if the location is the same, if the character moves, changes expression, or says something significant, create a new scene with a new camera angle or focus.
      - If a text segment is long, break it into multiple scenes. These scenes can share the same 'visualKey' (meaning they use the same image), but they MUST have different 'videoPrompt' descriptions (e.g., Scene 1: Close-up on face, Scene 2: Wide shot of the same character, Scene 3: Pan across the background). This "modeling" approach keeps the visual flow dynamic even when using the same image.
      - Ensure the pacing is natural. Do not create micro-scenes that are too short (less than 3 seconds) unless absolutely necessary for fast action.
      - We want a dynamic, detailed visual flow, not static long scenes.`}

    ${modeInstruction}

    CRITICAL CHARACTER CONSISTENCY RULE:
    1. Identify every character in the story.
    2. Use the following USER-PROVIDED CHARACTER PROMPTS for visual descriptions:
    ${characterPrompts || "No specific character prompts provided. Analyze the story to define character traits."}

    3. Define their physical traits (hair, eyes, face shape, clothing) based on the above prompts and keep these traits 100% consistent in every 'imagePrompt' and 'videoPrompt' throughout the entire sequence.
    4. If a character is wearing a specific red cloak in Scene 1, they MUST be wearing that same red cloak in every subsequent scene unless the story explicitly mentions a change.
    5. Ensure the artistic style remains a consistent "${visualStyle === '2D' ? '2D cinematic hand-drawn animation' : 'cinematic realistic style'}" for all characters and backgrounds.

    Ensure each scene has the exact text segment from the story. Story: ${story}` }
          ];

          if (refImage) {
            promptParts.push({
              inlineData: {
                mimeType: "image/png",
                data: refImage.split(',')[1]
              }
            });
            promptParts[0].text += `
    \n\nCRITICAL REFERENCE IMAGE INSTRUCTIONS:
    1. Analyze the provided reference image for:
       - Character Appearance: Hair color/style, eye color, facial features, age, and unique markings.
       - Clothing: Specific garments, colors, textures, and patterns.
       - Artistic Style: Force the style to be STRICTLY 2D cinematic animation, even if the reference image is different.
       - Color Palette: Dominant colors and lighting mood.
    2. Every 'imagePrompt' MUST explicitly describe the character and style from this reference image in extreme detail, ensuring a beautiful 2D aesthetic.
    3. Ensure the character remains identical across all scenes while their actions and expressions change according to the story.
    4. Focus on creating breathtakingly beautiful scenery and clear visual storytelling in every prompt.
    5. Add cinematic details like "8k resolution", "highly detailed textures", "volumetric lighting", and "masterpiece quality" to every prompt.`;
          }

          const sceneResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts: promptParts },
            config: {
              systemInstruction: systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  scene_count: { type: Type.INTEGER, description: "The total number of scenes generated." },
                  scenes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        textSegment: { type: Type.STRING },
                        description: { type: Type.STRING },
                        characters: { 
                          type: Type.ARRAY,
                          items: { type: Type.STRING }
                        },
                        imagePrompt: { type: Type.STRING },
                        videoPrompt: { type: Type.STRING },
                        visualKey: { type: Type.STRING }
                      },
                      required: ["textSegment", "description", "characters", "imagePrompt", "videoPrompt", "visualKey"]
                    }
                  }
                },
                required: ["scene_count", "scenes"]
              }
            }
          });

          const text = sceneResponse.text;
          if (!text) throw new Error("Could not understand the story.");
          
          let parsedScenes: any[] = [];
          
          try {
            const responseJson = JSON.parse(text);
            if (Array.isArray(responseJson)) {
              parsedScenes = responseJson;
            } else if (responseJson.scenes && Array.isArray(responseJson.scenes)) {
              parsedScenes = responseJson.scenes;
            } else {
              throw new Error("Invalid response format");
            }
          } catch (e) {
            console.error("Failed to parse AI response:", text);
            throw new Error("গল্পটি প্রসেস করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
          }
          
          // 3. Generate Voiceover (TTS) or Prepare Existing Audio
          let finalAudioUrl = audioUrl;
          let sceneDurations: number[] = [];
          let audioBlobForAnalysis: Blob | null = null;
          
          if (isAutoVoiceEnabled && !audioUrl) {
            try {
              let allRawData = new Uint8Array(0);
              const SAMPLE_RATE = 24000;
              const BYTES_PER_SAMPLE = 2; // 16-bit
              const CHANNELS = 1; // Mono

              for (let i = 0; i < parsedScenes.length; i++) {
                const scene = parsedScenes[i];
                // Generate audio for this specific scene's text
                const ttsResponse = await ai.models.generateContent({
                  model: "gemini-2.5-flash-preview-tts",
                  contents: [{ parts: [{ text: scene.textSegment }] }],
                  config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                      },
                    },
                  },
                });

                const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                if (base64Audio) {
                  const rawString = atob(base64Audio);
                  const rawLength = rawString.length;
                  const rawBytes = new Uint8Array(rawLength);
                  for (let j = 0; j < rawLength; j++) {
                    rawBytes[j] = rawString.charCodeAt(j);
                  }

                  // Calculate duration
                  const duration = rawLength / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE);
                  sceneDurations.push(duration);

                  // Append to master buffer
                  const newBuffer = new Uint8Array(allRawData.length + rawLength);
                  newBuffer.set(allRawData);
                  newBuffer.set(rawBytes, allRawData.length);
                  allRawData = newBuffer;
                } else {
                  sceneDurations.push(0); // Fallback
                }
                
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 200));
              }

              if (allRawData.length > 0) {
                const wavBlob = createWavBlobFromRaw(allRawData);
                finalAudioUrl = URL.createObjectURL(wavBlob);
                setAudioUrl(finalAudioUrl);
                await idbSet('story_video_gen_audio_blob', wavBlob);
                // We do NOT set audioBlobForAnalysis here because we already have exact durations
              }
            } catch (ttsErr: any) {
              console.warn("TTS failed, but continuing with scenes:", ttsErr);
              setError("ভয়েস জেনারেট করতে সমস্যা হয়েছে (Rate Limit হতে পারে)। তবে সিনগুলো তৈরি হয়েছে।");
            }
          } else if (audioUrl) {
            try {
              const res = await fetch(audioUrl);
              audioBlobForAnalysis = await res.blob();
              finalAudioUrl = audioUrl;
            } catch (e) {
              console.warn("Failed to fetch existing audio for analysis", e);
            }
          }

          // 4. Analyze Audio Alignment (if audio exists and we don't have durations yet)
          if (audioBlobForAnalysis && sceneDurations.length === 0) {
            try {
              const syncResponse = await ai.models.generateContent({
                model: "gemini-3.1-pro-preview",
                contents: [
                  {
                    parts: [
                      {
                        inlineData: {
                          mimeType: "audio/wav",
                          data: await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                            reader.readAsDataURL(audioBlobForAnalysis!);
                          })
                        }
                      },
                      {
                        text: `Scene List অনুযায়ী AI দিয়ে স্বয়ংক্রিয় ভিডিও এডিটিং নির্দেশনা

ভিডিও এডিটিং করার সময় AI অবশ্যই আগে থেকে তৈরি করা Scene List অনুসরণ করবে। এই Scene List গল্প বা স্ক্রিপ্ট বিশ্লেষণ করে তৈরি করা হয়েছে এবং প্রতিটি Scene-এর সাথে গল্পের নির্দিষ্ট অংশ যুক্ত রয়েছে। AI ভিডিও এডিটিং করার সময় এই লিস্টকে মূল নির্দেশনা হিসেবে ব্যবহার করবে।

Scene List ভিত্তিক এডিটিং প্রক্রিয়া

1. প্রথমে Scene List লোড করা
   AI প্রথমে সেই Scene List পড়বে যা গল্প থেকে ইতিমধ্যে তৈরি করা হয়েছে। এই লিস্টে প্রতিটি Scene-এর সাথে সংশ্লিষ্ট গল্পের অংশ, বর্ণনা এবং ভিডিওর ধরন উল্লেখ থাকবে।

2. গল্পের ভয়েস বিশ্লেষণ করা
   গল্পটি সাধারণত একটি ভয়েসওভার আকারে থাকবে। AI সেই ভয়েস বিশ্লেষণ করবে এবং বুঝবে গল্পের কোন অংশ কখন বলা হচ্ছে।

3. গল্পের অংশ শনাক্ত করা (Voice Detection)
   Scene List-এ যে গল্পের অংশ উল্লেখ করা আছে, AI সেই অংশটি ভয়েসের মধ্যে খুঁজে বের করবে। অর্থাৎ ভয়েসের কোথায় সেই বাক্য বা অংশটি রয়েছে তা শনাক্ত করবে।

4. টাইমিং নির্ধারণ করা
   AI ভয়েসের মধ্যে সেই অংশের সঠিক টাইমস্ট্যাম্প বের করবে। এরপর ভিডিওতে সেই সময় অনুযায়ী সংশ্লিষ্ট Scene বসানো হবে।

5. সঠিক Scene প্রদর্শন করা
   যে Scene-এর সাথে গল্পের যে অংশ যুক্ত আছে, ভয়েসে সেই অংশ শুরু হওয়ার সাথে সাথে AI সেই Scene-এর ভিডিও ক্লিপ দেখাবে।

6. ভিডিও ক্লিপ নির্বাচন ও বসানো
   প্রতিটি Scene অনুযায়ী AI উপযুক্ত ভিডিও ক্লিপ নির্বাচন করবে এবং সেগুলো সঠিক সময়ে ভিডিও টাইমলাইনে বসাবে।

7. ভয়েস ও ভিডিও সিঙ্ক করা
   ভিডিওটি এমনভাবে এডিট করা হবে যাতে ভয়েসে যে গল্প বলা হচ্ছে তার সাথে দৃশ্য সম্পূর্ণভাবে মিল থাকে। অর্থাৎ গল্পের প্রতিটি অংশের সাথে সংশ্লিষ্ট Scene সঠিক সময়ে দেখানো হবে।

8. স্বয়ংক্রিয় ভিডিও এডিটিং
   AI নিম্নলিখিত কাজগুলো স্বয়ংক্রিয়ভাবে সম্পন্ন করবে:
- ভিডিও কাট ও ট্রিম করা
- Scene অনুযায়ী ভিডিও বসানো
- প্রয়োজন হলে ট্রানজিশন যোগ করা
- সাবটাইটেল বা টেক্সট যোগ করা
- ভিডিওর গতি এবং সময় সামঞ্জস্য করা

9. পারফেক্ট ম্যাচিং নিশ্চিত করা
   AI নিশ্চিত করবে যে গল্পের ভয়েস, Scene List এবং ভিডিও ক্লিপগুলো একে অপরের সাথে নিখুঁতভাবে মিলছে।

10. ফাইনাল ভিডিও তৈরি করা
    সব Scene সঠিকভাবে বসানোর পরে AI একটি সম্পূর্ণ ভিডিও তৈরি করবে যেখানে গল্প, ভয়েস এবং দৃশ্যগুলো সম্পূর্ণভাবে সমন্বিত থাকবে।

উদ্দেশ্য
এই পদ্ধতির মূল উদ্দেশ্য হলো:
- গল্পের সাথে সম্পূর্ণ মিল রেখে ভিডিও তৈরি করা
- ভয়েসওভারের সাথে দৃশ্যের সঠিক টাইমিং নিশ্চিত করা
- Scene List অনুসরণ করে স্বয়ংক্রিয়ভাবে ভিডিও এডিট করা
- AI এর মাধ্যমে দ্রুত ও পেশাদার মানের ভিডিও তৈরি করা

---
CRITICAL TASK FOR YOU (THE AI):
You are performing Steps 2, 3, and 4 of the above process.
Listen to the provided audio and align it with the following text segments (Scene List).
Find the EXACT start and end timestamps for each segment.
The segments cover the ENTIRE audio. There should be no gaps.
If there is music/silence/pauses between segments, assign that time to the most relevant segment (usually the preceding one) to maintain visual flow.
4. CRITICAL: The total duration of all segments MUST equal the total duration of the audio file.
5. Do not skip any segment. Every text segment must have a duration.

Text segments:
${parsedScenes.map((s, i) => `[Segment ${i}]: ${s.textSegment}`).join('\n')}

Return ONLY a JSON array of objects with "start" and "end" timestamps (in seconds) for each segment.
Example: [{"start": 0, "end": 3.5}, {"start": 3.5, "end": 7.7}, ...]
Ensure the array length matches the number of segments exactly.`
                      }
                    ]
                  }
                ],
                config: {
                  responseMimeType: "application/json",
                }
              });

              const syncText = syncResponse.text;
              if (syncText) {
                const parsed = JSON.parse(syncText);
                let durations: number[] = [];

                if (Array.isArray(parsed)) {
                  if (parsed.length > 0 && typeof parsed[0] === 'object' && 'end' in parsed[0]) {
                     // Handle start/end format
                     durations = parsed.map((s: any) => s.end - s.start);
                  } else if (parsed.length > 0 && typeof parsed[0] === 'number') {
                     // Handle duration format (fallback)
                     durations = parsed;
                  }
                }

                if (durations.length === parsedScenes.length) {
                  sceneDurations = durations;
                  console.log("Audio sync successful. Durations:", sceneDurations);
                } else {
                  console.warn("Audio sync mismatch. Expected", parsedScenes.length, "got", durations.length);
                }
              }
            } catch (syncErr) {
              console.warn("Audio sync analysis failed, falling back to text length:", syncErr);
            }
          }

          // Calculate timings based on generated audio or text length
          const totalChars = parsedScenes.reduce((acc, s) => acc + s.textSegment.length, 0);
          const totalAudioDuration = sceneDurations.reduce((acc, d) => acc + d, 0);

          const initialScenes: Scene[] = parsedScenes.map((s, i) => {
            let ratio = 0;
            let duration = 0;
            if (sceneDurations.length === parsedScenes.length && totalAudioDuration > 0) {
              ratio = sceneDurations[i] / totalAudioDuration;
              duration = sceneDurations[i];
            } else {
              ratio = s.textSegment.length / totalChars;
            }
            
            return {
              id: `scene-${Date.now()}-${i}`,
              textSegment: s.textSegment,
              description: s.description,
              characters: s.characters || [],
              imagePrompt: s.imagePrompt,
              videoPrompt: s.videoPrompt,
              visualKey: s.visualKey || `key-${i}`,
              status: 'pending' as const,
              durationRatio: ratio,
              duration: duration > 0 ? duration : undefined,
            };
          });

          setScenes(initialScenes);

          // 3. Automatic Image Generation (with reuse)
          if (isAutoImageEnabled) {
            const visualKeyMap: Record<string, string> = {};
            const updatedScenes = [...initialScenes];

            for (let i = 0; i < updatedScenes.length; i++) {
              const scene = updatedScenes[i];
              
              // Check if we already have an image for this visualKey
              if (visualKeyMap[scene.visualKey]) {
                updatedScenes[i] = {
                  ...scene,
                  mediaUrl: visualKeyMap[scene.visualKey],
                  mediaType: 'image',
                  status: 'completed'
                };
                setScenes([...updatedScenes]);
                continue;
              }

              // Generate new image
              updatedScenes[i] = { ...scene, status: 'generating-image' };
              setScenes([...updatedScenes]);

              try {
                const imgParts: any[] = [{ text: scene.imagePrompt }];
                
                if (refImage) {
                  imgParts.unshift({
                    inlineData: {
                      mimeType: "image/png",
                      data: refImage.split(',')[1]
                    }
                  });
                  imgParts[1].text = `CRITICAL: Generate an image that matches the character and style of the provided reference image. Prompt: ${scene.imagePrompt}`;
                }

                const imgResponse = await ai.models.generateContent({
                  model: 'gemini-2.5-flash-image',
                  contents: { parts: imgParts },
                });

                let base64Image = '';
                for (const part of imgResponse.candidates?.[0]?.content?.parts || []) {
                  if (part.inlineData) {
                    base64Image = part.inlineData.data;
                    break;
                  }
                }

                if (base64Image) {
                  const imageUrl = `data:image/png;base64,${base64Image}`;
                  visualKeyMap[scene.visualKey] = imageUrl;
                  updatedScenes[i] = {
                    ...scene,
                    mediaUrl: imageUrl,
                    mediaType: 'image',
                    status: 'completed'
                  };
                } else {
                  throw new Error("Image generation failed to return data.");
                }
              } catch (imgErr: any) {
                console.error(`Image generation failed for scene ${i}:`, imgErr);
                updatedScenes[i] = {
                  ...scene,
                  status: 'failed',
                  error: imgErr.message
                };
              }
              setScenes([...updatedScenes]);
            }
          }
        })(),
        timeoutPromise
      ]);
    } catch (err: any) {
      console.error("Generation failed:", err);
      let errorMessage = err.message || "An unexpected error occurred.";
      
      // Try to parse JSON error message
      try {
        if (errorMessage.includes("{")) {
           const jsonPart = errorMessage.substring(errorMessage.indexOf("{"));
           const parsed = JSON.parse(jsonPart);
           if (parsed.error && parsed.error.code === 429) {
             errorMessage = "ফ্রি সিস্টেমের লিমিট শেষ হয়ে গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
           } else if (parsed.error && parsed.error.message) {
             errorMessage = parsed.error.message;
           }
        }
      } catch (e) {
        // Ignore parsing error
      }

      if (errorMessage.includes("429") || errorMessage.includes("quota")) {
        errorMessage = "ফ্রি সিস্টেমের লিমিট শেষ হয়ে গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
      }

      setError(errorMessage);
    } finally {
      setIsGenerating(false);
      isResetting.current = false;
    }
  };

  const generateVoice = async () => {
    if (!story.trim() || scenes.length === 0) return;
    setIsGeneratingVoice(true);
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("API Key পাওয়া যায়নি। অনুগ্রহ করে সেটিংস চেক করুন।");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      let allRawData: Uint8Array = new Uint8Array(0);
      const updatedScenes = [...scenes];
      const SAMPLE_RATE = 24000;
      const BYTES_PER_SAMPLE = 2; // 16-bit
      const CHANNELS = 1; // Mono

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        // Generate audio for this specific scene's text
        const ttsResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: scene.textSegment }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });

        const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          // Decode base64 to raw binary string
          const rawString = atob(base64Audio);
          const rawLength = rawString.length;
          const rawBytes = new Uint8Array(rawLength);
          for (let j = 0; j < rawLength; j++) {
            rawBytes[j] = rawString.charCodeAt(j);
          }

          // Calculate duration for this segment
          // Duration = Total Bytes / (Sample Rate * Channels * BytesPerSample)
          const duration = rawLength / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE);
          
          // Update scene with exact duration
          updatedScenes[i] = {
            ...scene,
            durationRatio: duration, // Temporarily store duration here, will be normalized later
            duration: duration
          };

          // Append to master buffer
          const newBuffer = new Uint8Array(allRawData.length + rawLength);
          newBuffer.set(allRawData);
          newBuffer.set(rawBytes, allRawData.length);
          allRawData = newBuffer;
        }
      }

      if (allRawData.length > 0) {
        // Create WAV from concatenated raw data
        const wavBlob = createWavBlobFromRaw(allRawData);
        const url = URL.createObjectURL(wavBlob);
        setAudioUrl(url);
        await idbSet('story_video_gen_audio_blob', wavBlob);
        
        // Normalize duration ratios based on total duration
        const totalDuration = allRawData.length / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE);
        const finalScenes = updatedScenes.map(s => ({
          ...s,
          durationRatio: (s.durationRatio as number) / totalDuration
        }));
        setScenes(finalScenes);
      }

    } catch (err: any) {
      console.error("Voice generation failed:", err);
      let errorMessage = err.message || "An unexpected error occurred.";
      
      if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "ফ্রি সিস্টেমের লিমিট শেষ হয়ে গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।";
      } else {
        errorMessage = "ভয়েস জেনারেট করতে সমস্যা হয়েছে: " + errorMessage;
      }

      setError(errorMessage);
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  // --- Video Assembly (Server-Side Rendering) ---
  const assembleVideo = async () => {
    if (!audioRef.current || scenes.length === 0 || !audioUrl) return;

    setIsRecording(true);
    setRecordingProgress(0);
    setStatusText("অডিও আপলোড হচ্ছে...");
    setError(null);

    try {
      // 1. Get audio duration
      const duration = audioRef.current.duration;
      if (!duration || isNaN(duration) || duration === Infinity) {
        throw new Error("অডিও লোড হতে সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।");
      }

      // Check max video duration limit
      if (maxVideoDuration > 0 && duration > maxVideoDuration * 60) {
        throw new Error(`আপনার লাইসেন্স অনুযায়ী আপনি সর্বোচ্চ ${maxVideoDuration} মিনিটের ভিডিও তৈরি করতে পারবেন। আপনার অডিওর দৈর্ঘ্য ${Math.ceil(duration / 60)} মিনিট। দয়া করে এডমিনের সাথে যোগাযোগ করুন।`);
      }

      // 2. Calculate scene timings
      let accumulatedTime = 0;
      const FPS = 30;
      
      const timedScenes = scenes.map((scene, i) => {
        const isLast = i === scenes.length - 1;
        const sceneDurationRatio = scene.durationRatio || (1 / scenes.length);
        const idealDuration = sceneDurationRatio * duration;
        
        const actualStartTime = accumulatedTime;
        
        let actualEndTime;
        if (isLast) {
           // For the last scene, use the total duration to ensure we cover the audio
           actualEndTime = duration;
        } else {
           // For intermediate scenes, snap to the nearest frame to avoid cumulative drift
           // Calculate target end time based on ideal duration
           const targetEndTime = actualStartTime + idealDuration;
           // Snap to 30fps grid
           actualEndTime = Math.round(targetEndTime * FPS) / FPS;
        }
        
        // Update accumulated time for the next scene
        accumulatedTime = actualEndTime;
        
        return {
          ...scene,
          actualStartTime,
          actualEndTime
        };
      });

      // 3. Create Job
      const jobRes = await fetch('/api/jobs', { method: 'POST' });
      if (!jobRes.ok) throw new Error("জব তৈরি করতে সমস্যা হয়েছে।");
      const { jobId } = await jobRes.json();

      // 4. Upload Audio
      const audioRes = await fetch(audioUrl);
      const audioBlob = await audioRes.blob();
      const audioForm = new FormData();
      audioForm.append('fieldname', 'audio');
      audioForm.append('file', audioBlob, 'audio.mp3');
      
      setRecordingProgress(5);
      await fetch(`/api/jobs/${jobId}/upload`, { method: 'POST', body: audioForm });

      // 5. Upload Media Files
      setStatusText("ছবি ও ভিডিও আপলোড হচ্ছে...");
      for (let i = 0; i < timedScenes.length; i++) {
        const scene = timedScenes[i];
        if (scene.mediaUrl || scene.mediaBlob) {
          let mediaBlob: Blob;
          
          if (scene.mediaBlob) {
            mediaBlob = scene.mediaBlob;
          } else if (scene.mediaUrl) {
            const mediaRes = await fetch(scene.mediaUrl);
            mediaBlob = await mediaRes.blob();
          } else {
            continue;
          }
          
          let ext = '.jpg';
          if (mediaBlob.type.includes('video')) ext = '.mp4';
          else if (mediaBlob.type.includes('png')) ext = '.png';

          const mediaForm = new FormData();
          mediaForm.append('fieldname', `media_${i}`);
          mediaForm.append('file', mediaBlob, `media_${i}${ext}`);
          
          await fetch(`/api/jobs/${jobId}/upload`, { method: 'POST', body: mediaForm });
          setRecordingProgress(5 + Math.floor(((i + 1) / timedScenes.length) * 15)); // Up to 20%
        }
      }

      // 6. Start Render
      setStatusText("আপলোড সম্পন্ন! রেন্ডারিং শুরু হচ্ছে...");
      const renderRes = await fetch(`/api/jobs/${jobId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: timedScenes })
      });
      if (!renderRes.ok) throw new Error("রেন্ডার শুরু করতে সমস্যা হয়েছে।");

      // 7. Monitor Job (Resume-able)
      setRecordingProgress(0);
      setStatusText("ভিডিও রেন্ডার শুরু হচ্ছে...");
      
      const audioDuration = audioRef.current?.duration || 0;
      // Increase timeout to 60 minutes base + 10s per second of audio to avoid premature timeouts
      const maxWaitTime = (60 * 60 * 1000) + (audioDuration * 10000); 
      const startTime = Date.now();

      // Save active job state
      const jobState = { jobId, startTime, maxWaitTime };
      localStorage.setItem('story_video_gen_active_job', JSON.stringify(jobState));
      setActiveJobId(jobId);

      await monitorJob(jobId, startTime, maxWaitTime);

    } catch (err: any) {
      console.error("Video assembly failed:", err);
      setError(err.message || "ভিডিও তৈরি করতে সমস্যা হয়েছে।");
      setActiveJobId(null);
      localStorage.removeItem('story_video_gen_active_job');
    } finally {
      setIsRecording(false);
    }
  };

  const cancelVideoRender = async () => {
    if (!activeJobId) return;
    
    try {
      setIsCancelling(true);
      isCancelled.current = true;
      setIsRecording(false);
      setStatusText("জেনারেশন বাতিল করা হচ্ছে...");
      
      const res = await fetch(`/api/jobs/${encodeURIComponent(activeJobId)}/cancel`, { method: 'POST' });
      
      if (res.ok || res.status === 404 || res.status === 429) {
        // If 404, it's already gone, so we consider it "cancelled" locally
        // If 429, we also consider it cancelled locally to prevent the UI from getting stuck
        setActiveJobId(null);
        localStorage.removeItem('story_video_gen_active_job');
        setStatusText(res.status === 404 ? "জবটি আর খুঁজে পাওয়া যায়নি।" : "জেনারেশন বাতিল করা হয়েছে।");
      } else {
        const contentType = res.headers.get("content-type");
        let errorMessage = "বাতিল করতে সমস্যা হয়েছে।";
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          errorMessage = data.error || errorMessage;
        } else {
          errorMessage = await res.text();
        }
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      console.error("Failed to cancel job:", err);
      // Even if API fails, we stop polling locally
      setIsRecording(false);
      setActiveJobId(null);
      localStorage.removeItem('story_video_gen_active_job');
      setStatusText("জেনারেশন বাতিল করা হয়েছে।");
    } finally {
      setIsCancelling(false);
    }
  };

  const updateSceneData = (id: string, data: Partial<Scene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
  };

  const loadFromHistory = async (project: SavedProject) => {
    setStory(project.story);
    
    // Recreate object URLs for blobs to ensure they are valid in the current session
    const restoredScenes = project.scenes.map(scene => {
      if (scene.mediaBlob && scene.mediaBlob instanceof Blob) {
        return {
          ...scene,
          mediaUrl: URL.createObjectURL(scene.mediaBlob)
        };
      } else if (scene.mediaUrl && scene.mediaUrl.startsWith('blob:')) {
        // Old blob URL without the actual blob data is unrecoverable
        return {
          ...scene,
          mediaUrl: undefined,
          status: 'failed' as const,
          error: 'Media file missing from history. Please re-upload.'
        };
      }
      return scene;
    });
    
    setScenes(restoredScenes);
    setRefImage(project.refImage);
    setProjectMode(project.projectMode);
    setVisualStyle(project.visualStyle);
    
    if (project.audioBlob) {
      const url = URL.createObjectURL(project.audioBlob);
      setAudioUrl(url);
      await idbSet('story_video_gen_audio_blob', project.audioBlob);
    } else {
      setAudioUrl(null);
    }
    
    setFinalVideoUrl(null);
    setShowHistory(false);
  };

  const deleteFromHistory = (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(p => p.id !== id);
      idbSet('story_video_gen_history', updated).catch(e => console.error(e));
      return updated;
    });
  };

  // Auto-download when video is ready (only for new server-generated videos)
  useEffect(() => {
    if (finalVideoUrl && finalVideoUrl.includes('/api/jobs/')) {
      const downloadUrl = finalVideoUrl.replace('?action=view', '-zip');
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', 'story.zip'); // Ensure download attribute is set
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [finalVideoUrl]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <a 
              href="https://t.me/AirdropKoP" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 sm:gap-3 group"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <Video className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <span className="font-bold text-xl sm:text-2xl tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent group-hover:opacity-80 transition-opacity">
                AirdropKoP
              </span>
            </a>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-all text-sm font-bold active:scale-95 touch-manipulation"
              title="Project History"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">হিস্টরি</span>
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-zinc-800/50 border border-white/10 text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-lg transition-all text-sm font-bold active:scale-95 touch-manipulation"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">সেটিংস</span>
            </button>

            <button
              onClick={() => setShowLibrary(true)}
              className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 rounded-lg transition-all text-sm font-bold active:scale-95 touch-manipulation"
              title="Video Library"
            >
              <Library className="w-4 h-4" />
              <span className="hidden sm:inline">লাইব্রেরি ({videoLibrary.length})</span>
              <span className="sm:hidden">({videoLibrary.length})</span>
            </button>

            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 px-2 sm:px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-lg transition-all text-sm font-bold active:scale-95 touch-manipulation"
              title="Clear all data"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">রিসেট করুন</span>
            </button>
          </div>
        </div>
      </header>

      {isLicenseNotificationEnabled && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-center backdrop-blur-sm sticky top-16 z-40">
          <div className="text-yellow-500 text-sm font-medium flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <div className="prose prose-sm prose-yellow max-w-none">
              <Markdown>{licenseNotification || 'লাইসেন্স সিস্টেম বর্তমানে ডিএক্টিভ আছে। আপনার লাইসেন্সের মেয়াদ কমবে না।'}</Markdown>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center px-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
              
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">সেটিংস</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300 block">
                    Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    আপনার নিজের API Key ব্যবহার করলে লিমিট এরর আসবে না। 
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 ml-1 underline"
                    >
                      এখানে ক্লিক করে ফ্রি Key নিন
                    </a>
                  </p>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="mb-4 space-y-2">
                    <label className="text-sm font-medium text-zinc-300 block">
                      লাইসেন্স মেয়াদ
                    </label>
                    <div className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-zinc-400 flex items-center justify-between">
                      {licenseExpiry ? (
                        <>
                          <span className={getRemainingDays() < 3 ? "text-red-400 font-bold" : "text-emerald-400 font-bold"}>
                            {getRemainingDays()} দিন বাকি
                          </span>
                          <span className="text-xs text-zinc-500">
                            ({new Date(licenseExpiry).toLocaleDateString()})
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-500 italic">তথ্য পাওয়া যায়নি</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="mb-4 space-y-2">
                    <label className="text-sm font-medium text-zinc-300 block">
                      সর্বোচ্চ ভিডিও রেন্ডারিং লিমিট
                    </label>
                    <div className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-zinc-400 flex items-center justify-between">
                      <span className="text-emerald-400 font-bold">
                        {maxVideoDuration ? `${maxVideoDuration} মিনিট` : 'আনলিমিটেড'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="mb-4 space-y-2">
                    <label className="text-sm font-medium text-zinc-300 block">
                      লাইসেন্স অ্যাক্টিভেশন সাপোর্ট
                    </label>
                    <div className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-zinc-400 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span>01717775962</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20"
                  >
                    সেভ করুন
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center px-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowResetConfirm(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-orange-500" />
              
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 mx-auto rotate-3">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              
              <h3 className="text-xl font-bold text-white text-center mb-3">সব ডাটা মুছে ফেলতে চান?</h3>
              <p className="text-zinc-400 text-sm text-center mb-8 leading-relaxed">
                এটি করলে আপনার বর্তমান সব কাজ চিরতরে মুছে যাবে। তবে লাইব্রেরিতে সেভ করা ভিডিওগুলো <span className="text-white font-bold">সুরক্ষিত থাকবে</span>।
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => clearAllData()}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 active:scale-95 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  হ্যাঁ, মুছে ফেলুন
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full py-4 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-300 rounded-2xl font-bold transition-all"
                >
                  না, ফিরে যান
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isResettingState || isResuming) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md"
          >
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
              <p className="text-white font-bold text-lg">{isResuming ? "আগের কাজ চেক করা হচ্ছে..." : "রিসেট হচ্ছে..."}</p>
              <p className="text-zinc-500 text-sm mt-2">অনুগ্রহ করে অপেক্ষা করুন</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-8">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-indigo-400">
                <Sparkles className="w-5 h-5" />
                <h2 className="text-xl font-semibold">আপনার গল্প ও স্টাইল</h2>
              </div>

              {/* Reference Image Upload */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-400 block">রেফারেন্স ইমেজ</label>
                  <div className="relative group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="ref-image-upload"
                    />
                    <label
                      htmlFor="ref-image-upload"
                      className="flex flex-col items-center justify-center w-full h-32 bg-zinc-900/50 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-indigo-500/50 hover:bg-zinc-900 transition-all overflow-hidden"
                    >
                      {refImage ? (
                        <div className="relative w-full h-full group">
                          <img src={refImage} alt="Reference" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <motion.button 
                              whileHover={{ scale: 1.1, rotate: 5 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.preventDefault();
                                setRefImage(null);
                              }}
                              className="bg-red-500 text-white p-3 rounded-full hover:bg-red-600 transition-colors shadow-lg shadow-red-500/40"
                            >
                              <Trash2 className="w-5 h-5" />
                            </motion.button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-500">
                          <Upload className="w-6 h-6" />
                          <span className="text-xs">ছবি আপলোড</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-zinc-400 block">ভয়েসওভার (ঐচ্ছিক)</label>
                  <div className="relative group">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleAudioUpload}
                      className="hidden"
                      id="audio-upload"
                    />
                    <div className="flex flex-col items-center justify-center w-full h-32 bg-zinc-900/50 border-2 border-dashed border-white/10 rounded-2xl overflow-hidden">
                      {audioUrl ? (
                        <div className="flex flex-col items-center gap-1 p-2 w-full">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center">
                              <Mic className="w-4 h-4 text-indigo-400" />
                            </div>
                            <motion.button 
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={deleteAudio}
                              className="text-[10px] text-red-400 hover:text-red-300 font-bold bg-red-400/10 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 border border-red-500/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              ডিলিট
                            </motion.button>
                          </div>
                          <audio src={audioUrl} controls className="w-full h-8 scale-90" />
                        </div>
                      ) : (
                        <label
                          htmlFor="audio-upload"
                          className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-zinc-900 transition-all"
                        >
                          <div className="flex flex-col items-center gap-2 text-zinc-500">
                            <Mic className="w-6 h-6" />
                            <span className="text-xs">ভয়েস আপলোড</span>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-400 block">গল্পটি এখানে লিখুন</label>
                <textarea
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="একদা এক বনে..."
                  className="w-full h-48 bg-zinc-900/50 border border-white/10 rounded-2xl p-6 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-zinc-400 block">ক্যারেক্টার প্রম্পট (ঐচ্ছিক)</label>
                <textarea
                  value={characterPrompts}
                  onChange={(e) => setCharacterPrompts(e.target.value)}
                  placeholder="যেমন: রাজু: ছোট ছেলে, নীল চোখ, বাদামী চুল, সবুজ জামা..."
                  className="w-full h-32 bg-zinc-900/50 border border-white/10 rounded-2xl p-6 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                />
                <p className="text-[10px] text-zinc-500 italic">এখানে আপনার গল্পের চরিত্রগুলোর বর্ণনা দিন যাতে সব সিনে তারা দেখতে একই রকম হয়।</p>
              </div>

              {/* Scene Count Selector */}
                <div className="space-y-4 bg-zinc-900/30 p-4 rounded-2xl border border-white/5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          id="custom-count-toggle"
                          checked={isCustomCountEnabled}
                          onChange={(e) => setIsCustomCountEnabled(e.target.checked)}
                          className="w-4 h-4 rounded border-white/10 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                        />
                        <label htmlFor="custom-count-toggle" className="text-sm font-medium text-zinc-400 cursor-pointer">সিনের সংখ্যা নির্দিষ্ট করুন</label>
                      </div>
                      {isCustomCountEnabled && (
                        <span className="text-xs font-bold text-indigo-400 bg-indigo-400/10 px-2 py-0.5 rounded-full">
                          {sceneCount && parseInt(sceneCount.toString()) > 0 ? `${sceneCount} টি সিন` : 'সিনের সংখ্যা দিন'}
                        </span>
                      )}
                    </div>

                    {isCustomCountEnabled ? (
                      <div className="space-y-3 pl-6 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={sceneCount}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                setSceneCount('');
                              } else {
                                const num = parseInt(val);
                                if (!isNaN(num)) setSceneCount(num);
                              }
                            }}
                            className="flex-1 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            placeholder="সিনের সংখ্যা লিখুন..."
                          />
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="500"
                          step="1"
                          value={sceneCount === '' ? 1 : Math.min(parseInt(sceneCount.toString()) || 1, 500)}
                          onChange={(e) => setSceneCount(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="flex justify-between text-[10px] text-zinc-600 font-medium px-1">
                          <span>১ টি</span>
                          <span>৫০০+ টি</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-zinc-500 italic pl-6">গল্পের দৈর্ঘ্য অনুযায়ী অটোমেটিক সিনে ভাগ করা হবে।</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                    <input 
                      type="checkbox" 
                      id="auto-image-toggle"
                      checked={isAutoImageEnabled}
                      onChange={(e) => setIsAutoImageEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-white/10 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                    />
                    <label htmlFor="auto-image-toggle" className="text-sm font-medium text-zinc-400 cursor-pointer">অটোমেটিক ইমেজ জেনারেট করুন</label>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-white/5">
                    <input 
                      type="checkbox" 
                      id="auto-voice-toggle"
                      checked={isAutoVoiceEnabled}
                      onChange={(e) => setIsAutoVoiceEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-white/10 bg-zinc-800 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                    />
                    <label htmlFor="auto-voice-toggle" className="text-sm font-medium text-zinc-400 cursor-pointer">অটোমেটিক ভয়েস জেনারেট করুন</label>
                  </div>

                  <div className="pt-3 border-t border-white/5 space-y-3">
                    <label className="text-sm font-medium text-zinc-400 block">এডিটিং মোড সিলেক্ট করুন</label>
                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setProjectMode('image')}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                          projectMode === 'image' 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                            : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'
                        }`}
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        ইমেজ এডিটিং
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setProjectMode('video')}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                          projectMode === 'video' 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                            : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5" />
                        ভিডিও এডিটিং
                      </motion.button>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 space-y-3">
                    <label className="text-sm font-medium text-zinc-400 block">ভিজ্যুয়াল স্টাইল সিলেক্ট করুন</label>
                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setVisualStyle('2D')}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                          visualStyle === '2D' 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                            : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'
                        }`}
                      >
                        <Palette className="w-3.5 h-3.5" />
                        2D Animation
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setVisualStyle('Realistic')}
                        className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                          visualStyle === 'Realistic' 
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' 
                            : 'bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10 hover:bg-zinc-900'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Realistic Cinematic
                      </motion.button>
                    </div>
                  </div>
                </div>

              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={isGenerating ? () => { setIsGenerating(false); setError("জেনারেশন বাতিল করা হয়েছে।"); } : generateFullStory}
                  disabled={!story.trim() || (isCustomCountEnabled && (!sceneCount || parseInt(sceneCount.toString()) < 1)) || isResuming}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl ${
                    !story.trim() || (isCustomCountEnabled && (!sceneCount || parseInt(sceneCount.toString()) < 1)) || isResuming
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                      : isGenerating 
                        ? 'bg-red-600/20 border border-red-500/30 text-red-400 hover:bg-red-600/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20 border border-indigo-400/20'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      বাতিল করুন (তৈরি হচ্ছে...)
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      {isAutoImageEnabled ? 'গল্প ও ছবি তৈরি করুন' : 'গল্পের সিন তৈরি করুন'}
                    </>
                  )}
                </motion.button>
                {isGenerating && (
                  <p className="text-[10px] text-zinc-500 text-center mt-2 animate-pulse">
                    গল্প বিশ্লেষণ ও সিন তৈরি হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...
                  </p>
                )}
              </div>

              {!audioUrl && story.trim() && !isAutoVoiceEnabled && (
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={generateVoice}
                  disabled={isGeneratingVoice || isGenerating}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl ${
                    isGeneratingVoice || isGenerating
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                      : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/20 border border-purple-400/20'
                  }`}
                >
                  {isGeneratingVoice ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      ভয়েস তৈরি হচ্ছে...
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-5 h-5" />
                      ভয়েস জেনারেট করুন
                    </>
                  )}
                </motion.button>
              )}

              <div className="space-y-3">
                <div className="flex gap-4">
                  {audioUrl && scenes.length > 0 && scenes.every(s => s.status === 'completed') && !finalVideoUrl && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={assembleVideo}
                      disabled={isRecording || isGenerating}
                      className={`flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl relative overflow-hidden ${
                        isRecording || isGenerating
                          ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed border border-white/5'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 border border-emerald-400/20'
                      }`}
                    >
                      {isRecording ? (
                        <>
                          <div className="absolute inset-0 bg-emerald-900/20 z-0">
                            <motion.div 
                              className="h-full bg-emerald-500/10"
                              initial={{ width: 0 }}
                              animate={{ width: `${recordingProgress}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                          <div className="relative z-10 flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>ভিডিও তৈরি হচ্ছে...</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <Film className="w-5 h-5" />
                          ফাইনাল ভিডিও তৈরি করুন
                        </>
                      )}
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={saveToHistory}
                    disabled={(!story.trim() && scenes.length === 0) || isSaving || saveSuccess}
                    className={`px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl border ${
                      (!story.trim() && scenes.length === 0) || isSaving
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed border-white/5'
                        : saveSuccess 
                          ? 'bg-green-600 text-white border-green-500/20'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-white border-white/10'
                    } ${!(audioUrl && scenes.length > 0 && scenes.every(s => s.status === 'completed') && !finalVideoUrl) ? 'flex-1' : ''}`}
                    title="প্রজেক্ট সেভ করুন"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        সেভ হচ্ছে...
                      </>
                    ) : saveSuccess ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        সেভ হয়েছে!
                      </>
                    ) : (
                      <>
                        <History className="w-5 h-5" />
                        সেভ করুন
                      </>
                    )}
                  </motion.button>
                </div>
                
                {isRecording && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-6 bg-zinc-900/80 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-500/10 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center animate-pulse">
                            <Film className="w-5 h-5 text-emerald-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-emerald-400">{statusText}</h4>
                            <p className="text-[10px] text-zinc-500">ব্যাকগ্রাউন্ডে রেন্ডারিং চলছে। আপনি চাইলে এই ট্যাবটি বন্ধ করতে পারেন, পরে ফিরে এসে ভিডিওটি লাইব্রেরিতে পাবেন।</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-lg font-mono font-bold text-emerald-400">{recordingProgress}%</span>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={cancelVideoRender}
                            disabled={isCancelling}
                            className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-lg border border-red-500/20 transition-all disabled:opacity-50"
                          >
                            {isCancelling ? 'বাতিল হচ্ছে...' : 'বাতিল করুন'}
                          </motion.button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden border border-white/5 p-0.5">
                          <motion.div 
                            className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.4)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${recordingProgress}%` }}
                            transition={{ type: "spring", stiffness: 50, damping: 20 }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
                          <span>শুরু</span>
                          <span>সম্পন্ন</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 text-sm">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-7 space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-400">
                <Video className="w-5 h-5" />
                <h2 className="text-xl font-semibold">আউটপুট</h2>
              </div>
            </div>

            <div className="space-y-8">
              {/* Final Video Player */}
              {finalVideoUrl && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-zinc-900 border border-indigo-500/30 rounded-3xl overflow-hidden shadow-2xl"
                >
                  <div className="p-4 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between">
                    <span className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      ফাইনাল ভিডিও প্রস্তুত!
                    </span>
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setFinalVideoUrl(null)}
                        className="flex items-center gap-2 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 px-5 py-2.5 rounded-xl transition-all border border-red-500/20"
                      >
                        <Trash2 className="w-4 h-4" />
                        ডিলিট
                      </motion.button>
                      <motion.a
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        href={finalVideoUrl.replace('?action=view', '-zip')}
                        download="story.zip"
                        className="flex items-center gap-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 border border-indigo-400/20"
                      >
                        <Download className="w-4 h-4" />
                        ডাউনলোড করুন (ZIP)
                      </motion.a>
                    </div>
                  </div>
                  <video src={finalVideoUrl} controls className="w-full aspect-video object-cover" />
                </motion.div>
              )}

              {/* Audio Preview */}
              {audioUrl && (
                <div className="p-4 bg-zinc-900/50 border border-white/5 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center">
                    <Volume2 className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-zinc-400 mb-1">ভয়েসওভার প্রিভিউ</p>
                    <audio ref={audioRef} src={audioUrl} controls className="w-full h-8" />
                  </div>
                </div>
              )}

              {/* Scenes Grid */}
              <div className="grid grid-cols-1 gap-6">
                {scenes.length > 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-2">
                    <div className="flex items-center gap-2 text-zinc-400">
                      <Film className="w-4 h-4" />
                      <h3 className="text-sm font-bold uppercase tracking-wider">সিন লিস্ট ({scenes.length})</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const allTexts = scenes.map((s, i) => `সিন ${i + 1}:\nগল্পের অংশ: "${s.textSegment}"\nবর্ণনা: ${s.description}`).join('\n\n');
                          navigator.clipboard.writeText(allTexts);
                          const btn = document.getElementById('copy-desc-btn');
                          if (btn) {
                            const original = btn.innerHTML;
                            btn.innerHTML = '<span class="text-emerald-500 flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> কপি হয়েছে</span>';
                            setTimeout(() => { btn.innerHTML = original; }, 2000);
                          }
                        }}
                        id="copy-desc-btn"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-[10px] font-bold text-zinc-400 hover:text-indigo-400 border border-white/5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        সব বর্ণনা কপি করুন
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const allPrompts = scenes.map((s, i) => `সিন ${i + 1}:\nগল্পের অংশ: "${s.textSegment}"\nইমেজ প্রম্পট: ${s.imagePrompt}`).join('\n\n');
                          navigator.clipboard.writeText(allPrompts);
                          const btn = document.getElementById('copy-all-btn');
                          if (btn) {
                            const original = btn.innerHTML;
                            btn.innerHTML = '<span class="text-emerald-500 flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> কপি হয়েছে</span>';
                            setTimeout(() => { btn.innerHTML = original; }, 2000);
                          }
                        }}
                        id="copy-all-btn"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-[10px] font-bold text-zinc-400 hover:text-indigo-400 border border-white/5"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        সব প্রম্পট কপি করুন
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const allVideoPrompts = scenes.map((s) => s.videoPrompt).join('\n\n');
                          navigator.clipboard.writeText(allVideoPrompts);
                          const btn = document.getElementById('copy-video-btn');
                          if (btn) {
                            const original = btn.innerHTML;
                            btn.innerHTML = '<span class="text-emerald-500 flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> কপি হয়েছে</span>';
                            setTimeout(() => { btn.innerHTML = original; }, 2000);
                          }
                        }}
                        id="copy-video-btn"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-[10px] font-bold text-zinc-400 hover:text-indigo-400 border border-white/5"
                      >
                        <Video className="w-3.5 h-3.5" />
                        সব ভিডিও প্রম্পট কপি করুন
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          const allCharacters = scenes.map((s, i) => `সিন ${i + 1}: ${s.characters.join(', ')}`).join('\n');
                          navigator.clipboard.writeText(allCharacters);
                          const btn = document.getElementById('copy-chars-btn');
                          if (btn) {
                            const original = btn.innerHTML;
                            btn.innerHTML = '<span class="text-emerald-500 flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> কপি হয়েছে</span>';
                            setTimeout(() => { btn.innerHTML = original; }, 2000);
                          }
                        }}
                        id="copy-chars-btn"
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-[10px] font-bold text-zinc-400 hover:text-indigo-400 border border-white/5"
                      >
                        <Users className="w-3.5 h-3.5" />
                        সব ক্যারেক্টার কপি করুন
                      </motion.button>
                    </div>
                  </div>
                )}

                {!isAutoImageEnabled && scenes.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex flex-col gap-4 text-indigo-300"
                  >
                    <div className="flex items-center gap-3">
                      <ImageIcon className="w-5 h-5 shrink-0" />
                      <p className="text-sm font-medium">
                        {scenes.some(s => s.status === 'pending') 
                          ? "এখন প্রতিটি সিনের জন্য ছবি বা ভিডিও আপলোড করুন। সব মিডিয়া আপলোড হলে ভিডিও তৈরি করতে পারবেন।" 
                          : "আপনি চাইলে সব সিনের মিডিয়া একসাথে পরিবর্তন করতে পারেন। ফাইলের নাম অনুযায়ী ক্রমানুসারে সেট হবে।"}
                      </p>
                    </div>
                    
                    <motion.label 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center justify-center gap-3 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl cursor-pointer transition-all text-sm font-bold shadow-lg shadow-indigo-600/20 border border-indigo-400/20"
                    >
                      <UploadCloud className="w-5 h-5" />
                      {projectMode === 'image' 
                        ? (scenes.some(s => s.status === 'pending') ? "একসাথে সব ছবি আপলোড করুন" : "সব ছবি একসাথে পরিবর্তন করুন")
                        : (scenes.some(s => s.status === 'pending') ? "একসাথে সব ভিডিও আপলোড করুন" : "সব ভিডিও একসাথে পরিবর্তন করুন")}
                      <input 
                        type="file" 
                        multiple 
                        accept={projectMode === 'image' ? "image/*" : "video/*"} 
                        className="hidden" 
                        onChange={handleBulkMediaUpload}
                      />
                    </motion.label>
                  </motion.div>
                )}
                <AnimatePresence mode="popLayout">
                  {scenes.map((scene, idx) => (
                    <motion.div
                      key={scene.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-zinc-900/30 border border-white/5 rounded-2xl overflow-hidden"
                    >
                      <div className="flex flex-col md:flex-row">
                        <div className="w-full md:w-48 aspect-video md:aspect-square bg-black relative group">
                          {scene.mediaUrl ? (
                            <>
                              {scene.mediaType === 'video' ? (
                                <div className="relative w-full h-full">
                                  <video 
                                    src={scene.mediaUrl} 
                                    className="w-full h-full object-cover" 
                                    muted 
                                    loop 
                                    playsInline 
                                    controls
                                    preload="metadata"
                                    onError={(e) => {
                                      console.error("Video load error:", e);
                                      // Check if it's a format issue
                                      const videoEl = e.target as HTMLVideoElement;
                                      const error = videoEl.error;
                                      let msg = "ভিডিও প্লে করা যাচ্ছে না।";
                                      if (error && error.code === 4) {
                                          msg = "ফরম্যাট সাপোর্টেড নয় (MKV/AVI প্রিভিউ হবে না, তবে রেন্ডারে কাজ করবে)।";
                                      }
                                      updateSceneData(scene.id, { error: msg });
                                    }}
                                  />
                                  {/* Filename overlay for confirmation */}
                                  {scene.mediaBlob && 'name' in scene.mediaBlob && (
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white/80 max-w-[80%] truncate pointer-events-none">
                                      {(scene.mediaBlob as File).name}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <img 
                                  src={scene.mediaUrl} 
                                  alt="Scene" 
                                  className="w-full h-full object-cover" 
                                  referrerPolicy="no-referrer" 
                                  onError={(e) => {
                                    console.error("Image load error:", e);
                                    updateSceneData(scene.id, { error: "ছবি লোড করা যাচ্ছে না।" });
                                  }}
                                />
                              )}
                              {scene.error && (
                                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center z-20 border border-red-500/20">
                                  <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
                                  <span className="text-xs text-red-400 font-bold mb-1">{scene.error}</span>
                                  <span className="text-[10px] text-zinc-500">ফাইলটি রেন্ডারিং-এর সময় প্রসেস করা হবে।</span>
                                </div>
                              )}
                              {/* Edit button (Visible on mobile, and on desktop hover) */}
                              <div className="absolute top-2 right-2 z-10 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200 flex gap-2">
                                {projectMode === 'image' ? (
                                  <label 
                                    className="flex items-center justify-center w-8 h-8 bg-black/60 rounded-full cursor-pointer text-white backdrop-blur-md border border-white/10 shadow-lg hover:bg-indigo-600 transition-colors"
                                    title="ছবি পরিবর্তন করুন"
                                  >
                                    <ImageIcon className="w-4 h-4" />
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      className="hidden" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const objectUrl = URL.createObjectURL(file);
                                          updateSceneData(scene.id, { mediaUrl: objectUrl, mediaBlob: file, mediaType: 'image', status: 'completed', error: undefined });
                                        }
                                      }}
                                    />
                                  </label>
                                ) : (
                                  <label 
                                    className="flex items-center justify-center w-8 h-8 bg-black/60 rounded-full cursor-pointer text-white backdrop-blur-md border border-white/10 shadow-lg hover:bg-indigo-600 transition-colors"
                                    title="ভিডিও পরিবর্তন করুন"
                                  >
                                    <Video className="w-4 h-4" />
                                    <input 
                                      type="file" 
                                      accept="video/*" 
                                      className="hidden" 
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const objectUrl = URL.createObjectURL(file);
                                          updateSceneData(scene.id, { mediaUrl: objectUrl, mediaBlob: file, mediaType: 'video', status: 'completed', error: undefined });
                                        }
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 group/upload relative">
                              {scene.status === 'generating-image' ? (
                                <div className="flex flex-col items-center gap-3">
                                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                                  <span className="text-[10px] text-zinc-500 animate-pulse">তৈরি হচ্ছে...</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-4 w-full px-4">
                                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">মিডিয়া আপলোড</span>
                                  <div className="flex gap-3 w-full justify-center">
                                    {projectMode === 'image' ? (
                                      <label className="flex flex-col items-center gap-2 cursor-pointer hover:text-indigo-400 transition-colors">
                                        <div className="p-3 bg-white/5 rounded-full hover:bg-indigo-500/20 transition-all">
                                          <ImageIcon className="w-5 h-5 text-zinc-400" />
                                        </div>
                                        <span className="text-[10px] text-zinc-500">ছবি আপলোড</span>
                                        <input 
                                          type="file" 
                                          accept="image/*" 
                                          className="hidden" 
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              const objectUrl = URL.createObjectURL(file);
                                              updateSceneData(scene.id, { mediaUrl: objectUrl, mediaBlob: file, mediaType: 'image', status: 'completed', error: undefined });
                                            }
                                          }}
                                        />
                                      </label>
                                    ) : (
                                      <label className="flex flex-col items-center gap-2 cursor-pointer hover:text-indigo-400 transition-colors">
                                        <div className="p-3 bg-white/5 rounded-full hover:bg-indigo-500/20 transition-all">
                                          <Video className="w-5 h-5 text-zinc-400" />
                                        </div>
                                        <span className="text-[10px] text-zinc-500">ভিডিও আপলোড</span>
                                        <input 
                                          type="file" 
                                          accept="video/*" 
                                          className="hidden" 
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                              const objectUrl = URL.createObjectURL(file);
                                              updateSceneData(scene.id, { mediaUrl: objectUrl, mediaBlob: file, mediaType: 'video', status: 'completed', error: undefined });
                                            }
                                          }}
                                        />
                                      </label>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <div className="p-6 flex-1 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">সিন {idx + 1}</span>
                              {scene.characters && scene.characters.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                  {scene.characters.map((char, i) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[9px] font-bold text-indigo-400 uppercase">
                                      {char}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {scene.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          </div>
                          
                          {/* Story Segment */}
                          <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">গল্পের অংশ</span>
                              {scene.duration && (
                                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900/50 px-1.5 py-0.5 rounded border border-white/5">
                                  {scene.duration.toFixed(1)}s
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-zinc-200 leading-relaxed italic">"{scene.textSegment}"</p>
                          </div>

                          <div>
                             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">দৃশ্য বর্ণনা</span>
                             <p className="text-sm text-zinc-300 leading-relaxed">{scene.description}</p>
                          </div>
                          
                          {/* Prompt Section */}
                          <div className="space-y-4">
                            {projectMode === 'image' && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase">ইমেজ প্রম্পট</span>
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 rounded cursor-pointer transition-colors text-[10px] font-bold text-zinc-400 hover:text-indigo-400">
                                      <ImageIcon className="w-3 h-3" />
                                      <span>ছবি আপলোড</span>
                                      <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const objectUrl = URL.createObjectURL(file);
                                            updateSceneData(scene.id, { mediaUrl: objectUrl, mediaBlob: file, mediaType: 'image', status: 'completed', error: undefined });
                                          }
                                        }}
                                      />
                                    </label>
                                    <motion.button 
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={async () => {
                                        if (scene.status === 'generating-image') return;
                                        
                                        const keyToUse = apiKey || process.env.GEMINI_API_KEY;
                                        if (!keyToUse) {
                                          setError("API Key পাওয়া যায়নি। সেটিংস থেকে যুক্ত করুন।");
                                          return;
                                        }

                                        updateSceneData(scene.id, { status: 'generating-image', error: undefined });
                                        
                                        try {
                                          const ai = new GoogleGenAI({ apiKey: keyToUse });
                                          const imgParts: any[] = [{ text: scene.imagePrompt }];
                                          
                                          if (refImage) {
                                            imgParts.unshift({
                                              inlineData: {
                                                mimeType: "image/png",
                                                data: refImage.split(',')[1]
                                              }
                                            });
                                            imgParts[1].text = `CRITICAL: Generate an image that matches the character and style of the provided reference image. Prompt: ${scene.imagePrompt}`;
                                          }

                                          const imgResponse = await ai.models.generateContent({
                                            model: 'gemini-2.5-flash-image',
                                            contents: { parts: imgParts },
                                          });

                                          let base64Image = '';
                                          for (const part of imgResponse.candidates?.[0]?.content?.parts || []) {
                                            if (part.inlineData) {
                                              base64Image = part.inlineData.data;
                                              break;
                                            }
                                          }

                                          if (base64Image) {
                                            const imageUrl = `data:image/png;base64,${base64Image}`;
                                            updateSceneData(scene.id, {
                                              mediaUrl: imageUrl,
                                              mediaType: 'image',
                                              status: 'completed'
                                            });
                                          } else {
                                            throw new Error("Image generation failed.");
                                          }
                                        } catch (err: any) {
                                          console.error("Manual image generation failed:", err);
                                          updateSceneData(scene.id, { status: 'failed', error: err.message });
                                        }
                                      }}
                                      className={`p-2 rounded-lg transition-all ${scene.status === 'generating-image' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-white/5 text-zinc-400 hover:bg-indigo-500/20 hover:text-indigo-400'}`}
                                      title="ইমেজ জেনারেট করুন"
                                    >
                                      {scene.status === 'generating-image' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    </motion.button>
                                    <motion.button 
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => {
                                        navigator.clipboard.writeText(scene.imagePrompt);
                                        const btn = document.getElementById(`copy-btn-${scene.id}`);
                                        if (btn) {
                                          const originalContent = btn.innerHTML;
                                          btn.innerHTML = '<span class="text-emerald-500 flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> কপি হয়েছে</span>';
                                          setTimeout(() => { btn.innerHTML = originalContent; }, 2000);
                                        }
                                      }}
                                      id={`copy-btn-${scene.id}`}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-[10px] font-bold text-zinc-400 hover:text-indigo-400 border border-white/5"
                                      title="প্রম্পট কপি করুন"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>কপি</span>
                                    </motion.button>
                                  </div>
                                </div>
                                <p className="text-[11px] text-zinc-500 bg-black/20 p-3 rounded-xl border border-white/5 line-clamp-2 italic">
                                  {scene.imagePrompt}
                                </p>
                              </div>
                            )}

                            {projectMode === 'video' && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-zinc-500 uppercase">ভিডিও মোশন প্রম্পট</span>
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-white/10 rounded cursor-pointer transition-colors text-[10px] font-bold text-zinc-400 hover:text-indigo-400">
                                      <Video className="w-3 h-3" />
                                      <span>ভিডিও আপলোড</span>
                                      <input 
                                        type="file" 
                                        accept="video/*" 
                                        className="hidden" 
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) {
                                            const objectUrl = URL.createObjectURL(file);
                                            updateSceneData(scene.id, { mediaUrl: objectUrl, mediaBlob: file, mediaType: 'video', status: 'completed', error: undefined });
                                          }
                                        }}
                                      />
                                    </label>
                                    <motion.button 
                                      whileHover={{ scale: 1.1 }}
                                      whileTap={{ scale: 0.9 }}
                                      onClick={() => {
                                        navigator.clipboard.writeText(scene.videoPrompt);
                                        const btn = document.getElementById(`copy-video-btn-${scene.id}`);
                                        if (btn) {
                                          const originalContent = btn.innerHTML;
                                          btn.innerHTML = '<span class="text-emerald-500 flex items-center gap-1"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> কপি হয়েছে</span>';
                                          setTimeout(() => { btn.innerHTML = originalContent; }, 2000);
                                        }
                                      }}
                                      id={`copy-video-btn-${scene.id}`}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-[10px] font-bold text-zinc-400 hover:text-indigo-400 border border-white/5"
                                      title="ভিডিও প্রম্পট কপি করুন"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>কপি</span>
                                    </motion.button>
                                  </div>
                                </div>
                                <p className="text-[11px] text-zinc-500 bg-black/20 p-3 rounded-xl border border-white/5 line-clamp-2 italic">
                                  {scene.videoPrompt}
                                </p>
                              </div>
                            )}
                          </div>

                          {scene.error && (
                            <p className="text-[10px] text-amber-400 bg-amber-400/5 p-2 rounded border border-amber-400/10">
                              {scene.error}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Hidden Canvas for Recording - Must be in DOM and not 'display: none' for requestAnimationFrame */}
      <div className="fixed -left-[9999px] -top-[9999px] pointer-events-none opacity-0">
        <canvas ref={canvasRef} width={1920} height={1080} />
      </div>

      {/* Video Library Modal */}
      <AnimatePresence>
        {showLibrary && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLibrary(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[85vh] bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                    <Library className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">ভিডিও লাইব্রেরি</h2>
                    <p className="text-xs text-zinc-500">আপনার সেভ করা সব ভিডিও এখানে পাবেন</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowLibrary(false)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Active Jobs Section */}
                {activeJobId && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <h3 className="text-sm font-bold uppercase tracking-wider">রেন্ডারিং চলছে...</h3>
                    </div>
                    <div className="p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center animate-pulse">
                            <Film className="w-5 h-5 text-indigo-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-indigo-300">{statusText}</h4>
                            <p className="text-[10px] text-zinc-500">ব্যাকগ্রাউন্ডে প্রসেস হচ্ছে</p>
                          </div>
                        </div>
                        <span className="text-lg font-mono font-bold text-indigo-400">{recordingProgress}%</span>
                      </div>
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-indigo-500"
                          initial={{ width: 0 }}
                          animate={{ width: `${recordingProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {videoLibrary.length === 0 && !activeJobId ? (
                  <div className="h-64 flex flex-col items-center justify-center text-zinc-500 gap-4">
                    <History className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium">আপনার লাইব্রেরি এখন খালি</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {videoLibrary.map((video) => (
                      <motion.div
                        key={video.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group bg-black/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col"
                      >
                        <div className="aspect-video bg-black relative group-hover:ring-2 ring-indigo-500/50 transition-all">
                          <video
                            src={video.url}
                            controls
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLVideoElement;
                              target.style.display = 'none';
                              target.parentElement?.insertAdjacentHTML('beforeend', 
                                `<div class="absolute inset-0 flex flex-col items-center justify-center text-red-400 bg-zinc-900/80 p-4 text-center">
                                   <svg class="w-8 h-8 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                   <p class="text-xs font-bold">ভিডিওটি প্লে করা যাচ্ছে না</p>
                                   <p class="text-[10px] opacity-70 mt-1">ফরম্যাট সাপোর্টেড নাও হতে পারে</p>
                                 </div>`
                              );
                            }}
                          />
                        </div>
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-zinc-200 line-clamp-1">{video.title}</h3>
                              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                                {new Date(video.timestamp).toLocaleString('bn-BD')}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteFromLibrary(video.id)}
                              className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                              title="Delete from library"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <a
                                href={video.url}
                                download={`story-video-${video.id}.mp4`}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl text-xs font-bold transition-all border border-indigo-500/20"
                              >
                                <Download className="w-3.5 h-3.5" />
                                ভিডিও
                              </a>
                              
                              <a
                                href={`/api/jobs/${video.id}/download-zip`}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold transition-all border border-emerald-500/20"
                                title="ভিডিও এবং অডিও সহ জিপ ফাইল ডাউনলোড করুন"
                              >
                                <FileArchive className="w-3.5 h-3.5" />
                                জিপ (ZIP)
                              </a>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl max-h-[85vh] bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <History className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">প্রজেক্ট হিস্টরি</h2>
                    <p className="text-xs text-zinc-500">আপনার সেভ করা সব প্রজেক্ট এখানে পাবেন</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors text-zinc-400 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {history.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-zinc-500 gap-4">
                    <History className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium">আপনার প্রজেক্ট হিস্টরি এখন খালি</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {history.map((project) => (
                      <motion.div
                        key={project.id}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group bg-black/40 border border-white/5 rounded-2xl overflow-hidden flex flex-col"
                      >
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-zinc-200 line-clamp-2">{project.story.substring(0, 100)}...</h3>
                              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mt-1">
                                {new Date(project.timestamp).toLocaleString('bn-BD')} • {project.scenes.length} সিন
                              </p>
                            </div>
                            <button
                              onClick={() => deleteFromHistory(project.id)}
                              className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                              title="Delete from history"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => loadFromHistory(project)}
                              className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-bold transition-all border border-emerald-500/20"
                            >
                              <Download className="w-3.5 h-3.5" />
                              লোড করুন
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
