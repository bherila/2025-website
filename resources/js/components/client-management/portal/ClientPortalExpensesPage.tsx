import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Plus, 
  Trash2, 
  Receipt, 
  DollarSign, 
  ExternalLink, 
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  Unlink
} from 'lucide-react'
import ClientPortalNav from './ClientPortalNav'
import NewExpenseModal from './NewExpenseModal'
import DeleteExpenseDialog from './DeleteExpenseDialog'
import type { Project } from '@/types/client-management/common'
import type { ClientExpense, ExpensesResponse } from '@/types/client-management/expense'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface ClientPortalExpensesPageProps {
  slug: string
  companyName: string
  companyId: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ClientPortalExpensesPage({ slug, companyName, companyId }: ClientPortalExpensesPageProps) {
  const [data, setData] = useState<ExpensesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ClientExpense | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState<ClientExpense | null>(null)

  useEffect(() => {
    document.title = `Expenses: ${companyName}`
  }, [companyName])

  useEffect(() => {
    fetchExpenses()
    fetchProjects()
  }, [slug, companyId])

  const fetchExpenses = async () => {
    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}/expenses`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Error fetching expenses:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await fetch(`/api/client/portal/${slug}/projects`)
      if (response.ok) {
        const result = await response.json()
        setProjects(result)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const handleDelete = async (expense: ClientExpense) => {
    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}/expenses/${expense.id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        fetchExpenses()
      }
    } catch (error) {
      console.error('Error deleting expense:', error)
    }
  }

  const handleMarkReimbursed = async (expense: ClientExpense) => {
    try {
      const response = await fetch(`/api/client/mgmt/companies/${companyId}/expenses/${expense.id}/mark-reimbursed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
        }
      })

      if (response.ok) {
        fetchExpenses()
      }
    } catch (error) {
      console.error('Error marking expense as reimbursed:', error)
    }
  }

  const openEditModal = (expense: ClientExpense) => {
    setEditingExpense(expense)
    setModalOpen(true)
  }

  const handleModalClose = (open: boolean) => {
    setModalOpen(open)
    if (!open) {
      setEditingExpense(null)
    }
  }

  if (loading) {
    return (
      <>
        <ClientPortalNav slug={slug} companyName={companyName} currentPage="home" />
        <div className="container mx-auto px-8 max-w-6xl">
          <Skeleton className="h-10 w-64 mb-6" />
          <Skeleton className="h-24 w-full mb-6" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    )
  }

  return (
    <>
      <ClientPortalNav slug={slug} companyName={companyName} currentPage="home" />
      <div className="container mx-auto px-8 max-w-6xl">
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Expenses</h1>
              <p className="text-muted-foreground mt-1">Track reimbursable and non-reimbursable expenses</p>
            </div>
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Receipt className="h-4 w-4" />
                Total Expenses
              </div>
              <div className="text-2xl font-semibold mt-1">
                {formatCurrency(data?.total_amount || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4 text-green-600" />
                Reimbursable
              </div>
              <div className="text-2xl font-semibold text-green-600 mt-1">
                {formatCurrency(data?.reimbursable_total || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-amber-600" />
                Pending Reimbursement
              </div>
              <div className="text-2xl font-semibold text-amber-600 mt-1">
                {formatCurrency(data?.pending_reimbursement_total || 0)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Non-Reimbursable
              </div>
              <div className="text-2xl font-semibold mt-1">
                {formatCurrency(data?.non_reimbursable_total || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Expenses Table */}
        {(!data?.expenses || data.expenses.length === 0) ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No expenses yet</h3>
              <p className="text-muted-foreground mb-4">Start tracking expenses for this client</p>
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>All Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Finance Link</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.expenses.map(expense => (
                    <TableRow 
                      key={expense.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openEditModal(expense)}
                    >
                      <TableCell className="whitespace-nowrap">
                        {formatDate(expense.expense_date)}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate">{expense.description}</div>
                        {expense.notes && (
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {expense.notes}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {expense.category && (
                          <Badge variant="outline" className="text-xs">
                            {expense.category}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {expense.project?.name || '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(expense.amount)}
                      </TableCell>
                      <TableCell>
                        {expense.is_reimbursable ? (
                          expense.is_reimbursed ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Reimbursed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-amber-600 border-amber-600">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Non-Reimbursable
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {expense.fin_line_item ? (
                          <a
                            href={`/finance/${expense.fin_line_item.t_account}/transactions#t_id=${expense.fin_line_item.t_id}`}
                            className="text-blue-600 hover:underline inline-flex items-center gap-1 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <LinkIcon className="h-3 w-3" />
                            {expense.fin_line_item.account_name || 'View'}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {expense.is_reimbursable && !expense.is_reimbursed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkReimbursed(expense)
                              }}
                              title="Mark as reimbursed"
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpenseToDelete(expense)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <NewExpenseModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        companyId={companyId}
        projects={projects}
        onSuccess={fetchExpenses}
        expense={editingExpense}
      />

      <DeleteExpenseDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        expense={expenseToDelete}
        onConfirm={() => expenseToDelete && handleDelete(expenseToDelete)}
      />
    </>
  )
}
