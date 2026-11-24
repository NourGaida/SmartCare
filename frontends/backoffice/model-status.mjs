import { careState, panelMarkup } from '../shared/connected-views.mjs';
import { escapeHTML as h } from '../shared/ui.mjs';

function unavailable() {
  return careState('Analyse indisponible', { retry: true, retryLabel: 'Réessayer' });
}

function modelMarkup(model) {
  const fields = [
    ['État', model.available ? 'Disponible' : null],
    ['Version', model.version],
    ['Mode', model.mode]
  ].filter(([, value]) => value);
  const details = '<dl class="full-details">' + fields.map(([label, value]) =>
    '<div><dt>' + h(label) + '</dt><dd>' + h(value) + '</dd></div>').join('') + '</dl>';
  const description = model.mode === 'shadow'
    ? 'Le mode shadow observe les scores ML. Les règles restent actives.'
    : 'Disponibilité et mode de l’analyse.';
  const retry = model.available ? '' : unavailable();
  return panelMarkup('Métadonnées du modèle', description, details + retry);
}

export async function renderModelStatus(view, readModel, signal) {
  view.innerHTML = careState('Chargement de l’état du modèle…');
  try {
    const model = await readModel(signal);
    if (signal.aborted) return;
    view.innerHTML = model ? modelMarkup(model) :
      careState('Aucune information sur le modèle.', { retry: true, retryLabel: 'Réessayer' });
  } catch (error) {
    if (signal.aborted) return;
    if (error.code === 'SESSION_EXPIRED') throw error;
    view.innerHTML = unavailable();
  }
}
