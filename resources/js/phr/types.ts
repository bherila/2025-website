import { z } from 'zod'

const nullableString = z.string().nullable()

export const PhrAccessGrantSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  user_name: nullableString,
  user_email: nullableString,
  access_level: z.enum(['owner', 'manager', 'viewer']),
  granted_at: nullableString,
})

export type PhrAccessGrant = z.infer<typeof PhrAccessGrantSchema>

export const PhrPatientSchema = z.object({
  id: z.number(),
  owner_user_id: z.number(),
  display_name: nullableString,
  relationship: nullableString,
  birth_date: nullableString,
  sex_at_birth: nullableString,
  notes: nullableString,
  archived_at: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
  access_level: z.enum(['owner', 'manager', 'viewer']).nullable(),
  can_manage: z.boolean(),
  can_share: z.boolean(),
  access_grants: z.array(PhrAccessGrantSchema),
})

export type PhrPatient = z.infer<typeof PhrPatientSchema>

export const PhrLabResultSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  test_name: nullableString,
  collection_datetime: nullableString,
  result_datetime: nullableString,
  result_status: nullableString,
  ordering_provider: nullableString,
  resulting_lab: nullableString,
  analyte: nullableString,
  value: nullableString,
  value_numeric: nullableString,
  unit: nullableString,
  range_min: nullableString,
  range_max: nullableString,
  range_unit: nullableString,
  reference_range_text: nullableString,
  normal_value: nullableString,
  abnormal_flag: nullableString,
  message_from_provider: nullableString,
  result_comment: nullableString,
  lab_director: nullableString,
  source: nullableString,
  notes: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrLabResult = z.infer<typeof PhrLabResultSchema>

export const PhrVitalSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  vital_name: nullableString,
  vital_date: nullableString,
  observed_at: nullableString,
  vital_value: nullableString,
  value_numeric: nullableString,
  value_numeric_secondary: nullableString,
  unit: nullableString,
  secondary_unit: nullableString,
  body_site: nullableString,
  source: nullableString,
  notes: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrVital = z.infer<typeof PhrVitalSchema>

export const PhrDicomStudySchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  upload_id: z.number().nullable(),
  study_instance_uid: z.string(),
  study_date: nullableString,
  study_time: nullableString,
  accession_number: nullableString,
  description: nullableString,
  modalities: nullableString,
  series_count: z.number(),
  instance_count: z.number(),
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrDicomStudy = z.infer<typeof PhrDicomStudySchema>

export const PhrDicomSkippedFileSchema = z.object({
  path: z.string(),
  reason: z.string(),
})

export const PhrDicomUploadSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  uploaded_by_user_id: z.number(),
  status: z.string(),
  original_root_name: nullableString,
  total_files: z.number(),
  stored_files: z.number(),
  skipped_files: z.number(),
  total_bytes: z.number(),
  stored_bytes: z.number(),
  manifest_json: z.record(z.string(), z.unknown()).nullable(),
  skipped_files_json: z.array(PhrDicomSkippedFileSchema).nullable(),
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrDicomUpload = z.infer<typeof PhrDicomUploadSchema>

export const PhrPatientListResponseSchema = z.object({
  patients: z.array(PhrPatientSchema),
})

export const PhrPatientResponseSchema = z.object({
  patient: PhrPatientSchema,
})

export const PhrLabResultsResponseSchema = z.object({
  lab_results: z.array(PhrLabResultSchema),
})

export const PhrLabResultResponseSchema = z.object({
  lab_result: PhrLabResultSchema,
})

export const PhrVitalsResponseSchema = z.object({
  vitals: z.array(PhrVitalSchema),
})

export const PhrVitalResponseSchema = z.object({
  vital: PhrVitalSchema,
})

export const PhrDicomStudiesResponseSchema = z.object({
  studies: z.array(PhrDicomStudySchema),
})

export const PhrDicomUploadResponseSchema = z.object({
  upload: PhrDicomUploadSchema,
})

export const PhrAccessResponseSchema = z.object({
  access: PhrAccessGrantSchema,
  patient: PhrPatientSchema,
})

export const PhrPatientFormSchema = z.object({
  display_name: z.string().trim().min(1).max(255),
  relationship: z.string().trim().max(50).optional(),
  birth_date: z.string().trim().optional(),
  sex_at_birth: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(10000).optional(),
})

export type PhrPatientFormData = z.infer<typeof PhrPatientFormSchema>

export const PhrLabResultFormSchema = z.object({
  test_name: z.string().trim().max(255).optional(),
  analyte: z.string().trim().min(1).max(100),
  value: z.string().trim().max(255).optional(),
  value_numeric: z.string().trim().optional(),
  unit: z.string().trim().max(50).optional(),
  result_datetime: z.string().trim().optional(),
  range_min: z.string().trim().optional(),
  range_max: z.string().trim().optional(),
  abnormal_flag: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(10000).optional(),
})

export type PhrLabResultFormData = z.infer<typeof PhrLabResultFormSchema>

export const PhrVitalFormSchema = z.object({
  vital_name: z.string().trim().min(1).max(255),
  vital_date: z.string().trim().optional(),
  observed_at: z.string().trim().optional(),
  vital_value: z.string().trim().max(255).optional(),
  value_numeric: z.string().trim().optional(),
  value_numeric_secondary: z.string().trim().optional(),
  unit: z.string().trim().max(50).optional(),
  secondary_unit: z.string().trim().max(50).optional(),
  body_site: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(10000).optional(),
})

export type PhrVitalFormData = z.infer<typeof PhrVitalFormSchema>

// ── Office Visits ──────────────────────────────────────────────────────────────

export const PhrOfficeVisitSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  visit_date: nullableString,
  visit_started_at: nullableString,
  visit_ended_at: nullableString,
  visit_type: nullableString,
  provider_name: nullableString,
  provider_specialty: nullableString,
  facility_name: nullableString,
  chief_complaint: nullableString,
  assessment: nullableString,
  plan: nullableString,
  subjective: nullableString,
  objective: nullableString,
  icd10_codes: z.array(z.record(z.string(), z.string())).nullable(),
  cpt_codes: z.array(z.record(z.string(), z.string())).nullable(),
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrOfficeVisit = z.infer<typeof PhrOfficeVisitSchema>

export const PhrOfficeVisitsResponseSchema = z.object({
  office_visits: z.array(PhrOfficeVisitSchema),
})

// ── Medications ───────────────────────────────────────────────────────────────

export const PhrMedicationSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  name: z.string(),
  rxnorm_code: nullableString,
  dose: nullableString,
  dose_unit: nullableString,
  route: nullableString,
  frequency: nullableString,
  started_on: nullableString,
  ended_on: nullableString,
  status: z.string(),
  prescriber_name: nullableString,
  reason_for_use: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrMedication = z.infer<typeof PhrMedicationSchema>

export const PhrMedicationsResponseSchema = z.object({
  medications: z.array(PhrMedicationSchema),
})

// ── Conditions ────────────────────────────────────────────────────────────────

export const PhrConditionSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  name: z.string(),
  icd10_code: nullableString,
  snomed_code: nullableString,
  onset_date: nullableString,
  abated_date: nullableString,
  clinical_status: z.string(),
  verification_status: z.string(),
  severity: nullableString,
  notes: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrCondition = z.infer<typeof PhrConditionSchema>

export const PhrConditionsResponseSchema = z.object({
  conditions: z.array(PhrConditionSchema),
})

// ── Procedures ────────────────────────────────────────────────────────────────

export const PhrProcedureSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  name: z.string(),
  cpt_code: nullableString,
  snomed_code: nullableString,
  performed_at: nullableString,
  performed_on: nullableString,
  performer_name: nullableString,
  performer_specialty: nullableString,
  facility_name: nullableString,
  status: z.string(),
  reason: nullableString,
  outcome: nullableString,
  notes: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrProcedure = z.infer<typeof PhrProcedureSchema>

export const PhrProceduresResponseSchema = z.object({
  procedures: z.array(PhrProcedureSchema),
})

// ── Immunizations ─────────────────────────────────────────────────────────────

export const PhrImmunizationSchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  vaccine_name: z.string(),
  cvx_code: nullableString,
  manufacturer: nullableString,
  lot_number: nullableString,
  administered_on: nullableString,
  dose_number: z.number().nullable(),
  series_doses: z.number().nullable(),
  site: nullableString,
  route: nullableString,
  administered_by: nullableString,
  facility_name: nullableString,
  notes: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrImmunization = z.infer<typeof PhrImmunizationSchema>

export const PhrImmunizationsResponseSchema = z.object({
  immunizations: z.array(PhrImmunizationSchema),
})

// ── Allergies ─────────────────────────────────────────────────────────────────

export const PhrAllergySchema = z.object({
  id: z.number(),
  patient_id: z.number(),
  user_id: z.number(),
  substance: z.string(),
  rxnorm_code: nullableString,
  snomed_code: nullableString,
  category: nullableString,
  criticality: nullableString,
  clinical_status: z.string(),
  verification_status: z.string(),
  reaction: nullableString,
  severity: nullableString,
  notes: nullableString,
  created_at: nullableString,
  updated_at: nullableString,
})

export type PhrAllergy = z.infer<typeof PhrAllergySchema>

export const PhrAllergiesResponseSchema = z.object({
  allergies: z.array(PhrAllergySchema),
})
