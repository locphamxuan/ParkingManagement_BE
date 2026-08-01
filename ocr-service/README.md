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

Khi deploy lên Render, `localhost` không phải máy đang chạy API Node. Deploy service
`pbms-ocr` từ `render.yaml`, sau đó đặt `PADDLE_OCR_URL` của `pbms-api` thành URL
công khai của service đó (ví dụ `https://<pbms-ocr-url>`), rồi redeploy API.

Bỏ trống `OCR_PROVIDER` → BE tự chọn: có `PADDLE_OCR_URL` dùng paddle, có `GEMINI_API_KEY` dùng gemini. Không cấu hình gì → endpoint `/scan` trả lỗi 503 (không có mock fallback).

### Hai cái bẫy khi host trên gói free

1. **RAM.** `paddlepaddle` cộng model PP-OCR vượt xa hạn mức 512MB của một instance
   free — service sẽ bị OOM lúc nạp model chứ không phải lúc quét. Muốn chạy thật
   thì nâng gói RAM lớn hơn, hoặc để service này trên một máy tự quản.
2. **Ngủ đông.** Instance free ngủ sau ~15 phút rảnh; lần quét kế tiếp phải đánh
   thức tiến trình rồi nạp lại model, thường lâu hơn `PADDLE_OCR_TIMEOUT_MS`
   (mặc định 15s). Nới biến đó lên ~60000, hoặc giữ `GEMINI_API_KEY` để BE tự
   chuyển sang Gemini khi PaddleOCR không kịp trả lời.

Đặt cả hai provider là cấu hình bền nhất: `OCR_PROVIDER` chọn cái chạy trước, cái
còn lại tự động đỡ khi cái chính chết (xem `resolveProviderChain` trong
`src/services/staff/visionScan.service.js`).

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
