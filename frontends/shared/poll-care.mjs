// Schedule after the response so a slow request cannot overlap the next refresh.
export function pollCare(signal, load, render, showError, interval = 1000) {
  let timer;
  let stopped = false;
  const active = () => !stopped && !signal.aborted;

  function stop() {
    stopped = true;
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }

  async function update() {
    if (!active()) return;
    try {
      const snapshot = await load(signal);
      if (active()) render(snapshot);
    } catch (error) {
      if (active()) showError(error);
    }
    if (active()) timer = setTimeout(update, interval);
  }

  signal.addEventListener('abort', stop, { once: true });
  update();
  return stop;
}
