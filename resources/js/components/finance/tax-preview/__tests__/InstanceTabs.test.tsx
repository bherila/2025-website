import { fireEvent, render, screen } from '@testing-library/react'

import { InstanceTabs } from '../InstanceTabs'

describe('InstanceTabs', () => {
  const instances = [
    { key: 'passive', label: 'Passive' },
    { key: 'general', label: 'General' },
  ]

  it('renders one tab per instance', () => {
    render(<InstanceTabs instances={instances} activeKey="passive" onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Passive' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument()
  })

  it('marks the active tab with aria-selected', () => {
    render(<InstanceTabs instances={instances} activeKey="general" onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Passive' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onSelect with the tab key', () => {
    const onSelect = jest.fn()
    render(<InstanceTabs instances={instances} activeKey="passive" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: 'General' }))
    expect(onSelect).toHaveBeenCalledWith('general')
  })

  it('renders a + button when onCreate is provided', () => {
    const onCreate = jest.fn()
    render(<InstanceTabs instances={instances} activeKey="passive" onSelect={() => {}} onCreate={onCreate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add new instance' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('does not render a + button when onCreate is omitted', () => {
    render(<InstanceTabs instances={instances} activeKey="passive" onSelect={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Add new instance' })).not.toBeInTheDocument()
  })

  it('handles an empty instance list', () => {
    const onCreate = jest.fn()
    render(<InstanceTabs instances={[]} activeKey={undefined} onSelect={() => {}} onCreate={onCreate} />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Add new instance' })).toBeInTheDocument()
  })
})
