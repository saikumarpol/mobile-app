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
function getOrt(): typeof OrtType {
  return require("onnxruntime-react-native");
}
import * as jpeg from "jpeg-js";
import { useAssets } from "expo-asset";

// ─── ICONS ───────────────────────────────────────────────────────────────────
const IconPerson = ({ size = 24, color = "#fff" }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="5" r="3" stroke={color} strokeWidth="2" />
    <Path d="M5 21V16C5 13.8 6.8 12 9 12H15C17.2 12 19 13.8 19 16V21"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M9 12V21M15 12V21" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <Path d="M2 8 L2 2 L8 2"    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M22 8 L22 2 L16 2" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M2 16 L2 22 L8 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <Path d="M22 16 L22 22 L16 22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
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
const NODE_URL    = "https://pl-api.iiit.ac.in/rcts/anemiav2/";
const QUALITY_URL = `${NODE_URL}/check-quality`;

const MODEL_INPUT_SIZE = 640;
const PERSON_CLASS_ID  = 0;
const CONF_THRESHOLD   = 0.35;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const GUIDE_SIZE = 280;

// ─── Server reachability cache ───────────────────────────────────────────────
let _serverReachable = true;
let _lastServerCheck = 0;

async function isServerReachable(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastServerCheck < 10000) return _serverReachable; // 10s cache

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
  alignBody: {
    en: { text: "Make the child stand fully inside the box.",      bcp47: "en-IN" },
    hi: { text: "बच्चे को बॉक्स के अंदर पूरा खड़ा करें।",         bcp47: "hi-IN" },
    te: { text: "పిల్లవాడిని బాక్స్‌లో పూర్తిగా నిలబెట్టండి.",    bcp47: "te-IN" },
  },
  lowLight: {
    en: { text: "Move to a brighter place.",                       bcp47: "en-IN" },
    hi: { text: "रोशनी वाली जगह पर जाएं।",                        bcp47: "hi-IN" },
    te: { text: "వెలుతురు ఉన్న చోటికి వెళ్ళండి.",                 bcp47: "te-IN" },
  },
  highLight: {
    en: { text: "Too much light. Move away from direct sunlight.", bcp47: "en-IN" },
    hi: { text: "बहुत रोशनी है। सीधी धूप से दूर जाएं।",           bcp47: "hi-IN" },
    te: { text: "చాలా వెలుతురు. నేరు సూర్యకాంతి నుండి దూరంగా వెళ్ళండి.", bcp47: "te-IN" },
  },
  holdStill: {
    en: { text: "Hold the phone steady.",                          bcp47: "en-IN" },
    hi: { text: "फोन को स्थिर रखें।",                              bcp47: "hi-IN" },
    te: { text: "ఫోన్‌ను స్థిరంగా పట్టుకోండి.",                   bcp47: "te-IN" },
  },
  allGood: {
    en: { text: "Perfect! Tap Capture.",                           bcp47: "en-IN" },
    hi: { text: "बढ़िया! कैप्चर दबाएं।",                           bcp47: "hi-IN" },
    te: { text: "బాగుంది! క్యాప్చర్ నొక్కండి.",                    bcp47: "te-IN" },
  },
};

function getProblemKey(detected: boolean, light: string, blur: string): string {
  if (!detected)       return "alignBody";
  if (light === "low") return "lowLight";
  if (light === "high") return "highLight";
  if (blur === "bad")  return "holdStill";
  return "allGood";
}

// ─── On-device quality (Same as EyeCapture - proven stable) ─────────────────
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

// ─── Quality check via Server (optional) ─────────────────────────────────────
async function checkQualityOnServer(uri: string) {
  try {
    const resized = await ImageManipulator.manipulateAsync(
      uri, [{ resize: { width: 320, height: 240 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    const fd = new FormData();
    fd.append("image", { uri: resized.uri, name: "quality.jpg", type: "image/jpeg" } as any);

    const res = await axios.post(QUALITY_URL, fd, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 1500,
    });

    if (res.data?.success) {
      return {
        brightness:  res.data.brightness   ?? 128,
        blurScore:   res.data.blur_score   ?? 50,
        lightStatus: res.data.light_status ?? "good",
        blurStatus:  res.data.blur_status  ?? "good",
      };
    }
    throw new Error("Bad response");
  } catch {
    throw new Error("Server quality failed");
  }
}

// ─── On-device ONNX person detection ─────────────────────────────────────────
async function runPersonDetectionOnDevice(
  session: OrtType.InferenceSession,
  uri: string,
): Promise<{ detected: boolean; confidence: number }> {
  try {
    const SIZE = MODEL_INPUT_SIZE;
    const resized = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: SIZE, height: SIZE } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );

    const b64 = await FileSystem.readAsStringAsync(resized.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryStr = atob(b64);
    const raw = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) raw[i] = binaryStr.charCodeAt(i);

    const jpegData = jpeg.decode(raw, { useTArray: true });

    const pc  = SIZE * SIZE;
    const f32 = new Float32Array(3 * pc);
    for (let i = 0; i < pc; i++) {
      f32[i]          = jpegData.data[i * 4]     / 255.0;
      f32[pc + i]     = jpegData.data[i * 4 + 1] / 255.0;
      f32[pc * 2 + i] = jpegData.data[i * 4 + 2] / 255.0;
    }

    const inputTensor = new (getOrt().Tensor)("float32", f32, [1, 3, SIZE, SIZE]);
    const results     = await session.run({ [session.inputNames[0]]: inputTensor });

    const output  = results[session.outputNames[0]];
    const outData = output.data as Float32Array;
    const dims    = output.dims;

    let maxConf = 0;
    if (dims.length === 3) {
      const numBoxes = dims[2];
      for (let i = 0; i < numBoxes; i++) {
        const personScore = outData[(4 + PERSON_CLASS_ID) * numBoxes + i];
        if (personScore > maxConf) maxConf = personScore;
      }
    }

    console.log(`[Person-ONNX] conf=${maxConf.toFixed(4)} detected=${maxConf > CONF_THRESHOLD}`);
    return { detected: maxConf > CONF_THRESHOLD, confidence: maxConf };

  } catch (e: any) {
    console.error("[Person-ONNX] error:", e?.message ?? String(e));
    return { detected: false, confidence: 0 };
  }
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function HeightCaptureScreen() {
  const router    = useRouter();
  const params    = useLocalSearchParams();
  const cameraRef = useRef<CameraView>(null);

  const [assets ,error ] = useAssets([
    require('../assets/yolov8n.onnx'),
  ]) 

  //console.log("assets:", assets, "error:", error);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady,  setCameraReady]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [lang,         setLang]         = useState<Lang>("en");
  const [facing,       setFacing]       = useState<"front" | "back">("back");

  const [isDetected,  setIsDetected]  = useState(false);
  const [confidence,  setConfidence]  = useState(0);
  const [brightness,  setBrightness]  = useState(0);
  const [blurScore,   setBlurScore]   = useState(0);
  const [lightStatus, setLightStatus] = useState("low");
  const [blurStatus,  setBlurStatus]  = useState("bad");
  const [isSpeaking,  setIsSpeaking]  = useState(false);

  const sessionRef     = useRef<OrtType.InferenceSession | null>(null);
  const loadingRef     = useRef(false);
  const lastSpokenKey  = useRef<string | null>(null);
  const lastSpokenTime = useRef<number>(0);
  const lastFrameUri   = useRef<string | null>(null);

  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { requestPermission(); }, []);
  useEffect(() => () => { Speech.stop(); }, []);

  // Load ONNX model
  useEffect(() => {
    (async () => {
      try {
        setModelLoading(true);
        //const asset = Asset.fromModule(require("../assets/yolov8n.onnx"));
       // const localurl = await asset.downloadAsync();
        //const modelDest = FileSystem.cacheDirectory + "yolov8n.onnx";
        // const info = await FileSystem.getInfoAsync(modelDest);
        // if (!info.exists) {
        //   await FileSystem.copyAsync({ from: localurl.uri, to: modelDest });
        // }
        if(!assets || assets.length === 0 || !assets[0].localUri) return
        const session = await getOrt().InferenceSession.create(assets[0].localUri, {
          executionProviders: ["cpu"],
        });
        sessionRef.current = session;
        console.log("✅ Person model loaded successfully");
      } catch (e: any) {
        console.error("❌ Person model load failed:", e?.message ?? String(e));
        Alert.alert("Model Error", "Failed to load person detection model.");
      } finally {
        setModelLoading(false);
      }
    })();
  }, [assets]);

  const allGood = isDetected && lightStatus === "good" && blurStatus === "good";

  // Voice guidance
  const speakNow = useCallback((key: string, l: Lang = lang) => {
    const entry = VOICE[key]?.[l];
    if (!entry) return;
    Speech.stop();
    setIsSpeaking(true);
    Speech.speak(entry.text, {
      language: entry.bcp47, rate: 1.0, pitch: 1.0,
      onDone:    () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError:   () => setIsSpeaking(false),
    });
  }, [lang]);

  useEffect(() => {
    if (loading) return;
    const key = getProblemKey(isDetected, lightStatus, blurStatus);
    const now = Date.now();
    if (key !== lastSpokenKey.current || now - lastSpokenTime.current > 8000) {
      lastSpokenKey.current  = key;
      lastSpokenTime.current = now;
      speakNow(key, lang);
    }
  }, [isDetected, lightStatus, blurStatus, loading, lang]);

  useEffect(() => {
    const key = getProblemKey(isDetected, lightStatus, blurStatus);
    lastSpokenKey.current  = key;
    lastSpokenTime.current = Date.now();
    speakNow(key, lang);
  }, [lang]);

  // Detection loop with robust quality fallback
  useEffect(() => {
    let running = true, processing = false;

    const loop = async () => {
      while (running) {
        if (!cameraRef.current || !cameraReady || processing || loadingRef.current || modelLoading || !sessionRef.current) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        processing = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.4, skipProcessing: true, shutterSound: false,
          });
          lastFrameUri.current = photo.uri;

          const [person, quality] = await Promise.all([
            runPersonDetectionOnDevice(sessionRef.current!, photo.uri),
            (async () => {
              try {
                if (await isServerReachable()) {
                  return await checkQualityOnServer(photo.uri);
                }
                throw new Error("Server unreachable");
              } catch {
                // Fallback to on-device quality
                const resized = await ImageManipulator.manipulateAsync(
                  photo.uri,
                  [{ resize: { width: 320, height: 240 } }],
                  { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
                );
                const b64 = await FileSystem.readAsStringAsync(resized.uri, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                const bin = atob(b64);
                const raw = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);

                const jpegData = jpeg.decode(raw, { useTArray: true });
                return computeQualityOnDevice(jpegData.data, jpegData.width, jpegData.height);
              }
            })()
          ]);

          setIsDetected(person.detected);
          setConfidence(person.confidence);
          setBrightness(quality.brightness);
          setBlurScore(quality.blurScore);
          setLightStatus(quality.lightStatus);
          setBlurStatus(quality.blurStatus);

        } catch (e: any) {
          console.warn("[loop] skipping frame:", e?.message);
        }
        processing = false;
        await new Promise((r) => setTimeout(r, 500));
      }
    };

    if (cameraReady && !modelLoading) loop();
    return () => { running = false; };
  }, [cameraReady, modelLoading]);

  // Capture function
  const captureHeight = async () => {
    if (!allGood || loading) return;
    const frameUri = lastFrameUri.current;
    if (!frameUri) {
      Alert.alert("Not ready", "Please wait a moment.");
      return;
    }

    setLoading(true);
    Speech.stop();

    try {
      const tmp = await ImageManipulator.manipulateAsync(frameUri, [], {
        compress: 1, format: ImageManipulator.SaveFormat.JPEG,
      });

      const sX = tmp.width / SCREEN_WIDTH;
      const sY = tmp.height / SCREEN_HEIGHT;

      const guideLeft = (SCREEN_WIDTH - GUIDE_SIZE) / 2;
      const guideTop  = (SCREEN_HEIGHT - GUIDE_SIZE) / 2;

      const cropped = await ImageManipulator.manipulateAsync(
        frameUri,
        [
          {
            crop: {
              originX: Math.max(0, guideLeft * sX),
              originY: Math.max(0, guideTop * sY),
              width: Math.min(GUIDE_SIZE * sX, tmp.width),
              height: Math.min(GUIDE_SIZE * sY, tmp.height),
            },
          },
          { resize: { width: 512, height: 512 } },
        ],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      );

      router.replace({
        pathname: "/",
        params: { ...params, heightImage: cropped.uri },
      });
    } catch (e) {
      Alert.alert("Capture failed", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const problemKey = getProblemKey(isDetected, lightStatus, blurStatus);
  const instrText = VOICE[problemKey]?.[lang]?.text ?? "";

  if(error) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Failed to load assets.</Text>
        <Text style={styles.permText}>{error.message}</Text>
      </View>
    )
  }

  if (!permission) return <View style={styles.container}><ActivityIndicator color="#00c853" /></View>;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera permission required.</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        onCameraReady={() => setCameraReady(true)}
      />

      {modelLoading && (
        <View style={styles.modelOverlay}>
          <ActivityIndicator color="#00c853" size="large" />
          <Text style={styles.modelText}>Loading model on device…</Text>
        </View>
      )}

      {/* Top Panel */}
      <View style={styles.topSafeArea}>
        <View style={styles.controlRow}>
          <View style={styles.radioGroup}>
            {(["en", "hi", "te"] as Lang[]).map((l, idx) => (
              <TouchableOpacity
                key={l}
                style={[
                  styles.radioBtn,
                  idx === 0 && styles.radioBtnFirst,
                  idx === 2 && styles.radioBtnLast,
                  lang === l && styles.radioBtnActive,
                ]}
                onPress={() => setLang(l)}
                activeOpacity={0.8}
              >
                <View style={[styles.radioCircle, lang === l && styles.radioCircleActive]}>
                  {lang === l && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.radioLabel, lang === l && styles.radioLabelActive]}>
                  {l === "en" ? "EN" : l === "hi" ? "हि" : "తె"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.flipBtn}
            onPress={() => {
              setCameraReady(false);
              setFacing((f) => (f === "front" ? "back" : "front"));
              setTimeout(() => setCameraReady(true), 300);
            }}
            activeOpacity={0.75}
          >
            <IconFlip size={16} color="#fff" />
            <Text style={styles.flipLabel}>Flip</Text>
          </TouchableOpacity>
        </View>

        {/* Indicators */}
        <View style={styles.indicatorRow}>
          <View style={styles.indicator}>
            <View style={styles.indicatorHeader}>
              <IconPerson size={20} color="#fff" />
              <Text style={styles.indicatorLabel}>BODY</Text>
            </View>
            <View style={[styles.indicatorBlock, { backgroundColor: isDetected ? "#a8e6a3" : "#f4a97f" }]} />
          </View>
          <View style={styles.indicator}>
            <View style={styles.indicatorHeader}>
              <IconLight size={20} color="#fff" />
              <Text style={styles.indicatorLabel}>LIGHT</Text>
            </View>
            <View style={[styles.indicatorBlock, { backgroundColor: lightStatus === "good" ? "#a8e6a3" : "#f4a97f" }]} />
          </View>
          <View style={styles.indicator}>
            <View style={styles.indicatorHeader}>
              <IconBlur size={20} color="#fff" />
              <Text style={styles.indicatorLabel}>BLUR</Text>
            </View>
            <View style={[styles.indicatorBlock, { backgroundColor: blurStatus === "good" ? "#a8e6a3" : "#f4a97f" }]} />
          </View>
        </View>

        {/* Instruction */}
        <View style={[styles.instrBox, { borderColor: allGood ? "#00e676" : "rgba(255,255,255,0.15)" }]}>
          {isSpeaking && (
            <View style={styles.speakingDot}>
              <View style={[styles.speakingPulse, { backgroundColor: allGood ? "#00e676" : "#f4a97f" }]} />
            </View>
          )}
          <Text style={[styles.instrText, { color: allGood ? "#00e676" : "#fff" }]}>
            {instrText}
          </Text>
          <TouchableOpacity
            onPress={() => { lastSpokenKey.current = null; lastSpokenTime.current = 0; speakNow(problemKey); }}
            style={styles.speakBtn}
            activeOpacity={0.7}
          >
            <IconSpeaker size={20} color={allGood ? "#00e676" : "#fff"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Camera Guide */}
      <View style={styles.cameraWindow}>
        <View style={[styles.guide, { borderColor: allGood ? "#00ff66" : "#ff3366" }]}>
          <View style={[styles.corner, styles.cornerTL, { borderColor: allGood ? "#00ff66" : "#ff3366" }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: allGood ? "#00ff66" : "#ff3366" }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: allGood ? "#00ff66" : "#ff3366" }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: allGood ? "#00ff66" : "#ff3366" }]} />
          <View style={styles.verticalLine} />
          <View style={styles.horizontalLine} />
          <View style={[styles.centerDot, { borderColor: allGood ? "#00ff66" : "#ff3366" }]} />
        </View>
      </View>

      {/* Capture Button */}
      <View style={styles.captureArea}>
        <TouchableOpacity
          style={[
            styles.capture,
            { backgroundColor: allGood ? "#00c853" : "#2a2a2a", borderColor: allGood ? "#00ff66" : "#444" },
          ]}
          onPress={captureHeight}
          disabled={!allGood || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text style={[styles.btnLarge, { opacity: allGood ? 1 : 0.4 }]}>
              {allGood ? "CAPTURE" : modelLoading ? "Loading…" : "Waiting..."}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.debugText}>
          Conf: {(confidence * 100).toFixed(0)}%  |  Light: {brightness.toFixed(0)}  |  Blur: {blurScore.toFixed(0)}  |  🤖 On-Device
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000", flexDirection: "column" },
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

  topSafeArea: {
    paddingTop: 54, paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.78)", gap: 10, zIndex: 10,
  },
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  radioGroup:     { flexDirection: "row", borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  radioBtn:       { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.07)", gap: 6, borderRightWidth: 1, borderRightColor: "rgba(255,255,255,0.15)" },
  radioBtnFirst:  { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
  radioBtnLast:   { borderTopRightRadius: 10, borderBottomRightRadius: 10, borderRightWidth: 0 },
  radioBtnActive: { backgroundColor: "rgba(255,215,0,0.18)" },
  radioCircle:       { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: "rgba(255,255,255,0.45)", justifyContent: "center", alignItems: "center" },
  radioCircleActive: { borderColor: "#FFD700" },
  radioInner:        { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFD700" },
  radioLabel:        { color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: "700" },
  radioLabelActive:  { color: "#FFD700" },

  flipBtn:   { flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", gap: 5 },
  flipLabel: { color: "#fff", fontSize: 13, fontWeight: "600" },

  indicatorRow:    { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  indicator:       { flex: 1, alignItems: "flex-start", gap: 6 },
  indicatorHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  indicatorLabel:  { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.4 },
  indicatorBlock:  { width: "100%", height: 26, borderRadius: 10 },

  instrBox:      { borderWidth: 1, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.06)" },
  speakingDot:   { marginRight: 10, justifyContent: "center", alignItems: "center" },
  speakingPulse: { width: 10, height: 10, borderRadius: 5, opacity: 0.9 },
  instrText:     { flex: 1, fontSize: 15, fontWeight: "700" },
  speakBtn:      { paddingLeft: 10 },

  cameraWindow: { flex: 1, justifyContent: "center", alignItems: "center" },

  guide: {
    width: GUIDE_SIZE, height: GUIDE_SIZE,
    borderWidth: 2, borderRadius: 20, borderStyle: "dashed",
    justifyContent: "center", alignItems: "center",
  },
  corner:         { position: "absolute", width: 22, height: 22, borderWidth: 3 },
  cornerTL:       { top: -2,    left: -2,  borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 8 },
  cornerTR:       { top: -2,    right: -2, borderBottomWidth: 0, borderLeftWidth: 0,  borderTopRightRadius: 8 },
  cornerBL:       { bottom: -2, left: -2,  borderTopWidth: 0,    borderRightWidth: 0, borderBottomLeftRadius: 8 },
  cornerBR:       { bottom: -2, right: -2, borderTopWidth: 0,    borderLeftWidth: 0,  borderBottomRightRadius: 8 },
  verticalLine:   { position: "absolute", width: 1,  height: "80%", backgroundColor: "rgba(255,255,255,0.2)" },
  horizontalLine: { position: "absolute", height: 1, width: "80%",  backgroundColor: "rgba(255,255,255,0.2)" },
  centerDot:      { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },

  captureArea: { paddingVertical: 20, alignItems: "center", gap: 10, backgroundColor: "rgba(0,0,0,0.6)" },
  capture:     { paddingVertical: 18, paddingHorizontal: 56, borderRadius: 80, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  btnLarge:    { color: "#fff", fontSize: 20, fontWeight: "bold" },
  debugText:   { color: "rgba(255,255,255,0.3)", fontSize: 10 },
});