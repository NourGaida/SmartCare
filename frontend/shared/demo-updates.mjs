// In-memory demo transport. This is not a WebSocket client or a server security check.
// Guard both registration and delivery, so a stale subscription cannot outlive its session.
export function createDemoUpdates() {
  const subscribers = new Set();
  return {
    subscribe(patientId, receive, authorize) {
      authorize();
      if (typeof receive !== 'function') throw new TypeError('A reading listener is required.');
      const subscription = { patientId, receive, authorize };
      subscribers.add(subscription);
      return () => subscribers.delete(subscription);
    },
    publish(patientId, reading) {
      for (const subscription of [...subscribers]) {
        if (subscription.patientId !== patientId) continue;
        try { subscription.authorize(); }
        catch (error) {
          if (error.code !== 'FORBIDDEN') throw error;
          subscribers.delete(subscription);
          continue;
        }
        subscription.receive(structuredClone(reading));
      }
    }
  };
}
