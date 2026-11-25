import { useApp } from '../App.jsx';

export default function ProviderPicker({ value, onChange }) {
  const { config } = useApp();
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="provider-picker">
      {config.providers.map((p) => (
        <button type="button" key={p.key} aria-pressed={value.includes(p.key)}
          className={`chip ${value.includes(p.key) ? 'on' : ''}`} style={{ '--c': p.color }} onClick={() => toggle(p.key)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
