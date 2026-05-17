export const phrTabs = [
  { key: 'patients', label: 'Patients', path: '/phr/patients', patientScoped: false },
  { key: 'patients-manage', label: 'Manage', path: '/phr/patients/manage', patientScoped: false },
  { key: 'summary', label: 'Summary', path: '/phr/summary', patientScoped: true },
  { key: 'labs', label: 'Labs', path: '/phr/labs', patientScoped: true },
  { key: 'vitals', label: 'Vitals', path: '/phr/vitals', patientScoped: true },
  { key: 'imaging', label: 'Imaging', path: '/phr/imaging', patientScoped: true },
  { key: 'office-visits', label: 'Office Visits', path: '/phr/office-visits', patientScoped: true },
  { key: 'medications', label: 'Medications', path: '/phr/medications', patientScoped: true },
  { key: 'conditions', label: 'Conditions', path: '/phr/conditions', patientScoped: true },
  { key: 'procedures', label: 'Procedures', path: '/phr/procedures', patientScoped: true },
  { key: 'immunizations', label: 'Immunizations', path: '/phr/immunizations', patientScoped: true },
  { key: 'allergies', label: 'Allergies', path: '/phr/allergies', patientScoped: true },
  { key: 'documents', label: 'Documents', path: '/phr/documents', patientScoped: true },
  { key: 'access', label: 'Access', path: '/phr/access', patientScoped: true },
] as const

export type PhrTabKey = typeof phrTabs[number]['key']
