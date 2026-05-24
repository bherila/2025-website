declare function require(moduleName: string): unknown

interface JestProjectConfig {
  displayName: string
  testPathIgnorePatterns?: string[]
}

interface JestRootConfig {
  projects: JestProjectConfig[]
}

const config = require('../jest.config.cjs') as JestRootConfig

function getProject(displayName: string): JestProjectConfig {
  const project = config.projects.find((candidate) => candidate.displayName === displayName)

  if (!project) {
    throw new Error(`Missing Jest project: ${displayName}`)
  }

  return project
}

describe('jest config', () => {
  it('does not ignore node tests with dom as part of another word', () => {
    const nodeProject = getProject('node')
    const domIgnorePattern = nodeProject.testPathIgnorePatterns?.find((pattern) => pattern.includes('dom')) ?? ''
    const domIgnoreRegex = new RegExp(domIgnorePattern)

    expect(domIgnorePattern).toBe('\\.dom\\.test\\.ts$')
    expect(domIgnoreRegex.test('tests-ts/webauthn-utils.dom.test.ts')).toBe(true)
    expect(domIgnoreRegex.test('tests-ts/freedom.test.ts')).toBe(false)
  })

  it('does not ignore normal tests with slow as part of another word', () => {
    const jsdomProject = getProject('jsdom')
    const slowIgnorePattern = jsdomProject.testPathIgnorePatterns?.find((pattern) => pattern.includes('slow')) ?? ''
    const slowIgnoreRegex = new RegExp(slowIgnorePattern)

    expect(slowIgnorePattern).toBe('\\.slow\\.test\\.[tj]sx?$')
    expect(slowIgnoreRegex.test('tests-ts/interest.slow.test.ts')).toBe(true)
    expect(slowIgnoreRegex.test('tests-ts/slowdown.test.ts')).toBe(false)
  })
})
