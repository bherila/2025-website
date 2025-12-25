import React, { useState, useEffect, useMemo } from 'react'
import { fetchWrapper } from '@/fetchWrapper'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

interface ProductKey {
  id: number
  uid: number
  product_id: string
  product_key: string
  product_name: string | null
  computer_name: string | null
  comment: string | null
  used_on: string | null
  claimed_date: string | null
  key_type: string | null
  key_retrieval_note: string | null
}

interface EditFormData {
  computer_name: string
  comment: string
  used_on: string
}

const LicenseManager: React.FC = () => {
  const [productKeys, setProductKeys] = useState<ProductKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedKey, setSelectedKey] = useState<ProductKey | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [selectedProductKey, setSelectedProductKey] = useState<string | null>(null)
  const [sortField, setSortField] = useState<keyof ProductKey>('product_name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [productNameFilter, setProductNameFilter] = useState('')
  const [productKeyFilter, setProductKeyFilter] = useState('')
  const [commentFilter, setCommentFilter] = useState('')
  const [computerNameFilter, setComputerNameFilter] = useState('')

  useEffect(() => {
    fetchProductKeys()
  }, [])

  const fetchProductKeys = async () => {
    try {
      const response = await fetchWrapper.get('/api/license-keys')
      setProductKeys(response)
    } catch (err) {
      setError('Failed to load license keys')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const updateProductKey = async (id: number, data: Partial<ProductKey>) => {
    try {
      await fetchWrapper.put(`/api/license-keys/${id}`, data)
      await fetchProductKeys()
    } catch (err) {
      console.error('Failed to update license key', err)
      throw err
    }
  }

  const deleteProductKey = async (id: number) => {
    try {
      await fetchWrapper.delete(`/api/license-keys/${id}`, {})
      await fetchProductKeys()
    } catch (err) {
      console.error('Failed to delete license key', err)
      throw err
    }
  }

  const handleSort = (field: keyof ProductKey) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const processedRows = useMemo(() => {
    let filteredRows = productKeys.filter(
      (row) =>
        (!productNameFilter || (row.product_name || '').toLowerCase().includes(productNameFilter.toLowerCase())) &&
        (!productKeyFilter || (row.product_key || '').toLowerCase().includes(productKeyFilter.toLowerCase())) &&
        (!commentFilter || (row.comment || '').toLowerCase().includes(commentFilter.toLowerCase())) &&
        (!computerNameFilter || (row.computer_name || '').toLowerCase().includes(computerNameFilter.toLowerCase())),
    )

    return filteredRows.sort((a, b) => {
      const aVal = a[sortField] || ''
      const bVal = b[sortField] || ''
      if (sortDirection === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0
      }
    })
  }, [productKeys, sortField, sortDirection, productNameFilter, productKeyFilter, commentFilter, computerNameFilter])

  const handleSave = async (formData: EditFormData) => {
    if (!selectedKey) return

    await updateProductKey(selectedKey.id, {
      computer_name: formData.computer_name || null,
      comment: formData.comment || null,
      used_on: formData.used_on || null,
    })
    setShowEditModal(false)
  }

  // Add key
  const [addLoading, setAddLoading] = useState(false)
  const handleAddKey = async (data: { product_name: string; product_key: string; computer_name?: string; comment?: string; used_on?: string }) => {
    setAddLoading(true)
    try {
      await fetchWrapper.post('/api/license-keys', data)
      await fetchProductKeys()
      setShowAddModal(false)
    } catch (err) {
      console.error('Failed to add key', err)
      alert(typeof err === 'string' ? err : 'Failed to add key')
    } finally {
      setAddLoading(false)
    }
  }

  // Import keys
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importLoading, setImportLoading] = useState(false)

  const handleImportFile = (file: File | null) => {
    setImportFile(file)
    setImportPreview([])
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      if (!e.target) return
      const xml = e.target.result as string
      try {
        const parser = new DOMParser()
        const xmlDoc = parser.parseFromString(xml, 'text/xml')
        const items: any[] = []
        const unique = new Set<string>()
        const productKeysNodes = xmlDoc.getElementsByTagName('Product_Key')
        for (let i = 0; i < productKeysNodes.length; i++) {
            const pk = productKeysNodes[i] as Element | null
            if (!pk) continue
            const productName = pk.getAttribute('Name') || ''
            const keyNodes = pk.getElementsByTagName('Key')
            for (let j = 0; j < keyNodes.length; j++) {
              const keyNode = keyNodes[j] as Element | null
              if (!keyNode) continue
              const keyValue = keyNode.textContent || ''
              if (!keyValue) continue
              if (unique.has(keyValue)) continue
              unique.add(keyValue)
              items.push({
                productId: productName,
                productKey: keyValue,
                productName: productName,
                computerName: '',
                comment: '',
                usedOn: '',
                claimedDate: keyNode.getAttribute('ClaimedDate') || '',
                keyType: keyNode.getAttribute('Type') || '',
                keyRetrievalNote: pk.getAttribute('KeyRetrievalNote') || '',
              })
          }
        }
        setImportPreview(items)
      } catch (err) {
        console.error('Failed to parse XML', err)
        alert('Failed to parse XML file')
      }
    }
    reader.readAsText(file)
  }

  const handleUploadImport = async () => {
    if (importPreview.length === 0) {
      alert('No product keys to upload')
      return
    }
    setImportLoading(true)
    try {
      await fetchWrapper.post('/api/license-keys/import', importPreview)
      await fetchProductKeys()
      setShowImportModal(false)
      setImportFile(null)
      setImportPreview([])
    } catch (err) {
      console.error('Import failed', err)
      alert(typeof err === 'string' ? err : 'Import failed')
    } finally {
      setImportLoading(false)
    }
  }

  const handleViewFullKey = (key: string) => {
    setSelectedProductKey(key)
    setShowKeyModal(true)
  }

  const highlightMatch = (text: string, filter: string) => {
    if (!filter) return text
    const regex = new RegExp(`(${filter})`, 'gi')
    const parts = text.split(regex)
    return parts.map((part, index) =>
      regex.test(part) ? <mark key={index}>{part}</mark> : part
    )
  }

  const renderProductKey = (key: string | null | undefined) => {
    if (!key) return ''
    const truncated = key.length > 20 ? key.substring(0, 20) + '...' : key
    return (
      <span>
        {highlightMatch(truncated, productKeyFilter)}
        {key.length > 20 && (
          <Button variant="link" size="sm" onClick={() => handleViewFullKey(key)}>
            View
          </Button>
        )}
      </span>
    )
  }

  if (loading) return <div>Loading...</div>
  if (error)
    return (
      <div className="max-w-3xl mx-auto mt-6 px-4">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowAddModal(true)}>Add Key</Button>
          <Button variant="outline" onClick={() => setShowImportModal(true)}>Import XML</Button>
        </div>
        <div />
      </div>
      <Table className="mt-4">
        <TableHeader>
          {/* Filters row above the header labels */}
          <tr>
            <TableHead>
              <Input
                placeholder="Filter product"
                value={productNameFilter}
                onChange={(e) => setProductNameFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </TableHead>
            <TableHead>
              <Input
                placeholder="Filter key"
                value={productKeyFilter}
                onChange={(e) => setProductKeyFilter(e.target.value)}
                className="h-8 text-sm font-mono"
              />
            </TableHead>
            <TableHead>
              <Input
                placeholder="Filter computer"
                value={computerNameFilter}
                onChange={(e) => setComputerNameFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </TableHead>
            <TableHead>
              <Input
                placeholder="Filter comment"
                value={commentFilter}
                onChange={(e) => setCommentFilter(e.target.value)}
                className="h-8 text-sm"
              />
            </TableHead>
            <TableHead>
              {/* used_on has no filter */}
            </TableHead>
            <TableHead>
              {/* actions column */}
            </TableHead>
          </tr>

          {/* Header labels row */}
          <tr>
            <TableHead className="cursor-pointer" onClick={() => handleSort('product_name')}>
              Product Name {sortField === 'product_name' && (sortDirection === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('product_key')}>
              Product Key {sortField === 'product_key' && (sortDirection === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('computer_name')}>
              Computer Name {sortField === 'computer_name' && (sortDirection === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('comment')}>
              Comment {sortField === 'comment' && (sortDirection === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('used_on')}>
              Used On {sortField === 'used_on' && (sortDirection === 'asc' ? '↑' : '↓')}
            </TableHead>
            <TableHead>Actions</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {processedRows.map((key) => (
            <TableRow key={key.id}>
              <TableCell>{highlightMatch(key.product_name || '', productNameFilter)}</TableCell>
              <TableCell className="font-mono">{renderProductKey(key.product_key)}</TableCell>
              <TableCell>{highlightMatch(key.computer_name || '', computerNameFilter)}</TableCell>
              <TableCell>{highlightMatch(key.comment || '', commentFilter)}</TableCell>
              <TableCell>{key.used_on}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setSelectedKey(key); setShowEditModal(true) }}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteProductKey(key.id)}>Delete</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit License Key</DialogTitle>
            <DialogDescription>Make changes to the license key details</DialogDescription>
          </DialogHeader>
          <EditForm key={selectedKey?.id} cdKey={selectedKey} onSave={handleSave} onCancel={() => setShowEditModal(false)} />
        </DialogContent>
      </Dialog>

      {/* Add Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add License Key</DialogTitle>
            <DialogDescription>Enter details for a new license key</DialogDescription>
          </DialogHeader>
          <AddForm onAdd={handleAddKey} onCancel={() => setShowAddModal(false)} loading={addLoading} />
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import License Keys (XML)</DialogTitle>
            <DialogDescription>Upload a Product Keys XML file to import multiple keys</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="file"
              accept=".xml"
              onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
            />
            {importPreview.length > 0 && (
              <div>
                <p className="text-sm">{importPreview.length} keys parsed. Showing first 10:</p>
                <ul className="list-disc pl-6 max-h-40 overflow-auto">
                  {importPreview.slice(0, 10).map((it, idx) => (
                    <li key={idx} className="text-sm font-mono">{it.productKey} — {it.productName}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancel</Button>
              <Button onClick={handleUploadImport} disabled={importLoading}>{importLoading ? 'Importing...' : 'Import'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Key Modal */}
      <Dialog open={showKeyModal} onOpenChange={setShowKeyModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Full Product Key</DialogTitle>
            <DialogDescription>View and copy the complete product key</DialogDescription>
          </DialogHeader>
          <Textarea rows={10} value={selectedProductKey || ''} readOnly className="font-mono" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKeyModal(false)}>Close</Button>
            <Button onClick={() => { if (selectedProductKey) navigator.clipboard.writeText(selectedProductKey); alert('Key copied to clipboard') }}>Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const EditForm: React.FC<{ cdKey: ProductKey | null; onSave: (data: EditFormData) => void; onCancel: () => void }> = ({ cdKey, onSave, onCancel }) => {
  const [formData, setFormData] = useState<EditFormData>({
    computer_name: cdKey?.computer_name || '',
    comment: cdKey?.comment || '',
    used_on: cdKey?.used_on || '',
  })

  useEffect(() => {
    if (cdKey) {
      setFormData({
        computer_name: cdKey.computer_name || '',
        comment: cdKey.comment || '',
        used_on: cdKey.used_on || '',
      })
    }
  }, [cdKey])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Product ID</label>
          <Input value={cdKey?.product_id || ''} disabled />
        </div>
        <div>
          <label className="block text-sm font-medium">Product Key</label>
          <Input value={cdKey?.product_key || ''} disabled className="font-mono" />
        </div>
        <div>
          <label className="block text-sm font-medium">Computer Name</label>
          <Input
            value={formData.computer_name}
            onChange={(e) => setFormData({ ...formData, computer_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Comment</label>
          <Textarea
            rows={5}
            value={formData.comment}
            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Used On</label>
          <Input
            type="date"
            value={formData.used_on}
            onChange={(e) => setFormData({ ...formData, used_on: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  )
}

const AddForm: React.FC<{ onAdd: (data: any) => Promise<void>; onCancel: () => void; loading?: boolean }> = ({ onAdd, onCancel, loading }) => {
  const [form, setForm] = useState({ product_name: '', product_key: '', computer_name: '', comment: '', used_on: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.product_name || !form.product_key) {
      alert('Product name and key are required')
      return
    }

    await onAdd(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Product Name</label>
        <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
      </div>
      <div>
        <label className="block text-sm font-medium">Product Key</label>
        <Input value={form.product_key} onChange={(e) => setForm({ ...form, product_key: e.target.value })} className="font-mono" />
      </div>
      <div>
        <label className="block text-sm font-medium">Computer Name</label>
        <Input value={form.computer_name} onChange={(e) => setForm({ ...form, computer_name: e.target.value })} />
      </div>
      <div>
        <label className="block text-sm font-medium">Comment</label>
        <Textarea value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} rows={3} />
      </div>
      <div>
        <label className="block text-sm font-medium">Used On</label>
        <Input type="date" value={form.used_on} onChange={(e) => setForm({ ...form, used_on: e.target.value })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading}>{loading ? 'Adding...' : 'Add'}</Button>
      </div>
    </form>
  )
}

export default LicenseManager