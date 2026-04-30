<?php

namespace App\Http\Requests\Finance;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class ApplyLotReconciliationRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'supersede' => ['sometimes', 'array'],
            'supersede.*.keep_lot_id' => ['required', 'integer'],
            'supersede.*.drop_lot_id' => ['required', 'integer'],
            'accept' => ['sometimes', 'array'],
            'accept.*' => ['integer'],
            'conflicts' => ['sometimes', 'array'],
            'conflicts.*.lot_id' => ['required', 'integer'],
            'conflicts.*.status' => ['required', 'string', 'in:matched,variance,missing_account,missing_1099b,duplicate,accepted,ignored,conflict'],
            'conflicts.*.notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<int, array{keep_lot_id: int, drop_lot_id: int}>
     */
    public function supersedeRows(): array
    {
        $rows = $this->validated('supersede', []);
        if (! is_array($rows)) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $result[] = [
                'keep_lot_id' => (int) ($row['keep_lot_id'] ?? 0),
                'drop_lot_id' => (int) ($row['drop_lot_id'] ?? 0),
            ];
        }

        return $result;
    }

    /**
     * @return int[]
     */
    public function acceptedLotIds(): array
    {
        $lotIds = $this->validated('accept', []);
        if (! is_array($lotIds)) {
            return [];
        }

        return array_values(array_map(static fn (mixed $lotId): int => (int) $lotId, $lotIds));
    }

    /**
     * @return array<int, array{lot_id: int, status: string, notes: string|null}>
     */
    public function conflictRows(): array
    {
        $rows = $this->validated('conflicts', []);
        if (! is_array($rows)) {
            return [];
        }

        $result = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $result[] = [
                'lot_id' => (int) ($row['lot_id'] ?? 0),
                'status' => (string) ($row['status'] ?? ''),
                'notes' => isset($row['notes']) ? (string) $row['notes'] : null,
            ];
        }

        return $result;
    }
}
