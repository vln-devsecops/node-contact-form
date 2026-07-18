import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactForm } from './ContactForm';

afterEach(() => {
  document.querySelectorAll('script[src*="recaptcha/api.js"]').forEach((el) => el.remove());
  delete (window as { grecaptcha?: unknown }).grecaptcha;
});

async function fillValidForm(): Promise<void> {
  await userEvent.type(screen.getByLabelText(/name/i), 'Jane Doe');
  await userEvent.type(screen.getByLabelText(/email/i), 'jane@example.com');
  await userEvent.type(screen.getByLabelText(/subject/i), 'Hello');
  await userEvent.type(screen.getByLabelText(/message/i), 'Test message body');
}

describe('ContactForm', () => {
  it('renders name, email, subject, and message fields', () => {
    render(<ContactForm recaptchaSiteKey="site-key" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
  });

  it('shows a validation error and does not submit when fields are empty', async () => {
    const onSubmit = vi.fn();
    render(<ContactForm recaptchaSiteKey="site-key" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['name', /name is required/i],
    ['email', /email is required/i],
    ['subject', /subject is required/i],
    ['message', /message is required/i],
  ])('rejects a missing %s', async (field, expectedError) => {
    const onSubmit = vi.fn();
    render(<ContactForm recaptchaSiteKey="site-key" onSubmit={onSubmit} />);

    await fillValidForm();
    await userEvent.clear(screen.getByLabelText(new RegExp(field, 'i')));
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(await screen.findByText(expectedError)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with the field values and the acquired reCAPTCHA token', async () => {
    const execute = vi.fn().mockResolvedValue('token-123');
    window.grecaptcha = { ready: (cb) => cb(), execute };

    const onSubmit = vi.fn();
    render(<ContactForm recaptchaSiteKey="site-key" onSubmit={onSubmit} />);

    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(execute).toHaveBeenCalledWith('site-key', { action: 'submit' });
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'Jane Doe', email: 'jane@example.com', subject: 'Hello', message: 'Test message body' },
        'token-123'
      )
    );
  });

  it('calls onSubmit with an undefined token when reCAPTCHA fails to load, rather than blocking submission', async () => {
    const onSubmit = vi.fn();
    render(<ContactForm recaptchaSiteKey="site-key" onSubmit={onSubmit} />);

    await fillValidForm();
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    document.querySelector('script[src*="recaptcha/api.js"]')?.dispatchEvent(new Event('error'));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'Jane Doe', email: 'jane@example.com', subject: 'Hello', message: 'Test message body' },
        undefined
      )
    );
  });

  it('applies the given className to the form element', () => {
    render(<ContactForm recaptchaSiteKey="site-key" onSubmit={vi.fn()} className="my-form" />);

    expect(screen.getByRole('button', { name: /send/i }).closest('form')).toHaveClass('my-form');
  });
});
