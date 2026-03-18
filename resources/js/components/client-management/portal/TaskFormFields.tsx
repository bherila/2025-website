import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface User {
  id: number
  name: string
  email: string
}

interface TaskFormFieldsProps {
  name: string
  setName: (val: string) => void
  description: string
  setDescription: (val: string) => void
  dueDate: string
  setDueDate: (val: string) => void
  assigneeId: string
  setAssigneeId: (val: string) => void
  isHighPriority: boolean
  setIsHighPriority: (val: boolean) => void
  isHiddenFromClients: boolean
  setIsHiddenFromClients: (val: boolean) => void
  milestonePrice: string
  setMilestonePrice: (val: string) => void
  users: User[]
  isAdmin: boolean
  alreadyInvoiced?: boolean
  idPrefix?: string
  autoFocusName?: boolean
}

export function TaskFormFields({
  name, setName,
  description, setDescription,
  dueDate, setDueDate,
  assigneeId, setAssigneeId,
  isHighPriority, setIsHighPriority,
  isHiddenFromClients, setIsHiddenFromClients,
  milestonePrice, setMilestonePrice,
  users,
  isAdmin,
  alreadyInvoiced,
  idPrefix = '',
  autoFocusName = false
}: TaskFormFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}name`}>Task name *</Label>
        <Input
          id={`${idPrefix}name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter task name"
          required
          autoFocus={autoFocusName}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}description`}>Description</Label>
        <Textarea
          id={`${idPrefix}description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Task description"
          rows={4}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}assignee`}>Assignee</Label>
          <select
            id={`${idPrefix}assignee`}
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">No Assignee...</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}duedate`}>Due Date</Label>
          <Input
            id={`${idPrefix}duedate`}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`${idPrefix}hidden`}
            checked={isHiddenFromClients}
            onCheckedChange={(checked) => setIsHiddenFromClients(checked as boolean)}
          />
          <Label htmlFor={`${idPrefix}hidden`} className="font-normal cursor-pointer">
            Hidden from clients
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`${idPrefix}priority`}
            checked={isHighPriority}
            onCheckedChange={(checked) => setIsHighPriority(checked as boolean)}
          />
          <Label htmlFor={`${idPrefix}priority`} className="font-normal cursor-pointer">
            High priority
          </Label>
        </div>
      </div>

      {isAdmin && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}milestone-price`}>Milestone Price ($)</Label>
          <Input
            id={`${idPrefix}milestone-price`}
            type="number"
            step="0.01"
            min="0"
            value={milestonePrice}
            onChange={(e) => setMilestonePrice(e.target.value)}
            placeholder="0.00"
          />
          <p className="text-xs text-muted-foreground">
            Set a non-zero price to make this task a billable milestone. It will be billed on the invoice covering its completion date.
            {alreadyInvoiced && (
              <span className="ml-1 text-green-600 dark:text-green-400">✓ Already invoiced</span>
            )}
          </p>
        </div>
      )}
    </div>
  )
}
