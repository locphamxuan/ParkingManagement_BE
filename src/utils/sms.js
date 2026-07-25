const env = require('../config/env');
const AppError = require('./AppError');

const ESMS_ENDPOINT = 'https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/';

// SmsType=2: tin nhắn thương hiệu/CSKH (dùng cho OTP) theo tài liệu eSMS.vn.
const ESMS_OTP_SMS_TYPE = '2';

/**
 * Gửi OTP qua SMS bằng eSMS.vn. Chỉ validate credentials lúc gọi (không lúc load app)
 * để các luồng khác không phụ thuộc SMS vẫn chạy được khi chưa cấu hình.
 */
const sendOtpSms = async ({ phone, otp }) => {
  if (!env.esmsApiKey || !env.esmsSecretKey) {
    throw new AppError('SMS provider chưa được cấu hình (thiếu ESMS_API_KEY/ESMS_SECRET_KEY)', 500);
  }

  const payload = {
    ApiKey: env.esmsApiKey,
    SecretKey: env.esmsSecretKey,
    Content: `Ma OTP dat lai mat khau PBMS cua ban la: ${otp}. Ma co hieu luc trong 5 phut.`,
    Phone: phone,
    SmsType: ESMS_OTP_SMS_TYPE,
    ...(env.esmsBrandname ? { Brandname: env.esmsBrandname } : {}),
  };

  let response;
  try {
    response = await fetch(ESMS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new AppError(`Không gửi được SMS OTP: ${err.message}`, 500);
  }

  if (!response.ok) {
    throw new AppError(`Nhà cung cấp SMS trả lỗi HTTP ${response.status}`, 500);
  }

  const data = await response.json();
  // eSMS.vn: CodeResult "100" = thành công, còn lại là lỗi (xem docs eSMS).
  if (String(data?.CodeResult) !== '100') {
    throw new AppError(
      `Gửi SMS OTP thất bại: ${data?.ErrorMessage || data?.CodeResult || 'unknown error'}`,
      500,
    );
  }

  return data;
};

module.exports = { sendOtpSms };
