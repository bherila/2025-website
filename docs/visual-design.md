## 🎨 Theming & Color Guidelines (For LLM Agents)

This project uses a highly specific semantic color system defined in `app.css` via Tailwind v4 `@theme`. The UI resembles a sleek, financial dashboard (dark mode by default). 

**CRITICAL RULE:** Do NOT use arbitrary Tailwind color scales (e.g., `text-red-500`, `bg-green-400`, `text-blue-500`). You MUST use the semantic variables listed below to ensure Light/Dark mode transitions work perfectly.

### Semantic Color Usage

* **`primary` (Gold/Tan):** Use for branding, active states, key highlights, and primary buttons. (`text-primary`, `bg-primary`)
* **`foreground` / `background`:** Standard text and app backgrounds.
* **`navbar` / `navbar-foreground`:** Use for the site header/navbar container background and text. The `.site-header` class applies these automatically.
* **`card` / `secondary`:** Use for panels, widgets, and elevated container backgrounds. 
* **`muted`:** Use `text-muted-foreground` for helper text, subtitles, table headers, and secondary data.
* **`border`:** Use `border-border` for standard dividers. Use `border-table-border` for data tables. **Never** use `border-gray-*` with `dark:border-*` variants.
* **`popover` / `popover-foreground`:** Use for dropdown menus, tooltips, and floating panels (e.g., `bg-popover text-popover-foreground`).
* **`accent` / `accent-foreground`:** Use `hover:bg-accent hover:text-accent-foreground` for interactive hover and active states (subtle gold-tinted highlight).

### Financial / Status Colors

Whenever rendering numerical data, trends, or statuses, map them strictly to these classes:

* **Positive / Income / Earned:** Use **`success`** (`text-success`, `bg-success/10`, `border-success/30`).
* **Negative / Taxes / Deductions:** Use **`destructive`** (`text-destructive`, `bg-destructive/10`, `border-destructive/30`).
* **Alerts / Pending / Warning:** Use **`warning`** (`text-warning`, `bg-warning/10`, `border-warning/30`).
* **Informational / Subtotals:** Use **`info`** (`text-info` — this resolves to a specific Teal accent, `bg-info/10`, `border-info/30`).

> These semantic colors are defined with proper contrast for both light and dark modes. Light mode uses darker shades (e.g., `--success: 147 40% 38%`); dark mode uses lighter shades (e.g., `--success: 147 31% 51%`). Using the semantic variables ensures automatic contrast compliance.

### Typography
* Use `font-hyperlegible` + `tabular-nums` for all financial data: prices, quantities, dates, and account IDs.
* Use standard `font-sans` for regular prose, labels, and buttons.
* Use `font-mono` as a fallback for tabular data when `font-hyperlegible` is not available.

### Navbar Conventions
* All navbar text should use `text-navbar-foreground` (or `text-foreground` for elements inside the nav).
* Dropdown panels must use `bg-popover text-popover-foreground border-border` — never hardcode `bg-white dark:bg-[...]`.
* Hover states in the navbar and dropdowns must use `hover:bg-accent hover:text-accent-foreground`.
* Active nav items must use `bg-accent text-accent-foreground` (not `bg-secondary` or `bg-gray-*`).
* The branding link ("Ben Herila") must use `text-primary` to render as gold in both modes.

### Dark Mode Palette Reference
* Background: `#0f0f0f` (`--background`)
* Cards: `#171717` (`--card`)
* Navbar: `#171717` (`--navbar`)
* Primary (Gold): `#c8a96e` (`--primary`)
* Info (Teal): `#7eb8a0` (`--info`)
* Success (Green): `#5aaa7e` (`--success`)
* Destructive (Red): `#e05a5a` (`--destructive`)

### Light Mode Palette Reference
* Background: `#f5f5f5` (`--background`)
* Cards: `#ffffff` (`--card`)
* Navbar: `~#ebebeb` (`--navbar`)
* Primary (Darker Gold): HSL(39 40% 45%) (`--primary`)
* Info (Darker Teal): HSL(155 35% 40%) (`--info`)
* Success (Darker Green): HSL(147 40% 38%) (`--success`)
* Destructive (Darker Red): HSL(0 65% 45%) (`--destructive`)

### Dialog/Modal Width Constraints

**CRITICAL:** The `DialogContent` component in `components/ui/dialog.tsx` has `sm:max-w-lg` (512px) by default. This constraint takes precedence over width settings.

**To make a dialog wider:**

1. **Use responsive max-width override:** `sm:max-w-[Npx]` where N is your desired width
   ```tsx
   <DialogContent className="sm:max-w-[1800px] ...">
   ```

2. **Use !important if needed:** `sm:!max-w-[Npx]` to force override
   ```tsx
   <DialogContent className="sm:!max-w-[1400px] ...">
   ```

3. **Common patterns:**
   - Financial data modals: `sm:max-w-[1800px]` (wide, uses most of screen)
   - Form modals: `sm:max-w-[800px]` (medium width)
   - Confirmation dialogs: Use default `sm:max-w-lg` (512px)

**Why:** CSS `max-width` constraints take precedence over `width`. The base component's `sm:max-w-lg` applies at the `sm` breakpoint (640px) and above, so you must override with a matching or higher specificity class like `sm:max-w-[...]`.

**Reference:** [shadcn-ui/ui#1870](https://github.com/shadcn-ui/ui/issues/1870#issuecomment-3400436709)