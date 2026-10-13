'use client';
import { useState } from 'react';
import { authApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n/i18n-context';
export function CompanyAiAssistant({ companyId }: { companyId: string }) {
  const { locale } = useI18n();
  const fr = locale === 'fr';
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof authApi.askCompanyAssistant>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="profile-card">
      <h2>{fr ? 'Assistant commercial' : 'Sales assistant'}</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          setResult(null);
          try {
            setResult(await authApi.askCompanyAssistant(companyId, question));
          } catch {
            setError(
              fr
                ? 'Assistant indisponible. Réessayez.'
                : 'Assistant unavailable. Please retry.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="drawer-field">
          <span>
            {fr
              ? 'Votre question sur cette entreprise'
              : 'Your question about this company'}
          </span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
            maxLength={2000}
            rows={3}
            placeholder={
              fr
                ? 'Comment préparer la visite ?'
                : 'How should I prepare the visit?'
            }
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !question.trim()}
        >
          {busy ? (fr ? 'Analyse…' : 'Analyzing…') : fr ? 'Demander' : 'Ask'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          <p>{result.answer}</p>
          <ul>
            {result.key_facts?.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
          <p>{result.next_action}</p>
          {!result.model_used && (
            <p>
              {fr
                ? 'Réponse basée sur les règles et les données disponibles.'
                : 'Response based on rules and available data.'}
            </p>
          )}
          {result.warnings
            ?.filter((warning) => !warning.startsWith('Flowise '))
            .map((warning, i) => (
              <p key={i}>{warning}</p>
            ))}
        </div>
      )}
    </section>
  );
}
