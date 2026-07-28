/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     tags: [User - Profile]
 *     summary: Update the authenticated user's profile
 *     description: Updates editable profile fields for the currently authenticated user. Supported fields are fullName, phone, and avatar. The response returns the updated MongoDB user document in public form.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Full name of the user. Leading and trailing spaces are trimmed by the service.
 *                 example: John Doe
 *               phone:
 *                 type: string
 *                 nullable: true
 *                 pattern: '^[0-9+\\-\\s()]{8,20}$'
 *                 description: Optional phone number in local or international format.
 *                 example: '+84901234567'
 *               avatar:
 *                 type: string
 *                 nullable: true
 *                 description: Optional avatar URL or avatar asset identifier.
 *                 example: https://cdn.parking-system.com/avatars/user-665f1d2c.png
 *           examples:
 *             updateProfile:
 *               summary: Update profile fields
 *               value:
 *                 fullName: John Doe
 *                 phone: '+84901234567'
 *                 avatar: https://cdn.parking-system.com/avatars/user-665f1d2c.png
 *             updatePhoneOnly:
 *               summary: Update phone only
 *               value:
 *                 phone: '+84907654321'
 *     responses:
 *       200:
 *         description: Profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Profile updated
 *                     data:
 *                       type: object
 *                       properties:
 *                         user:
 *                           $ref: '#/components/schemas/PublicUser'
 *             example:
 *               success: true
 *               message: Profile updated
 *               data:
 *                 user:
 *                   _id: 665f1d2c7b0d1b0012a34567
 *                   email: user@example.com
 *                   fullName: John Doe
 *                   phone: '+84901234567'
 *                   role: user
 *                   avatar: https://cdn.parking-system.com/avatars/user-665f1d2c.png
 *                   licensePlates:
 *                     - _id: 665f1d2c7b0d1b0012a34568
 *                       plateNumber: 59G2-038.80
 *                       vehicleType: car
 *                       brand: Toyota
 *                       isDefault: true
 *                       qrCode: PLT-7a9f2c11b8d4e003
 *                   assignedBuildings: []
 *                   isActive: true
 *                   lastLoginAt: '2026-06-12T04:35:20.000Z'
 *                   walletBalance: 150000
 *                   createdAt: '2026-06-01T08:00:00.000Z'
 *                   updatedAt: '2026-06-12T05:45:00.000Z'
 *       400:
 *         description: Invalid request payload.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidPhoneNumber:
 *                 summary: Invalid phone number format
 *                 value:
 *                   success: false
 *                   message: Invalid phone number format
 *               fullNameTooLong:
 *                 summary: Full name exceeds the maximum length
 *                 value:
 *                   success: false
 *                   message: Full name cannot exceed 100 characters
 *       401:
 *         description: Missing, invalid, or expired access token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Invalid or expired token
 *       403:
 *         description: The authenticated account is deactivated or not allowed to access this resource.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Account is deactivated
 *       404:
 *         description: User record was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: User not found
 *
 * /api/users/profile/password:
 *   put:
 *     tags: [User - Profile]
 *     summary: Change the authenticated user's password
 *     description: Changes the password for the currently authenticated user. The current password must be correct and the new password must satisfy the server password policy (at least 12 characters, no common/predictable values).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password of the authenticated user.
 *                 example: OldPassword123!
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: New password to store for the account.
 *                 example: NewPassword123!
 *           example:
 *             currentPassword: OldPassword123!
 *             newPassword: NewPassword123!
 *     responses:
 *       200:
 *         description: Password changed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponseWrapper'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Password changed successfully
 *             example:
 *               success: true
 *               message: Password changed successfully
 *       400:
 *         description: Invalid request body or incorrect current password.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingCurrentPassword:
 *                 summary: Current password is missing
 *                 value:
 *                   success: false
 *                   message: currentPassword is required
 *               shortNewPassword:
 *                 summary: New password is too short
 *                 value:
 *                   success: false
 *                   message: Password must be at least 12 characters
 *               incorrectCurrentPassword:
 *                 summary: Current password is incorrect
 *                 value:
 *                   success: false
 *                   message: Current password is incorrect
 *       401:
 *         description: Missing, invalid, or expired access token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Invalid or expired token
 *       403:
 *         description: The authenticated account is deactivated or not allowed to access this resource.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Account is deactivated
 *       404:
 *         description: User record was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: User not found
 */

module.exports = {};
