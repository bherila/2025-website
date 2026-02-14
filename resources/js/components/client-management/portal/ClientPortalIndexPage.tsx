import { Clock, FolderOpen, Plus, ExternalLink, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { abbreviateName } from '@/lib/nameUtils'
import type { Agreement, Project, User } from '@/types/client-management/common'
import type { TimeEntry } from '@/types/client-management/time-entry'
import type { FileRecord } from '@/types/files'

import ClientPortalNav from './ClientPortalNav'
import NewProjectModal from './NewProjectModal'
import NewTimeEntryModal from './NewTimeEntryModal'

interface ClientPortalIndexPageProps {
  slug: string
  companyName: string
  companyId: number
  isAdmin?: boolean | undefined
  initialProjects?: Project[] | undefined
  initialAgreements?: Agreement[] | undefined
  initialCompanyUsers?: User[] | undefined
  initialRecentTimeEntries?: TimeEntry[] | undefined
  initialCompanyFiles?: FileRecord[] | undefined
  /** called after a mutation so the host can refresh the page/state */
  afterEdit?: (() => void) | undefined
}

export default function ClientPortalIndexPage({
  slug,
  companyName,
  companyId,
  isAdmin = false,
  initialProjects,
  initialAgreements,
  initialCompanyUsers,
  initialRecentTimeEntries,
  initialCompanyFiles,
  afterEdit,
}: ClientPortalIndexPageProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects ?? [])
  const [agreements] = useState<Agreement[]>(initialAgreements ?? [])
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false)
  const [newTimeEntryModalOpen, setNewTimeEntryModalOpen] = useState(false)
  const [recentTimeEntries, setRecentTimeEntries] = useState<TimeEntry[]>(initialRecentTimeEntries ?? [])
  const [companyUsers, setCompanyUsers] = useState<User[]>(initialCompanyUsers ?? [])
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)

  const fileManager = useFileManagement({
    listUrl: `/api/client/portal/${slug}/files`,
    uploadUrl: `/api/client/portal/${slug}/files`,
    uploadUrlEndpoint: `/api/client/portal/${slug}/files/upload-url`,
    downloadUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}/download`,
    deleteUrlPattern: (fileId) => `/api/client/portal/${slug}/files/${fileId}`,
  })

  useEffect(() => {
    document.title = `Client Home: ${companyName}`
  }, [companyName])

  useEffect(() => {
    // If the server did not provide a hydrated file list, call the files API on mount
    if (initialCompanyFiles === undefined) {
      fileManager.fetchFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleTimeEntryModalClose = (open: boolean) => {
    setNewTimeEntryModalOpen(open)
    if (!open) {
      setEditingEntry(null)
    }
  }

  const handleTimeEntrySuccess = () => {
    // allow the host to refresh (preferred) or fall back to a full reload
    if (afterEdit) return afterEdit()
    window.location.reload()
  }

  const openEditTimeEntry = (entry: TimeEntry) => {
    if (!isAdmin) return
    setEditingEntry(entry)
    setNewTimeEntryModalOpen(true)
  }

  // Get active agreement info for compact display
  const activeAgreement = agreements.find(a =>
    !a.termination_date && a.client_company_signed_date
  )

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
      <div className="mx-auto px-4 max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">{companyName}</h1>
            <p className="text-muted-foreground">Client Portal</p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button onClick={() => setNewTimeEntryModalOpen(true)} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                New Time Entry
              </Button>
            )}
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

            {/* Recent Time Entries Section */}
            {recentTimeEntries.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Recent Time Entries</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.location.href = `/client/portal/${slug}/time`}
                    >
                      View All →
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="border border-muted/50 rounded-md overflow-hidden mx-4 mb-4">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-muted/50 border-b border-muted">
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground w-[110px]">Date</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Description</th>
                          <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">User</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Time</th>
                          {isAdmin && <th className="w-[40px] py-2 px-3"></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {recentTimeEntries.map((entry) => {
                          const entryDate = new Date(entry.date_worked)
                          return (
                            <tr
                              key={entry.id}
                              className={`group border-b border-muted/30 last:border-0 ${isAdmin && !entry.is_invoiced ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                              onClick={() => isAdmin && !entry.is_invoiced && openEditTimeEntry(entry)}
                            >
                              <td className="py-2 px-3 align-top">
                                <span className="text-sm font-medium">
                                  {entryDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                              </td>
                              <td className="py-2 px-3 align-top">
                                <div className="flex flex-col">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none mb-1">
                                    {entry.job_type}
                                  </span>
                                  <span className="text-sm leading-tight mb-2">{entry.name || '--'}</span>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {entry.is_billable && entry.is_invoiced ? (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-green-600 text-green-600 font-bold shrink-0">
                                        INVOICED
                                      </Badge>
                                    ) : (
                                      <Badge variant={entry.is_billable ? 'default' : 'secondary'} className="text-[9px] px-1 py-0 h-3.5 font-bold shrink-0">
                                        {entry.is_billable ? 'BILLABLE' : 'NON-BILLABLE'}
                                      </Badge>
                                    )}
                                    {entry.project && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-medium border-muted-foreground/30 text-muted-foreground shrink-0">
                                        {entry.project.name}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 px-3 align-top">
                                <span className="text-sm whitespace-nowrap text-muted-foreground">
                                  {abbreviateName(entry.user?.name)}
                                </span>
                              </td>
                              <td className="text-right py-2 px-3 align-top text-sm">
                                {entry.formatted_time}
                              </td>
                              {isAdmin && (
                                <td className="py-1 px-3 align-top text-right">
                                  {!entry.is_invoiced && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openEditTimeEntry(entry)
                                      }}
                                    >
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Company Files (1/3 width) */}
          <div className="space-y-4">
            <FileList
              files={fileManager.files.length > 0 ? fileManager.files : (initialCompanyFiles ?? [])}
              loading={fileManager.loading && fileManager.files.length === 0}
              isAdmin={isAdmin}
              onDownload={fileManager.downloadFile}
              onDelete={fileManager.handleDeleteRequest}
              title="Company Files"
            />
          </div>
        </div>

        {/* Compact Agreement Section at Bottom */}
        {activeAgreement && (
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Active Agreement: <span className="font-semibold text-foreground">{activeAgreement.monthly_retainer_hours} retainer hours / month</span>
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.href = `/client/portal/${slug}/agreement/${activeAgreement.id}`}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View Agreement
              </Button>
            </div>
          </div>
        )}

        <NewTimeEntryModal
          open={newTimeEntryModalOpen}
          onOpenChange={handleTimeEntryModalClose}
          slug={slug}
          projects={projects}
          users={companyUsers}
          onSuccess={handleTimeEntrySuccess}
          entry={editingEntry}
          lastProjectId={recentTimeEntries.length > 0 ? recentTimeEntries[0]?.project?.id?.toString() : undefined}
        />

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

