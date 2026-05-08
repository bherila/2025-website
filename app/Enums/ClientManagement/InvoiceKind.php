<?php

namespace App\Enums\ClientManagement;

/**
 * Classification for a client invoice.
 *
 * `cadence_period` is the standard full-cycle invoice (monthly, quarterly, or annual).
 * `interim_overage` is an intra-cycle invoice for overage hours only.
 * `terminal` is a closing invoice generated at agreement termination.
 */
enum InvoiceKind: string
{
    case CadencePeriod = 'cadence_period';
    case InterimOverage = 'interim_overage';
    case Terminal = 'terminal';
}
