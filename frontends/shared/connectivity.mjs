export function connectivityMessage(online) {
  return online ? '' :
    'Offline · Server measurements, history and alerts are unavailable. The static app and fictional demo remain available; no saved health data is loaded.';
}

export function mountConnectivity(element, {
  network = navigator, events = window, connected = false
} = {}) {
  const render = () => {
    const message = connected && !network.onLine
      ? 'Offline · Connect to the server to load current measurements and alerts.'
      : connectivityMessage(network.onLine);
    element.textContent = message;
    element.hidden = !message;
    if (element.ownerDocument) {
      element.ownerDocument.documentElement.style.setProperty('--connection-notice-height',
        message ? element.getBoundingClientRect().height + 'px' : '0px');
    }
  };
  events.addEventListener('online', render);
  events.addEventListener('offline', render);
  events.addEventListener('resize', render);
  render();
  return () => {
    events.removeEventListener('online', render);
    events.removeEventListener('offline', render);
    events.removeEventListener('resize', render);
  };
}
