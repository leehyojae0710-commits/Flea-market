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
    },
  },
  // authRoutes.js에 붙인 @swagger 주석을 읽어옵니다.
  // 다른 팀원이 라우트 파일을 새로 추가하면 이 배열에 경로만 추가하면 됩니다.
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
