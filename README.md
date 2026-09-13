# WEB07-AiAgent

This is a Node.js/Express application with a chat UI shell implementation.

## Chat UI Shell Implementation

The chat UI shell has been implemented with the following structure:

### Features Implemented:
1. Permanent left sidebar 
2. Sidebar contains a "Chat" menu item
3. Main content area displays the Chat view
4. Chat view is a separate feature/component
5. Chat view contains only a simple placeholder
6. CSS follows component/feature structure

### File Structure:
```
src/
├── client/
│   ├── components/
│   │   ├── layout.tsx           # Main layout with sidebar and header
│   │   └── chat/
│   │       ├── ChatView.tsx     # Chat view component with placeholder
│   │       ├── chat.css         # Component-specific CSS
│   │       └── index.ts         # Exports for the chat feature
│   └── index.html               # Entry point for the UI
└── server.ts                    # Basic server to serve the UI
```

### How to run:
1. Install dependencies: `npm install`
2. Start development server: `npm run dev`
3. Visit http://localhost:3000/chat

## Development Notes:
- The implementation follows React component structure
- CSS is organized by feature/component
- The chat view is a placeholder as required
- Sidebar is permanent and contains the Chat menu item

## Environment configuration

The server reads runtime configuration from the project's `.env` file.

When starting the compiled server, make sure Node loads the file explicitly:

    node --env-file=.env dist/server.js

The provided start script should use the same command.
`.env.example` is only a template showing which environment variables are supported. It is not loaded by the application and should not contain real secrets.

The local `.env` file contains the actual runtime values for the current installation and should normally not be committed to source control.

For persisted model-connection API keys, the server requires:
    MODEL_CREDENTIAL_ENCRYPTION_KEY=<32-byte base64 key>

This key is used only to encrypt and decrypt saved model-connection credentials. It is not the API key sent to the model provider.

Important:

- Keep the same `MODEL_CREDENTIAL_ENCRYPTION_KEY` across server restarts.
- Do not commit the real encryption key.
- Do not copy `.env` into `dist`.
- Connections without an API key continue to work without authentication.
- API keys entered under Settings → Connections are encrypted and persisted server-side, then reused automatically for that saved connection.