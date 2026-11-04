import { useJson } from '../api.ts';

// Recount's WhatsApp number, shown once the Cloud API is connected.
export function WhatsAppCard({ compact = false }: { compact?: boolean }) {
  const { data } = useJson<{ ready: boolean; number: string | null }>('/api/whatsapp/status');
  if (!data?.ready || !data.number) return null;
  const digits = data.number.replace(/[^0-9]/g, '');
  return (
    <div className={`card wa-card ${compact ? 'compact' : ''}`}>
      <div>
        <div className="kicker">On WhatsApp</div>
        <h3>Message Recount on {data.number}</h3>
        {!compact && (
          <ul className="small">
            <li>Send your polling unit's code to see what Recount holds for it</li>
            <li>Send <b>COVER</b> and the code to cover your unit on 16 January 2027</li>
            <li>Send a photo of your unit's result with the code as the caption</li>
            <li>Forward a result sheet you were sent to check it against INEC's copy</li>
          </ul>
        )}
      </div>
      <a className="btn btn-green" href={`https://wa.me/${digits}?text=${encodeURIComponent('Hi Recount')}`} target="_blank" rel="noreferrer">Open WhatsApp</a>
    </div>
  );
}
