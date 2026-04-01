import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions, Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as Speech from "expo-speech";
import * as FileSystem from "expo-file-system/legacy";
import { Asset } from "expo-asset";
import axios from "axios";
import { useRouter, useLocalSearchParams } from "expo-router";
import Svg, { Path, Circle, Line } from "react-native-svg";
import type * as OrtType from "onnxruntime-react-native";
// Lazy-load to avoid crashing at module evaluation time (JSI not ready yet)
function getOrt(): typeof OrtType {
  return require("onnxruntime-react-native");
}
import * as jpeg from "jpeg-js";

// ─── ICONS ───────────────────────────────────────────────────────────────────
const IconEye = ({ size = 24, color = "#fff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M1 12C1 12 5 5 12 5C19 5 23 12 23 12C23 12 19 19 12 19C5 19 1 12 1 12Z"
      stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <Circle cx="12" cy="12" r="3.5" stroke={color} strokeWidth="2" />
    <Path d="M2 7L2 2L7 2"   stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M22 7L22 2L17 2" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M2 17L2 22L7 22"  stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M22 17L22 22L17 22" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);
const IconLight = ({ size = 24, color = "#fff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2" />
    <Line x1="12" y1="2"  x2="12" y2="5"  stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="2"  y1="12" x2="5"  y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="19" y1="12" x2="22" y2="12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="4.93" y1="4.93"   x2="7.05" y2="7.05"   stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="19.07" y1="4.93"  x2="16.95" y2="7.05"  stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Line x1="7.05" y1="16.95"  x2="4.93" y2="19.07"  stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);
const IconBlur = ({ size = 24, color = "#fff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" />
    <Path d="M12 2C12 2 15 7 14 12C13 17 12 22 12 22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M2 12C2 12 7 9 12 10C17 11 22 12 22 12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);
const IconSpeaker = ({ size = 22, color = "#fff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M11 5L6 9H3C2.45 9 2 9.45 2 10V14C2 14.55 2.45 15 3 15H6L11 19V5Z"
      stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <Path d="M15.54 8.46C16.48 9.4 17 10.67 17 12C17 13.33 16.48 14.6 15.54 15.54"
      stroke={color} strokeWidth="2" strokeLinecap="round" />
    <Path d="M19.07 4.93C20.96 6.82 22 9.35 22 12C22 14.65 20.96 17.18 19.07 19.07"
      stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);
const IconFlip = ({ size = 18, color = "#fff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M20 7H4C2.9 7 2 7.9 2 9V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V9C22 7.9 21.1 7 20 7Z"
      stroke={color} strokeWidth="2" strokeLinejoin="round" />
    <Circle cx="12" cy="13.5" r="3.5" stroke={color} strokeWidth="2" />
    <Path d="M9 4L12 1L15 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const NODE_URL        = "https://pl-api.iiit.ac.in/rcts/anemiav2/";
const DETECT_FACE_URL = `${NODE_URL}/detect-face`;
const SAVE_FRAME_URL  = `${NODE_URL}/save-frame`;
const SUBMIT_FORM_URL = `${NODE_URL}/submit-form`;

const MODEL_INPUT_SIZE      = 320;
const CONF_THRESHOLD_SERVER = 0.25; // server YOLO threshold
const CONF_THRESHOLD_DEVICE = 0.05; // on-device threshold (lower — device conf is smaller)
const SERVER_TIMEOUT_MS     = 2000; // 2s — if server misses this, fall to device
const SERVER_RECHECK_MS     = 10000;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const GUIDE_WIDTH  = 260;
const GUIDE_HEIGHT = 240;

// ─── Server reachability cache (module-level) ─────────────────────────────────
let _serverReachable = true;
let _lastServerCheck = 0;

async function isServerReachable(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastServerCheck < SERVER_RECHECK_MS) return _serverReachable;
  try {
    await axios.get(`${NODE_URL}/verify`, { timeout: 1000 });
    _serverReachable = true;
  } catch {
    _serverReachable = false;
  }
  _lastServerCheck = Date.now();
  return _serverReachable;
}

// ─── VOICE ───────────────────────────────────────────────────────────────────
type Lang = "en" | "hi" | "te";

const VOICE: Record<string, Record<Lang, { text: string; bcp47: string }>> = {
  alignFace: {
    en: { text: "Pull down your lower eyelid and fill the box with the pink area.", bcp47: "en-IN" },
    hi: { text: "निचली पलक को नीचे खींचें और गुलाबी हिस्से से बॉक्स भरें।",        bcp47: "hi-IN" },
    te: { text: "కింది రెప్పను కిందకు లాగి, గులాబీ భాగంతో బాక్స్ నింపండి.",         bcp47: "te-IN" },
  },
  lowLight: {
    en: { text: "Move to a brighter place.",                bcp47: "en-IN" },
    hi: { text: "रोशनी वाली जगह पर जाएं।",                  bcp47: "hi-IN" },
    te: { text: "వెలుతురు ఉన్న చోటికి వెళ్ళండి.",             bcp47: "te-IN" },
  },
  highLight: {
    en: { text: "Too much light. Move away from window.",   bcp47: "en-IN" },
    hi: { text: "बहुत रोशनी है। खिड़की से दूर जाएं।",        bcp47: "hi-IN" },
    te: { text: "చాలా వెలుతురు. కిటికీ నుండి దూరంగా వెళ్ళండి.", bcp47: "te-IN" },
  },
  holdStill: {
    en: { text: "Hold your phone steady.",                  bcp47: "en-IN" },
    hi: { text: "फोन को स्थिर रखें।",                       bcp47: "hi-IN" },
    te: { text: "ఫోన్‌ను స్థిరంగా పట్టుకోండి.",               bcp47: "te-IN" },
  },
  allGood: {
    en: { text: "Good! Tap Capture now.",                   bcp47: "en-IN" },
    hi: { text: "बढ़िया! अब कैप्चर दबाएं।",                  bcp47: "hi-IN" },
    te: { text: "బాగుంది! ఇప్పుడు క్యాప్చర్ నొక్కండి.",        bcp47: "te-IN" },
  },
};

function getProblemKey(detected: boolean, light: string, blur: string): string {
  if (!detected)        return "alignFace";
  if (light === "low")  return "lowLight";
  if (light === "high") return "highLight";
  if (blur  === "bad")  return "holdStill";
  return "allGood";
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface DetectionResult {
  detected:    boolean;
  confidence:  number;
  brightness:  number;
  blurScore:   number;
  lightStatus: string;
  blurStatus:  string;
  source:      "server" | "device";
}

// ─── On-device quality (Laplacian variance + mean luminance) ─────────────────
function computeQualityOnDevice(
  rgba: Uint8Array, width: number, height: number,
): { brightness: number; blurScore: number; lightStatus: string; blurStatus: string } {
  const n = width * height;
  let luma = 0;
  for (let i = 0; i < n; i++)
    luma += 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2];
  const brightness = luma / n;

  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++)
    gray[i] = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2];

  let lapSum = 0, lapSq = 0, cnt = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const lap =
        gray[(y-1)*width+x] + gray[(y+1)*width+x] +
        gray[y*width+(x-1)] + gray[y*width+(x+1)] -
        4 * gray[y*width+x];
      lapSum += lap; lapSq += lap*lap; cnt++;
    }
  }
  const lapMean  = lapSum / cnt;
  const blurScore = lapSq / cnt - lapMean * lapMean;

  return {
    brightness,
    blurScore,
    lightStatus: brightness < 60 ? "low" : brightness > 210 ? "high" : "good",
    blurStatus:  blurScore >= 35 ? "good" : "bad",
  };
}

// ─── Server detection (YOLO + Sharp quality) ─────────────────────────────────
async function detectViaServer(uri: string): Promise<DetectionResult> {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  const fd = new FormData();
  fd.append("image", { uri: resized.uri, name: "detect.jpg", type: "image/jpeg" } as any);

  const res = await axios.post(DETECT_FACE_URL, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: SERVER_TIMEOUT_MS,
  });
  const d = res.data;
  if (!d || typeof d.detected === "undefined") throw new Error("Bad server response");

  return {
    detected:    !!d.detected,
    confidence:  parseFloat(d.confidence)  || 0,
    brightness:  parseFloat(d.brightness)  || 0,
    blurScore:   parseFloat(d.blur_score)  || 0,
    lightStatus: d.light_status ?? "good",
    blurStatus:  d.blur_status  ?? "good",
    source:      "server",
  };
}

// ─── On-device ONNX inference ─────────────────────────────────────────────────
async function detectOnDevice(
  session: OrtType.InferenceSession, uri: string,
): Promise<DetectionResult> {
  const SIZE = MODEL_INPUT_SIZE;
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: SIZE, height: SIZE } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );

  const b64 = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);

  // Decode JPEG once → reuse pixels for quality AND ONNX
  const jpegData = jpeg.decode(raw, { useTArray: true });
  const quality  = computeQualityOnDevice(jpegData.data, jpegData.width, jpegData.height);

  // HWC(RGBA) → CHW(RGB) planar float32
  const pc  = SIZE * SIZE;
  const f32 = new Float32Array(3 * pc);
  for (let i = 0; i < pc; i++) {
    f32[i]          = jpegData.data[i*4]   / 255.0;
    f32[pc + i]     = jpegData.data[i*4+1] / 255.0;
    f32[pc*2 + i]   = jpegData.data[i*4+2] / 255.0;
  }

  const results = await session.run({
    [session.inputNames[0]]: new (getOrt().Tensor)("float32", f32, [1, 3, SIZE, SIZE]),
  });
  const output  = results[session.outputNames[0]];
  const outData = output.data as Float32Array;
  const dims    = output.dims;

  let maxConf = 0;
  if (dims.length === 3 && dims[2] >= 5) {
    for (let i = 0; i < dims[1]; i++) {
      const c = outData[i * dims[2] + 4];
      if (c > maxConf) maxConf = c;
    }
  }

  console.log(`[ONNX] conf=${maxConf.toFixed(4)} detected=${maxConf > CONF_THRESHOLD_DEVICE}`);
  return {
    detected:    maxConf > CONF_THRESHOLD_DEVICE,
    confidence:  maxConf,
    brightness:  quality.brightness,
    blurScore:   quality.blurScore,
    lightStatus: quality.lightStatus,
    blurStatus:  quality.blurStatus,
    source:      "device",
  };
}

// ─── SCREEN ──────────────────────────────────────────────────────────────────
export default function EyeCaptureScreen() {
  const router    = useRouter();
  const params    = useLocalSearchParams<any>();
  const cameraRef = useRef<CameraView>(null);

  // Which eye: "left" (default) or "right"
  const eyeSide: "left" | "right" = params.eyeSide === "right" ? "right" : "left";
  const sideLabel = eyeSide === "left" ? "LEFT Eye" : "RIGHT Eye";
  const sideColor = eyeSide === "left" ? "#4c9fff" : "#ff7043";

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady,  setCameraReady]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [lang,         setLang]         = useState<Lang>("en");
  const [facing,       setFacing]       = useState<"front" | "back">("front");

  const [isEyeDetected, setIsEyeDetected] = useState(false);
  const [confidence,    setConfidence]    = useState(0);
  const [brightness,    setBrightness]    = useState(0);
  const [blurScore,     setBlurScore]     = useState(0);
  const [lightStatus,   setLightStatus]   = useState("low");
  const [blurStatus,    setBlurStatus]    = useState("bad");
  const [isSpeaking,    setIsSpeaking]    = useState(false);
  const [detSource,     setDetSource]     = useState<"server" | "device">("device");
  const [topPanelHeight, setTopPanelHeight] = useState(0); // measured at runtime

  // All refs declared before any useEffect
  const sessionRef     = useRef<OrtType.InferenceSession | null>(null);
  const loadingRef     = useRef(false);
  const lastSpokenKey  = useRef<string | null>(null);
  const lastSpokenTime = useRef<number>(0);
  const lastFrameUri   = useRef<string | null>(null);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { requestPermission(); }, []);
  useEffect(() => () => { Speech.stop(); }, []);

  // ─── Load ONNX model (fallback for offline use) ───────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setModelLoading(true);
        const asset = Asset.fromModule(require("../assets/yolo-26-n-best.onnx"));
        await asset.downloadAsync();
        const dest = FileSystem.cacheDirectory + "yolo-26-n-best.onnx";
        const info = await FileSystem.getInfoAsync(dest);
        if (!info.exists) {
          await FileSystem.copyAsync({ from: asset.localUri!, to: dest });
        }
        const session = await getOrt().InferenceSession.create(dest, { executionProviders: ["cpu"] });
        sessionRef.current = session;
        console.log("✅ On-device model ready:", session.inputNames, session.outputNames);
      } catch (e: any) {
        console.error("❌ Model load failed:", e?.message ?? String(e));
      } finally {
        setModelLoading(false);
      }
    })();
  }, []);

  const allGood = isEyeDetected && lightStatus === "good" && blurStatus === "good";

  // ─── Voice guidance ───────────────────────────────────────────────────────
  const speakNow = useCallback((key: string, l: Lang = lang) => {
    const entry = VOICE[key]?.[l];
    if (!entry) return;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(entry.text, {
      language:  entry.bcp47, rate: 1.0, pitch: 1.0,
      onDone:    () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError:   () => setIsSpeaking(false),
    });
  }, [lang]);

  useEffect(() => {
    if (loading) return;
    const key = getProblemKey(isEyeDetected, lightStatus, blurStatus);
    const now = Date.now();
    if (key !== lastSpokenKey.current || now - lastSpokenTime.current > 8000) {
      lastSpokenKey.current  = key;
      lastSpokenTime.current = now;
      speakNow(key, lang);
    }
  }, [isEyeDetected, lightStatus, blurStatus, loading]);

  useEffect(() => {
    const key = getProblemKey(isEyeDetected, lightStatus, blurStatus);
    lastSpokenKey.current  = key;
    lastSpokenTime.current = Date.now();
    speakNow(key, lang);
  }, [lang]);

  // ─── Detection loop ───────────────────────────────────────────────────────
  useEffect(() => {
    let running = true, processing = false;

    const loop = async () => {
      while (running) {
        if (!cameraRef.current || !cameraReady || processing || loadingRef.current || modelLoading) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        processing = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.4, skipProcessing: true, shutterSound: false,
          });
          lastFrameUri.current = photo.uri;

          let result: DetectionResult;
          const serverOk = await isServerReachable();

          if (serverOk) {
            try {
              const serverResult = await detectViaServer(photo.uri);
              _serverReachable = true;

              // Server reachable but YOLO gave 0 conf → use on-device ONNX for detection
              // but keep server quality values (Sharp > pixel math)
              if (serverResult.confidence < 0.01 && sessionRef.current) {
                const devResult = await detectOnDevice(sessionRef.current, photo.uri);
                result = {
                  ...devResult,
                  brightness:  serverResult.brightness,
                  blurScore:   serverResult.blurScore,
                  lightStatus: serverResult.lightStatus,
                  blurStatus:  serverResult.blurStatus,
                  source:      "device",
                };
              } else {
                result = serverResult;
              }
            } catch (serverErr: any) {
              _serverReachable = false;
              _lastServerCheck = Date.now();
              console.warn(`[loop] server fail: ${serverErr?.message}`);
              if (!sessionRef.current) {
                processing = false;
                await new Promise((r) => setTimeout(r, 500));
                continue;
              }
              result = await detectOnDevice(sessionRef.current, photo.uri);
            }
          } else {
            if (!sessionRef.current) {
              processing = false;
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            result = await detectOnDevice(sessionRef.current, photo.uri);
          }

          console.log(
            `[loop] ${result.source.toUpperCase()}` +
            ` conf=${result.confidence.toFixed(3)}` +
            ` light=${result.lightStatus}(${result.brightness.toFixed(0)})` +
            ` blur=${result.blurStatus}(${result.blurScore.toFixed(0)})`
          );

          setIsEyeDetected(result.detected);
          setConfidence(result.confidence);
          setBrightness(result.brightness);
          setBlurScore(result.blurScore);
          setLightStatus(result.lightStatus);
          setBlurStatus(result.blurStatus);
          setDetSource(result.source);
        } catch (e: any) {
          console.warn("[loop] skipping frame:", e?.message);
        }
        processing = false;
        await new Promise((r) => setTimeout(r, 400));
      }
    };

    if (cameraReady && !modelLoading) loop();
    return () => { running = false; };
  }, [cameraReady, modelLoading]);

  // ─── CAPTURE ─────────────────────────────────────────────────────────────
  const captureEye = async () => {
    if (!allGood || loading) return;
    const frameUri = lastFrameUri.current;
    if (!frameUri) { Alert.alert("Not ready", "Please wait."); return; }

    setLoading(true);
    Speech.stop();

    try {
      // 1. Take a fresh full-res photo for the final capture
      const finalPhoto = await cameraRef.current!.takePictureAsync({
        quality: 1.0, skipProcessing: false, shutterSound: false,
      });

      // 2. Get actual photo dimensions
      const photoInfo = await ImageManipulator.manipulateAsync(
        finalPhoto.uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
      );
      const photoW = photoInfo.width;
      const photoH = photoInfo.height;

      // 3. Compute scale from SCREEN → PHOTO coordinates
      //    The camera feed fills the full screen (StyleSheet.absoluteFill),
      //    but the guide box is centered in the cameraWindow area which starts
      //    below the topPanel. We use the measured topPanelHeight for this.
      const scaleX = photoW / SCREEN_WIDTH;
      const scaleY = photoH / SCREEN_HEIGHT;

      // Camera window height = screen height minus top panel and capture area
      // Guide is centered vertically within the camera window
      const CAPTURE_AREA_HEIGHT = 110; // approx height of bottom capture bar
      const cameraWindowH = SCREEN_HEIGHT - topPanelHeight - CAPTURE_AREA_HEIGHT;
      const cameraWindowTop = topPanelHeight;

      // Guide center in screen coords
      const guideCenterX = SCREEN_WIDTH / 2;
      const guideCenterY = cameraWindowTop + cameraWindowH / 2;

      // Guide top-left in screen coords
      const guideLeft = guideCenterX - GUIDE_WIDTH  / 2;
      const guideTop  = guideCenterY - GUIDE_HEIGHT / 2;

      // Convert to photo pixel coords
      const cropX = Math.max(0, Math.round(guideLeft * scaleX));
      const cropY = Math.max(0, Math.round(guideTop  * scaleY));
      const cropW = Math.min(Math.round(GUIDE_WIDTH  * scaleX), photoW - cropX);
      const cropH = Math.min(Math.round(GUIDE_HEIGHT * scaleY), photoH - cropY);

      console.log(`[capture] photo=${photoW}×${photoH} scale=${scaleX.toFixed(2)}×${scaleY.toFixed(2)}`);
      console.log(`[capture] crop x=${cropX} y=${cropY} w=${cropW} h=${cropH}`);
      console.log(`[capture] topPanel=${topPanelHeight} camWin=${cameraWindowH} guideTop=${guideTop.toFixed(0)}`);

      const cropped = await ImageManipulator.manipulateAsync(
        finalPhoto.uri,
        [
          { crop: { originX: cropX, originY: cropY, width: cropW, height: cropH } },
          { resize: { width: 512, height: 512 } },
        ],
        { compress: 1, format: ImageManipulator.SaveFormat.JPEG },
      );

      const sessionId = (params.eyeSessionId as string) || `session_${Date.now()}`;

      // 2. Build return params
      const returnParams: Record<string, string> = { ...(params as any), eyeSessionId: sessionId };
      if (eyeSide === "left") {
        returnParams.leftEyeImage = cropped.uri;
      } else {
        returnParams.rightEyeImage = cropped.uri;
      }

      // 3. Navigate back immediately — don't wait for server
      router.replace({ pathname: "/", params: returnParams });

      // 4. Upload to server in background (single attempt, short timeout, silent fail)
      ;(async () => {
        try {
          const fd = new FormData();
          fd.append("image",      { uri: cropped.uri, name: `${eyeSide}.jpg`, type: "image/jpeg" } as any);
          fd.append("session_id", sessionId);
          fd.append("color_name", eyeSide);
          await axios.post(SAVE_FRAME_URL, fd, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 5000,
          });
          console.log(`[bg] ✅ ${eyeSide} saved to server`);

          if (eyeSide === "right") {
            const fd2 = new FormData();
            fd2.append("session_id", sessionId);
            fd2.append("best_color", "left");
            await axios.post(SUBMIT_FORM_URL, fd2, {
              headers: { "Content-Type": "multipart/form-data" },
              timeout: 5000,
            });
            console.log("[bg] ✅ session submitted");
          }
        } catch {
          // Server unreachable — local URI is the source of truth for submit
        }
      })();

    } catch (e) {
      Alert.alert("Capture failed", "Please try again.");
      setLoading(false);
    }
    // No setLoading(false) — router.replace unmounts this screen
  };

  const problemKey = getProblemKey(isEyeDetected, lightStatus, blurStatus);
  const instrText  = VOICE[problemKey]?.[lang]?.text ?? "";

  if (!permission) {
    return <View style={s.container}><ActivityIndicator color="#00c853" /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.permText}>Camera permission required.</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        onCameraReady={() => setCameraReady(true)}
      />

      {modelLoading && (
        <View style={s.modelOverlay}>
          <ActivityIndicator color="#00c853" size="large" />
          <Text style={s.modelText}>Loading model…</Text>
        </View>
      )}

      {/* ── TOP PANEL ──────────────────────────────────────────────────────── */}
      <View
        style={s.topPanel}
        onLayout={(e) => setTopPanelHeight(e.nativeEvent.layout.height)}
      >

        {/* Eye side badge */}
        <View style={[s.sideBadge, { backgroundColor: sideColor + "33", borderColor: sideColor }]}>
          <Text style={[s.sideBadgeText, { color: sideColor }]}>👁 Capturing: {sideLabel}</Text>
        </View>

        {/* Language + Flip */}
        <View style={s.controlRow}>
          <View style={s.radioGroup}>
            {(["en", "hi", "te"] as Lang[]).map((l, idx) => (
              <TouchableOpacity
                key={l}
                style={[
                  s.radioBtn,
                  idx === 0 && s.radioBtnFirst,
                  idx === 2 && s.radioBtnLast,
                  lang === l && s.radioBtnActive,
                ]}
                onPress={() => setLang(l)}
                activeOpacity={0.8}
              >
                <View style={[s.radioCircle, lang === l && s.radioCircleActive]}>
                  {lang === l && <View style={s.radioInner} />}
                </View>
                <Text style={[s.radioLabel, lang === l && s.radioLabelActive]}>
                  {l === "en" ? "EN" : l === "hi" ? "हि" : "తె"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={s.flipBtn}
            onPress={() => {
              setCameraReady(false);
              setFacing((f) => (f === "front" ? "back" : "front"));
              setTimeout(() => setCameraReady(true), 300);
            }}
            activeOpacity={0.75}
          >
            <IconFlip size={16} color="#fff" />
            <Text style={s.flipLabel}>Flip</Text>
          </TouchableOpacity>
        </View>

        {/* Indicators */}
        <View style={s.indicatorRow}>
          {[
            { icon: <IconEye   size={20} color="#fff" />, label: "EYE",   ok: isEyeDetected          },
            { icon: <IconLight size={20} color="#fff" />, label: "LIGHT", ok: lightStatus === "good"  },
            { icon: <IconBlur  size={20} color="#fff" />, label: "BLUR",  ok: blurStatus  === "good"  },
          ].map(({ icon, label, ok }) => (
            <View key={label} style={s.indicator}>
              <View style={s.indicatorHeader}>{icon}<Text style={s.indicatorLabel}>{label}</Text></View>
              <View style={[s.indicatorBlock, { backgroundColor: ok ? "#a8e6a3" : "#f4a97f" }]} />
            </View>
          ))}
        </View>

        {/* Instruction */}
        <View style={[s.instrBox, { borderColor: allGood ? "#00e676" : "rgba(255,255,255,0.15)" }]}>
          {isSpeaking && (
            <View style={s.speakingDot}>
              <View style={[s.speakingPulse, { backgroundColor: allGood ? "#00e676" : "#f4a97f" }]} />
            </View>
          )}
          <Text style={[s.instrText, { color: allGood ? "#00e676" : "#fff" }]}>{instrText}</Text>
          <TouchableOpacity
            style={s.speakBtn}
            onPress={() => { lastSpokenKey.current = null; lastSpokenTime.current = 0; speakNow(problemKey); }}
            activeOpacity={0.7}
          >
            <IconSpeaker size={20} color={allGood ? "#00e676" : "#fff"} />
          </TouchableOpacity>
        </View>

        {/* Hint */}
        <View style={s.hintBox}>
          <Text style={s.hintText}>
            📱 Hold 10–15 cm from eye  •  Pull down lower eyelid  •  Show pink area
          </Text>
        </View>
      </View>

      {/* ── CAMERA GUIDE ──────────────────────────────────────────────────── */}
      <View style={s.cameraWindow}>
        <View style={[s.guide, { borderColor: allGood ? "#00ff66" : sideColor }]}>
          {(["TL","TR","BL","BR"] as const).map((c) => (
            <View key={c} style={[s.corner, s[`corner${c}`], { borderColor: allGood ? "#00ff66" : sideColor }]} />
          ))}
          <View style={s.verticalLine} />
          <View style={s.horizontalLine} />
          <View style={[s.centerDot, { borderColor: allGood ? "#00ff66" : sideColor }]} />
        </View>
      </View>

      {/* ── CAPTURE BUTTON ────────────────────────────────────────────────── */}
      <View style={s.captureArea}>
        <TouchableOpacity
          style={[
            s.captureBtn,
            { backgroundColor: allGood ? "#00c853" : "#2a2a2a", borderColor: allGood ? "#00ff66" : "#444" },
          ]}
          onPress={captureEye}
          disabled={!allGood || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="large" />
            : <Text style={[s.captureBtnText, { opacity: allGood ? 1 : 0.4 }]}>
                {allGood ? `CAPTURE ${eyeSide.toUpperCase()}` : modelLoading ? "Loading…" : "Waiting..."}
              </Text>
          }
        </TouchableOpacity>
        <Text style={s.debugText}>
          {`Conf: ${(confidence*100).toFixed(0)}%  |  Bright: ${brightness.toFixed(0)}  |  Blur: ${blurScore.toFixed(0)}  |  ${detSource === "server" ? "🌐 Server" : "🤖 On-Device"}`}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center:    { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  permText:    { color: "#fff", fontSize: 16, marginBottom: 20, textAlign: "center", paddingHorizontal: 30 },
  permBtn:     { backgroundColor: "#00c853", paddingVertical: 14, paddingHorizontal: 30, borderRadius: 12 },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  modelOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center", alignItems: "center", zIndex: 99,
  },
  modelText: { color: "#fff", marginTop: 14, fontSize: 15, fontWeight: "600" },

  topPanel: {
    paddingTop: 54, paddingHorizontal: 12, paddingBottom: 10,
    backgroundColor: "rgba(0,0,0,0.80)", gap: 8, zIndex: 10,
  },

  sideBadge:     { borderWidth: 1.5, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 14, alignSelf: "center" },
  sideBadgeText: { fontWeight: "800", fontSize: 15, letterSpacing: 0.5 },

  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  radioGroup:        { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  radioBtn:          { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.07)", gap: 6, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.15)" },
  radioBtnFirst:     { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  radioBtnLast:      { borderTopRightRadius: 10, borderBottomRightRadius: 10, borderRightWidth: 0 },
  radioBtnActive:    { backgroundColor: "rgba(255,215,0,0.18)" },
  radioCircle:       { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.45)", justifyContent: "center", alignItems: "center" },
  radioCircleActive: { borderColor: "#FFD700" },
  radioInner:        { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFD700" },
  radioLabel:        { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
  radioLabelActive:  { color: "#FFD700" },

  flipBtn:   { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", gap: 5 },
  flipLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },

  indicatorRow:    { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  indicator:       { flex: 1, alignItems: "flex-start", gap: 6 },
  indicatorHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  indicatorLabel:  { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  indicatorBlock:  { width: "100%", height: 26, borderRadius: 10 },

  instrBox:      { borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  speakingDot:   { marginRight: 10, justifyContent: "center", alignItems: "center" },
  speakingPulse: { width: 10, height: 10, borderRadius: 5, opacity: 0.9 },
  instrText:     { flex: 1, fontSize: 15, fontWeight: "700" },
  speakBtn:      { paddingLeft: 10 },

  hintBox:  { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12 },
  hintText: { color: "rgba(255,255,255,0.55)", fontSize: 11, textAlign: "center" },

  cameraWindow: { flex: 1, justifyContent: "center", alignItems: "center" },

  guide:          { width: GUIDE_WIDTH, height: GUIDE_HEIGHT, borderWidth: 2, borderRadius: 20, borderStyle: "dashed", justifyContent: "center", alignItems: "center" },
  corner:         { position: "absolute", width: 22, height: 22, borderWidth: 3 },
  cornerTL:       { top: -2,    left: -2,  borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 8 },
  cornerTR:       { top: -2,    right: -2, borderBottomWidth: 0, borderLeftWidth: 0,  borderTopRightRadius: 8 },
  cornerBL:       { bottom: -2, left: -2,  borderTopWidth: 0,    borderRightWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR:       { bottom: -2, right: -2, borderTopWidth: 0,    borderLeftWidth: 0,  borderBottomRightRadius: 8 },
  verticalLine:   { position: "absolute", width: 1,  height: "80%", backgroundColor: "rgba(255,255,255,0.2)" },
  horizontalLine: { position: "absolute", height: 1, width: "80%",  backgroundColor: "rgba(255,255,255,0.2)" },
  centerDot:      { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },

  captureArea:     { paddingVertical: 20, alignItems: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.65)" },
  captureBtn:      { paddingVertical: 18, paddingHorizontal: 56, borderRadius: 80, borderWidth: 2, alignItems: "center", justifyContent: "center", minWidth: 200 },
  captureBtnText:  { color: "#fff", fontSize: 20, fontWeight: "bold" },
  debugText:       { color: "rgba(255,255,255,0.3)", fontSize: 10 },
});