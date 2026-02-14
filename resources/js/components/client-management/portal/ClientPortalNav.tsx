'use client'

import { ChevronDown, Clock, FileText, FolderOpen, Home, Receipt, Settings } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { AppInitialDataSchema } from '@/types/client-management/hydration-schemas'

interface Project {
  id: number
  name: string
  slug: string
}

interface Company {
  id: number
  company_name: string
  slug: string
}

interface ClientPortalNavProps {
  slug: string
  companyName: string
  currentPage: 'home' | 'project' | 'time' | 'invoices' | 'invoice' | 'agreement' | 'expenses'
  currentProjectSlug?: string | undefined
  projectName?: string | undefined
  invoiceNumber?: string | undefined
  projects?: Project[] | undefined
  isAdmin?: boolean | undefined
  companyId?: number | undefined
}

export default function ClientPortalNav({
  slug,
  companyName,
  currentPage,
  currentProjectSlug,
  projectName,
  invoiceNumber,
  projects: initialProjects,
  isAdmin = false,
  companyId
}: ClientPortalNavProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects || [])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loadingProjects, setLoadingProjects] = useState(!initialProjects)
  const [loadingCompanies, setLoadingCompanies] = useState(true)

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoadingProjects(false)
    }
  }, [slug])

  const fetchCompanies = useCallback(async () => {
    // Check for global hydrated app data first
    try {
      const appScript = document.getElementById('app-initial-data') as HTMLScriptElement | null
      const appRaw = appScript?.textContent ? JSON.parse(appScript.textContent) : null
      const appParsed = appRaw ? AppInitialDataSchema.safeParse(appRaw) : null

      if (appParsed?.success && appParsed.data.clientCompanies) {
        setCompanies(appParsed.data.clientCompanies as Company[])
        setLoadingCompanies(false)
        return
      }
    } catch (e) {
      // fallback to API
    }

    try {
      const response = await fetch('/api/client/portal/companies')
      if (response.ok) {
        const data = await response.json()
        setCompanies(data)
      }
    } catch (error) {
      console.error('Error fetching companies:', error)
    } finally {
      setLoadingCompanies(false)
    }
  }, [])

  useEffect(() => {
    if (!initialProjects) {
      fetchProjects()
    }
    fetchCompanies()
  }, [initialProjects, fetchProjects, fetchCompanies])

  const currentProject = projects.find(p => p.slug === currentProjectSlug)

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mb-6 print:hidden">
      <div className="mx-auto px-4 max-w-7xl">
        <div className="flex h-14 items-center justify-between">
          {/* Left side: Company name, Home, Projects dropdown */}
          <div className="flex items-center gap-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="font-semibold text-lg hover:text-primary transition-colors px-2 gap-1 h-auto">
                  {companyName}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {loadingCompanies ? (
                  <DropdownMenuItem disabled>Loading companies...</DropdownMenuItem>
                ) : companies.length === 0 ? (
                  <DropdownMenuItem disabled>No companies available</DropdownMenuItem>
                ) : (
                  <>
                    {companies.map(company => (
                      <DropdownMenuItem key={company.id} asChild>
                        <a
                          href={`/client/portal/${company.slug}`}
                          className={cn(
                            slug === company.slug && 'bg-accent font-medium'
                          )}
                        >
                          {company.company_name}
                        </a>
                      </DropdownMenuItem>
                    ))}
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <a href="/client/mgmt">
                            All Companies
                          </a>
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-1">
              {/* Home link */}
              <Button
                variant={currentPage === 'home' ? 'secondary' : 'ghost'}
                size="sm"
                asChild
              >
                <a href={`/client/portal/${slug}`}>
                  <Home className="h-4 w-4 mr-1" />
                  Home
                </a>
              </Button>

              {/* Time Records */}
              <Button
                variant={currentPage === 'time' ? 'secondary' : 'ghost'}
                size="sm"
                asChild
              >
                <a href={`/client/portal/${slug}/time`}>
                  <Clock className="h-4 w-4 mr-1" />
                  Time Records
                </a>
              </Button>

              {/* Expenses */}
              <Button
                variant={currentPage === 'expenses' ? 'secondary' : 'ghost'}
                size="sm"
                asChild
              >
                <a href={`/client/portal/${slug}/expenses`}>
                  <Receipt className="h-4 w-4 mr-1" />
                  Expenses
                </a>
              </Button>

              {/* Invoices */}
              <Button
                variant={currentPage === 'invoices' || currentPage === 'invoice' ? 'secondary' : 'ghost'}
                size="sm"
                asChild
              >
                <a href={`/client/portal/${slug}/invoices`}>
                  <FileText className="h-4 w-4 mr-1" />
                  Invoices
                </a>
              </Button>

              {/* Tasks dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={currentPage === 'project' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="gap-1"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {currentProject ? currentProject.name : 'Tasks'}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {loadingProjects ? (
                    <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
                  ) : projects.length === 0 ? (
                    <DropdownMenuItem disabled>No projects</DropdownMenuItem>
                  ) : (
                    projects.map(project => (
                      <DropdownMenuItem key={project.id} asChild>
                        <a
                          href={`/client/portal/${slug}/project/${project.slug}`}
                          className={cn(
                            currentProjectSlug === project.slug && 'bg-accent'
                          )}
                        >
                          {project.name}
                        </a>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Right side: Manage Company button */}
          {isAdmin && companyId && (
            <div className="flex items-center">
              <Button variant="outline" size="sm" asChild className="gap-2">
                <a href={`/client/mgmt/${companyId}`}>
                  <Settings className="h-4 w-4" />
                  Manage Company
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumbs Row */}
      {currentPage !== 'home' && (
        <div className="mx-auto px-4 max-w-7xl pb-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/client/portal/${slug}`}>Home</BreadcrumbLink>
              </BreadcrumbItem>

              {currentPage === 'time' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Time Records</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}

              {currentPage === 'expenses' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Expenses</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}

              {currentPage === 'invoices' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Invoices</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}

              {currentPage === 'invoice' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/client/portal/${slug}/invoices`}>Invoices</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{invoiceNumber ? `Invoice ${invoiceNumber}` : 'Invoice'}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}

              {currentPage === 'project' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{projectName || 'Project'}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}

              {currentPage === 'agreement' && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Agreement</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      )}
    </nav>
  )
}