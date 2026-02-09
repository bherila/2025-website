import { Clock, FolderOpen, Plus } from 'lucide-react'
import { useCallback,useEffect, useState } from 'react'

import {
  DeleteFileModal,
  FileHistoryModal,
  FileList,
  FileUploadButton,
  useFileManagement,
} from '@/components/shared/FileManager'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Agreement, Project } from '@/types/client-management/common'

import ClientPortalNav from './ClientPortalNav'
import NewProjectModal from './NewProjectModal'

interface ClientPortalIndexPageProps {
  slug: string
  companyName: string
  companyId: number
  isAdmin?: boolean
  initialProjects?: Project[]
  initialAgreements?: Agreement[]
}

export default function ClientPortalIndexPage({ 
  slug, 
  companyName, 
  companyId,
  isAdmin = false,
  initialProjects = [],
  initialAgreements = []
}: ClientPortalIndexPageProps) {
  const [projects] = useState<Project[]>(initialProjects)
  const [agreements] = useState<Agreement[]>(initialAgreements)
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false)

  const fileManager = useFileManagement({
    listUrl: `/api/client/portal/${slug}/files`,
    uploadUrl: `/api/client/portal/${slug}/files`,
    uploadUrlEndpoint: `/api/client/portal/${slug}/files/upload-url`,
    downloadUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}/download`,
    deleteUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}`,
  })

  const fetchTimeEntries = useCallback(async () => {
    try {
      // Preload time entries into cache (data not directly used here)
      await fetch(`/api/client/portal/${slug}/time-entries`)
    } catch (error) {
      console.error('Error preloading time entries:', error)
    }
  }, [slug])

  useEffect(() => {
    document.title = `Client Home: ${companyName}`
  }, [companyName])

  useEffect(() => {
    fetchTimeEntries()
    fileManager.fetchFiles()
  }, [fetchTimeEntries, fileManager])

  return (
    <>
      <ClientPortalNav 
        slug={slug} 
        companyName={companyName} 
        companyId={companyId}
        isAdmin={isAdmin}
        currentPage="home"
        projects={projects}
      />
      <div className="container mx-auto px-8 max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">{companyName}</h1>
            <p className="text-muted-foreground">Client Portal</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setNewProjectModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
            {isAdmin && (
              <FileUploadButton onUpload={fileManager.uploadFile} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Projects and Agreements (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            {projects.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No projects yet</h3>
                  <p className="text-muted-foreground mb-4">Create your first project to get started</p>
                  <Button onClick={() => setNewProjectModalOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Project
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {projects.map(project => (
                  <Card key={project.id} className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => window.location.href = `/client/portal/${slug}/project/${project.slug}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{project.description}</p>
                      )}
                      <div className="flex gap-2">
                        <Badge variant="secondary">{project.tasks_count} tasks</Badge>
                        <Badge variant="outline">{project.time_entries_count} time entries</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {agreements.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Clock className="h-5 w-5" />
                  <h2 className="text-xl font-semibold text-foreground">Service Agreements</h2>
                </div>
                <div className="space-y-3">
                  {agreements.map(agreement => (
                    <Card key={agreement.id} className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => window.location.href = `/client/portal/${slug}/agreement/${agreement.id}`}>
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              Agreement (Effective {new Date(agreement.active_date).toLocaleDateString()})
                            </span>
                            {agreement.client_company_signed_date ? (
                              <Badge variant="default" className="bg-green-600">✓ Signed</Badge>
                            ) : (
                              <Badge variant="secondary">Awaiting Signature</Badge>
                            )}
                            {agreement.termination_date && (
                              <Badge variant="destructive">Terminated</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {agreement.monthly_retainer_hours} hrs/mo @ ${parseFloat(agreement.monthly_retainer_fee).toLocaleString()}/mo
                          </p>
                        </div>
                        <Button variant="ghost" size="sm">View Agreement →</Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Company Files (1/3 width) */}
          <div className="space-y-4">
            <FileList
              files={fileManager.files}
              loading={fileManager.loading}
              isAdmin={isAdmin}
              onDownload={fileManager.downloadFile}
              onDelete={fileManager.handleDeleteRequest}
              title="Company Files"
            />
          </div>
        </div>

      <NewProjectModal
        open={newProjectModalOpen}
        onOpenChange={setNewProjectModalOpen}
        slug={slug}
      />

      <FileHistoryModal
        file={fileManager.historyFile}
        history={fileManager.historyData}
        isOpen={fileManager.historyModalOpen}
        onClose={fileManager.closeHistoryModal}
      />

      <DeleteFileModal
        file={fileManager.deleteFile}
        isOpen={fileManager.deleteModalOpen}
        isDeleting={fileManager.isDeleting}
        onClose={fileManager.closeDeleteModal}
        onConfirm={fileManager.handleDeleteConfirm}
      />
      </div>
    </>
  )
}

