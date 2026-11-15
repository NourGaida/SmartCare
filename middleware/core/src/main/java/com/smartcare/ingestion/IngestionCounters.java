package com.smartcare.ingestion;

import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

@ApplicationScoped
public class IngestionCounters {

    private final AtomicLong received = new AtomicLong();
    private final AtomicLong saved = new AtomicLong();
    private final AtomicLong duplicate = new AtomicLong();
    private final AtomicLong rejected = new AtomicLong();
    private final AtomicLong storeFailed = new AtomicLong();
    private final AtomicBoolean connected = new AtomicBoolean();
    private final AtomicReference<String> lastRejectionReason = new AtomicReference<>();
    private final AtomicReference<Instant> lastMessageAt = new AtomicReference<>();
    private final ConcurrentHashMap<String, Long> rejectedByReason = new ConcurrentHashMap<>();

    public void messageReceived() {
        received.incrementAndGet();
        lastMessageAt.set(Instant.now());
    }

    public void saved() {
        saved.incrementAndGet();
    }

    public void duplicate() {
        duplicate.incrementAndGet();
    }

    public void rejected(String reason) {
        rejected.incrementAndGet();
        lastRejectionReason.set(reason);
        rejectedByReason.merge(reason, 1L, Long::sum);
    }

    public void storeFailed(String reason) {
        storeFailed.incrementAndGet();
        rejected(reason);
    }

    public void setConnected(boolean value) {
        connected.set(value);
    }

    public Snapshot snapshot() {
        Map<String, Long> reasons = new TreeMap<>(rejectedByReason);
        return new Snapshot(
                connected.get(),
                received.get(),
                saved.get(),
                duplicate.get(),
                rejected.get(),
                storeFailed.get(),
                lastRejectionReason.get(),
                lastMessageAt.get(),
                Collections.unmodifiableMap(reasons));
    }

    public record Snapshot(
            boolean connected,
            long received,
            long saved,
            long duplicate,
            long rejected,
            long storeFailed,
            String lastRejectionReason,
            Instant lastMessageAt,
            Map<String, Long> rejectedByReason) {
    }
}
