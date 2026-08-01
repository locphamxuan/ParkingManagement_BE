/**
 * email.js — gửi email qua SMTP (nodemailer).
 *
 * Ba loại email: reset mật khẩu, OTP đăng ký, và thông báo hệ thống chung.
 * Mọi email dùng chung một khung layout (renderLayout) để nhất quán thương hiệu.
 */
const dns = require("node:dns").promises;
const nodemailer = require("nodemailer");

const BRAND_COLOR = "#f97316";
const MUTED_COLOR = "#64748b";
const FOOTER_COLOR = "#94a3b8";
const APP_NAME = "PBMS — Parking Building Management System";
const SMTP_HOST = "smtp.gmail.com";

// smtp.gmail.com có cả bản ghi A lẫn AAAA, còn container trên Render có interface
// IPv6 nhưng KHÔNG có route IPv6 ra ngoài → nodemailer bốc trúng địa chỉ IPv6 là
// chết ngay với ENETUNREACH (đây chính là nguyên nhân đăng ký trả 500).
//
// Option `family` của nodemailer không dùng được: nó dựng opts socket từ một danh
// sách field cố định và không chép `family` vào, nên đặt cũng vô tác dụng. Cách
// chắc chắn là tự phân giải sang IPv4 rồi đưa thẳng IP làm host — kèm `servername`
// để bắt tay STARTTLS vẫn kiểm chứng chứng chỉ theo đúng tên miền Gmail.
let cachedSmtpIp = null;
const resolveSmtpIpv4 = async () => {
  if (cachedSmtpIp) return cachedSmtpIp;
  const [address] = await dns.resolve4(SMTP_HOST);
  if (address) cachedSmtpIp = address;
  return address;
};

const createTransporter = async () => {
  // DNS hỏng thì vẫn để nodemailer tự xoay với hostname, đừng chặn luôn việc gửi mail.
  const host = await resolveSmtpIpv4().catch(() => null);

  return nodemailer.createTransport({
    host: host || SMTP_HOST,
    servername: SMTP_HOST,
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS) || 10000,
    greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS) || 10000,
    socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS) || 10000,
  });
};

const fromAddress = () => `"PBMS - Parking Management" <${process.env.EMAIL_USER}>`;

/** Khung HTML chung: heading + lời chào + nội dung + footer. */
const renderLayout = ({ heading, greeting, bodyHtml }) => [
  `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">`,
  `<h2 style="color:${BRAND_COLOR}">${heading}</h2>`,
  greeting ? `<p>${greeting}</p>` : "",
  bodyHtml,
  `<hr style="border:none;border-top:1px solid #e2e8f0;margin-top:32px"/>`,
  `<p style="color:${FOOTER_COLOR};font-size:12px">${APP_NAME}</p>`,
  `</div>`,
].join("\n");

const send = async ({ to, subject, html }) => {
  // Tests and local environments without SMTP credentials must not leave a job
  // waiting on a network socket. Notification delivery is intentionally best effort.
  if (process.env.NODE_ENV === 'test' || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return false;
  }
  const transporter = await createTransporter();
  await transporter.sendMail({ from: fromAddress(), to, subject, html });
  return true;
};

const sendResetPasswordEmail = async ({ to, resetUrl, fullName }) => {
  const bodyHtml = [
    `<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>`,
    `<p>Nhấn vào nút bên dưới để đặt lại mật khẩu. Link có hiệu lực trong <strong>15 phút</strong>.</p>`,
    `<div style="text-align:center;margin:32px 0">`,
    `<a href="${resetUrl}" style="background:${BRAND_COLOR};color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Đặt lại mật khẩu</a>`,
    `</div>`,
    `<p style="color:${MUTED_COLOR};font-size:13px">Hoặc copy link sau vào trình duyệt:<br/>`,
    `<a href="${resetUrl}" style="color:${BRAND_COLOR};word-break:break-all">${resetUrl}</a></p>`,
    `<p style="color:${MUTED_COLOR};font-size:13px">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.</p>`,
  ].join("\n");

  await send({
    to,
    subject: "Đặt lại mật khẩu PBMS",
    html: renderLayout({
      heading: "Đặt lại mật khẩu",
      greeting: `Xin chào <strong>${fullName}</strong>,`,
      bodyHtml,
    }),
  });
};

const sendOtpEmail = async ({ to, otp, fullName }) => {
  const bodyHtml = [
    `<p>Thank you for registering with PBMS. Use the OTP code below to complete your registration.</p>`,
    `<p>This code is valid for <strong>5 minutes</strong>.</p>`,
    `<div style="text-align:center;margin:32px 0">`,
    `<div style="background:${BRAND_COLOR};color:#fff;font-size:36px;font-weight:bold;letter-spacing:12px;padding:20px 40px;border-radius:8px;display:inline-block">${otp}</div>`,
    `</div>`,
    `<p style="color:${MUTED_COLOR};font-size:13px">If you did not request this, please ignore this email.</p>`,
  ].join("\n");

  await send({
    to,
    subject: "Your OTP Code for Registration - PBMS",
    html: renderLayout({
      heading: "Email Verification",
      greeting: `Hello <strong>${fullName}</strong>,`,
      bodyHtml,
    }),
  });
};

/**
 * Generic email cho các thông báo hệ thống (gói dài hạn sắp/đã hết hạn,
 * vượt giờ đỗ, ...). `bodyHtml` do nơi gọi build sẵn.
 */
const sendNotificationEmail = async ({ to, fullName, subject, heading, bodyHtml }) => {
  await send({
    to,
    subject,
    html: renderLayout({
      heading,
      greeting: `Xin chào <strong>${fullName || "Quý khách"}</strong>,`,
      bodyHtml,
    }),
  });
};

module.exports = { sendResetPasswordEmail, sendOtpEmail, sendNotificationEmail };
