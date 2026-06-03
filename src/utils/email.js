const nodemailer = require("nodemailer");

const createTransporter = () =>
  nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

const sendResetPasswordEmail = async ({ to, resetUrl, fullName }) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"PBMS - Parking Management" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Đặt lại mật khẩu PBMS",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#f97316">Đặt lại mật khẩu</h2>
        <p>Xin chào <strong>${fullName}</strong>,</p>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p>Nhấn vào nút bên dưới để đặt lại mật khẩu. Link có hiệu lực trong <strong>15 phút</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${resetUrl}"
             style="background:#f97316;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">
            Đặt lại mật khẩu
          </a>
        </div>
        <p style="color:#64748b;font-size:13px">
          Hoặc copy link sau vào trình duyệt:<br/>
          <a href="${resetUrl}" style="color:#f97316;word-break:break-all">${resetUrl}</a>
        </p>
        <p style="color:#64748b;font-size:13px">
          Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.
          Mật khẩu của bạn sẽ không thay đổi.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:32px"/>
        <p style="color:#94a3b8;font-size:12px">PBMS — Parking Building Management System</p>
      </div>
    `,
  });
};

const sendOtpEmail = async ({ to, otp, fullName }) => {
  const transporter = createTransporter();

  await transporter.sendMail({
    from: `"PBMS - Parking Management" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your OTP Code for Registration - PBMS',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <h2 style="color:#f97316">Email Verification</h2>
        <p>Hello <strong>${fullName}</strong>,</p>
        <p>Thank you for registering with PBMS. Use the OTP code below to complete your registration.</p>
        <p>This code is valid for <strong>5 minutes</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <div style="background:#f97316;color:#fff;font-size:36px;font-weight:bold;letter-spacing:12px;padding:20px 40px;border-radius:8px;display:inline-block">
            ${otp}
          </div>
        </div>
        <p style="color:#64748b;font-size:13px">
          If you did not request this, please ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin-top:32px"/>
        <p style="color:#94a3b8;font-size:12px">PBMS — Parking Building Management System</p>
      </div>
    `,
  });
};

module.exports = { sendResetPasswordEmail, sendOtpEmail };
