/**
 * Formats decimal hours into hh:mm format.
 * Example: 1.333 -> 1:20
 */
export function formatHours(hours: number): string {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
}
