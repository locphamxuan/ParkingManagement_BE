# PBMS Plate OCR — PaddleOCR microservice

Microservice Python đọc biển số xe cho camera cổng, thay thế (hoặc chạy song song với) Google Gemini.

## Vì sao tách microservice?

[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) là thư viện Python — backend Node không nhúng trực tiếp được. Service này bọc PaddleOCR sau một HTTP API tối giản; BE Node gọi qua `PADDLE_OCR_URL`.

So sánh nhanh với Gemini:

| | Gemini (`gemini-2.5-flash`) | PaddleOCR (service này) |
|---|---|---|
| Chi phí | Free tier có rate limit, cần API key | Miễn phí, không giới hạn |
| Mạng | Cần internet | Chạy offline/nội bộ |
| Đọc biển số | Tốt | Tốt (kèm ghép biển 2 tầng xe máy) |
| Loại xe (car/motorcycle) | Có | Không — staff chọn trên UI |
| Hãng xe (brand) | Có | Không |
| Độ trễ | ~1–3s (mạng) | ~0.2–1s (CPU local) |

## Cài đặt & chạy

```bash
cd ocr-service
python -m venv .venv
.venv\Scripts\activate        # Windows (Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8868
```

Lần chạy đầu PaddleOCR tự tải model (~20MB) về `~/.paddleocr`.

## Cấu hình BE Node

Trong `.env` của backend:

```
OCR_PROVIDER=paddle
PADDLE_OCR_URL=http://localhost:8868
```

Bỏ trống `OCR_PROVIDER` → BE tự chọn: có `PADDLE_OCR_URL` dùng paddle, có `GEMINI_API_KEY` dùng gemini. Không cấu hình gì → endpoint `/scan` trả lỗi 503 (không có mock fallback).

## API

### `POST /scan`

Request:

```json
{ "image": "<base64, có hoặc không data-URL prefix đã bị BE strip>", "mediaType": "image/jpeg" }
```

Response (đúng contract `visionScan.service.js`):

```json
{
  "plateNumber": "59G203880",
  "plateConfidence": 0.97,
  "vehicleType": null,
  "brand": null,
  "brandConfidence": 0
}
```

`plateNumber` được BE chuẩn hóa lại về định dạng VN (`normalizePlate`). `vehicleType`/`brand` luôn `null` — UI check-in của staff đã có bước chọn loại xe.

### `GET /health`

Trả `{ "status": "ok" }` — dùng cho monitoring/docker healthcheck.
