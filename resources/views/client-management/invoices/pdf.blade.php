<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Invoice {{ $invoice['invoice_number'] ?? '' }}</title>
    <style>
        @page {
            margin: 48px 56px;
        }

        * {
            box-sizing: border-box;
        }

        body {
            font-family: "DejaVu Sans", sans-serif;
            font-size: 12px;
            color: #1f2933;
            line-height: 1.45;
            margin: 0;
        }

        .muted {
            color: #6b7280;
        }

        .label {
            color: #6b7280;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-weight: bold;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        /* Header */
        .header td {
            vertical-align: top;
        }

        .issuer-name {
            font-size: 18px;
            font-weight: bold;
            color: #111827;
        }

        .doc-title {
            text-align: right;
        }

        .doc-title .word {
            font-size: 26px;
            font-weight: bold;
            letter-spacing: 0.12em;
            color: #111827;
        }

        .doc-title .number {
            font-size: 12px;
            color: #6b7280;
            margin-top: 2px;
        }

        .rule {
            border: 0;
            border-top: 2px solid #111827;
            margin: 16px 0 20px 0;
        }

        /* Parties / meta */
        .parties td {
            vertical-align: top;
            width: 50%;
            padding-right: 16px;
        }

        .block-title {
            font-weight: bold;
            color: #111827;
            margin-bottom: 4px;
        }

        .meta-table td {
            padding: 2px 0;
            font-size: 11px;
        }

        .meta-table .meta-label {
            color: #6b7280;
            padding-right: 12px;
            white-space: nowrap;
        }

        .status-badge {
            display: inline-block;
            padding: 1px 8px;
            border: 1px solid #9ca3af;
            border-radius: 10px;
            font-size: 10px;
            text-transform: capitalize;
            color: #374151;
        }

        /* Line items */
        .items {
            margin-top: 24px;
        }

        .items th {
            text-align: left;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: #6b7280;
            border-bottom: 1px solid #d1d5db;
            padding: 6px 8px;
        }

        .items td {
            padding: 7px 8px;
            border-bottom: 1px solid #eceff3;
            vertical-align: top;
        }

        .num {
            text-align: right;
            white-space: nowrap;
        }

        .item-desc {
            color: #111827;
        }

        .item-sub {
            color: #9ca3af;
            font-size: 10px;
        }

        /* Totals */
        .totals {
            margin-top: 18px;
        }

        .totals-table {
            width: 46%;
        }

        .totals-table td {
            padding: 5px 8px;
            font-size: 12px;
        }

        .totals-table .t-label {
            color: #6b7280;
        }

        .totals-table .t-value {
            text-align: right;
            white-space: nowrap;
        }

        .totals-table .balance td {
            border-top: 2px solid #111827;
            font-weight: bold;
            font-size: 14px;
            color: #111827;
            padding-top: 8px;
        }

        /* Notes */
        .notes {
            margin-top: 28px;
            padding-top: 14px;
            border-top: 1px solid #e5e7eb;
        }

        .notes-body {
            white-space: pre-line;
            color: #374151;
        }

        .footer {
            margin-top: 36px;
            font-size: 9px;
            color: #9ca3af;
        }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <div class="issuer-name">{{ $issuer_name }}</div>
            </td>
            <td class="doc-title">
                <div class="word">INVOICE</div>
                @if (! empty($invoice['invoice_number']))
                    <div class="number">{{ $invoice['invoice_number'] }}</div>
                @endif
            </td>
        </tr>
    </table>

    <hr class="rule">

    <table class="parties">
        <tr>
            <td>
                <div class="label">Bill To</div>
                <div class="block-title">{{ $company['company_name'] ?? '—' }}</div>
                @if (! empty($company['address']))
                    <div class="muted">{{ $company['address'] }}</div>
                @endif
                @if (! empty($company['billing_email']))
                    <div class="muted">{{ $company['billing_email'] }}</div>
                @endif
            </td>
            <td>
                <table class="meta-table">
                    <tr>
                        <td class="meta-label">Issue Date</td>
                        <td>{{ $invoice['issue_date'] ?? '—' }}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Due Date</td>
                        <td>{{ $invoice['due_date'] ?? '—' }}</td>
                    </tr>
                    <tr>
                        <td class="meta-label">Status</td>
                        <td><span class="status-badge">{{ $invoice['status'] ?? '—' }}</span></td>
                    </tr>
                    @if (! empty($invoice['period_start']) || ! empty($invoice['period_end']))
                        <tr>
                            <td class="meta-label">Service Period</td>
                            <td>{{ $invoice['period_start'] ?? '—' }} – {{ $invoice['period_end'] ?? '—' }}</td>
                        </tr>
                    @endif
                </table>
            </td>
        </tr>
    </table>

    <table class="items">
        <thead>
            <tr>
                <th style="width: 56%;">Description</th>
                <th class="num" style="width: 12%;">Qty</th>
                <th class="num" style="width: 16%;">Unit Price</th>
                <th class="num" style="width: 16%;">Amount</th>
            </tr>
        </thead>
        <tbody>
            @forelse ($invoice['line_items'] ?? [] as $line)
                <tr>
                    <td>
                        <div class="item-desc">{{ $line['description'] ?? '' }}</div>
                        @if (! empty($line['line_date']) || (isset($line['hours']) && (float) $line['hours'] != 0))
                            <div class="item-sub">
                                @if (! empty($line['line_date'])){{ $line['line_date'] }}@endif
                                @if (! empty($line['line_date']) && isset($line['hours']) && (float) $line['hours'] != 0) · @endif
                                @if (isset($line['hours']) && (float) $line['hours'] != 0){{ number_format((float) $line['hours'], 2) }} hrs @endif
                            </div>
                        @endif
                    </td>
                    <td class="num">{{ $line['quantity'] ?? '' }}</td>
                    <td class="num">${{ number_format((float) ($line['unit_price'] ?? 0), 2) }}</td>
                    <td class="num">${{ number_format((float) ($line['line_total'] ?? 0), 2) }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="4" class="muted" style="padding: 16px 8px;">No line items.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <table class="totals">
        <tr>
            <td></td>
            <td style="text-align: right;">
                <table class="totals-table" align="right">
                    <tr>
                        <td class="t-label">Total</td>
                        <td class="t-value">${{ number_format((float) ($invoice['invoice_total'] ?? 0), 2) }}</td>
                    </tr>
                    <tr>
                        <td class="t-label">Payments</td>
                        <td class="t-value">${{ number_format((float) ($invoice['payments_total'] ?? 0), 2) }}</td>
                    </tr>
                    <tr class="balance">
                        <td class="t-label">Balance Due</td>
                        <td class="t-value">${{ number_format((float) ($invoice['remaining_balance'] ?? 0), 2) }}</td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    @if (! empty($invoice['notes']))
        <div class="notes">
            <div class="label">Notes</div>
            <div class="notes-body">{{ $invoice['notes'] }}</div>
        </div>
    @endif

    <div class="footer">
        Generated {{ $generated_at }} by {{ $issuer_name }}.
    </div>
</body>
</html>
