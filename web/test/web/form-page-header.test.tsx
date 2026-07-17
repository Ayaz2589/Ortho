// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormPageHeader } from '@/components/web/FormPageHeader'

describe('FormPageHeader', () => {
  it('renders the title and both actions with a semantic header', async () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()
    render(
      <FormPageHeader
        title="New transaction"
        cancelLabel="Cancel"
        saveLabel="Add"
        canSave
        onCancel={onCancel}
        onSave={onSave}
      />
    )
    expect(screen.getByRole('banner')).toBeInTheDocument()
    // The title is a real heading (programmatic name + reachable via the H gesture).
    expect(screen.getByRole('heading', { name: 'New transaction' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('disables Save when canSave is false', async () => {
    const onSave = vi.fn()
    render(
      <FormPageHeader
        title="Edit"
        cancelLabel="Cancel"
        saveLabel="Save"
        canSave={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />
    )
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('omits the Save action when onSave is not provided', () => {
    render(<FormPageHeader title="Pick a type" cancelLabel="Cancel" onCancel={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
