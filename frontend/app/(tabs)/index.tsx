import { useState, useEffect } from "react";
import {
  View, TextInput, ScrollView, Image, Text, Alert,
  StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, KeyboardAvoidingView, Modal, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { useRouter, useLocalSearchParams } from "expo-router";

const BASE_URL        = "https://pl-api.iiit.ac.in/rcts/anemiav2/";
const { width: SW }   = Dimensions.get("window");
const THUMB           = (SW - 40 - 40 - 12) / 2; // thumbnail size

export default function FormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<any>();

  // ─── Form fields ──────────────────────────────────────────────────────────
  const [childName,   setChildName]   = useState("");
  const [parentName,  setParentName]  = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [age,         setAge]         = useState("");
  const [gender,      setGender]      = useState("");
  const [weight,      setWeight]      = useState("");

  // ─── Images ───────────────────────────────────────────────────────────────
  const [heightImage,   setHeightImage]   = useState<string | null>(null);
  const [leftEyeImage,  setLeftEyeImage]  = useState<string | null>(null);
  const [rightEyeImage, setRightEyeImage] = useState<string | null>(null);
  const [eyeSessionId,  setEyeSessionId]  = useState("");

  // ─── UI state ─────────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(false);
  const [loadingMsg,   setLoadingMsg]   = useState("Uploading…");
  const [previewUri,   setPreviewUri]   = useState<string | null>(null); // modal

  // ─── Sync params from capture screens ────────────────────────────────────
  useEffect(() => {
    if (params.childName)    setChildName(params.childName);
    if (params.parentName)   setParentName(params.parentName);
    if (params.phoneNumber)  setPhoneNumber(params.phoneNumber);
    if (params.age)          setAge(params.age);
    if (params.gender)       setGender(params.gender);
    if (params.weight)       setWeight(params.weight);
    if (params.heightImage)  setHeightImage(params.heightImage);
    if (params.leftEyeImage) setLeftEyeImage(params.leftEyeImage);
    if (params.rightEyeImage)setRightEyeImage(params.rightEyeImage);
    if (params.eyeSessionId) setEyeSessionId(params.eyeSessionId);
  }, []);

  const resetForm = () => {
    setChildName(""); setParentName(""); setPhoneNumber("");
    setAge(""); setGender(""); setWeight("");
    setHeightImage(null); setLeftEyeImage(null);
    setRightEyeImage(null); setEyeSessionId("");
  };

  // Common params forwarded to capture screens so nothing is lost
  const commonParams = {
    childName, parentName, phoneNumber, age, gender, weight,
    heightImage:    heightImage    ?? "",
    leftEyeImage:   leftEyeImage   ?? "",
    rightEyeImage:  rightEyeImage  ?? "",
    eyeSessionId:   eyeSessionId   ?? "",
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const submitData = async () => {
    if (!heightImage)                        { Alert.alert("Missing", "Please capture height image.");      return; }
    if (!leftEyeImage || !rightEyeImage)     { Alert.alert("Missing", "Please capture both eye images.");  return; }
    if (!childName || !age || !weight || !gender) {
      Alert.alert("Missing", "Please fill all required fields (*).");
      return;
    }

    setLoading(true);
    setLoadingMsg("Uploading images…");

    const formData = new FormData();
    formData.append("childName",   childName);
    formData.append("parentName",  parentName  || "");
    formData.append("phoneNumber", phoneNumber || "");
    formData.append("age",    age);
    formData.append("gender", gender);
    formData.append("weight", weight);
    if (eyeSessionId) formData.append("eyeSessionId", eyeSessionId);

    formData.append("heightImage",   { uri: heightImage,   type: "image/jpeg", name: `height_${Date.now()}.jpg`  } as any);
    formData.append("leftEyeImage",  { uri: leftEyeImage,  type: "image/jpeg", name: `left_${Date.now()}.jpg`    } as any);
    formData.append("rightEyeImage", { uri: rightEyeImage, type: "image/jpeg", name: `right_${Date.now()}.jpg`   } as any);

    // Cycle progress messages so the user knows it's working
    const MESSAGES = [
      "Uploading images…",
      "Estimating height…",
      "Analysing left eye…",
      "Analysing right eye…",
      "Almost done…",
    ];
    let msgIdx = 0;
    const msgTimer = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, MESSAGES.length - 1);
      setLoadingMsg(MESSAGES[msgIdx]);
    }, 7000);

    try {
      const res = await axios.post(`${BASE_URL}/api/children`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 360000, // 6 min max — anemia API runs twice in parallel
      });
      clearInterval(msgTimer);

      const d = res.data;
      const lHb    = d.leftHb    != null ? `${d.leftHb} g/dL`  : "N/A";
      const rHb    = d.rightHb   != null ? `${d.rightHb} g/dL` : "N/A";
      const lAnem  = d.leftAnemia  ?? "Unknown";
      const rAnem  = d.rightAnemia ?? "Unknown";

      resetForm();
      // Clear URL params so the form doesn't re-hydrate old images on re-render
      router.replace({ pathname: "/" });

      Alert.alert(
        "✅ Analysis Complete",
        `Height : ${d.height ?? "N/A"} cm\n` +
        `BMI    : ${d.bmi ?? "N/A"} (${d.bmiCategory ?? "—"})\n\n` +
        `👁 Left Eye\n  Hb: ${lHb}\n  Anemia: ${lAnem}\n\n` +
        `👁 Right Eye\n  Hb: ${rHb}\n  Anemia: ${rAnem}`,
      );
    } catch (error: any) {
      clearInterval(msgTimer);
      Alert.alert("Error", error.message || "Something went wrong. Check server connection.");
    } finally {
      setLoading(false);
      setLoadingMsg("Uploading…");
    }
  };

  // ─── Thumbnail (small preview, tap to expand) ─────────────────────────────
  const Thumb = ({ uri, label, color }: { uri: string; label: string; color: string }) => (
    <TouchableOpacity onPress={() => setPreviewUri(uri)} activeOpacity={0.85} style={styles.thumbTouch}>
      <View style={[styles.thumbBox, { borderColor: color }]}>
        <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
        <View style={[styles.thumbBadge, { backgroundColor: color }]}>
          <Text style={styles.thumbBadgeText}>{label}</Text>
        </View>
      </View>
      <Text style={styles.thumbHint}>Tap to expand</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">

          <Text style={styles.header}>Child Health Assessment</Text>

          {/* ─── FORM FIELDS ──────────────────────────────────────────────── */}
          <View style={styles.card}>
            <Field label="Child Name *"    value={childName}   onChange={setChildName}   placeholder="Enter child's full name" />
            <Field label="Parent Name"     value={parentName}  onChange={setParentName}  placeholder="Enter parent's name" />
            <Field label="Phone Number"    value={phoneNumber} onChange={setPhoneNumber} placeholder="10-digit mobile number" keyboard="phone-pad" />
            <Field label="Age (years) *"   value={age}         onChange={setAge}         placeholder="Enter age"    keyboard="numeric" />

            <Text style={styles.fieldLabel}>Gender *</Text>
            <View style={styles.genderRow}>
              {["Male", "Female"].map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                  onPress={() => setGender(g)}
                >
                  <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="Weight (kg) *" value={weight} onChange={setWeight} placeholder="Enter weight" keyboard="numeric" last />
          </View>

          {/* ─── IMAGES ────────────────────────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>📸 Capture Images</Text>

            {/* Height */}
            <TouchableOpacity
              style={[styles.imgBtn, heightImage ? styles.imgBtnDone : styles.imgBtnReady]}
              onPress={() => router.push({ pathname: "/height-capture", params: commonParams })}
            >
              <Text style={styles.imgBtnText}>
                {heightImage ? "↺  Re-capture Height Image" : "📏  Capture Height Image"}
              </Text>
            </TouchableOpacity>
            {heightImage && <Thumb uri={heightImage} label="Height" color="#2f9e44" />}

            {/* Eye images side by side */}
            <Text style={styles.eyeLabel}>👁 Eye Images (both required)</Text>
            <View style={styles.eyeRow}>
              <View style={styles.eyeCol}>
                <TouchableOpacity
                  style={[styles.imgBtn, leftEyeImage ? styles.imgBtnDone : styles.imgBtnReady]}
                  onPress={() => router.push({ pathname: "/eye-capture", params: { ...commonParams, eyeSide: "left" } })}
                >
                  <Text style={styles.imgBtnText}>{leftEyeImage ? "↺  Re-capture" : "Capture"}</Text>
                  <Text style={styles.imgBtnSub}>LEFT Eye</Text>
                </TouchableOpacity>
                {leftEyeImage && <Thumb uri={leftEyeImage} label="L" color="#4c9fff" />}
              </View>

              <View style={styles.eyeCol}>
                <TouchableOpacity
                  style={[styles.imgBtn, rightEyeImage ? styles.imgBtnDone : styles.imgBtnReady]}
                  onPress={() => router.push({ pathname: "/eye-capture", params: { ...commonParams, eyeSide: "right" } })}
                >
                  <Text style={styles.imgBtnText}>{rightEyeImage ? "↺  Re-capture" : "Capture"}</Text>
                  <Text style={styles.imgBtnSub}>RIGHT Eye</Text>
                </TouchableOpacity>
                {rightEyeImage && <Thumb uri={rightEyeImage} label="R" color="#ff7043" />}
              </View>
            </View>

            {/* Status pills */}
            <View style={styles.statusRow}>
              <StatusPill ok={!!leftEyeImage}  label="Left eye" />
              <StatusPill ok={!!rightEyeImage} label="Right eye" />
              <StatusPill ok={!!heightImage}   label="Height" />
            </View>
          </View>

          {/* ─── SUBMIT ────────────────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={submitData}
            disabled={loading}
          >
            {loading ? (
              <View style={{ alignItems: "center", gap: 8 }}>
                <ActivityIndicator color="#fff" />
                <Text style={[styles.submitBtnText, { fontSize: 13, opacity: 0.85 }]}>{loadingMsg}</Text>
              </View>
            ) : (
              <Text style={styles.submitBtnText}>Analyze Health</Text>
            )}
          </TouchableOpacity>

          {/* Reset */}
          <TouchableOpacity style={styles.resetBtn} onPress={resetForm}>
            <Text style={styles.resetBtnText}>🔄 Clear / Reset Form</Text>
          </TouchableOpacity>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── 512×512 PREVIEW MODAL ────────────────────────────────────────── */}
      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUri(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPreviewUri(null)}
        >
          {previewUri && (
            <View style={styles.modalCard}>
              <Image
                source={{ uri: previewUri }}
                style={styles.modalImage}
                resizeMode="contain"
              />
              <Text style={styles.modalHint}>Tap anywhere to close</Text>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────
function Field({
  label, value, onChange, placeholder, keyboard = "default", last = false,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; keyboard?: any; last?: boolean;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, last && { marginBottom: 0 }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#adb5bd"
        keyboardType={keyboard}
      />
    </>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: ok ? "#d3f9d8" : "#f1f3f5" }]}>
      <Text style={[styles.pillText, { color: ok ? "#2f9e44" : "#868e96" }]}>
        {ok ? "✓" : "○"} {label}
      </Text>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const PREVIEW_SIZE = Math.min(512, SW - 32);

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: "#f1f3f5" },
  scroll: { padding: 20, paddingBottom: 40 },

  header: { fontSize: 24, fontWeight: "bold", textAlign: "center", marginBottom: 22, color: "#212529" },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  fieldLabel: { fontWeight: "600", color: "#343a40", marginBottom: 7, fontSize: 14 },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dee2e6",
    borderRadius: 10,
    padding: 13,
    marginBottom: 16,
    fontSize: 15,
    color: "#212529",
  },

  genderRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  genderBtn: {
    flex: 1, padding: 13, backgroundColor: "#f1f3f5",
    borderRadius: 10, alignItems: "center",
    borderWidth: 1.5, borderColor: "transparent",
  },
  genderBtnActive: { backgroundColor: "#e7f5ff", borderColor: "#4c6ef5" },
  genderText:      { fontWeight: "600", color: "#495057", fontSize: 15 },
  genderTextActive:{ color: "#4c6ef5" },

  sectionTitle: { fontSize: 17, fontWeight: "700", color: "#212529", marginBottom: 14 },
  eyeLabel:     { fontWeight: "700", fontSize: 14, color: "#343a40", marginTop: 10, marginBottom: 12 },

  imgBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  // Not yet captured → blue
  imgBtnReady: { backgroundColor: "#4c6ef5" },
  // Captured → gray (consistent across all three buttons)
  imgBtnDone: {
    backgroundColor: "#868e96",
  },
  imgBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  imgBtnSub:  { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 2, fontWeight: "600" },

  eyeRow: { flexDirection: "row", gap: 12, marginBottom: 4 },
  eyeCol: { flex: 1 },

  // Thumbnails
  thumbTouch: { marginBottom: 8 },
  thumbBox: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    position: "relative",
  },
  thumbImg:       { width: "100%", height: "100%" },
  thumbBadge: {
    position: "absolute", top: 6, left: 6,
    paddingVertical: 2, paddingHorizontal: 8,
    borderRadius: 6,
  },
  thumbBadgeText: { color: "#fff", fontWeight: "700", fontSize: 11 },
  thumbHint:      { textAlign: "center", fontSize: 10, color: "#adb5bd" },

  // Status pills
  statusRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 10 },
  pill:      { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
  pillText:  { fontSize: 12, fontWeight: "600" },

  // Submit
  submitBtn: {
    backgroundColor: "#2f9e44",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    marginBottom: 12,
  },
  submitBtnDisabled: { backgroundColor: "#8ce99a" },
  submitBtnText:     { color: "#fff", fontWeight: "700", fontSize: 16 },

  resetBtn:     { borderRadius: 14, padding: 15, alignItems: "center", borderWidth: 1.5, borderColor: "#dee2e6", backgroundColor: "#fff" },
  resetBtnText: { color: "#868e96", fontWeight: "600", fontSize: 14 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.90)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard:  { alignItems: "center" },
  modalImage: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, borderRadius: 14 },
  modalHint:  { color: "rgba(255,255,255,0.45)", marginTop: 14, fontSize: 13 },
});