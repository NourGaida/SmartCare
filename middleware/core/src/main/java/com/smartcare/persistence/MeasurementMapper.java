package com.smartcare.persistence;

import org.bson.Document;

import java.util.Date;

public final class MeasurementMapper {

    private MeasurementMapper() {
    }

    public static Document toDocument(Measurement measurement) {
        return new Document()
                .append("deviceId", measurement.deviceId())
                .append("bootId", measurement.bootId())
                .append("sequence", measurement.sequence())
                .append("acquiredAt", Date.from(measurement.acquiredAt()))
                .append("receivedAt", Date.from(measurement.receivedAt()))
                .append("heartRate", measurement.heartRate())
                .append("spo2", measurement.spo2())
                .append("quality", measurement.quality())
                .append("reason", measurement.reason())
                .append("clockStatus", measurement.clockStatus())
                .append("source", measurement.source())
                .append("patientId", measurement.patientId())
                .append("schemaVersion", measurement.schemaVersion());
    }

    public static Measurement fromDocument(Document document) {
        return new Measurement(
                document.getString("deviceId"),
                document.getString("bootId"),
                ((Number) document.get("sequence")).longValue(),
                document.getDate("acquiredAt").toInstant(),
                document.getDate("receivedAt").toInstant(),
                toInteger(document.get("heartRate")),
                toInteger(document.get("spo2")),
                document.getString("quality"),
                document.getString("reason"),
                document.getString("clockStatus"),
                document.getString("source"),
                document.getString("patientId"),
                toInteger(document.get("schemaVersion")));
    }

    private static Integer toInteger(Object value) {
        return value == null ? null : ((Number) value).intValue();
    }
}
