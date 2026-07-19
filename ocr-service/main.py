# PaddleOCR microservice — đọc biển số xe từ ảnh camera cổng.
# BE Node gọi POST /scan với { image: base64, mediaType }; trả về
# { plateNumber, plateConfidence, vehicleType, brand, brandConfidence }
# theo đúng contract của visionScan.service.js (vehicleType/brand luôn null —
# PaddleOCR chỉ đọc text, staff xác nhận loại xe trên UI).

import base64
import io
import re

import numpy as np
from fastapi import FastAPI, HTTPException
from paddleocr import PaddleOCR
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="PBMS Plate OCR", version="1.0.0")

# lang="en" đủ cho biển số VN (chữ Latin + số); det+rec, bỏ cls cho nhanh.
_ocr = PaddleOCR(use_angle_cls=False, lang="en", show_log=False)

# Biển số VN: 2 số tỉnh + 1-2 chữ serie + 4-5 số. Chấp nhận cả xe máy
# (vd 59G2-038.80) lẫn ô tô (vd 51H-123.45) sau khi bỏ ký tự phân cách.
_PLATE_RE = re.compile(r"^\d{2}[A-Z]{1,2}\d?\d{4,5}$")


class ScanRequest(BaseModel):
    image: str
    mediaType: str | None = None


def _decode_image(b64: str) -> np.ndarray:
    try:
        raw = base64.b64decode(b64, validate=False)
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        return np.array(img)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"invalid image: {exc}") from exc


def _candidate_score(text: str, confidence: float) -> tuple[bool, str]:
    """Chuẩn hóa text OCR và kiểm tra có khớp định dạng biển số VN không."""
    cleaned = re.sub(r"[^A-Z0-9]", "", text.upper())
    return bool(_PLATE_RE.match(cleaned)), cleaned


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/scan")
def scan(req: ScanRequest) -> dict:
    img = _decode_image(req.image)

    try:
        result = _ocr.ocr(img, cls=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ocr failed: {exc}") from exc

    best_plate = ""
    best_conf = 0.0

    # PaddleOCR trả list các dòng [box, (text, confidence)] — ghép các dòng
    # gần nhau vì biển số 2 tầng (xe máy) bị tách thành 2 dòng.
    lines: list[tuple[str, float]] = []
    for page in result or []:
        for item in page or []:
            text, conf = item[1][0], float(item[1][1])
            lines.append((text, conf))

    # Thử từng dòng đơn lẻ trước.
    for text, conf in lines:
        ok, cleaned = _candidate_score(text, conf)
        if ok and conf > best_conf:
            best_plate, best_conf = cleaned, conf

    # Thử ghép các cặp dòng liên tiếp (biển 2 tầng của xe máy).
    if not best_plate:
        for i in range(len(lines) - 1):
            merged = lines[i][0] + lines[i + 1][0]
            conf = min(lines[i][1], lines[i + 1][1])
            ok, cleaned = _candidate_score(merged, conf)
            if ok and conf > best_conf:
                best_plate, best_conf = cleaned, conf

    return {
        "plateNumber": best_plate,
        "plateConfidence": round(best_conf, 4),
        "vehicleType": None,
        "brand": None,
        "brandConfidence": 0,
    }
