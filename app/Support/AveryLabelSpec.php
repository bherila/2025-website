<?php

namespace App\Support;

class AveryLabelSpec
{
    /** @var array<string, mixed> */
    private array $spec;

    public function __construct(public string $sheetNumber)
    {
        $spec = config('avery-labels.'.$sheetNumber);
        if (! is_array($spec)) {
            throw new \InvalidArgumentException('Unsupported Avery sheet number.');
        }

        $this->spec = $spec;
    }

    public static function options(): array
    {
        /** @var array<string, array<string, mixed>> $specs */
        $specs = config('avery-labels', []);

        return $specs;
    }

    public function labelsPerPage(): int
    {
        return $this->rows() * $this->columns();
    }

    public function rows(): int
    {
        return (int) $this->spec['rows'];
    }

    public function columns(): int
    {
        return (int) $this->spec['columns'];
    }

    public function labelWidthInches(): float
    {
        return (float) $this->spec['label_width'];
    }

    public function labelHeightInches(): float
    {
        return (float) $this->spec['label_height'];
    }

    public function topMarginInches(): float
    {
        return (float) $this->spec['top_margin'];
    }

    public function leftMarginInches(): float
    {
        return (float) $this->spec['left_margin'];
    }

    public function horizontalPitchInches(): float
    {
        return (float) $this->spec['h_pitch'];
    }

    public function verticalPitchInches(): float
    {
        return (float) $this->spec['v_pitch'];
    }

    public function paper(): string
    {
        return (string) $this->spec['paper'];
    }
}
