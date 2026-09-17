import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

const swaggerCustomCss = `
  :root {
    --code-quest-primary: #3a14c4;
    --code-quest-primary-hover: #7e70f9;
    --code-quest-accent: #c0b9fc;
    --code-quest-bg: #171027;
    --code-quest-surface: #1c1829;
    --code-quest-surface-raised: #241c36;
    --code-quest-border: rgba(192, 185, 252, 0.22);
    --code-quest-text: #ffffff;
    --code-quest-muted: #7b72c0;
    --code-quest-code-bg: #120c1f;
    --code-quest-error: #f4aea3;
    --code-quest-success: #a8ad5c;
  }

  html,
  body {
    background: var(--code-quest-bg);
  }

  .swagger-ui {
    color: var(--code-quest-text);
    font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
  }

  .swagger-ui .topbar {
    display: none;
  }

  .swagger-ui .wrapper {
    max-width: 1320px;
    padding: 0 32px;
  }

  .swagger-ui .information-container.wrapper {
    background: var(--code-quest-surface);
    border: 1px solid var(--code-quest-border);
    border-radius: 16px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
    margin: 28px auto 20px;
    padding: 28px 32px;
  }

  .swagger-ui .info {
    margin: 0;
  }

  .swagger-ui .info .title {
    color: var(--code-quest-text);
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    font-size: 34px;
    font-weight: 600;
    line-height: 1.15;
  }

  .swagger-ui .info .title small {
    background: transparent;
    top: 8px;
  }

  .swagger-ui .info .title small.version-stamp {
    background: var(--code-quest-primary);
    border-radius: 999px;
  }

  .swagger-ui .info .title small pre {
    background: var(--code-quest-primary);
    color: var(--code-quest-text);
  }

  .swagger-ui .info .description,
  .swagger-ui .info p,
  .swagger-ui .info li {
    color: var(--code-quest-accent);
    font-size: 15px;
    line-height: 1.65;
    max-width: 980px;
  }

  .swagger-ui .info a {
    color: var(--code-quest-accent);
  }

  .swagger-ui .info a:hover {
    color: var(--code-quest-primary-hover);
  }

  .swagger-ui .scheme-container {
    background: var(--code-quest-surface);
    border: 1px solid var(--code-quest-border);
    border-radius: 16px;
    box-shadow: none;
    margin: 0 auto 20px;
    max-width: 1320px;
    padding: 18px 32px;
  }

  .swagger-ui .scheme-container .schemes > label {
    color: var(--code-quest-accent);
  }

  .swagger-ui select {
    background: var(--code-quest-surface-raised);
    border-color: var(--code-quest-border);
    color: var(--code-quest-text);
    box-shadow: none;
  }

  .swagger-ui .btn {
    border-radius: 10px;
    box-shadow: none;
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  }

  .swagger-ui .btn.execute {
    background: var(--code-quest-primary);
    border-color: transparent;
    color: var(--code-quest-text);
  }

  .swagger-ui .btn.execute:hover {
    background: var(--code-quest-primary-hover);
  }

  .swagger-ui .auth-wrapper .authorize,
  .swagger-ui .btn.authorize {
    background: var(--code-quest-primary);
    border-color: transparent;
    color: var(--code-quest-text);
  }

  .swagger-ui .btn.authorize svg {
    fill: var(--code-quest-text);
  }

  .swagger-ui .authorization__btn svg {
    fill: var(--code-quest-accent);
  }

  .swagger-ui .dialog-ux .modal-ux {
    background: var(--code-quest-surface);
    border: 1px solid var(--code-quest-border);
    border-radius: 16px;
    color: var(--code-quest-text);
  }

  .swagger-ui .dialog-ux .modal-ux-header {
    background: var(--code-quest-surface);
    border-bottom: 1px solid var(--code-quest-border);
  }

  .swagger-ui .dialog-ux .modal-ux-header h3,
  .swagger-ui .dialog-ux .modal-ux-content h4,
  .swagger-ui .dialog-ux .modal-ux-content p,
  .swagger-ui .dialog-ux .modal-ux-content label {
    color: var(--code-quest-text);
  }

  .swagger-ui input[type="text"],
  .swagger-ui input[type="password"],
  .swagger-ui input[type="search"],
  .swagger-ui textarea {
    background: var(--code-quest-bg);
    border: 1px solid var(--code-quest-border);
    border-radius: 10px;
    color: var(--code-quest-text);
  }

  .swagger-ui input[type="text"]::placeholder,
  .swagger-ui textarea::placeholder {
    color: var(--code-quest-muted);
  }

  .swagger-ui .opblock-tag-section {
    background: var(--code-quest-surface);
    border: 1px solid var(--code-quest-border);
    border-radius: 16px;
    margin: 18px 0;
    overflow: hidden;
  }

  .swagger-ui .opblock-tag {
    border-bottom: 1px solid var(--code-quest-border);
    color: var(--code-quest-text);
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    font-size: 21px;
    padding: 16px 20px;
  }

  .swagger-ui .opblock-tag small {
    color: var(--code-quest-muted);
    display: block;
    font-family: "DM Sans", ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.45;
    margin-top: 6px;
  }

  .swagger-ui .expand-operation svg,
  .swagger-ui .opblock-control-arrow {
    fill: var(--code-quest-accent);
  }

  .swagger-ui .opblock {
    border-radius: 12px;
    box-shadow: none;
    margin: 10px 14px;
  }

  .swagger-ui .opblock .opblock-summary {
    min-height: 52px;
    padding: 10px 14px;
  }

  .swagger-ui .opblock .opblock-summary-method {
    border-radius: 8px;
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
    min-width: 74px;
    padding: 8px 0;
  }

  .swagger-ui .opblock .opblock-summary-path,
  .swagger-ui .opblock .opblock-summary-path__deprecated {
    color: var(--code-quest-text);
    font-size: 15px;
  }

  .swagger-ui .opblock .opblock-summary-description {
    color: var(--code-quest-muted);
    font-size: 13px;
  }

  .swagger-ui .opblock.opblock-get {
    background: rgba(192, 185, 252, 0.08);
    border-color: rgba(192, 185, 252, 0.35);
  }

  .swagger-ui .opblock.opblock-get .opblock-summary-method {
    background: #7e70f9;
  }

  .swagger-ui .opblock.opblock-post {
    background: rgba(168, 173, 92, 0.1);
    border-color: rgba(168, 173, 92, 0.4);
  }

  .swagger-ui .opblock.opblock-post .opblock-summary-method {
    background: #6f7538;
  }

  .swagger-ui .opblock.opblock-put,
  .swagger-ui .opblock.opblock-patch {
    background: rgba(58, 20, 196, 0.16);
    border-color: rgba(126, 112, 249, 0.45);
  }

  .swagger-ui .opblock.opblock-put .opblock-summary-method,
  .swagger-ui .opblock.opblock-patch .opblock-summary-method {
    background: var(--code-quest-primary);
  }

  .swagger-ui .opblock.opblock-delete {
    background: rgba(244, 174, 163, 0.1);
    border-color: rgba(244, 174, 163, 0.4);
  }

  .swagger-ui .opblock.opblock-delete .opblock-summary-method {
    background: #b86b61;
  }

  .swagger-ui .opblock-body {
    background: var(--code-quest-surface-raised);
  }

  .swagger-ui .opblock-section-header {
    background: transparent;
    border-color: var(--code-quest-border);
    box-shadow: none;
  }

  .swagger-ui .opblock-section-header h4,
  .swagger-ui .opblock-section-header label {
    color: var(--code-quest-text);
  }

  .swagger-ui .tab li,
  .swagger-ui .tab li button.tablinks {
    color: var(--code-quest-accent);
  }

  .swagger-ui .opblock-description-wrapper,
  .swagger-ui .opblock-external-docs-wrapper,
  .swagger-ui .opblock-title_normal {
    color: var(--code-quest-accent);
    font-size: 14px;
    line-height: 1.6;
    padding: 14px 24px;
  }

  .swagger-ui table {
    border-collapse: separate;
    border-spacing: 0;
  }

  .swagger-ui table thead tr td,
  .swagger-ui table thead tr th,
  .swagger-ui table thead tr td,
  .swagger-ui .parameter__name,
  .swagger-ui .parameter__type,
  .swagger-ui .parameter__deprecated,
  .swagger-ui .parameter__in,
  .swagger-ui .response-col_status,
  .swagger-ui .response-col_links,
  .swagger-ui .response-col_description {
    color: var(--code-quest-accent);
  }

  .swagger-ui table thead tr td,
  .swagger-ui table thead tr th {
    border-bottom: 1px solid var(--code-quest-border);
    font-size: 12px;
  }

  .swagger-ui table tbody tr td {
    color: var(--code-quest-text);
  }

  .swagger-ui .parameters-col_description input,
  .swagger-ui .parameters-col_description select,
  .swagger-ui textarea {
    border-color: var(--code-quest-border);
    border-radius: 10px;
  }

  .swagger-ui .highlight-code,
  .swagger-ui .microlight,
  .swagger-ui .opblock-body pre.microlight {
    background: var(--code-quest-code-bg) !important;
    border-radius: 10px;
    color: var(--code-quest-accent) !important;
  }

  .swagger-ui .model-box,
  .swagger-ui section.models {
    background: var(--code-quest-surface);
    border: 1px solid var(--code-quest-border);
    border-radius: 16px;
  }

  .swagger-ui section.models h4,
  .swagger-ui section.models h4 span {
    color: var(--code-quest-text);
  }

  .swagger-ui .model-title,
  .swagger-ui .model,
  .swagger-ui .prop-format,
  .swagger-ui .prop-type {
    color: var(--code-quest-accent);
    font-size: 13px;
  }

  .swagger-ui .model-toggle:after {
    background: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMCAyMCI+PHBhdGggZmlsbD0iI2MwYjlmYyIgZD0iTTEwIDE1bC02LTZoMTJ6Ii8+PC9zdmc+") center center no-repeat;
    background-size: 16px;
  }

  .swagger-ui .errors-wrapper {
    background: rgba(244, 174, 163, 0.12);
    border-color: var(--code-quest-error);
    color: var(--code-quest-error);
  }

  .swagger-ui .response-col_status,
  .swagger-ui .response-col_description {
    color: var(--code-quest-text);
  }

  .swagger-ui .copy-to-clipboard button {
    background: var(--code-quest-surface-raised);
  }

  .swagger-ui .filter-container .operation-filter-input {
    background: var(--code-quest-surface);
    border: 1px solid var(--code-quest-border);
    color: var(--code-quest-text);
  }

  @media (max-width: 768px) {
    .swagger-ui .wrapper,
    .swagger-ui .scheme-container,
    .swagger-ui .information-container.wrapper {
      padding-left: 16px;
      padding-right: 16px;
    }

    .swagger-ui .info .title {
      font-size: 26px;
    }

    .swagger-ui .opblock .opblock-summary {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 8px;
    }
  }
`;

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
) {
  const port = configService.get<number>('app.port') ?? 3000;
  const hostApi = configService.get<string>('HOST_API');
  const localServer = `http://localhost:${port}`;

  const config = new DocumentBuilder()
    .setTitle('Code Quest API')
    .setDescription(
      [
        'REST API for Code Quest learning paths.',
        'Published courses and catalogs are readable. Administration requires the pending authentication integration.',
      ].join(' '),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the access token returned by the auth flow.',
      },
      'access-token',
    )
    .addServer(localServer, 'Local API')
    .addTag('Courses', 'Published learning resources.')
    .addTag('Catalog', 'Categories, technologies and fixed levels.')
    .addTag(
      'Catalog administration',
      'Blocked until administrator authentication is integrated.',
    );

  if (hostApi) {
    config.addServer(hostApi, 'Configured API host');
  }

  const document = SwaggerModule.createDocument(app, config.build(), {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
  });

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: '/api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Code Quest API Docs',
    customfavIcon:
      'https://import.cdn.thinkific.com/643563%2Fcustom_site_themes%2Fid%2FWfAxXZRxQleTTbGJPzpp_devtalles-icon.png',
    customCssUrl:
      'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:ital,wght@0,400;0,500;1,400&display=swap',
    customCss: swaggerCustomCss,
  });

  app.use(
    '/api/reference',
    apiReference({
      spec: {
        content: document,
      },
      pageTitle: 'Code Quest',
      theme: 'purple',
      persistAuth: true,
    }),
  );
}
