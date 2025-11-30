import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

interface ImportProgressDialogProps {
  open: boolean
  progress: { processed: number; total: number }
  error: string | null
  onRetry: () => void
  onCancel: () => void
}

/**
 * Dialog showing import progress with retry/cancel options on error.
 */
export function ImportProgressDialog({
  open,
  progress,
  error,
  onRetry,
  onCancel,
}: ImportProgressDialogProps) {
  const percentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{error ? 'Import Failed' : 'Importing Transactions'}</AlertDialogTitle>
          <AlertDialogDescription>
            {error ? (
              <div className="text-red-500">{error}</div>
            ) : (
              `Please wait while the transactions are being imported. Do not close this window.`
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {!error && (
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
            <p className="text-sm text-center mt-2">
              {progress.processed} of {progress.total} transactions imported.
            </p>
          </div>
        )}
        {error && (
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRetry}>Retry</AlertDialogAction>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
