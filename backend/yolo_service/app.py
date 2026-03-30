from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
import torch

app = Flask(__name__)

# ============================
# LOAD YOLO MODEL
# ============================
model = YOLO("yolov8n-face.pt")

device = "cuda" if torch.cuda.is_available() else "cpu"
model.to(device)

# Warmup once (important for speed)
dummy = np.zeros((160, 160, 3), dtype=np.uint8)
model(dummy, imgsz=160, verbose=False)

# ============================
# THRESHOLDS (TUNE THESE)
# ============================
LOW_LIGHT_THRESHOLD = 60
HIGH_LIGHT_THRESHOLD = 170
BLUR_THRESHOLD = 35


def default_response():
    return {
        "valid": False,
        "brightness": 0,
        "blur_score": 0,
        "light_status": "low",
        "blur_status": "bad"
    }


@app.route("/detect-eye", methods=["POST"])
def detect_eye():
    try:
        file = request.files.get("image")
        if not file:
            return jsonify(default_response())

        img = cv2.imdecode(
            np.frombuffer(file.read(), np.uint8),
            cv2.IMREAD_COLOR
        )

        if img is None:
            return jsonify(default_response())

        # Resize for fast inference
        img = cv2.resize(img, (160, 160))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # ============================
        # 🔥 BRIGHTNESS CALCULATION
        # ============================
        brightness = float(np.mean(gray))

        if brightness < LOW_LIGHT_THRESHOLD:
            light_status = "low"
        elif brightness > HIGH_LIGHT_THRESHOLD:
            light_status = "high"
        else:
            light_status = "good"

        # ============================
        # 🔥 BLUR CALCULATION
        # ============================
        blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        if blur_score < BLUR_THRESHOLD:
            blur_status = "bad"
        else:
            blur_status = "good"

        # ============================
        # 🔥 FACE DETECTION
        # ============================
        results = model(img, imgsz=160, conf=0.3, verbose=False)
        valid = any(len(r.boxes) > 0 for r in results)

        print("Brightness:", brightness)
        print("Blur Score:", blur_score)
        print("Light:", light_status)
        print("Blur:", blur_status)

        return jsonify({
            "valid": valid,
            "brightness": brightness,
            "blur_score": blur_score,
            "light_status": light_status,
            "blur_status": blur_status
        })

    except Exception as e:
        print("ERROR:", e)
        return jsonify(default_response())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=6000, debug=False, threaded=True)
    