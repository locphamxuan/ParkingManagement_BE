const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'PBMS API - Parking Building Management System',
      version: '1.0.0',
      description: 'Smart Parking Management System API Documentation',
      contact: {
        name: 'PBMS Development Team',
        email: 'support@pbms.com',
      },
    },
    // 🔥 Dynamic URL để tự động nhận diện port theo server.js của Bảo
    servers: [
      {
        url: '/',
        description: 'Current Active Environment',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/user/auth/login or /api/user/auth/register',
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication token is invalid or expired',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Access denied. No token provided.' },
                },
              },
            },
          },
        },
        ForbiddenError: {
          description: 'User does not have permission to access this resource',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Forbidden' },
                },
              },
            },
          },
        },
        NotFoundError: {
          description: 'The requested resource was not found',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Resource not found' },
                },
              },
            },
          },
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: false },
                  message: { type: 'string', example: 'Validation failed' },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'User authentication and registration' },
      { name: 'User - Profile', description: 'User profile management' },
      { name: 'User - License Plates', description: 'Vehicle license plate management' },
      { name: 'User - Reservations', description: 'Parking reservation operations' },
      { name: 'User - Parking History', description: 'User parking session history' },
      { name: 'User - Wallet', description: 'User wallet and top-up operations' },
      { name: 'User - Long-term', description: 'Long-term parking subscriptions' },
      { name: 'User - Notifications', description: 'User notification management' },
      { name: 'User - Buildings', description: 'View available parking buildings' },
      { name: 'User - Feedback', description: 'Submit feedback' },
      { name: 'Kiosk', description: 'Kiosk self-service check-in (no auth required)' },
      { name: 'Staff - Dashboard', description: 'Staff dashboard and statistics' },
      { name: 'Staff - Parking Sessions', description: 'Parking session operations' },
      { name: 'Staff - Reservations', description: 'Reservation confirmation' },
      { name: 'Staff - Wallet Transactions', description: 'User wallet transaction handling' },
      { name: 'Staff - Incidents', description: 'Incident reporting and management' },
      { name: 'Staff - Shifts', description: 'Staff shift schedules' },
      { name: 'Staff - Users Lookup', description: 'User and vehicle lookup via QR/Plate' },
      { name: 'Staff - Feedback', description: 'Feedback management (Staff + Manager)' },
      { name: 'Manager - Building', description: 'Building information management' },
      { name: 'Manager - Dashboard', description: 'Manager dashboard overview' },
      { name: 'Manager - Wallet', description: 'Building wallet and subscriptions' },
      { name: 'Manager - Vehicle Types', description: 'Vehicle type definitions' },
      { name: 'Manager - Floors', description: 'Parking floor management' },
      { name: 'Manager - Gates', description: 'Entry and exit gate management' },
      { name: 'Manager - Slots', description: 'Parking slot management' },
      { name: 'Manager - Price Policies', description: 'Pricing policy configuration' },
      { name: 'Manager - Packages', description: 'Long-term subscription packages' },
      { name: 'Manager - Reservation Policy', description: 'Reservation policy settings' },
      { name: 'Manager - Shifts', description: 'Staff shift management' },
      { name: 'Manager - Feedback', description: 'User feedback responses' },
      { name: 'Admin - Buildings', description: 'System-wide building management' },
      { name: 'Admin - Users', description: 'System-wide user management' },
      { name: 'Admin - Audit Logs', description: 'System audit trail' },
      { name: 'Admin - Dashboard', description: 'System-wide dashboard' },
      { name: 'Admin - Revenue', description: 'System revenue and transfers' },
      { name: 'Admin - Wallet', description: 'System wallet management' },
      { name: 'Admin - Price Policies', description: 'View building price policies (read-only)' },
      { name: 'Admin - Subscription Packages', description: 'Manager subscription packages' },
      { name: 'Payment - Webhook', description: 'PayOS payment webhook (no auth)' },
    ],
  },
  apis: [
    './src/docs/**/*.js',
    './src/routes/**/*.swagger.js', // Ưu tiên quét file định nghĩa swagger trước
    './src/routes/**/*.js',
  ],
};

let swaggerSpec;
try {
  const rawSpec = swaggerJsdoc(options);
  
  // HOOK BẢO HIỂM: Tự động lọc sạch các block tag bị lỗi null phát sinh từ file con
  if (rawSpec.tags) {
    rawSpec.tags = rawSpec.tags.filter(tag => tag && tag.name);
  }
  swaggerSpec = rawSpec;
} catch (error) {
  console.error('[Swagger Config Error] Safe-mode fallback activated due to formatting error:', error.message);
  // Tạo fallback spec trống để tránh làm sập server, giúp Bảo vẫn chạy được dự án
  swaggerSpec = { openapi: '3.0.0', info: options.definition.info, paths: {}, components: options.definition.components };
}

const setupSwagger = (app) => {
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'PBMS API Documentation',
  }));
};

module.exports = { setupSwagger, swaggerSpec };