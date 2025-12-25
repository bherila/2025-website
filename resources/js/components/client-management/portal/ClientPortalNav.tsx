'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { Home, FolderOpen, Clock, FileText, ChevronDown } from 'lucide-react'

interface Project {
  id: number
  name: string
  slug: string
}

interface ClientPortalNavProps {
  slug: string
  companyName: string
  currentPage: 'home' | 'project' | 'time' | 'invoices' | 'invoice' | 'agreement'
  currentProjectSlug?: string
  projects?: Project[]
}

export default function ClientPortalNav({ 
  slug, 
  companyName, 
  currentPage, 
  currentProjectSlug,
  projects: initialProjects 
}: ClientPortalNavProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects || [])
  const [loading, setLoading] = useState(!initialProjects)

  useEffect(() => {
    if (!initialProjects) {
      fetchProjects()
    }
  }, [slug, initialProjects])

  const fetchProjects = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects`)
      if (response.ok) {
        const data = await response.json()
        setProjects(data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const currentProject = projects.find(p => p.slug === currentProjectSlug)

  const navItems = [
    {
      key: 'home',
      label: 'Home',
      href: `/client/portal/${slug}`,
      icon: Home,
    },
  ]

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mb-6">
      <div className="container mx-auto px-8 max-w-6xl">
        <div className="flex h-14 items-center justify-between">
          {/* Left side: Company name, Home, Projects dropdown */}
          <div className="flex items-center gap-6">
            <a 
              href={`/client/portal/${slug}`} 
              className="font-semibold text-lg hover:text-primary transition-colors"
            >
              {companyName}
            </a>

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

              {/* Projects dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant={currentPage === 'project' ? 'secondary' : 'ghost'} 
                    size="sm"
                    className="gap-1"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {currentProject ? currentProject.name : 'Projects'}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {loading ? (
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

          {/* Right side: Time Records and Invoices */}
          <div className="flex items-center gap-1">
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
          </div>
        </div>
      </div>
    </nav>
  )
}
