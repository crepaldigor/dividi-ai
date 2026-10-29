/** Helpers compartilhados de texto seguro, datas e ícones SVG. */
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
export function dateLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Data desconhecida' : dateFormatter.format(date);
}
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

const iconPaths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2.5-5 6-5s6 2 6 5v2M17 5c2.5 0 4 2 4 4s-1.5 4-4 4M18 15c2 .5 3 2 3 5"/>',
  receipt:
    '<path d="M7 3h10l3 3v15l-5-2-3 2-3-2-5 2V6l3-3Z"/><path d="M9 10h6M9 14h6"/>',
  wallet:
    '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 10V6a3 3 0 0 1 3-3h12M16 15h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6m4-6v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  cup: '<path d="M4 7h13v7a6.5 6.5 0 0 1-13 0V7Zm13 2h2a3 3 0 0 1 0 6h-2M3 21h17"/>',
  car: '<path d="m5 11 2-5h10l2 5M4 11h16v8H4zM7 19v2m10-2v2M7 15h2m6 0h2"/>',
  house: '<path d="m3 10 9-7 9 7v11H3V10ZM9 21v-7h6v7"/>',
  bag: '<path d="M4 8h16l-1 13H5L4 8ZM9 9V6a3 3 0 0 1 6 0v3"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-4 0-7-1.2-7-3 0-3 5-3 7 3Zm0 0c4 0 7-1.2 7-3 0-3-5-3-7 3Z"/>',
  chart: '<path d="M4 20V9m5 11V4m5 16v-7m5 7V8M2 20h20"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-3 8-9 10-6-2-9-5-9-10V6l9-4Z"/><path d="m9 12 2 2 4-4"/>',
  party:
    '<path d="m4 20 5-13 8 8-13 5ZM12 4l2 2M19 5l2-2M19 11l2 2M9 2l-1 3"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8c-1-.7-2.5-1-4-.5-3 1-3 3.5 0 4.5s4 3 1 4c-1.3.5-3 .3-4-1M12 5v14"/>',
};
export const icon = (name, size = 18) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || iconPaths.coin}</svg>`;
