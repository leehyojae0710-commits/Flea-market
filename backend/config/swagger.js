// backend/config/swagger.js
// swagger-jsdoc으로 routes/*.js 안의 @swagger 주석을 모아 OpenAPI 문서를 만듭니다.
// 신규 파일이라 기존 코드와 충돌할 일이 없습니다.

import swaggerJSDoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Flea-market API',
      version: '1.0.0',
      description:
        '플리마켓 매칭 플랫폼 백엔드 API 문서입니다. 응답은 `{ success, data, message }` 형태입니다. ' +
        '로그인/회원가입 응답의 token을 우측 상단 Authorize 버튼에 Bearer <token> 형식으로 입력하면 인증이 필요한 API도 테스트할 수 있습니다.',
    },
    servers: [
      { url: 'http://localhost:5000/api', description: '로컬 개발 서버' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        // 모든 응답의 공통 뼈대: { success, data, message }
        ApiEnvelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        ErrorResponse: {
          allOf: [
            { $ref: '#/components/schemas/ApiEnvelope' },
            {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                data: { nullable: true, example: null },
              },
            },
          ],
        },
        User: {
          type: 'object',
          description: 'authRoutes.js publicUser() 가 내려주는 회원 정보 (비밀번호 해시 제외)',
          properties: {
            userId: { type: 'integer', example: 1 },
            userType: { type: 'integer', description: '0: 판매자, 1: 주최자', example: 0 },
            email: { type: 'string', example: 'seller01@example.com' },
            phone: { type: 'string', example: '010-1234-5678' },
            region: { type: 'string', example: '서울시 강남구' },
          },
        },
        AuthData: {
          type: 'object',
          properties: {
            token: { type: 'string', description: 'JWT (7일 만료)' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        ToggleRoleData: {
          type: 'object',
          properties: {
            activeRole: { type: 'string', enum: ['host', 'seller'] },
          },
        },
        Market: {
          type: 'object',
          properties: {
            marketId: { type: 'integer' },
            hostId: { type: 'integer' },
            title: { type: 'string' },
            description: { type: 'string' },
            marketImage: { type: 'string', nullable: true },
            locationName: { type: 'string' },
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            eventDate: { type: 'string', format: 'date' },
            isExpired: { type: 'boolean' },
            boothPrice: { type: 'integer' },
            hostRegion: { type: 'string', description: '목록 조회(GET /markets)에서만 users JOIN으로 함께 내려옵니다.' },
          },
        },
        MarketCreateData: {
          type: 'object',
          properties: { marketId: { type: 'integer' } },
        },
        MarketLocationData: {
          type: 'object',
          properties: {
            latitude: { type: 'number' },
            longitude: { type: 'number' },
          },
        },
        Application: {
          type: 'object',
          properties: {
            applicationId: { type: 'integer' },
            marketId: { type: 'integer' },
            sellerId: { type: 'integer' },
            boothNumber: { type: 'string' },
            itemName: { type: 'string' },
            itemImage: { type: 'string', nullable: true },
            productDesc: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
          },
        },
        ApplicationCreateData: {
          type: 'object',
          properties: {
            applicationId: { type: 'integer' },
            status: { type: 'string', enum: ['Pending'] },
          },
        },
        ApplicationStatusData: {
          type: 'object',
          properties: {
            applicationId: { type: 'integer' },
            status: { type: 'string', enum: ['Approved', 'Rejected'] },
          },
        },
        Comment: {
          type: 'object',
          properties: {
            commentId: { type: 'integer' },
            targetType: { type: 'string', example: 'market' },
            targetId: { type: 'integer' },
            userId: { type: 'integer' },
            content: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CommentCreateData: {
          type: 'object',
          properties: {
            commentId: { type: 'integer' },
            targetType: { type: 'string' },
            targetId: { type: 'integer' },
            userId: { type: 'integer' },
            content: { type: 'string' },
          },
        },
        PaymentData: {
          type: 'object',
          properties: {
            paymentId: { type: 'integer' },
            applicationId: { type: 'integer' },
            amount: { type: 'integer' },
            status: { type: 'string', example: 'Paid' },
          },
        },
        ScheduleItemHosting: {
          type: 'object',
          properties: {
            marketId: { type: 'integer' },
            title: { type: 'string' },
            eventDate: { type: 'string', format: 'date' },
            locationName: { type: 'string' },
            isExpired: { type: 'boolean' },
            role: { type: 'string', example: 'host' },
          },
        },
        ScheduleItemSelling: {
          type: 'object',
          properties: {
            marketId: { type: 'integer' },
            title: { type: 'string' },
            eventDate: { type: 'string', format: 'date' },
            locationName: { type: 'string' },
            applicationId: { type: 'integer' },
            status: { type: 'string', enum: ['Pending', 'Approved', 'Rejected'] },
            role: { type: 'string', example: 'seller' },
          },
        },
        ScheduleData: {
          type: 'object',
          properties: {
            hosting: { type: 'array', items: { $ref: '#/components/schemas/ScheduleItemHosting' } },
            selling: { type: 'array', items: { $ref: '#/components/schemas/ScheduleItemSelling' } },
          },
        },
        QrCodeData: {
          type: 'object',
          properties: {
            userId: { type: 'integer' },
            payload: { type: 'string', example: 'checkin:1' },
            qrImage: { type: 'string', description: 'base64 PNG data URL' },
          },
        },
        UserUpdateData: {
          type: 'object',
          properties: {
            userId: { type: 'integer' },
            userType: { type: 'integer' },
            email: { type: 'string' },
            phone: { type: 'string' },
            region: { type: 'string' },
          },
        },
      },
    },
  },
  // authRoutes.js에 붙인 @swagger 주석을 읽어옵니다.
  // 다른 팀원이 라우트 파일을 새로 추가하면 이 배열에 경로만 추가하면 됩니다.
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
