<?php

namespace App\Services\PHR\Export;

use App\Models\PhrPatient;
use TCPDF;

class PhrPdfSummaryRenderer
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function render(array $data): string
    {
        /** @var PhrPatient $patient */
        $patient = $data['patient'];

        $pdf = new TCPDF('P', 'mm', 'LETTER', true, 'UTF-8', false);
        $pdf->SetCreator(config('app.name', 'PHR'));
        $pdf->SetAuthor(config('app.name', 'PHR'));
        $pdf->SetTitle('PHR Summary');
        $pdf->SetPrintHeader(false);
        $pdf->SetPrintFooter(false);
        $pdf->SetMargins(14, 14, 14);
        $pdf->SetAutoPageBreak(true, 14);
        $pdf->AddPage();
        $pdf->SetFont('helvetica', 'B', 18);
        $pdf->Cell(0, 8, 'Personal Health Record Summary', 0, 1);
        $pdf->SetFont('helvetica', '', 10);
        $pdf->Cell(0, 6, 'Generated '.now()->toDateTimeString(), 0, 1);
        $pdf->Ln(2);

        $this->section($pdf, 'Patient', [
            ['Name', $patient->display_name ?? 'Patient '.$patient->id],
            ['Relationship', $patient->relationship],
            ['Birth Date', $patient->birth_date?->toDateString()],
            ['Sex at Birth', $patient->sex_at_birth],
        ]);

        $this->section($pdf, 'Labs', $data['lab_results']->map(fn ($lab): array => [
            $lab->result_datetime?->toDateString() ?? $lab->collection_datetime?->toDateString(),
            $lab->analyte ?? $lab->test_name,
            trim((string) ($lab->value ?? $lab->value_numeric).' '.(string) $lab->unit),
            $lab->abnormal_flag,
        ])->all());
        $this->section($pdf, 'Vitals', $data['vitals']->map(fn ($vital): array => [
            $vital->observed_at?->toDateString() ?? $vital->vital_date?->toDateString(),
            $vital->vital_name,
            trim((string) ($vital->vital_value ?? $vital->value_numeric).' '.(string) $vital->unit),
        ])->all());
        $this->section($pdf, 'Conditions', $data['conditions']->map(fn ($condition): array => [
            $condition->name,
            $condition->icd10_code,
            $condition->clinical_status,
        ])->all());
        $this->section($pdf, 'Medications', $data['medications']->map(fn ($medication): array => [
            $medication->name,
            trim(implode(' ', array_filter([$medication->dose, $medication->dose_unit, $medication->frequency]))),
            $medication->status,
        ])->all());
        $this->section($pdf, 'Procedures', $data['procedures']->map(fn ($procedure): array => [
            $procedure->performed_at?->toDateString() ?? $procedure->performed_on?->toDateString(),
            $procedure->name,
            $procedure->status,
        ])->all());
        $this->section($pdf, 'Immunizations', $data['immunizations']->map(fn ($immunization): array => [
            $immunization->administered_on?->toDateString(),
            $immunization->vaccine_name,
            $immunization->lot_number,
        ])->all());
        $this->section($pdf, 'Allergies', $data['allergies']->map(fn ($allergy): array => [
            $allergy->substance,
            $allergy->reaction,
            $allergy->severity,
        ])->all());
        $this->section($pdf, 'Office Visits', $data['office_visits']->map(fn ($visit): array => [
            $visit->visit_started_at?->toDateString() ?? $visit->visit_date?->toDateString(),
            $visit->provider_name,
            $visit->chief_complaint,
            $visit->assessment,
        ])->all());
        $this->section($pdf, 'Imaging', $data['dicom_studies']->map(fn ($study): array => [
            $study->study_date?->toDateString(),
            $study->description,
            $study->modalities,
        ])->all());
        $this->section($pdf, 'Documents', $data['documents']->map(fn ($document): array => [
            $document->title ?? $document->original_filename,
            $document->document_type,
            $document->summary,
        ])->all());

        return $pdf->Output('phr-summary.pdf', 'S');
    }

    /**
     * @param  array<int, array<int, mixed>>  $rows
     */
    private function section(TCPDF $pdf, string $title, array $rows): void
    {
        $pdf->Ln(3);
        $pdf->SetFont('helvetica', 'B', 12);
        $pdf->Cell(0, 6, $title, 0, 1);
        $pdf->SetFont('helvetica', '', 9);

        if ($rows === []) {
            $pdf->SetTextColor(100, 100, 100);
            $pdf->Cell(0, 5, 'No records.', 0, 1);
            $pdf->SetTextColor(0, 0, 0);

            return;
        }

        foreach (array_slice($rows, 0, 60) as $row) {
            $line = implode(' | ', array_filter(array_map(
                static fn (mixed $value): string => is_scalar($value) ? trim((string) $value) : '',
                $row
            )));
            if ($line === '') {
                continue;
            }

            $pdf->MultiCell(0, 5, $line, 0, 'L');
        }

        if (count($rows) > 60) {
            $pdf->SetTextColor(100, 100, 100);
            $pdf->Cell(0, 5, 'Additional records are included in FHIR/CCDA exports.', 0, 1);
            $pdf->SetTextColor(0, 0, 0);
        }
    }
}
