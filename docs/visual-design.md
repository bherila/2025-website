## 🎨 Theming & Color Guidelines (For LLM Agents)

This project uses a highly specific semantic color system defined in `app.css` via Tailwind v4 `@theme`. The UI resembles a sleek, financial dashboard (dark mode by default). 

**CRITICAL RULE:** Do NOT use arbitrary Tailwind color scales (e.g., `text-red-500`, `bg-green-400`, `text-blue-500`). You MUST use the semantic variables listed below to ensure Light/Dark mode transitions work perfectly.

### Semantic Color Usage

* **`primary` (Gold/Tan):** Use for branding, active states, key highlights, and primary buttons. (`text-primary`, `bg-primary`)
* **`foreground` / `background`:** Standard text and app backgrounds.
* **`card` / `secondary`:** Use for panels, widgets, and elevated container backgrounds. 
* **`muted`:** Use `text-muted-foreground` for helper text, subtitles, table headers, and secondary data.
* **`border`:** Use for standard dividers. Use `border-table-border` for data tables.

### Financial / Status Colors

Whenever rendering numerical data, trends, or statuses, map them strictly to these classes:

* **Positive / Income / Earned:** Use **`success`** (`text-success`, `bg-success/10`).
* **Negative / Taxes / Deductions:** Use **`destructive`** (`text-destructive`, `bg-destructive/10`).
* **Alerts / Pending / Warning:** Use **`warning`** (`text-warning`, `bg-warning/10`).
* **Informational / Subtotals:** Use **`info`** (`text-info` — this resolves to a specific Teal accent).

### Typography
* Always use `font-mono` for tabular data, currency values, dates, and account identifiers.
* Use standard `font-sans` for regular prose and labels.