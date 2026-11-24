#!/usr/bin/env bash
set -euo pipefail

JBOSS_HOME="${JBOSS_HOME:-/opt/jboss/wildfly}"
CLI="$JBOSS_HOME/bin/jboss-cli.sh"
CONFIG="/opt/jboss/wildfly/bin/wildfly-proxy.cli"
ADDRESS="/subsystem=undertow/server=default-server/http-listener=default"

/__cacert_entrypoint.sh "$@" &
server_pid=$!

stop() {
  kill -TERM "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap stop TERM INT

ready=0
for _ in $(seq 1 120); do
  if "$CLI" --connect --command=":read-attribute(name=server-state)" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "WildFly management API did not start within 120 seconds."
  exit 1
fi

if ! "$CLI" --connect --file="$CONFIG"; then
  echo "Proxy CLI returned non-zero; verifying final state."
fi

verified=0
for _ in $(seq 1 120); do
  if "$CLI" --connect --command="${ADDRESS}:read-attribute(name=proxy-address-forwarding)" 2>/dev/null | grep -q '"result" => true'; then
    verified=1
    break
  fi
  sleep 1
done
if [ "$verified" -ne 1 ]; then
  echo "proxy-address-forwarding is not true; refusing to serve traffic."
  exit 1
fi

echo "SmartCare WildFly proxy forwarding verified."
wait "$server_pid"
