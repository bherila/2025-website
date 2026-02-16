import { UserSchema, ProjectSchema, FileRecordSchema, TimeEntrySchema, AgreementSchema, AppInitialDataSchema } from '../hydration-schemas'

describe('hydration zod schemas', () => {
  it('UserSchema parses valid user', () => {
    const valid = { id: 1, name: 'Alice', email: 'a@ex.com' }
    expect(UserSchema.parse(valid)).toMatchObject(valid)
  })

  it('UserSchema coerces string IDs', () => {
    const validStr = { id: '123', name: 'Alice', email: 'a@ex.com' }
    const parsed = UserSchema.parse(validStr as any)
    expect(parsed.id).toBe(123)
  })

  it('UserSchema rejects truly invalid IDs', () => {
    const bad = { id: 'abc', name: 'Alice', email: 'a@ex.com' }
    expect(() => UserSchema.parse(bad as any)).toThrow()
  })

  it('ProjectSchema parses minimal project', () => {
    const p = { id: 5, name: 'P', slug: 'p' }
    expect(ProjectSchema.parse(p)).toMatchObject(p)
  })

  it('FileRecordSchema accepts minimal file record', () => {
    const f = { id: 2, original_filename: 'f.txt', created_at: new Date().toISOString() }
    expect(FileRecordSchema.parse({ ...f, human_file_size: '1 KB', download_count: 0 })).toBeTruthy()
  })

  it('TimeEntrySchema parses recent time entry', () => {
    const t = { id: 1, date_worked: '2024-01-01', job_type: 'dev' }
    expect(TimeEntrySchema.parse(t)).toMatchObject({ id: 1 })
  })

  it('AgreementSchema parses agreement shape', () => {
    const a = { id: 1, active_date: '2024-01-01', monthly_retainer_hours: '10', monthly_retainer_fee: '0' }
    expect(AgreementSchema.parse(a)).toMatchObject({ id: 1 })
  })

  it('AppInitialDataSchema parses app-level payload', () => {
    const payload = {
      appName: 'App',
      authenticated: true,
      isAdmin: false,
      clientCompanies: [{ id: 1, company_name: 'Acme', slug: 'acme' }],
      currentUser: { id: 2, name: 'Bob', email: 'b@e.com' },
    }
    expect(AppInitialDataSchema.parse(payload)).toMatchObject({ authenticated: true, isAdmin: false })
  })

  it('AppInitialDataSchema rejects invalid currentUser', () => {
    const bad = { authenticated: true, currentUser: { id: 'x', name: null } }
    expect(() => AppInitialDataSchema.parse(bad as any)).toThrow()
  })
})