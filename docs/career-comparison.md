# Career Comparison

The Career Comparison calculator compares a current job against one or more hypothetical offers across a calendar-year planning horizon. The public compute endpoint is `/api/financial-planning/career-comparison/compute`; authenticated users can save their private latest comparison and create shared forks.

## Key Files

- `resources/js/financial-planning/career-comparison.tsx` — page mount.
- `resources/js/components/planning/CareerComp/CareerCompPage.tsx` — Miller-column orchestration, save/share/export actions, and result navigation.
- `resources/js/components/planning/CareerComp/CareerCompForm.tsx` — planning window, model assumptions, current job, offers, grants, and valuation timeline editors.
- `app/Services/Planning/CareerComp/CareerCompCalculator.php` — server-side projection, transition composition, equity valuation, and after-tax lifetime-value calculation.
- `app/Services/Planning/CareerComp/CareerCompInputs.php` and `ModelAssumptions.php` — default input contract.

## Career-Transition Behavior

- Shared model assumptions include `careerTransition.currentJobNoticeWeeks` (default `2`) and `careerTransition.timeOffBetweenJobsWeeks` (default `0`).
- When a hypothetical offer has a `startDate` and there is a current job, the offer projection becomes a composite path: current job through the derived prior-job end date, then the new offer from its start date.
- The default prior-job resignation date is derived from the offer start date by subtracting notice-period weeks plus time-off weeks. Current-job compensation and vesting remain active through the notice period, then the time-off gap is left before the new start date.
- Each offer may override `transitionOverride.currentJobNoticeWeeks`, `transitionOverride.timeOffBetweenJobsWeeks`, and/or `priorJobResignationDate`. If no offer override is set, the shared assumptions apply.
- Deltas still compare each offer path against the full current-job baseline. To compare "join now" against "join later", create two offers with different start dates/transition overrides and compare their lifetime rows.

## Offer Notes And Archive Behavior

- Hypothetical offers may store markdown notes in `notesMarkdown`. The UI opens notes in a dedicated Miller column backed by the shared CodeMirror editor.
- Notes are persisted with the offer spec JSON, so assumptions such as exercise-cost analysis or negotiation context travel with saved latest comparisons and shared forks.
- Hypothetical offers may be archived with `archived: true`. Archived offers remain stored and can be unarchived from the offer editor, but the projection engine skips them.
- Because graphs, tables, deltas, and XLSX exports are built from the projection output, archived offers are omitted from every comparison result and export while still being recoverable later.
