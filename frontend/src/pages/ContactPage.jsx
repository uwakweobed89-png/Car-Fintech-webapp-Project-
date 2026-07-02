import { useState } from 'react';
import Reveal from '../components/Reveal';

const initialForm = { name: '', email: '', message: '' };

export default function ContactPage() {
  const [form, setForm] = useState(initialForm);
  const [sent, setSent] = useState(false);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // Demo project — no contact backend wired up, so this is a client-side-only confirmation.
    setSent(true);
  };

  return (
    <div className="container page-transition" style={{ paddingTop: 32 }}>
      <Reveal as="div" className="section-header" style={{ margin: '0 auto 40px' }}>
        <p className="section-eyebrow">Contact</p>
        <h1 className="page-title" style={{ margin: '0 0 12px' }}>Talk to us</h1>
        <p className="section-subtitle">
          Questions about a listing, a financing decision, or the platform itself —
          send a note and we'll get back to you.
        </p>
      </Reveal>

      <div className="detail-layout" style={{ marginBottom: 64 }}>
        <Reveal as="div" className="card" style={{ padding: 28 }}>
          {sent ? (
            <div>
              <p className="card-title" style={{ fontSize: 18 }}>Message sent</p>
              <p className="card-copy">Thanks, {form.name || 'there'} — this is a demo, so nothing was actually emailed, but that's the flow.</p>
              <button className="secondary" style={{ marginTop: 16 }} onClick={() => { setForm(initialForm); setSent(false); }}>
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input id="name" required value={form.name} onChange={handleChange('name')} />
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" required value={form.email} onChange={handleChange('email')} />
                </div>
                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    value={form.message}
                    onChange={handleChange('message')}
                    style={{ font: 'inherit', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--gridline)', background: 'var(--surface-1)', color: 'var(--text-primary)', resize: 'vertical' }}
                  />
                </div>
              </div>
              <button type="submit">Send message</button>
            </form>
          )}
        </Reveal>

        <div>
          <Reveal as="div" delay={100} className="card" style={{ padding: 24, marginBottom: 16 }}>
            <p className="card-title">Support</p>
            <p className="card-copy">support@carfintech.example<br />Mon–Fri, 9am–6pm ET</p>
          </Reveal>
          <Reveal as="div" delay={180} className="card" style={{ padding: 24 }}>
            <p className="card-title">Sales &amp; partnerships</p>
            <p className="card-copy">partners@carfintech.example</p>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
