// ===============================
// IMPORTS
// ===============================
const express  = require("express");
const mongoose = require("mongoose");
const cors     = require("cors");
const multer   = require("multer");
const axios    = require("axios");
const fs       = require("fs");
const path     = require("path");
const FormData = require("form-data");
const sharp    = require("sharp");
const Minio    = require("minio");
const ort      = require("onnxruntime-node");

const Child = require("./models/Child");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// MONGODB
// ===============================
mongoose
  .connect("mongodb://127.0.0.1:27017/growthDB")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

// ===============================
// FOLDERS
// ===============================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ===============================
// LOAD YOLO MODEL
// ===============================
const FACE_MODEL_PATH = path.join(__dirname, "yolo_service", "yolo-26-n-best.onnx");
let faceSession = null;
ort.InferenceSession.create(FACE_MODEL_PATH, { executionProviders: ["cpu"] })
  .then((s) => {
    faceSession = s;
    console.log("✅ YOLO model loaded");
    console.log("   Input  names:", s.inputNames);
    console.log("   Output names:", s.outputNames);
  })
  .catch((e) => console.error("❌ YOLO model failed:", e.message));

// ===============================
// MINIO
// ===============================
const minioClient = new Minio.Client({
  endPoint: "pl-minio.iiit.ac.in",
  port:     443,
  useSSL:   true,
  accessKey: process.env.MINIO_ACCESS_KEY || "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY || "minioadmin",
});
const BUCKET_NAME = "mother-child-health"; // mother and child health tracker

function ensureBucket(name) {
  minioClient.bucketExists(name, (err, exists) => {
    if (err) return console.log(`MinIO Error (${name}):`, err.message);
    if (!exists) {
      minioClient.makeBucket(name, "us-east-1", (e) => {
        if (e) console.log("Bucket Error:", e.message);
        else   console.log(`✅ Bucket created: ${name}`);
      });
    } else {
      console.log(`✅ Bucket exists: ${name}`);
    }
  });
}
ensureBucket(BUCKET_NAME);

// ===============================
// MULTER
// ===============================
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const diskUpload = multer({ storage: diskStorage, limits: { fileSize: 15 * 1024 * 1024 } });
const memUpload  = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ===============================
// QUALITY: brightness + blur via Sharp Laplacian
// ===============================
function computeGrayStats(pixels, width, height) {
  let sum = 0;
  for (let i = 0; i < pixels.length; i++) sum += pixels[i];
  const brightness = sum / pixels.length;

  // Laplacian variance for blur detection
  let lapSum = 0, lapSumSq = 0, count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap = -4 * pixels[idx]
        + pixels[idx - width] + pixels[idx + width]
        + pixels[idx - 1]    + pixels[idx + 1];
      lapSum   += lap;
      lapSumSq += lap * lap;
      count++;
    }
  }
  const lapMean  = lapSum / count;
  const blurScore = lapSumSq / count - lapMean * lapMean;
  return { brightness, blurScore };
}

async function getQuality(buffer) {
  const { data, info } = await sharp(buffer)
    .resize(320, 320, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { brightness, blurScore } = computeGrayStats(
    new Uint8Array(data), info.width, info.height
  );

  return {
    brightness,
    blurScore,
    lightStatus: brightness < 60 ? "low" : brightness > 210 ? "high" : "good",
    blurStatus:  blurScore >= 35 ? "good" : "bad",
  };
}

// ===============================
// YOLO INFERENCE — fixed channel handling
// ===============================
async function runYolo(session, buffer) {
  const SIZE = 320;

  // Use jpeg pipeline to guarantee 3-channel RGB output
  const { data, info } = await sharp(buffer)
    .resize(SIZE, SIZE, { fit: "fill" })
    .jpeg({ quality: 95 })          // re-encode as JPEG first
    .toBuffer()
    .then((jpegBuf) =>
      sharp(jpegBuf)
        .resize(SIZE, SIZE, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true })
    );

  const channels = info.channels;
  const pc  = SIZE * SIZE;
  const f32 = new Float32Array(3 * pc);

  if (channels === 3) {
    for (let i = 0; i < pc; i++) {
      f32[i]          = data[i * 3]     / 255.0;
      f32[pc + i]     = data[i * 3 + 1] / 255.0;
      f32[pc * 2 + i] = data[i * 3 + 2] / 255.0;
    }
  } else if (channels === 4) {
    // RGBA — skip alpha
    for (let i = 0; i < pc; i++) {
      f32[i]          = data[i * 4]     / 255.0;
      f32[pc + i]     = data[i * 4 + 1] / 255.0;
      f32[pc * 2 + i] = data[i * 4 + 2] / 255.0;
    }
  } else {
    // Grayscale — replicate channel
    for (let i = 0; i < pc; i++) {
      const v = data[i * channels] / 255.0;
      f32[i] = f32[pc + i] = f32[pc * 2 + i] = v;
    }
  }

  const results = await session.run({
    [session.inputNames[0]]: new ort.Tensor("float32", f32, [1, 3, SIZE, SIZE]),
  });

  const output  = results[session.outputNames[0]];
  const outData = output.data;
  const dims    = output.dims; // e.g. [1, 300, 6]

  let maxConf = 0;

  if (dims.length === 3) {
    const d1 = dims[1], d2 = dims[2];
    if (d1 <= d2) {
      // [1, num_detections, num_fields] — conf at col 4
      for (let i = 0; i < d1; i++) {
        const c = outData[i * d2 + 4];
        if (c > maxConf) maxConf = c;
      }
    } else {
      // [1, num_fields, num_boxes] — conf at row 4
      for (let i = 0; i < d2; i++) {
        const c = outData[4 * d2 + i];
        if (c > maxConf) maxConf = c;
      }
    }
  } else if (dims.length === 2) {
    const d1 = dims[0], d2 = dims[1];
    for (let i = 0; i < d1; i++) {
      const c = outData[i * d2 + 4];
      if (c > maxConf) maxConf = c;
    }
  }

  console.log(`[YOLO] maxConf=${maxConf.toFixed(4)} dims=${JSON.stringify(dims)} ch=${channels}`);
  return maxConf;
}

// ===============================
// ROUTE: /detect-face
// YOLO conjunctiva detection + Sharp quality — one call
// ===============================
app.post("/detect-face", memUpload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.json({ success: false, detected: false, confidence: 0,
        brightness: 128, blur_score: 50, light_status: "good", blur_status: "good" });
    }

    const [quality, maxConf] = await Promise.all([
      getQuality(req.file.buffer),
      faceSession ? runYolo(faceSession, req.file.buffer) : Promise.resolve(0),
    ]);

    const detected = maxConf > 0.25;
    console.log(
      `[detect-face] conf=${maxConf.toFixed(3)} detected=${detected}` +
      ` bright=${quality.brightness.toFixed(0)} blur=${quality.blurScore.toFixed(0)}` +
      ` light=${quality.lightStatus} blurOk=${quality.blurStatus}`
    );

    return res.json({
      success:      true,
      detected,
      confidence:   parseFloat(maxConf.toFixed(4)),
      brightness:   parseFloat(quality.brightness.toFixed(1)),
      blur_score:   parseFloat(quality.blurScore.toFixed(1)),
      light_status: quality.lightStatus,
      blur_status:  quality.blurStatus,
    });
  } catch (e) {
    console.error("[detect-face] ERROR:", e.message);
    return res.json({ success: false, detected: false, confidence: 0,
      brightness: 128, blur_score: 50, light_status: "good", blur_status: "good" });
  }
});

// ===============================
// ROUTE: /save-frame  (eye image → MinIO)
// ===============================
app.post("/save-frame", memUpload.single("image"), async (req, res) => {
  try {
    const { session_id = "unknown", color_name = "frame" } = req.body;
    if (!req.file) return res.status(400).json({ success: false, error: "No image" });

    const resized = await sharp(req.file.buffer)
      .resize(512, 512, { fit: "fill" })
      .jpeg({ quality: 95 })
      .toBuffer();

    const sessionDir = path.join("uploads", session_id);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, `${color_name}.jpg`), resized);

    // Store under eyes/ prefix so they're easy to find in the bucket
    const objectName = `eyes/${session_id}/${color_name}.jpg`;
    minioClient.putObject(BUCKET_NAME, objectName, resized, resized.length,
      { "Content-Type": "image/jpeg" },
      (err) => {
        if (err) console.error("⚠️ MinIO save-frame:", err.message);
        else     console.log(`☁️ saved: ${objectName}`);
      }
    );

    return res.json({ success: true, color_name, session_id });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ===============================
// ROUTE: /submit-form  (finalise session on MinIO)
// ===============================
app.post("/submit-form", memUpload.none(), async (req, res) => {
  try {
    const { session_id, best_color = "left" } = req.body;
    const sessionId = session_id || `manual_${Date.now()}`;

    const sides = ["left", "right"];
    const minio_urls = {};
    for (const side of sides) {
      const f = path.join("uploads", sessionId, `${side}.jpg`);
      minio_urls[side] = fs.existsSync(f)
        ? `https://pl-minio.iiit.ac.in/${BUCKET_NAME}/eyes/${sessionId}/${side}.jpg`
        : null;
    }

    // Copy best eye as best.jpg
    const bestSrc = path.join("uploads", sessionId, `${best_color}.jpg`);
    if (fs.existsSync(bestSrc)) {
      const bestDest = path.join("uploads", sessionId, "best.jpg");
      fs.copyFileSync(bestSrc, bestDest);
      try {
        await minioClient.fPutObject(
          BUCKET_NAME, `eyes/${sessionId}/best.jpg`, bestDest,
          { "Content-Type": "image/jpeg" }
        );
        minio_urls["best"] = `https://pl-minio.iiit.ac.in/${BUCKET_NAME}/eyes/${sessionId}/best.jpg`;
      } catch (e) { console.error("⚠️ best.jpg upload:", e.message); }
    }

    return res.json({ success: true, session_id: sessionId, minio_urls });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ===============================
// HELPERS
// ===============================
const optimizeAndUpload = async (filePath) => {
  const fileName      = `opt-${Date.now()}.jpg`;
  const optimizedPath = path.join("uploads", fileName);
  await sharp(filePath)
    .resize(512, 512, { fit: "cover" })
    .jpeg({ quality: 90 })
    .toFile(optimizedPath);
  fs.unlinkSync(filePath);
  // Store under height/ prefix in the single bucket
  await minioClient.fPutObject(BUCKET_NAME, `height/${fileName}`, optimizedPath, { "Content-Type": "image/jpeg" });
  return fileName;
};

async function callAnemiaApi(buffer) {
  const form = new FormData();
  form.append("file", buffer, { filename: "eye.jpg", contentType: "image/jpeg" });
  const r = await axios.post(
    "https://pl-app.iiit.ac.in/rcts/anemia-modelpredict",
    form, { headers: form.getHeaders(), timeout: 120000 }
  );
  return {
    anemiaStatus: r.data?.anemia_status     ?? "Unknown",
    hb:           r.data?.predicted_hb_g_dL ?? null,
  };
}

// ===============================
// ROUTE: /api/children
// Accepts heightImage + leftEyeImage + rightEyeImage
// Runs anemia API on both eyes in parallel
// ===============================
app.post("/api/children",
  diskUpload.fields([
    { name: "heightImage"   },
    { name: "leftEyeImage"  },
    { name: "rightEyeImage" },
  ]),
  async (req, res) => {
    try {
      if (!req.files?.heightImage)
        return res.status(400).json({ error: "Height image missing" });
      if (!req.files?.leftEyeImage || !req.files?.rightEyeImage)
        return res.status(400).json({ error: "Both eye images (left + right) required" });

      const weight       = parseFloat(req.body.weight)  || 0;
      const age          = parseInt(req.body.age)        || 0;
      const eyeSessionId = req.body.eyeSessionId         || null;

      // ── Process eye images (resize + upload to MinIO) ──────────────────
      const processEye = async (file, side) => {
        const optPath  = path.join("uploads", `opt-eye-${side}-${Date.now()}.jpg`);
        await sharp(file.path)
          .resize(512, 512, { fit: "cover" })
          .jpeg({ quality: 90 })
          .toFile(optPath);
        fs.unlinkSync(file.path);
        const buffer   = fs.readFileSync(optPath);
        const fileName = `opt-eye-${side}-${Date.now()}.jpg`;
        try {
          await minioClient.fPutObject(BUCKET_NAME, `eyes/${fileName}`, optPath, { "Content-Type": "image/jpeg" });
        } catch (e) { console.warn(`MinIO eye upload (${side}):`, e.message); }
        fs.unlinkSync(optPath);
        return { buffer, fileName };
      };

      // Run all three image uploads in parallel
      const [leftEye, rightEye, heightFile] = await Promise.all([
        processEye(req.files.leftEyeImage[0],  "left"),
        processEye(req.files.rightEyeImage[0], "right"),
        optimizeAndUpload(req.files.heightImage[0].path),
      ]);

      // ── Height estimation API ──────────────────────────────────────────
      let heightValue = 0, bmi = 0, bmiCategory = "Unknown";
      try {
        const heightStream = await minioClient.getObject(BUCKET_NAME, `height/${heightFile}`);
        const hForm = new FormData();
        hForm.append("image", heightStream, heightFile);
        const r = await axios.post(
          "https://pl-api.iiit.ac.in/rcts/pmis/api/height-estimation",
          hForm, { headers: hForm.getHeaders(), timeout: 20000 }
        );
        heightValue = parseFloat(r.data.height_cm) || 0;
        console.log("✅ Height:", heightValue);
      } catch (err) {
        console.log("❌ Height API:", err.message);
      }

      if (heightValue > 0 && weight > 0) {
        const hM = heightValue / 100;
        bmi = parseFloat((weight / (hM * hM)).toFixed(2));
        bmiCategory = bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obesity";
      }

      // ── Anemia API — both eyes in parallel ────────────────────────────
      let leftAnem  = { anemiaStatus: "Unknown", hb: null };
      let rightAnem = { anemiaStatus: "Unknown", hb: null };

      try {
        [leftAnem, rightAnem] = await Promise.all([
          callAnemiaApi(leftEye.buffer),
          callAnemiaApi(rightEye.buffer),
        ]);
        console.log(`✅ Left  — ${leftAnem.anemiaStatus}  Hb: ${leftAnem.hb ?? "N/A"}`);
        console.log(`✅ Right — ${rightAnem.anemiaStatus} Hb: ${rightAnem.hb ?? "N/A"}`);
      } catch (err) {
        console.log("❌ Anemia API:", err.message);
      }

      // All images in one bucket — height/ and eyes/ prefixes for organisation
      const MINIO_BASE = `https://pl-minio.iiit.ac.in/${BUCKET_NAME}`;

      const child = new Child({
        childName:   req.body.childName,
        parentName:  req.body.parentName  || "",
        phoneNumber: req.body.phoneNumber || "",
        age, gender: req.body.gender, weight,
        height: heightValue, bmi, bmiCategory,

        // Both eye anemia results
        leftAnemiaStatus:  leftAnem.anemiaStatus,
        leftHb:            leftAnem.hb,
        rightAnemiaStatus: rightAnem.anemiaStatus,
        rightHb:           rightAnem.hb,
        anemiaStatus:      leftAnem.anemiaStatus, // legacy field

        heightImage:   `${MINIO_BASE}/height/${heightFile}`,
        eyeImageLeft:  eyeSessionId
          ? `${MINIO_BASE}/eyes/${eyeSessionId}/left.jpg`
          : `${MINIO_BASE}/eyes/${leftEye.fileName}`,
        eyeImageRight: eyeSessionId
          ? `${MINIO_BASE}/eyes/${eyeSessionId}/right.jpg`
          : `${MINIO_BASE}/eyes/${rightEye.fileName}`,
      });
      await child.save();

      return res.json({
        height:      heightValue,
        bmi,
        bmiCategory,
        leftAnemia:  leftAnem.anemiaStatus,
        leftHb:      leftAnem.hb,
        rightAnemia: rightAnem.anemiaStatus,
        rightHb:     rightAnem.hb,
      });
    } catch (error) {
      console.error("/api/children ERROR:", error.message);
      return res.status(500).json({ error: "Processing failed", details: error.message });
    }
  }
);

// ===============================
// ROUTE: GET /api/children
// ===============================
app.get("/api/children", async (req, res) => {
  try {
    res.json(await Child.find().sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

// ===============================
// ROUTE: /verify  (health check)
// ===============================
app.get("/verify", (req, res) => {
  res.json({
    status:    "ok",
    app:       "Mother & Child Health Tracker",
    port:      5001,
    minio:     "pl-minio.iiit.ac.in",
    bucket:    BUCKET_NAME,
    faceModel: faceSession ? "loaded" : "loading",
  });
});

// ===============================
// DEBUG: /debug-yolo  (GET — tests with blank grey image)
// ===============================
app.get("/debug-yolo", async (req, res) => {
  try {
    if (!faceSession) return res.json({ error: "Model not loaded yet" });
    const SIZE = 320;
    const buf = await sharp({
      create: { width: SIZE, height: SIZE, channels: 3, background: { r: 128, g: 128, b: 128 } },
    }).jpeg().toBuffer();
    const maxConf = await runYolo(faceSession, buf);
    const output  = (await faceSession.run({
      [faceSession.inputNames[0]]: new ort.Tensor(
        "float32",
        new Float32Array(3 * SIZE * SIZE).fill(0.5),
        [1, 3, SIZE, SIZE]
      ),
    }))[faceSession.outputNames[0]];
    res.json({
      dims:         Array.from(output.dims),
      inputNames:   faceSession.inputNames,
      outputNames:  faceSession.outputNames,
      maxConfGrey:  maxConf,
    });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ===============================
// DEBUG: /debug-yolo-image  (POST — test with real image)
// ===============================
app.post("/debug-yolo-image", memUpload.single("image"), async (req, res) => {
  try {
    if (!faceSession) return res.json({ error: "Model not loaded" });
    if (!req.file)    return res.json({ error: "No image" });
    const maxConf = await runYolo(faceSession, req.file.buffer);
    res.json({ maxConf, detected: maxConf > 0.25, inputBytes: req.file.size });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ===============================
// START
// ===============================
app.listen(5001, "0.0.0.0", () => {
  console.log("🚀 Mother & Child Health Tracker — Server on :5001");
  console.log("   MinIO : https://pl-minio.iiit.ac.in  bucket: " + BUCKET_NAME);
  console.log("   POST /detect-face        → YOLO + quality");
  console.log("   POST /save-frame         → MinIO eye storage");
  console.log("   POST /submit-form        → finalise session");
  console.log("   POST /api/children       → height + BMI + anemia (both eyes)");
  console.log("   GET  /verify             → health check");
  console.log("   GET  /debug-yolo         → model sanity check");
  console.log("   POST /debug-yolo-image   → test with real image");
});