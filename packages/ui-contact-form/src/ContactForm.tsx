import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRecaptcha } from './useRecaptcha.js';

export interface ContactFormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface ContactFormProps {
  /** reCAPTCHA v3 site key (classic, not Enterprise) for this deployment. */
  recaptchaSiteKey: string;
  /**
   * Called with the collected, client-validated field values and the
   * acquired reCAPTCHA token once the visitor submits. The token is
   * `undefined` when reCAPTCHA couldn't be loaded/executed -- submit
   * anyway; the backend treats a missing token as a spam-box entry, not a
   * rejection. This component only collects input; it makes no assumption
   * about how or where the values are sent.
   */
  onSubmit: (values: ContactFormValues, recaptchaToken: string | undefined) => void | Promise<void>;
  className?: string;
}

const initialValues: ContactFormValues = { name: '', email: '', subject: '', message: '' };

function validate(values: ContactFormValues): string | undefined {
  if (!values.name.trim()) {
    return 'Name is required.';
  }
  if (!values.email.trim()) {
    return 'Email is required.';
  }
  if (!values.subject.trim()) {
    return 'Subject is required.';
  }
  if (!values.message.trim()) {
    return 'Message is required.';
  }
  return undefined;
}

/** Unstyled, controlled contact form. Client-side validation only; the backend re-validates regardless. */
export function ContactForm(props: ContactFormProps) {
  const [values, setValues] = useState<ContactFormValues>(initialValues);
  const [error, setError] = useState<string | undefined>(undefined);
  const { execute } = useRecaptcha(props.recaptchaSiteKey);

  const handleChange =
    (field: keyof ContactFormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    const validationError = validate(values);
    setError(validationError);
    if (validationError) {
      return;
    }

    void execute('submit').then((token) => props.onSubmit(values, token));
  };

  return (
    <form onSubmit={handleSubmit} className={props.className}>
      <label htmlFor="contact-form-name">Name</label>
      <input
        id="contact-form-name"
        name="name"
        type="text"
        autoComplete="name"
        value={values.name}
        onChange={handleChange('name')}
      />

      <label htmlFor="contact-form-email">Email</label>
      <input
        id="contact-form-email"
        name="email"
        type="email"
        autoComplete="email"
        value={values.email}
        onChange={handleChange('email')}
      />

      <label htmlFor="contact-form-subject">Subject</label>
      <input
        id="contact-form-subject"
        name="subject"
        type="text"
        value={values.subject}
        onChange={handleChange('subject')}
      />

      <label htmlFor="contact-form-message">Message</label>
      <textarea
        id="contact-form-message"
        name="message"
        value={values.message}
        onChange={handleChange('message')}
      />

      {error && <p role="alert">{error}</p>}

      <button type="submit">Send</button>
    </form>
  );
}
