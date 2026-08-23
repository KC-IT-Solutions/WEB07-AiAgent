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