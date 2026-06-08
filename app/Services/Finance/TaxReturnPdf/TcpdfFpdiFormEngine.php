<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use RuntimeException;
use setasign\Fpdi\Tcpdf\Fpdi;

class TcpdfFpdiFormEngine implements IrsAcroFormFillEngine
{
    public function __construct(
        private readonly IrsPdfTemplateRepository $templates,
        private readonly IrsFieldDumpService $fieldDumpService,
    ) {}

    /**
     * @param  array<string, string|bool|null>  $fieldValues
     */
    public function fill(string $templatePath, array $fieldValues, TaxReturnPdfOptions $options): string
    {
        $formId = $options->formId ?? 'form-1040';

        return $this->fillForms([[
            'formId' => $formId,
            'templatePath' => $templatePath,
            'fieldValues' => $fieldValues,
            'instanceKey' => $this->instanceKey($options),
        ]], $options);
    }

    /**
     * @param  array<int, array{formId: string, templatePath: string, fieldValues: array<string, string|bool|null>, instanceKey: string}>  $forms
     */
    public function fillForms(array $forms, TaxReturnPdfOptions $options): string
    {
        $pdf = $this->newPdf($options);

        foreach ($forms as $form) {
            $this->renderForm($pdf, $form, $options);
        }

        $content = $pdf->Output($options->filename ?? 'tax-return.pdf', 'S');

        if ($content === '' || ! str_starts_with($content, '%PDF')) {
            throw new RuntimeException('TCPDF/FPDI did not return a valid PDF payload.');
        }

        return $content;
    }

    /**
     * @param  array{formId: string, templatePath: string, fieldValues: array<string, string|bool|null>, instanceKey: string}  $form
     */
    private function renderForm(Fpdi $pdf, array $form, TaxReturnPdfOptions $options): void
    {
        $formId = $form['formId'];
        $templatePath = $form['templatePath'];
        $fieldValues = $form['fieldValues'];
        $instanceKey = $form['instanceKey'];
        $template = $this->templates->template($options->year, $formId);
        $backgroundPath = $this->templates->backgroundPath($template);
        $fieldsByPage = $this->fieldsByPage($this->fieldDumpService->dump($templatePath));
        $pageCount = $pdf->setSourceFile($backgroundPath);

        for ($page = 1; $page <= $pageCount; $page++) {
            $templateId = $pdf->importPage($page);
            $size = $pdf->getTemplateSize($templateId);
            $width = (float) $size['width'];
            $height = (float) $size['height'];

            $pdf->AddPage((string) $size['orientation'], [$width, $height]);
            $pdf->useTemplate($templateId, 0, 0, $width, $height, true);

            foreach ($fieldsByPage[$page] ?? [] as $field) {
                $geometry = $this->geometry($field, $height);

                if ($geometry === null) {
                    continue;
                }

                if ($options->mode === 'print') {
                    $this->drawPrintValue($pdf, $field, $geometry, $fieldValues[$field->name] ?? null);
                } else {
                    $this->drawEditableField($pdf, $formId, $instanceKey, $field, $geometry, $fieldValues[$field->name] ?? null);
                }
            }
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function dumpFields(string $templatePath): array
    {
        return $this->fieldDumpService->dumpArray($templatePath);
    }

    public function supportsEditableOutput(): bool
    {
        return true;
    }

    private function newPdf(TaxReturnPdfOptions $options): Fpdi
    {
        $pdf = new Fpdi('P', 'pt', [612, 792], true, 'UTF-8', false);
        $pdf->setPrintHeader(false);
        $pdf->setPrintFooter(false);
        $pdf->SetMargins(0, 0, 0);
        $pdf->SetAutoPageBreak(false, 0);
        $pdf->SetCellPadding(0);
        $pdf->setCompression(false);
        $pdf->SetCreator(config('app.name', 'Laravel'));
        $pdf->SetTitle($options->filename ?? 'Tax return PDF');
        $pdf->SetFont('helvetica', '', 8);
        $pdf->SetTextColor(0, 0, 0);
        $pdf->SetDrawColor(0, 0, 0);
        $pdf->SetFillColor(255, 255, 255);

        return $pdf;
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     * @return array<int, array<int, IrsFieldDefinition>>
     */
    private function fieldsByPage(array $fields): array
    {
        $fieldsByPage = [];

        foreach ($fields as $field) {
            if ($field->page === null || count($field->rect) < 4) {
                continue;
            }

            $fieldsByPage[$field->page][] = $field;
        }

        return $fieldsByPage;
    }

    /**
     * @return array{x: float, y: float, w: float, h: float}|null
     */
    private function geometry(IrsFieldDefinition $field, float $pageHeight): ?array
    {
        if (count($field->rect) < 4) {
            return null;
        }

        $left = (float) $field->rect[0];
        $lower = (float) $field->rect[1];
        $right = (float) $field->rect[2];
        $upper = (float) $field->rect[3];
        $width = $right - $left;
        $height = $upper - $lower;

        if ($width <= 0 || $height <= 0) {
            return null;
        }

        return [
            'x' => $left,
            'y' => $pageHeight - $upper,
            'w' => $width,
            'h' => $height,
        ];
    }

    /**
     * @param  array{x: float, y: float, w: float, h: float}  $geometry
     */
    private function drawEditableField(Fpdi $pdf, string $formId, string $instanceKey, IrsFieldDefinition $field, array $geometry, string|bool|null $value): void
    {
        $fontSize = $this->fontSize($field);
        $pdf->SetFont('helvetica', '', $fontSize);
        $pdf->SetTextColor(0, 0, 0);

        if ($field->type === 'Btn') {
            $this->drawEditableButton($pdf, $formId, $instanceKey, $field, $geometry, $value);

            return;
        }

        $properties = [
            'value' => is_scalar($value) ? (string) $value : '',
            'lineWidth' => 0,
            'borderStyle' => 'none',
            'alignment' => $this->textAlignment($field, $value) === 'R' ? 'right' : 'left',
        ];
        $fieldOptions = $this->fieldOptions($field);

        if (is_scalar($value) && trim((string) $value) !== '') {
            $fieldOptions['v'] = (string) $value;
            $fieldOptions['dv'] = (string) $value;
        }

        $pdf->TextField(
            $this->outputFieldName($formId, $instanceKey, $field, true),
            $geometry['w'],
            $geometry['h'],
            $properties,
            $fieldOptions,
            $geometry['x'],
            $geometry['y'],
        );
    }

    /**
     * @param  array{x: float, y: float, w: float, h: float}  $geometry
     */
    private function drawEditableButton(Fpdi $pdf, string $formId, string $instanceKey, IrsFieldDefinition $field, array $geometry, string|bool|null $value): void
    {
        $size = max(1, (int) round(min($geometry['w'], $geometry['h'])));
        $onValue = $field->onValues[0] ?? 'Yes';
        $checked = $this->buttonIsChecked($field, $value);
        $fieldOptions = $this->fieldOptions($field);

        if ($field->fieldKind === 'radio') {
            $pdf->RadioButton(
                $this->outputFieldName($formId, $instanceKey, $field, false),
                $size,
                ['lineWidth' => 0, 'borderStyle' => 'none'],
                $fieldOptions,
                $onValue,
                $checked,
                $geometry['x'],
                $geometry['y'],
            );

            return;
        }

        $pdf->CheckBox(
            $this->outputFieldName($formId, $instanceKey, $field, true),
            $size,
            $checked,
            ['lineWidth' => 0, 'borderStyle' => 'none'],
            $fieldOptions,
            $onValue,
            $geometry['x'],
            $geometry['y'],
        );
    }

    /**
     * @param  array{x: float, y: float, w: float, h: float}  $geometry
     */
    private function drawPrintValue(Fpdi $pdf, IrsFieldDefinition $field, array $geometry, string|bool|null $value): void
    {
        if ($value === null || $value === false || $value === '') {
            return;
        }

        $pdf->SetFont('helvetica', '', $this->fontSize($field));
        $pdf->SetTextColor(0, 0, 0);

        if ($field->type === 'Btn') {
            if (! $this->buttonIsChecked($field, $value)) {
                return;
            }

            $pdf->SetFont('helvetica', 'B', 8);
            $pdf->MultiCell(
                $geometry['w'],
                $geometry['h'],
                'X',
                0,
                'C',
                false,
                0,
                $geometry['x'],
                $geometry['y'] - 0.5,
                true,
                0,
                false,
                true,
                $geometry['h'],
                'M',
            );

            return;
        }

        $pdf->MultiCell(
            $geometry['w'],
            $geometry['h'],
            (string) $value,
            0,
            $this->textAlignment($field, $value),
            false,
            0,
            $geometry['x'],
            $geometry['y'],
            true,
            0,
            false,
            true,
            $geometry['h'],
            'M',
        );
    }

    /**
     * @return array<string, int|string>
     */
    private function fieldOptions(IrsFieldDefinition $field): array
    {
        $options = [];

        if ($field->flags !== null) {
            $options['ff'] = $field->flags;
        }

        if ($field->maxLength !== null && $field->maxLength > 0) {
            $options['maxlen'] = $field->maxLength;
        }

        return $options;
    }

    private function buttonIsChecked(IrsFieldDefinition $field, string|bool|null $value): bool
    {
        if ($value === true) {
            return true;
        }

        if (! is_string($value) || $value === '' || $value === 'Off') {
            return false;
        }

        if ($field->onValues === []) {
            return true;
        }

        return in_array($value, $field->onValues, true);
    }

    private function outputFieldName(string $formId, string $instanceKey, IrsFieldDefinition $field, bool $includeObjectId): string
    {
        $fieldId = $includeObjectId && $field->objectId !== null
            ? "{$field->name}|{$field->objectId}"
            : $field->name;
        $hash = substr(hash('sha256', "{$formId}|{$instanceKey}|{$fieldId}"), 0, 18);
        $prefix = preg_replace('/[^A-Za-z0-9]+/', '_', "{$formId}_{$instanceKey}") ?: 'irs_form';

        return "trp_{$prefix}_{$hash}";
    }

    private function instanceKey(TaxReturnPdfOptions $options): string
    {
        return $options->scope === 'return' ? 'return' : 'form';
    }

    private function fontSize(IrsFieldDefinition $field): float
    {
        $defaultAppearance = $field->defaultAppearance ?? '';

        if (preg_match('/\/[A-Za-z0-9._-]+\s+([0-9]+(?:\.[0-9]+)?)\s+Tf/', $defaultAppearance, $matches) === 1) {
            return max(5.0, min(12.0, (float) $matches[1]));
        }

        return $field->type === 'Btn' ? 8.0 : 7.0;
    }

    private function textAlignment(IrsFieldDefinition $field, string|bool|null $value): string
    {
        if (is_string($value) && is_numeric($value) && $field->maxLength !== 9) {
            return 'R';
        }

        return 'L';
    }
}
