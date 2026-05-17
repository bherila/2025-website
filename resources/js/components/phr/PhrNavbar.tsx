'use client'

import { ArrowLeft, Settings } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fetchWrapper } from '@/fetchWrapper'
import type { PhrPatientTab, PhrSection } from '@/lib/phrRouteBuilder'
import { patientTabUrl, phrSectionUrl } from '@/lib/phrRouteBuilder'
import { cn } from '@/lib/utils'
import { type PhrPatient, PhrPatientListResponseSchema } from '@/phr/types'

const PATIENT_TABS: { value: PhrPatientTab; label: string }[] = [
  { value: 'summary', label: 'Summary' },
  { value: 'labs', label: 'Labs' },
  { value: 'vitals', label: 'Vitals' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'office-visits', label: 'Office Visits' },
  { value: 'medications', label: 'Medications' },
  { value: 'conditions', label: 'Conditions' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'immunizations', label: 'Immunizations' },
  { value: 'allergies', label: 'Allergies' },
  { value: 'documents', label: 'Documents' },
  { value: 'access', label: 'Access' },
]

interface PhrNavbarProps {
  patientId?: number
  activeTab?: PhrPatientTab
  activeSection?: PhrSection
  children?: React.ReactNode
}

export default function PhrNavbar({ patientId, activeTab, activeSection, children }: PhrNavbarProps) {
  const [patients, setPatients] = useState<PhrPatient[]>([])
  const [searchValue, setSearchValue] = useState('')
  const [isComboboxOpen, setIsComboboxOpen] = useState(false)

  const fetchPatients = useCallback(async () => {
    try {
      const rawResponse: unknown = await fetchWrapper.get('/api/phr/patients')
      const response = PhrPatientListResponseSchema.parse(rawResponse)
      setPatients(response.patients)
    } catch (error) {
      console.error('Failed to fetch PHR patients:', error)
    }
  }, [])

  useEffect(() => {
    void fetchPatients()
  }, [fetchPatients])

  const currentPatient = useMemo<PhrPatient | null>(
    () => patients.find((patient) => patient.id === patientId) ?? null,
    [patientId, patients],
  )

  const filteredPatients = useMemo<PhrPatient[]>(() => {
    if (!searchValue) {
      return patients
    }

    const query = searchValue.toLowerCase()
    return patients.filter((patient) => (patient.display_name ?? '').toLowerCase().includes(query))
  }, [patients, searchValue])

  const canManageAnyPatient = useMemo<boolean>(
    () => patients.some((patient) => patient.can_manage),
    [patients],
  )

  function handlePatientSelect(patient: PhrPatient): void {
    const targetTab = activeTab ?? 'summary'
    setSearchValue('')
    setIsComboboxOpen(false)
    window.location.href = patientTabUrl(targetTab, patient.id)
  }

  return (
    <div>
      <div className="w-full border-b border-border/40 bg-background">
        <div className="flex h-12 items-center gap-2 px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0" asChild>
                <a href="/" aria-label="Back to BWH">
                  <ArrowLeft className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to BWH</TooltipContent>
          </Tooltip>

          <span
            className="select-none text-xs font-bold uppercase tracking-widest text-foreground"
            aria-label="PHR section"
          >
            PHR
          </span>

          {patientId !== undefined && (
            <Combobox
              onValueChange={(value) => {
                if (value) {
                  handlePatientSelect(value as PhrPatient)
                }
              }}
              open={isComboboxOpen}
              onOpenChange={setIsComboboxOpen}
            >
              <ComboboxInput
                placeholder="Search patients…"
                aria-label={`Selected patient: ${currentPatient?.display_name ?? patientId}`}
                className="h-8 min-w-[200px]"
                value={isComboboxOpen ? searchValue : (currentPatient?.display_name ?? String(patientId))}
                onChange={(event) => setSearchValue(event.target.value)}
                onFocus={() => {
                  setIsComboboxOpen(true)
                  setSearchValue('')
                }}
              />
              <ComboboxContent align="start" className="w-72">
                <ComboboxList>
                  {filteredPatients.map((patient) => (
                    <ComboboxItem
                      key={patient.id}
                      value={patient}
                      className={cn(patient.id === patientId && 'bg-accent font-medium')}
                    >
                      {patient.display_name || `Patient ${patient.id}`}
                    </ComboboxItem>
                  ))}
                  {filteredPatients.length === 0 && searchValue && (
                    <div className="py-2 text-center text-sm text-muted-foreground">No patients found</div>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}

          {patientId !== undefined && (
            <div className="flex items-center gap-1">
              {PATIENT_TABS.map((tab) => {
                const isActive = activeTab === tab.value

                return (
                  <a
                    key={tab.value}
                    href={patientTabUrl(tab.value, patientId)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'h-8 px-3 text-sm',
                      isActive ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {tab.label}
                  </a>
                )
              })}
            </div>
          )}

          <NavigationMenu viewport={false} className="ml-auto">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink
                  href={phrSectionUrl('patients')}
                  aria-current={activeSection === 'patients' ? 'page' : undefined}
                  className={cn(
                    navigationMenuTriggerStyle(),
                    'h-8 px-3 text-sm',
                    activeSection === 'patients' ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
                  )}
                >
                  Patients
                </NavigationMenuLink>
              </NavigationMenuItem>
              {canManageAnyPatient && (
                <NavigationMenuItem>
                  <NavigationMenuLink
                    href={phrSectionUrl('manage-patients')}
                    aria-current={activeSection === 'manage-patients' ? 'page' : undefined}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'h-8 px-3 text-sm',
                      activeSection === 'manage-patients'
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    Manage Patients
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
              <NavigationMenuItem>
                <NavigationMenuLink
                  href={phrSectionUrl('imports')}
                  aria-current={activeSection === 'imports' ? 'page' : undefined}
                  className={cn(
                    navigationMenuTriggerStyle(),
                    'h-8 px-3 text-sm',
                    activeSection === 'imports' ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground',
                  )}
                >
                  Imports
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <NavigationMenuLink
                      href={phrSectionUrl('config')}
                      aria-current={activeSection === 'config' ? 'page' : undefined}
                      aria-label="Config"
                      className={cn(
                        navigationMenuTriggerStyle(),
                        'h-8 w-8 p-0',
                        activeSection === 'config' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
                      )}
                    >
                      <Settings className="h-4 w-4" />
                    </NavigationMenuLink>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Config</TooltipContent>
                </Tooltip>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>

      {children}
    </div>
  )
}
