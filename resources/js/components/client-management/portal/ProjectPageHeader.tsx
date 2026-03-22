import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ProjectPageHeaderProps {
    projectName: string
    isAdmin: boolean
    slug: string
    projectSlug: string
    onRenameSuccess: (newName: string, newSlug: string) => void
}

export default function ProjectPageHeader({
    projectName,
    isAdmin,
    slug,
    projectSlug,
    onRenameSuccess
}: ProjectPageHeaderProps) {
    const [isEditingName, setIsEditingName] = useState(false)
    const [currentProjectName, setCurrentProjectName] = useState(projectName)
    const [editedName, setEditedName] = useState(projectName)
    const [isSavingName, setIsSavingName] = useState(false)
    const nameInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditingName) {
            nameInputRef.current?.focus()
            nameInputRef.current?.select()
        }
    }, [isEditingName])

    const handleRename = async () => {
        if (!editedName.trim() || editedName === currentProjectName) {
            setIsEditingName(false)
            setEditedName(currentProjectName)
            return
        }

        setIsSavingName(true)
        try {
            const response = await fetch(`/api/client/portal/${slug}/projects/${projectSlug}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
                },
                body: JSON.stringify({ name: editedName })
            })

            if (response.ok) {
                const data = await response.json()
                setCurrentProjectName(data.name)
                onRenameSuccess(data.name, data.slug)
                setIsEditingName(false)
            } else {
                const errorData = await response.json()
                console.error('Error renaming project:', errorData)
                alert(errorData.message || 'Failed to rename project')
            }
        } catch (error) {
            console.error('Error renaming project:', error)
            alert('An unexpected error occurred while renaming the project.')
        } finally {
            setIsSavingName(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename()
        } else if (e.key === 'Escape') {
            setIsEditingName(false)
            setEditedName(currentProjectName)
        }
    }

    return (
        <div className="flex-1 min-w-0">
            {isEditingName ? (
                <div className="flex items-center gap-2 max-w-xl">
                    <Input
                        ref={nameInputRef}
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => !isSavingName && setIsEditingName(false)}
                        disabled={isSavingName}
                        className="text-2xl font-bold h-10"
                    />
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleRename}
                        disabled={isSavingName}
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                            setIsEditingName(false)
                            setEditedName(currentProjectName)
                        }}
                        disabled={isSavingName}
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-2 group">
                    <h1 className="text-3xl font-bold truncate">{currentProjectName}</h1>
                    {isAdmin && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setIsEditingName(true)}
                        >
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}
