# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RemoteHub is a team remote collaboration platform built with React and TypeScript. It's designed for managing remote connections, VPN configurations, and team collaboration in a unified interface. The application uses Vite as the build tool and includes AI integration through Google's Gemini API.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server (runs on port 3000)
- `npm run build` - Build production version
- `npm run preview` - Preview production build

## Environment Setup

Before running the application, create a `.env.local` file and set:
- `GEMINI_API_KEY` - Your Gemini API key for AI assistant functionality

## Architecture

### Core Structure

**Application Layer:**
- `App.tsx` - Main application component with authentication wrapper
- `index.tsx` - Application entry point

**Components (`/components`):**
- `Sidebar.tsx` - Navigation and project management
- `ConnectionCard.tsx` - Individual connection display
- `ConnectionModal.tsx` - Add/edit connection form
- `ProjectModal.tsx` - Add/edit project form
- `LoginPage.tsx` - User authentication
- `UserManagementModal.tsx` - Admin user management
- `UIComponents.tsx` - Shared UI components and context
- `AIAssistant.tsx` - AI assistant integration
- `Icons.tsx` / `ProjectIcons.tsx` - Icon components

**Services (`/services`):**
- `auth.service.ts` - User authentication and session management
- `data.service.ts` - CRUD operations for projects and connections
- `storage.adapter.ts` - Local storage abstraction layer

**Core Files:**
- `types.ts` - TypeScript interfaces and enums
- `utils.ts` - Utility functions

### Key Features

**Authentication System:**
- Local user management with role-based access (ADMIN/USER)
- Default admin credentials: username `admin`, password `admin123`
- Session persistence in local storage
- Online user tracking with heartbeat system

**Data Management:**
- Projects as containers for connections
- Multiple protocol support (RDP, SSH, VNC, HTTP/HTTPS, VPN, etc.)
- Audit trail with creator/editor tracking
- Local storage persistence (no backend required)

**Connection Types:**
- Remote Desktop (RDP, VNC, VDI)
- SSH connections
- Web connections (HTTP/HTTPS)
- Remote tools (ToDesk, SunLogin, TeamViewer, AnyDesk)
- VPN configurations with dependency management

### Important Patterns

**State Management:**
- React hooks for local state
- No external state management library
- Service layer for data operations

**Data Flow:**
- Components call service methods
- Services interact with storage adapter
- UI updates trigger refreshes

**Security:**
- Client-side only (no backend authentication)
- Passwords stored in local storage (basic hashing)
- Session-based authentication

### Configuration

**Vite Configuration:**
- React plugin enabled
- Path aliases (`@/` maps to root)
- Environment variable injection for API keys
- Development server on port 3000 with host binding

**TypeScript Configuration:**
- ES2022 target
- React JSX support
- Path mapping for imports
- Node.js types included

## Testing

No test framework is currently configured in this project.

## AI Integration

The application includes AI assistant functionality through Google's Gemini API. The API key should be configured in the environment variables.

## Development Notes

- This is a frontend-only application using local storage for data persistence
- No backend server is required
- User authentication is client-side only
- All data is stored locally in the browser
- The application supports both English and Chinese interfaces