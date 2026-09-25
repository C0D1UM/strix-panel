import { schema } from '@strix-panel/db'
import type { ScanAgent } from '@strix-panel/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { auth } from './lib/auth'
import { db, pool } from './lib/db'
import { env } from './lib/env'

export type SeedAdminResult = 'created' | 'promoted' | 'unchanged'

// Creates a local email+password admin, or promotes an existing user with that email.
// Never changes an existing user's password. Safe to run repeatedly.
export async function seedAdmin(input: {
  email: string
  password: string
  name: string
}): Promise<SeedAdminResult> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed an admin when NODE_ENV=production')
  }
  if (!env.AUTH_EMAIL_PASSWORD_ENABLED) {
    throw new Error(
      'The seeded admin signs in with email and password. Set AUTH_EMAIL_PASSWORD_ENABLED=true in .env first.',
    )
  }

  const email = input.email.toLowerCase()
  const [existing] = await db
    .select({ role: schema.user.role })
    .from(schema.user)
    .where(eq(schema.user.email, email))

  if (existing) {
    if (existing.role === 'admin') return 'unchanged'
    await db
      .update(schema.user)
      .set({ role: 'admin', approvedAt: sql`coalesce(${schema.user.approvedAt}, now())` })
      .where(eq(schema.user.email, email))
    return 'promoted'
  }

  // Better Auth's internal adapter, not the sign-up endpoint, so it works with AUTH_REGISTRATION_ENABLED=false.
  // It still hashes the password and runs our user hooks (ALLOWED_EMAIL_DOMAINS).
  const ctx = await auth.$context
  const user = await ctx.internalAdapter.createUser(
    { email, name: input.name, emailVerified: false },
    { method: 'email-password' },
  )
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  })
  await db
    .update(schema.user)
    .set({ role: 'admin', approvedAt: sql`coalesce(${schema.user.approvedAt}, now())` })
    .where(eq(schema.user.email, email))
  return 'created'
}

export type SeedSampleResult = 'created' | 'unchanged'

export const SAMPLE_SCAN_NAME = 'Sample scan (demo data)'

const TARGET = 'https://demo.example.com/'
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000)

const agents: ScanAgent[] = [
  { id: 'root', name: 'StrixAgent', parentId: null, status: 'completed', error: null },
  { id: 'recon', name: 'Recon', parentId: 'root', status: 'completed', error: null },
  { id: 'auth', name: 'Auth testing', parentId: 'root', status: 'completed', error: null },
  { id: 'xss', name: 'XSS hunter', parentId: 'recon', status: 'completed', error: null },
  {
    id: 'upload',
    name: 'File upload tester',
    parentId: 'root',
    status: 'failed',
    error: 'Sandbox ran out of disk space',
  },
]

const findings = [
  {
    strixId: 'vuln-0001',
    title: 'Reflected XSS in search',
    severity: 'high' as const,
    endpoint: '/search',
    method: 'GET',
    cvss: 7.1,
    cwe: 'CWE-79',
    confidence: 'high',
    report: {
      description:
        'The `q` parameter of `/search` is reflected into the page **without output encoding**, so an attacker can run script in a victim’s browser.',
      impact: 'Session theft and actions on behalf of a signed-in user.',
      evidence: 'Request `GET /search?q=<svg onload=alert(1)>` returned the payload unescaped.',
      technical_analysis:
        'The template renders `{{{ query }}}` (unescaped). The response has no `Content-Security-Policy` header.',
      poc_description: 'Open the URL below while signed in; the alert fires.',
      poc_script_code: 'curl -s "https://demo.example.com/search?q=%3Csvg%20onload%3Dalert(1)%3E"',
      remediation_steps:
        '1. HTML-encode the parameter on output.\n2. Add a strict `Content-Security-Policy`.',
      code_locations: [{ file: 'views/search.hbs', line: 14 }],
    },
  },
  {
    strixId: 'vuln-0002',
    title: 'IDOR on /api/invoices/{id}',
    severity: 'critical' as const,
    endpoint: '/api/invoices/{id}',
    method: 'GET',
    cvss: 9.1,
    cwe: 'CWE-639',
    confidence: 'high',
    report: {
      description: 'Any authenticated user can read **any** invoice by changing the numeric id.',
      impact: 'Exposure of every customer’s billing data.',
      evidence: 'User A (`/api/invoices/1001`) fetched user B’s invoice `1002` with a 200.',
      remediation_steps: 'Check that the invoice belongs to the caller before returning it.',
    },
  },
  {
    strixId: 'vuln-0003',
    title: 'Verbose error pages leak stack traces',
    severity: 'low' as const,
    endpoint: '/api/orders',
    method: 'POST',
    cvss: 3.7,
    cwe: 'CWE-209',
    confidence: 'medium',
    report: {
      description: 'Malformed JSON returns a full stack trace including file paths.',
      remediation_steps: 'Return a generic error body and log details server-side.',
    },
  },
  {
    strixId: 'vuln-0004',
    title: 'Missing security headers',
    severity: 'info' as const,
    endpoint: null,
    method: null,
    cvss: null,
    cwe: null,
    confidence: 'high',
    report: {
      description: 'No `X-Content-Type-Options` or `Referrer-Policy` headers are set.',
    },
  },
]

const reportMd = `# Security Penetration Test Report

**Generated:** 2026-09-24 10:42:00 UTC

# Executive Summary

Testing of ${TARGET} found **1 critical**, **1 high**, 1 low and 1 informational issue. The critical issue lets any signed-in user read other customers' invoices.

# Methodology

Black-box testing with an authenticated test account: reconnaissance, authentication and authorization checks, input handling.

# Technical Analysis

See the findings in the panel for evidence and proof of concept for each issue.

# Recommendations

1. Enforce object-level authorization on every \`/api/*\` route.
2. Encode output and add a Content-Security-Policy.
3. Stop returning stack traces to clients.
`

// Inserts one finished demo scan (agents, findings, feed, usage, report) owned by `userId`, so the UI can be
// explored without running Strix. Never enqueues anything. Safe to run repeatedly.
export async function seedSampleScan(userId: string): Promise<SeedSampleResult> {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed sample data when NODE_ENV=production')
  }
  const [existing] = await db
    .select({ id: schema.scan.id })
    .from(schema.scan)
    .where(and(eq(schema.scan.userId, userId), eq(schema.scan.name, SAMPLE_SCAN_NAME)))
    .limit(1)
  if (existing) return 'unchanged'

  const started = new Date(Date.now() - 45 * 60_000)
  const finished = at(started, 38 * 60)
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  for (const finding of findings) counts[finding.severity] += 1

  await db.transaction(async (tx) => {
    const [scan] = await tx
      .insert(schema.scan)
      .values({
        userId,
        name: SAMPLE_SCAN_NAME,
        targets: [TARGET],
        scanMode: 'standard',
        instruction: 'Focus on authorization and injection. Test account: demo / demo-password.',
        maxBudgetUsd: 5,
        status: 'completed',
        runName: 'demo-example-com_a1b2',
        requests: 212,
        inputTokens: 1_843_200,
        outputTokens: 96_400,
        cachedTokens: 1_210_000,
        costUsd: 3.4127,
        findingsCritical: counts.critical,
        findingsHigh: counts.high,
        findingsMedium: counts.medium,
        findingsLow: counts.low,
        findingsInfo: counts.info,
        reportMd,
        agents,
        startedAt: started,
        finishedAt: finished,
        createdAt: at(started, -5),
      })
      .returning({ id: schema.scan.id })
    const scanId = scan!.id

    await tx.insert(schema.scanFinding).values(
      findings.map((finding, i) => ({
        scanId,
        strixId: finding.strixId,
        title: finding.title,
        severity: finding.severity,
        target: TARGET,
        endpoint: finding.endpoint,
        method: finding.method,
        cwe: finding.cwe,
        confidence: finding.confidence,
        cvss: finding.cvss,
        foundAt: at(started, 600 + i * 420),
        report: {
          id: finding.strixId,
          title: finding.title,
          severity: finding.severity,
          ...finding.report,
        },
      })),
    )

    // Inserted in order in one statement: uuidv7 ids ascend, so the feed reads oldest first.
    await tx.insert(schema.scanEvent).values([
      { scanId, type: 'status', message: 'Scan started', createdAt: started },
      {
        scanId,
        type: 'agent_started',
        message: 'Agent StrixAgent started',
        createdAt: at(started, 5),
      },
      { scanId, type: 'agent_started', message: 'Agent Recon started', createdAt: at(started, 40) },
      {
        scanId,
        type: 'agent_started',
        message: 'Agent Auth testing started',
        createdAt: at(started, 300),
      },
      {
        scanId,
        type: 'agent_started',
        message: 'Agent XSS hunter started',
        createdAt: at(started, 520),
      },
      {
        scanId,
        type: 'finding',
        message: 'HIGH: Reflected XSS in search',
        data: { findingId: 'vuln-0001', severity: 'high' },
        createdAt: at(started, 600),
      },
      {
        scanId,
        type: 'agent_finished',
        message: 'Agent XSS hunter finished',
        createdAt: at(started, 700),
      },
      {
        scanId,
        type: 'finding',
        message: 'CRITICAL: IDOR on /api/invoices/{id}',
        data: { findingId: 'vuln-0002', severity: 'critical' },
        createdAt: at(started, 1020),
      },
      {
        scanId,
        type: 'agent_started',
        message: 'Agent File upload tester started',
        createdAt: at(started, 1100),
      },
      {
        scanId,
        type: 'finding',
        message: 'LOW: Verbose error pages leak stack traces',
        data: { findingId: 'vuln-0003', severity: 'low' },
        createdAt: at(started, 1440),
      },
      {
        scanId,
        type: 'agent_failed',
        message: 'Agent File upload tester failed: Sandbox ran out of disk space',
        createdAt: at(started, 1500),
      },
      {
        scanId,
        type: 'finding',
        message: 'INFO: Missing security headers',
        data: { findingId: 'vuln-0004', severity: 'info' },
        createdAt: at(started, 1860),
      },
      {
        scanId,
        type: 'agent_finished',
        message: 'Agent Recon finished',
        createdAt: at(started, 2000),
      },
      {
        scanId,
        type: 'agent_finished',
        message: 'Agent Auth testing finished',
        createdAt: at(started, 2100),
      },
      {
        scanId,
        type: 'agent_finished',
        message: 'Agent StrixAgent finished',
        createdAt: at(started, 2270),
      },
      { scanId, type: 'status', message: 'Scan completed', createdAt: finished },
    ])
  })
  return 'created'
}

if (import.meta.main) {
  const messages: Record<SeedAdminResult, string> = {
    created: 'Created admin',
    promoted: 'Promoted existing user to admin',
    unchanged: 'Admin already exists',
  }
  try {
    const result = await seedAdmin({
      email: env.SEED_ADMIN_EMAIL,
      password: env.SEED_ADMIN_PASSWORD,
      name: env.SEED_ADMIN_NAME,
    })
    console.log(`${messages[result]}: ${env.SEED_ADMIN_EMAIL}`)
    if (result === 'created') console.log(`Sign in with password from SEED_ADMIN_PASSWORD.`)

    const [admin] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, env.SEED_ADMIN_EMAIL.toLowerCase()))
    if (admin) {
      const sample = await seedSampleScan(admin.id)
      console.log(sample === 'created' ? 'Created sample scan' : 'Sample scan already exists')
    }
  } catch (error) {
    console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
