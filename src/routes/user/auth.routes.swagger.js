/**
 * @swagger
 * /api/users/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: '[REMOVED] Direct registration'
 *     deprecated: true
 *     description: >
 *       Removed. This endpoint created accounts without verifying the email
 *       address, bypassing the OTP flow entirely. Use POST /api/users/auth/register-request
 *       followed by POST /api/users/auth/register-verify. Always returns 410.
 *     responses:
 *       410:
 *         description: Endpoint removed; use the OTP registration flow.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Direct registration has been removed. Use POST /api/users/auth/register-request then /register-verify.
 *               errorCode: REGISTRATION_ENDPOINT_REMOVED
 *
 * /api/users/auth/register-request:
 *   post:
 *     tags: [Auth]
 *     summary: Request an OTP for email-based registration
 *     description: >
 *       Stores a pending registration record (email, full name, phone, plus a
 *       SHA-256 hash of the OTP) and emails a 6-digit OTP. Expires after 5
 *       minutes; a resend replaces the previous record so the old code stops
 *       working. No password is accepted or stored at this step.
 *
 *
 *       Always returns the same 200 response whether or not an OTP was actually
 *       sent. If the email is already registered, or the phone number belongs to
 *       another account, no record is created and no email is sent — but the
 *       response is byte-for-byte identical, so this endpoint cannot be used to
 *       discover which addresses have accounts. Duplicates are rejected at
 *       /register-verify instead.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *           examples:
 *             validRequest:
 *               summary: Valid OTP registration request
 *               value:
 *                 email: user@example.com
 *                 fullName: John Doe
 *                 phone: '+84901234567'
 *     responses:
 *       200:
 *         description: >
 *           Request accepted. Returned identically for a new email, an
 *           already-registered email, and a phone number already in use.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               message: If that email can be registered, a verification code has been sent to it.
 *       400:
 *         description: Invalid request body.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidEmail:
 *                 value:
 *                   success: false
 *                   message: Valid email is required
 *               missingName:
 *                 value:
 *                   success: false
 *                   message: Full name is required
 *               invalidPhone:
 *                 value:
 *                   success: false
 *                   message: Invalid phone number
 *       429:
 *         description: Too many registration OTP requests (5 per hour).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * /api/users/auth/register-verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify the registration OTP and create the account
 *     description: >
 *       Validates the 6-digit OTP sent by `/register-request` (constant-time hash
 *       comparison, max 5 failed attempts before the record is destroyed), creates
 *       the user, removes the OTP record, and returns a JWT token. Also sets the
 *       httpOnly `pbms_token` auth cookie (see POST /auth/login for details).
 *       The password is supplied here for the first time and goes straight to bcrypt.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterVerifyRequest'
 *           examples:
 *             validRequest:
 *               summary: Valid OTP verification request
 *               value:
 *                 email: user@example.com
 *                 otp: '123456'
 *                 password: correct-horse-battery
 *     responses:
 *       201:
 *         description: Registration completed successfully after OTP verification.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *             example:
 *               success: true
 *               message: Registration successful
 *               data:
 *                 token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature
 *                 user:
 *                   _id: 665f1d2c7b0d1b0012a34567
 *                   email: user@example.com
 *                   fullName: John Doe
 *                   phone: '+84901234567'
 *                   role: user
 *                   avatar: null
 *                   assignedBuildings: []
 *                   isActive: true
 *                   lastLoginAt: null
 *                   walletBalance: 0
 *                   createdAt: '2026-06-12T04:00:00.000Z'
 *                   updatedAt: '2026-06-12T04:00:00.000Z'
 *       400:
 *         description: Invalid email, invalid OTP format, expired OTP, or incorrect OTP.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidOtpFormat:
 *                 value:
 *                   success: false
 *                   message: OTP must be a 6-digit number
 *               expiredOtp:
 *                 value:
 *                   success: false
 *                   message: OTP has expired or does not exist. Please request a new one.
 *               invalidOtp:
 *                 value:
 *                   success: false
 *                   message: Invalid OTP code
 *               attemptsExceeded:
 *                 value:
 *                   success: false
 *                   message: Too many incorrect codes. Please request a new one.
 *                   errorCode: OTP_ATTEMPTS_EXCEEDED
 *               weakPassword:
 *                 value:
 *                   success: false
 *                   message: Password must be at least 12 characters
 *                   errorCode: WEAK_PASSWORD
 *       409:
 *         description: Email is already registered.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Email already registered
 *
 * /api/users/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: >
 *       Authenticates a user, updates `lastLoginAt`, and returns a JWT token plus the
 *       public user profile. Also sets an httpOnly `pbms_token` cookie (used by the FE
 *       web app instead of storing the token in localStorage). `authenticate` accepts
 *       EITHER this cookie OR an `Authorization: Bearer` header, so Mobile clients
 *       (which keep the token in secure device storage, no cookie jar) are unaffected.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *           examples:
 *             validRequest:
 *               summary: Valid login request
 *               value:
 *                 email: user@example.com
 *                 password: Password123!
 *     responses:
 *       200:
 *         description: Login completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *             example:
 *               success: true
 *               message: Login successful
 *               data:
 *                 token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature
 *                 user:
 *                   _id: 665f1d2c7b0d1b0012a34567
 *                   email: user@example.com
 *                   fullName: John Doe
 *                   phone: '+84901234567'
 *                   role: user
 *                   avatar: null
 *                   assignedBuildings: []
 *                   isActive: true
 *                   lastLoginAt: '2026-06-12T04:35:20.000Z'
 *                   walletBalance: 150000
 *                   createdAt: '2026-06-01T08:00:00.000Z'
 *                   updatedAt: '2026-06-12T04:35:20.000Z'
 *       400:
 *         description: Missing email or password.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Email and password are required
 *       401:
 *         description: Invalid email or password.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Invalid email or password
 *       403:
 *         description: Account has been deactivated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Account is deactivated
 *
 * /api/users/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out and clear the httpOnly auth cookie
 *     description: >
 *       Clears the `pbms_token` cookie set by login/register. Stateless otherwise (no
 *       server-side token blacklist) — Bearer-header clients simply discard their token
 *       client-side and don't need to call this.
 *     responses:
 *       200:
 *         description: Logged out successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *
 * /api/users/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get the current authenticated user profile
 *     description: Returns the public profile of the user represented by the JWT token.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/PublicUser'
 *             example:
 *               success: true
 *               data:
 *                 user:
 *                   _id: 665f1d2c7b0d1b0012a34567
 *                   email: user@example.com
 *                   fullName: John Doe
 *                   phone: '+84901234567'
 *                   role: user
 *                   avatar: null
 *                   assignedBuildings: []
 *                   isActive: true
 *                   lastLoginAt: '2026-06-12T04:35:20.000Z'
 *                   walletBalance: 150000
 *                   createdAt: '2026-06-01T08:00:00.000Z'
 *                   updatedAt: '2026-06-12T04:35:20.000Z'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 *       404:
 *         description: User no longer exists.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: User not found
 *
 * /api/users/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     description: Always returns HTTP 200 to prevent email enumeration. If the email exists and is active, a reset link is sent.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *           examples:
 *             validRequest:
 *               summary: Valid forgot-password request
 *               value:
 *                 email: user@example.com
 *     responses:
 *       200:
 *         description: Reset email response returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               message: If that email is registered, a reset link has been sent.
 *       400:
 *         description: Invalid email address.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Valid email is required
 *
 * /api/users/auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password using a reset token
 *     description: Hashes the provided reset token, finds a non-expired reset token record, updates the password, clears reset metadata, and returns a new JWT token.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *           examples:
 *             validRequest:
 *               summary: Valid reset-password request
 *               value:
 *                 token: 3f4f0be62f845f7f4f7c14cf8791e44a1d3e0a0b89de1a6c2e44c8d7f9a12345
 *                 newPassword: NewPassword123!
 *     responses:
 *       200:
 *         description: Password was reset successfully and a new JWT token was issued.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *             example:
 *               success: true
 *               message: Password has been reset successfully
 *               data:
 *                 token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.signature
 *                 user:
 *                   _id: 665f1d2c7b0d1b0012a34567
 *                   email: user@example.com
 *                   fullName: John Doe
 *                   phone: '+84901234567'
 *                   role: user
 *                   avatar: null
 *                   assignedBuildings: []
 *                   isActive: true
 *                   lastLoginAt: '2026-06-12T04:35:20.000Z'
 *                   walletBalance: 150000
 *                   createdAt: '2026-06-01T08:00:00.000Z'
 *                   updatedAt: '2026-06-12T05:10:00.000Z'
 *       400:
 *         description: Token is missing, password is invalid, or reset token is invalid/expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingToken:
 *                 value:
 *                   success: false
 *                   message: Token is required
 *               shortPassword:
 *                 value:
 *                   success: false
 *                   message: Password must be at least 12 characters
 *               invalidOrExpiredToken:
 *                 value:
 *                   success: false
 *                   message: Reset token is invalid or has expired
 *
 * /api/users/auth/forgot-password-sms:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset OTP via SMS
 *     description: >
 *       Always returns HTTP 200 to prevent phone enumeration. If the phone exists and is
 *       active, a 6-digit OTP is generated (5-minute expiry) and sent via SMS through
 *       eSMS.vn. Rate limited to 3 requests / 15 minutes per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '+84901234567'
 *     responses:
 *       200:
 *         description: OTP request response returned successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *             example:
 *               success: true
 *               message: If that phone number is registered, an OTP has been sent.
 *       400:
 *         description: Invalid phone number.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Valid phone number is required
 *       429:
 *         description: Too many OTP requests from this IP.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: SMS provider is not configured or delivery failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 * /api/users/auth/reset-password-sms:
 *   post:
 *     tags: [Auth]
 *     summary: Verify SMS OTP and reset password
 *     description: >
 *       Validates the 6-digit OTP sent by `/forgot-password-sms` for the given phone,
 *       updates the password, and returns a new JWT token. OTP is locked after 5 failed
 *       attempts and must be requested again.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp, newPassword]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: '+84901234567'
 *               otp:
 *                 type: string
 *                 example: '123456'
 *               newPassword:
 *                 type: string
 *                 example: NewPassword123!
 *     responses:
 *       200:
 *         description: Password was reset successfully and a new JWT token was issued.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *             example:
 *               success: true
 *               message: Password has been reset successfully
 *       400:
 *         description: Invalid phone/OTP format, or OTP is invalid/expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidOtpFormat:
 *                 value:
 *                   success: false
 *                   message: OTP must be a 6-digit number
 *               invalidOrExpiredOtp:
 *                 value:
 *                   success: false
 *                   message: OTP is invalid or has expired. Please request a new one.
 */
