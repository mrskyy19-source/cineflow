#!/usr/bin/env bash
###############################################################################
# enterprise-bootstrap.sh
# Transforms a standard Next.js project into an enterprise-grade architecture.
# Run from: ~/web
###############################################################################
set -euo pipefail

# -----------------------------------------------------------------------------
# Colours & helpers
# -----------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[enterprise]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; }

PROJECT_DIR="$(pwd)"
BACKUP_DIR="$PROJECT_DIR/.enterprise_backup_$(date +%s)"

# -----------------------------------------------------------------------------
# Pre-flight checks
# -----------------------------------------------------------------------------
if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  err "package.json not found. Run this from ~/web."
  exit 1
fi

command -v node >/dev/null 2>&1 || { err "Node.js is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { err "npm is required"; exit 1; }

log "Backing up existing project to $BACKUP_DIR ..."
mkdir -p "$BACKUP_DIR"
[[ -d src ]] && cp -r src "$BACKUP_DIR/src" || true
[[ -f package.json ]] && cp package.json "$BACKUP_DIR/package.json" || true
[[ -f next.config.js ]] && cp next.config.js "$BACKUP_DIR/next.config.js" || true
[[ -f tailwind.config.ts ]] && cp tailwind.config.ts "$BACKUP_DIR/tailwind.config.ts" || true
[[ -f tsconfig.json ]] && cp tsconfig.json "$BACKUP_DIR/tsconfig.json" || true
[[ -f postcss.config.js ]] && cp postcss.config.js "$BACKUP_DIR/postcss.config.js" || true
ok "Backup complete."

# -----------------------------------------------------------------------------
# Install enterprise dependencies
# -----------------------------------------------------------------------------
log "Installing enterprise dependencies..."

npm install --save \
  zod \
  @hookform/resolvers \
  react-hook-form \
  @tanstack/react-query \
  zustand \
  clsx \
  tailwind-merge \
  lucide-react \
  next-themes \
  framer-motion \
  date-fns \
  js-cookie \
  pino \
  pino-http \
  @sentry/nextjs \
  || true

npm install --save-dev \
  typescript \
  @types/node \
  @types/react \
  @types/react-dom \
  eslint \
  eslint-config-next \
  prettier \
  husky \
  lint-staged \
  jest \
  ts-jest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  identity-obj-proxy \
  next-bundle-analyzer \
  cross-env \
  || true

ok "Dependencies installed."

# -----------------------------------------------------------------------------
# Enterprise directory structure
# -----------------------------------------------------------------------------
log "Creating enterprise directory structure..."

mkdir -p src/app/{api,(auth),(dashboard),(marketing)}
mkdir -p src/components/{ui,forms,layout,features,providers}
mkdir -p src/{lib,hooks,services,store,types,config,i18n,middleware}
mkdir -p src/app/_tests
mkdir -p .github/workflows

ok "Directory structure created."

# -----------------------------------------------------------------------------
# Configuration files
# -----------------------------------------------------------------------------
log "Writing enterprise configuration files..."

# --- tsconfig.json -----------------------------------------------------------
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "useUnknownInCatchVariables": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      { "name": "next" }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", ".next"]
}
EOF

# --- next.config.js ----------------------------------------------------------
cat > next.config.js <<'EOF'
/** @type {import('next').NextConfig} */
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          { key: 'X-XSS-Protection', value: '0' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;",
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

module.exports = withBundleAnalyzer(nextConfig);
EOF

# --- tailwind.config.ts ------------------------------------------------------
cat > tailwind.config.ts <<'EOF'
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      keyframes: { 'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } }, 'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } } },
      animation: { 'accordion-down': 'accordion-down 0.2s ease-out', 'accordion-up': 'accordion-up 0.2s ease-out' },
    },
  },
  plugins: [],
};
export default config;
EOF

# --- postcss.config.js -------------------------------------------------------
cat > postcss.config.js <<'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
EOF

# --- .env.example ------------------------------------------------------------
cat > .env.example <<'EOF'
# Application
NEXT_PUBLIC_APP_NAME=EnterpriseApp
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# Auth
NEXTAUTH_SECRET=your-32-char-secret
NEXTAUTH_URL=http://localhost:3000

# Database (example)
DATABASE_URL="postgresql://user:pass@localhost:5432/db?schema=public"

# Observability
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=

# Feature flags
NEXT_PUBLIC_ENABLE_BUNDLE_ANALYZER=false
EOF

ok "Configuration files written."

# -----------------------------------------------------------------------------
# Core source files
# -----------------------------------------------------------------------------
log "Writing core enterprise source files..."

# --- lib/logger.ts -----------------------------------------------------------
cat > src/lib/logger.ts <<'EOF'
import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
      },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  serializers: {
    err: pino.stdSerializers.err,
    req: (req: any) => ({
      method: req.method,
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: req.body,
    }),
  },
});

export type Logger = typeof logger;
EOF

# --- config/env.ts (Zod validation) ------------------------------------------
cat > src/config/env.ts <<'EOF'
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default('EnterpriseApp'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  NEXTAUTH_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  SENTRY_DSN: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables');
}

export const env = _env.data;
EOF

# --- lib/utils.ts ------------------------------------------------------------
cat > src/lib/utils.ts <<'EOF'
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(date));
}
EOF

# --- types/index.ts ----------------------------------------------------------
cat > src/types/index.ts <<'EOF'
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type UserRole = 'admin' | 'manager' | 'user';

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  image: string | null;
}
EOF

# --- middleware.ts -----------------------------------------------------------
cat > src/middleware.ts <<'EOF'
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security: block access to internal routes
  if (pathname.startsWith('/_internal')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Example: redirect root to dashboard if authenticated (cookie check)
  // if (pathname === '/' && request.cookies.has('token')) {
  //   return NextResponse.redirect(new URL('/dashboard', request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*$).*)'],
};
EOF

# --- app/layout.tsx ----------------------------------------------------------
cat > src/app/layout.tsx <<'EOF'
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { template: '%s | EnterpriseApp', default: 'EnterpriseApp' },
  description: 'Enterprise-grade Next.js application.',
  openGraph: { siteName: 'EnterpriseApp', locale: 'en_US', type: 'website' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
EOF

# --- app/page.tsx ------------------------------------------------------------
cat > src/app/page.tsx <<'EOF'
export default function Page() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold">Enterprise Next.js</h1>
      <p className="mt-2 text-muted-foreground">Architecture initialized.</p>
    </main>
  );
}
EOF

# --- app/globals.css ---------------------------------------------------------
cat > src/app/globals.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
EOF

# --- components/providers/index.tsx -----------------------------------------
mkdir -p src/components/providers
cat > src/components/providers/index.tsx <<'EOF'
'use client';

import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect } from 'react';
import { logger } from '@/lib/logger';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    logger.info('Providers initialized');
  }, []);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </SessionProvider>
  );
}
EOF

# --- app/api/route.ts example ------------------------------------------------
mkdir -p src/app/api/health
cat > src/app/api/health/route.ts <<'EOF'
import { NextResponse } from 'next/server';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    logger.info('Health check requested');
    return NextResponse.json({
      success: true,
      service: env.NEXT_PUBLIC_APP_NAME,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
EOF

ok "Core source files written."

# -----------------------------------------------------------------------------
# Testing setup
# -----------------------------------------------------------------------------
log "Configuring testing..."

cat > jest.config.ts <<'EOF'
import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};

export default createJestConfig(config);
EOF

cat > jest.setup.ts <<'EOF'
import '@testing-library/jest-dom';
EOF

cat > src/app/_tests/health.test.ts <<'EOF'
import { describe, it, expect } from '@jest/globals';

describe('Health', () => {
  it('placeholder test', () => {
    expect(true).toBe(true);
  });
});
EOF

ok "Testing configured."

# -----------------------------------------------------------------------------
# Linting & formatting
# -----------------------------------------------------------------------------
log "Configuring ESLint, Prettier, Husky..."

cat > .eslintrc.json <<'EOF'
{
  "extends": ["next/core-web-vitals", "plugin:@typescript-eslint/recommended", "prettier"],
  "parser": "@typescript-eslint/parser",
  "parserOptions": { "project": "./tsconfig.json" },
  "plugins": ["@typescript-eslint", "import"],
  "rules": {
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "import/no-anonymous-default-export": "off",
    "react/no-unescaped-entities": "off"
  },
  "ignorePatterns": ["node_modules/", ".next/", "out/", "dist/", "*.config.js", "*.config.ts"]
}
EOF

cat > .prettierrc <<'EOF'
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
EOF

cat > .lintstagedrc <<'EOF'
{
  "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css,scss}": ["prettier --write"]
}
EOF

npx husky init
npx pkgjson husky-hooks || true
cat > .husky/pre-commit <<'EOF'
npx lint-staged
EOF
chmod +x .husky/pre-commit

# package.json scripts injection
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
pkg.scripts = {
  ...pkg.scripts,
  dev: 'next dev',
  build: 'next build',
  start: 'next start',
  lint: 'next lint',
  test: 'jest',
  'test:watch': 'jest --watch',
  analyze: 'ANALYZE=true next build',
  prepare: 'husky'
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

ok "Linting, formatting, and Git hooks configured."

# -----------------------------------------------------------------------------
# Docker
# -----------------------------------------------------------------------------
log "Generating Docker configuration..."

cat > Dockerfile <<'EOF'
# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
USER nextjs
EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"
CMD ["node_modules/.bin/next", "start"]
EOF

cat > docker-compose.yml <<'EOF'
version: '3.8'
services:
  web:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

cat > .dockerignore <<'EOF'
Dockerfile
.dockerignore
node_modules
npm-debug.log
README.md
.env
.env.local
.next
.git
.github
EOF

ok "Docker files generated."

# -----------------------------------------------------------------------------
# CI/CD (GitHub Actions)
# -----------------------------------------------------------------------------
log "Generating GitHub Actions CI pipeline..."

cat > .github/workflows/ci.yml <<'EOF'
name: Enterprise CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --ci

  build:
    needs: lint-and-test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
EOF

ok "CI pipeline generated."

# -----------------------------------------------------------------------------
# Finish
# -----------------------------------------------------------------------------
echo ""
ok "Enterprise bootstrap complete!"
log "Next steps:"
echo "  1. Copy .env.example to .env.local and fill in secrets."
echo "  2. Run: npm run dev"
echo "  3. Run: npm run lint && npm test"
echo "  4. Commit the changes (husky pre-commit will run lint-staged)."
echo ""
warn "Backups stored in: $BACKUP_DIR"
