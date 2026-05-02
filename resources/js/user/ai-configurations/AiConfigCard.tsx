import React from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import type { AiConfig } from './types';
import { PROVIDER_BADGE_CLASS, PROVIDER_LABELS } from './types';
import { UsageDisplay } from './UsageDisplay';

interface AiConfigCardProps {
  config: AiConfig;
  activatingId: number | null;
  deletingId: number | null;
  onActivate: (config: AiConfig) => void;
  onEdit: (config: AiConfig) => void;
  onDelete: (config: AiConfig) => void;
}

function ExpiryBadge({ config }: { config: AiConfig }) {
  if (!config.expires_at) return null;

  const expiresAt = new Date(config.expires_at);
  const now = new Date();
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (config.is_expired) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
        Expired
      </span>
    );
  }

  if (daysLeft <= 30) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
        Expires in {daysLeft}d
      </span>
    );
  }

  return (
    <span className="text-xs text-muted-foreground">
      Expires {expiresAt.toLocaleDateString()}
    </span>
  );
}

function InvalidApiKeyBadge({ config }: { config: AiConfig }) {
  if (!config.has_invalid_api_key) return null;

  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
      Invalid key
    </span>
  );
}

export const AiConfigCard: React.FC<AiConfigCardProps> = ({
  config,
  activatingId,
  deletingId,
  onActivate,
  onEdit,
  onDelete,
}) => (
  <div className="border rounded-lg p-4 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{config.name}</span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${PROVIDER_BADGE_CLASS[config.provider]}`}>
        {PROVIDER_LABELS[config.provider]}
      </span>
      <span className="text-sm text-muted-foreground">{config.model}</span>
      {config.is_active && <Badge>Active</Badge>}
      <InvalidApiKeyBadge config={config} />
      <ExpiryBadge config={config} />
    </div>
    <div className="text-xs text-muted-foreground">
      Key: {config.masked_key}
      {config.region && <span className="ml-3">Region: {config.region}</span>}
    </div>
    <UsageDisplay usage={config.usage} />
    <div className="flex gap-2 pt-1">
      {!config.is_active && !config.is_expired && !config.has_invalid_api_key && (
        <Button
          size="sm"
          variant="outline"
          disabled={activatingId !== null}
          onClick={() => onActivate(config)}
        >
          {activatingId === config.id ? <Spinner className="mr-1 size-3" /> : null}
          Set active
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => onEdit(config)}>Edit</Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={deletingId === config.id}>
            {deletingId === config.id ? <Spinner className="mr-1 size-3" /> : null}
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{config.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(config)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
);
