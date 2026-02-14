import { createRoot } from 'react-dom/client'

import ClientPortalAgreementPage from '@/components/client-management/portal/ClientPortalAgreementPage'
import ClientPortalExpensesPage from '@/components/client-management/portal/ClientPortalExpensesPage'
import ClientPortalIndexPage from '@/components/client-management/portal/ClientPortalIndexPage'
import ClientPortalInvoicePage from '@/components/client-management/portal/ClientPortalInvoicePage'
import ClientPortalInvoicesPage from '@/components/client-management/portal/ClientPortalInvoicesPage'
import ClientPortalProjectPage from '@/components/client-management/portal/ClientPortalProjectPage'
import ClientPortalTimePage from '@/components/client-management/portal/ClientPortalTimePage'
import { InvoiceSchema, InvoiceListItemSchema, InvoiceHydrationSchema } from '@/types/client-management/invoice'
import { ProjectSchema, UserSchema, AgreementSchema, FileRecordSchema, TimeEntrySchema, AppInitialDataSchema } from '@/types/client-management/hydration-schemas'

document.addEventListener('DOMContentLoaded', () => {
  // Parse app-level head JSON once (id="app-initial-data") and validate it.
  // Components should read auth/currentUser/isAdmin from this source.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appScript = document.getElementById('app-initial-data') as HTMLScriptElement | null
  const appRaw: any = appScript && appScript.textContent ? JSON.parse(appScript.textContent) : null
  const appParsed = appRaw ? AppInitialDataSchema.safeParse(appRaw) : null
  if (appParsed && !appParsed.success) {
    console.error('Invalid app-initial-data payload — app-level hydration may be unsafe.', appParsed.error)
  }
  const appData = appParsed && appParsed.success ? appParsed.data : (appRaw || null)
  // Validate app-level currentUser shape (log; components will fall back on API if invalid)
  try {
    const parsedCurrentUser = UserSchema.nullable().safeParse(appData?.currentUser ?? null)
    if (!parsedCurrentUser.success) {
      console.error('Invalid hydrated currentUser payload — will fall back to API fetch.', parsedCurrentUser.error)
    }
  } catch (e) {
    /* no-op */
  }

  const indexDiv = document.getElementById('ClientPortalIndexPage')
  if (indexDiv) {
    // Server-hydrated payload must be embedded in <script type="application/json"> tag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
    const serverData: any = script && script.textContent ? JSON.parse(script.textContent) : null

    if (!serverData || !serverData.slug) {
      console.error('Missing server-hydrated payload for Client Portal index — aborting mount.')
      return
    }

    // Validate hydrated payloads (fall back to API fetch on validation failure)
    const parsedProjects = ProjectSchema.array().safeParse(serverData.projects ?? [])
    if (!parsedProjects.success) {
      console.error('Invalid hydrated projects payload — will fall back to API fetch.', parsedProjects.error)
    }
    const initialProjects = parsedProjects.success ? parsedProjects.data : undefined

    const parsedAgreements = AgreementSchema.array().safeParse(serverData.agreements ?? [])
    if (!parsedAgreements.success) {
      console.error('Invalid hydrated agreements payload — ignoring server data.', parsedAgreements.error)
    }
    const initialAgreements = parsedAgreements.success ? parsedAgreements.data : undefined

    const parsedCompanyUsers = UserSchema.array().safeParse(serverData.companyUsers ?? [])
    if (!parsedCompanyUsers.success) {
      console.error('Invalid hydrated companyUsers payload — will fall back to API fetch.', parsedCompanyUsers.error)
    }
    const initialCompanyUsers = parsedCompanyUsers.success ? parsedCompanyUsers.data : undefined

    const parsedRecentTimeEntries = TimeEntrySchema.array().safeParse(serverData.recentTimeEntries ?? [])
    if (!parsedRecentTimeEntries.success) {
      console.error('Invalid hydrated recentTimeEntries payload — ignoring server data.', parsedRecentTimeEntries.error)
    }
    const initialRecentTimeEntries = parsedRecentTimeEntries.success ? parsedRecentTimeEntries.data : undefined

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const isAdmin = appData?.isAdmin ?? false

    const root = createRoot(indexDiv)
    root.render(<ClientPortalIndexPage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      isAdmin={isAdmin}
      initialProjects={initialProjects as any}
      initialAgreements={initialAgreements as any}
      initialCompanyUsers={initialCompanyUsers as any}
      initialRecentTimeEntries={initialRecentTimeEntries as any}
      afterEdit={() => window.location.reload()}
    />)
  }

  const timeDiv = document.getElementById('ClientPortalTimePage')
  if (timeDiv) {
    // Read head-embedded JSON payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
    const serverData: any = script && script.textContent ? JSON.parse(script.textContent) : null

    if (!serverData || !serverData.slug) {
      console.error('Missing server-hydrated payload for Client Portal time — aborting mount.')
      return
    }

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const isAdmin = appData?.isAdmin ?? false
    const parsedCompanyUsers_time = UserSchema.array().safeParse(serverData.companyUsers ?? [])
    if (!parsedCompanyUsers_time.success) {
      console.error('Invalid hydrated companyUsers for time page — will fall back to API fetch.', parsedCompanyUsers_time.error)
    }
    const initialCompanyUsers = parsedCompanyUsers_time.success ? parsedCompanyUsers_time.data : undefined

    const parsedProjects_time = ProjectSchema.array().safeParse(serverData.projects ?? [])
    if (!parsedProjects_time.success) {
      console.error('Invalid hydrated projects for time page — will fall back to API fetch.', parsedProjects_time.error)
    }
    const initialProjects = parsedProjects_time.success ? parsedProjects_time.data : undefined

    const root = createRoot(timeDiv)
    root.render(<ClientPortalTimePage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      isAdmin={isAdmin}
      initialCompanyUsers={initialCompanyUsers as any}
      initialProjects={initialProjects as any}
    />)
  }

  const projectDiv = document.getElementById('ClientPortalProjectPage')
  if (projectDiv) {
    // Read head-embedded JSON payload for project page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
    const serverData: any = script && script.textContent ? JSON.parse(script.textContent) : null

    if (!serverData || !serverData.project) {
      console.error('Missing server-hydrated payload for Client Portal project — aborting mount.')
      return
    }

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const projectSlug = serverData.project.slug
    const projectName = serverData.project.name
    const isAdmin = appData?.isAdmin ?? false

    const initialTasksRaw = serverData.tasks
    const initialTasks = Array.isArray(initialTasksRaw) ? initialTasksRaw : undefined

    const parsedCompanyUsers_proj = UserSchema.array().safeParse(serverData.companyUsers ?? [])
    if (!parsedCompanyUsers_proj.success) {
      console.error('Invalid hydrated companyUsers for project page — will fall back to API fetch.', parsedCompanyUsers_proj.error)
    }
    const initialCompanyUsers = parsedCompanyUsers_proj.success ? parsedCompanyUsers_proj.data : undefined

    const parsedProjects_proj = ProjectSchema.array().safeParse(serverData.projects ?? [])
    if (!parsedProjects_proj.success) {
      console.error('Invalid hydrated projects for project page — will fall back to API fetch.', parsedProjects_proj.error)
    }
    const initialProjects = parsedProjects_proj.success ? parsedProjects_proj.data : undefined

    const root = createRoot(projectDiv)
    root.render(<ClientPortalProjectPage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      projectSlug={projectSlug}
      projectName={projectName}
      isAdmin={isAdmin}
      // hydration props
      initialTasks={initialTasks as any}
      initialCompanyUsers={initialCompanyUsers as any}
      initialProjects={initialProjects as any}
    />)
  }

  const agreementDiv = document.getElementById('ClientPortalAgreementPage')
  if (agreementDiv) {
    // Read head-embedded JSON payload for agreement page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
    const serverData: any = script && script.textContent ? JSON.parse(script.textContent) : null

    if (!serverData || !serverData.agreement) {
      console.error('Missing server-hydrated payload for Client Portal agreement — aborting mount.')
      return
    }

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const isAdmin = appData?.isAdmin ?? false
    const parsedAgreement = AgreementSchema.safeParse(serverData.agreement ?? {})
    if (!parsedAgreement.success) {
      console.error('Invalid hydrated agreement payload — aborting to allow API fallback.', parsedAgreement.error)
    }
    const initialAgreement = parsedAgreement.success ? parsedAgreement.data : null

    const parsedInvoices = InvoiceSchema.array().safeParse(serverData.invoices ?? [])
    if (!parsedInvoices.success) {
      console.error('Invalid hydrated invoices for agreement page — ignoring server invoices.', parsedInvoices.error)
    }
    const initialInvoices = parsedInvoices.success ? parsedInvoices.data : undefined

    if (!initialAgreement) {
      console.error('Invalid or missing hydrated agreement — aborting mount.')
      return
    }

    const root = createRoot(agreementDiv)
    root.render(<ClientPortalAgreementPage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      agreementId={initialAgreement.id}
      isAdmin={isAdmin}
      initialAgreement={initialAgreement as any}
      initialInvoices={initialInvoices as any}
    />)
  }

  const invoicesDiv = document.getElementById('ClientPortalInvoicesPage')
  if (invoicesDiv) {
    // Read head-embedded JSON payload for invoices page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
    const serverData: any = script && script.textContent ? JSON.parse(script.textContent) : null

    if (!serverData || !serverData.slug) {
      console.error('Missing server-hydrated payload for Client Portal invoices — aborting mount.')
      return
    }

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const isAdmin = appData?.isAdmin ?? false
    // Prefer full Invoice objects, but accept lightweight list items from the server
    const parsedInvoices_full = InvoiceSchema.array().safeParse(serverData.invoices ?? [])
    let initialInvoices: any[] | undefined = undefined

    if (parsedInvoices_full.success) {
      initialInvoices = parsedInvoices_full.data
    } else {
      // try the relaxed list-item schema (server often omits line_items/payments for list endpoints)
      const parsedList = InvoiceListItemSchema.array().safeParse(serverData.invoices ?? [])
      if (parsedList.success) {
        initialInvoices = parsedList.data
      } else {
        // validation failed — treat as missing so the component will fetch from the API
        console.error('Invalid hydrated invoices payload for invoices page — will fall back to API fetch.', parsedInvoices_full.error || parsedList.error)
        initialInvoices = undefined
      }
    }

    const root = createRoot(invoicesDiv)
    root.render(<ClientPortalInvoicesPage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      isAdmin={isAdmin}
      initialInvoices={initialInvoices as any}
    />)
  }

  const invoiceDiv = document.getElementById('ClientPortalInvoicePage')
  if (invoiceDiv) {
    // Read head-embedded JSON payload for invoice page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const script = document.getElementById('client-portal-initial-data') as HTMLScriptElement | null
    const serverData: any = script && script.textContent ? JSON.parse(script.textContent) : null

    if (!serverData || !serverData.invoice) {
      console.error('Missing server-hydrated payload for Client Portal invoice — aborting mount.')
      return
    }

    const slug = serverData.slug
    const companyName = serverData.companyName
    const companyId = serverData.companyId
    const isAdmin = appData?.isAdmin ?? false

    // Validate hydrated invoice payload with Zod
    const rawInvoice = serverData.invoice ?? null

    // Try strict parse first, then fall back to a relaxed hydration schema and normalize it
    let initialInvoice: any = null
    if (rawInvoice) {
      const strict = InvoiceSchema.safeParse(rawInvoice)
      if (strict.success) {
        initialInvoice = strict.data
      } else {
        const relaxed = InvoiceHydrationSchema.safeParse(rawInvoice)
        if (relaxed.success) {
          // values are already normalized by InvoiceHydrationSchema (using currencyjs)
          const src = relaxed.success ? relaxed.data : ({} as any)
          
          const coerced: any = {
            ...src,
            client_company_id: src.client_company_id ?? serverData.companyId,
            invoice_number: src.invoice_number ?? null,
            issue_date: src.issue_date ?? null,
            due_date: src.due_date ?? null,
            paid_date: src.paid_date ?? null,
            status: src.status ?? 'draft',
            period_start: src.period_start ?? null,
            period_end: src.period_end ?? null,
            notes: src.notes ?? null,
            payments: src.payments.map((p: any) => ({
              ...p,
              client_invoice_id: p.client_invoice_id ?? src.client_company_id ?? serverData.companyId,
              payment_date: p.payment_date ?? null,
              payment_method: p.payment_method ?? 'Other',
              notes: p.notes ?? null,
              created_at: p.created_at ?? p.payment_date ?? new Date().toISOString(),
              updated_at: p.updated_at ?? p.payment_date ?? new Date().toISOString(),
            })),
            previous_invoice_id: src.previous_invoice_id ?? null,
            next_invoice_id: src.next_invoice_id ?? null,
          }

          const recheck = InvoiceSchema.safeParse(coerced)
          if (recheck.success) {
            initialInvoice = recheck.data
          } else {
            console.error('Invalid or missing hydrated invoice payload — aborting mount.', recheck.error)
          }
        } else {
          console.error('Invalid or missing hydrated invoice payload — aborting mount.', strict.error)
        }
      }
    }

    if (!initialInvoice) {
      console.error('Invalid or missing hydrated invoice payload — aborting mount.')
      return
    }

    const invoiceId = initialInvoice.client_invoice_id

    const root = createRoot(invoiceDiv)
    root.render(<ClientPortalInvoicePage 
      slug={slug}
      companyName={companyName}
      companyId={companyId}
      invoiceId={invoiceId}
      isAdmin={isAdmin}
      initialInvoice={initialInvoice}
    />)
  }

  const expensesDiv = document.getElementById('ClientPortalExpensesPage')
  if (expensesDiv) {
    const root = createRoot(expensesDiv)
    root.render(<ClientPortalExpensesPage 
      slug={expensesDiv.dataset.slug!}
      companyName={expensesDiv.dataset.companyName!}
      companyId={parseInt(expensesDiv.dataset.companyId!)}
      isAdmin={appData?.isAdmin ?? false}
    />)
  }
})
